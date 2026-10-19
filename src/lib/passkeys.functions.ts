/**
 * Passkeys (WebAuthn / FIDO2). Credentials are stored per user; sign-in with a
 * passkey verifies the signed assertion server-side, then mints a one-time
 * sign-in token the browser exchanges for a normal session.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { requireSupabaseAuth } from "@/lib/auth-middleware";
import { writeAuditLog } from "./identity.server";

function relyingParty() {
  const origin =
    getRequestHeader("origin") ??
    `${getRequestHeader("x-forwarded-proto") ?? "https"}://${getRequestHeader("host")}`;
  return { origin, rpID: new URL(origin).hostname };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PasskeyRow = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

export const listPasskeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PasskeyRow[]> => {
    const { data, error } = await context.supabase
      .from("passkeys")
      .select("id, name, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your passkeys.");
    return data ?? [];
  });

export const deletePasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("passkeys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove this passkey.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "passkey.removed",
      category: "security",
      status: "warning",
      description: "Passkey removed",
    });
    return { ok: true };
  });

export const passkeyRegisterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID } = relyingParty();
    const db = await admin();
    const { data: existing } = await db
      .from("passkeys")
      .select("credential_id, transports")
      .eq("user_id", context.userId);
    const email = (context.claims as { email?: string }).email ?? context.userId;
    const options = await generateRegistrationOptions({
      rpName: "EGREED Identity",
      rpID,
      userName: email,
      userID: new TextEncoder().encode(context.userId),
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    await db.from("webauthn_challenges").delete().eq("user_id", context.userId).eq("kind", "register");
    await db
      .from("webauthn_challenges")
      .insert({ user_id: context.userId, challenge: options.challenge, kind: "register" });
    return JSON.stringify(options);
  });

export const passkeyRegisterVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ name: z.string().trim().min(1).max(60), response: z.any() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { origin, rpID } = relyingParty();
    const db = await admin();
    const { data: ch } = await db
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", context.userId)
      .eq("kind", "register")
      .maybeSingle();
    if (!ch || new Date(ch.expires_at) < new Date()) throw new Error("Passkey setup expired. Try again.");
    await db.from("webauthn_challenges").delete().eq("id", ch.id);

    const result = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!result.verified || !result.registrationInfo) throw new Error("Passkey could not be verified.");
    const cred = result.registrationInfo.credential;
    const { error } = await db.from("passkeys").insert({
      user_id: context.userId,
      credential_id: cred.id,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ?? [],
      name: data.name,
    });
    if (error) throw new Error("Could not save this passkey.");
    await writeAuditLog({
      userId: context.userId,
      eventType: "passkey.added",
      category: "security",
      description: `Passkey "${data.name}" added`,
    });
    return { ok: true };
  });

export const passkeyLoginOptions = createServerFn({ method: "POST" }).handler(async () => {
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  const db = await admin();
  await db.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
  const { data } = await db
    .from("webauthn_challenges")
    .insert({ challenge: options.challenge, kind: "login" })
    .select("id")
    .single();
  return {
    challengeId: data!.id as string,
    options: JSON.stringify(options),
  };
});

export const passkeyLoginVerify = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ challengeId: z.string().uuid(), response: z.any() }).parse(i),
  )
  .handler(async ({ data }): Promise<{ tokenHash: string }> => {
    const { origin, rpID } = relyingParty();
    const db = await admin();
    const { data: ch } = await db
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("id", data.challengeId)
      .eq("kind", "login")
      .maybeSingle();
    if (!ch || new Date(ch.expires_at) < new Date()) throw new Error("Sign-in expired. Try again.");
    await db.from("webauthn_challenges").delete().eq("id", ch.id);

    const { data: pk } = await db
      .from("passkeys")
      .select("id, user_id, credential_id, public_key, counter, transports")
      .eq("credential_id", String(data.response?.id ?? ""))
      .maybeSingle();
    if (!pk) throw new Error("This passkey isn't registered with EGREED ID.");

    const result = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: pk.credential_id,
        publicKey: isoBase64URL.toBuffer(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports as never,
      },
    });
    if (!result.verified) throw new Error("Passkey could not be verified.");
    await db
      .from("passkeys")
      .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", pk.id);

    const { data: u } = await db.auth.admin.getUserById(pk.user_id);
    const email = u.user?.email;
    if (!email) throw new Error("Account not found.");
    const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) throw new Error("Could not complete sign-in.");
    await writeAuditLog({
      userId: pk.user_id,
      eventType: "auth.passkey_sign_in",
      category: "authentication",
      description: "Signed in with a passkey",
    });
    return { tokenHash: link.properties.hashed_token };
  });
