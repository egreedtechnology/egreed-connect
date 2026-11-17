import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { MfaChallenge, needsMfa } from "@/components/security/MfaChallenge";
import { BackupCodeRecovery } from "@/components/security/BackupCodeRecovery";
import { passkeyLoginOptions, passkeyLoginVerify } from "@/lib/passkeys.functions";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { registerSession } from "@/lib/identity.functions";
import { EGREED } from "@/lib/egreed";

const TITLE = "Sign in — EGREED Identity";
const DESCRIPTION =
  "Sign in to your EGREED account, or create an EGREED ID to access every product in the ecosystem.";

/**
 * External apps may only send users back to the consent screen; they can never
 * steer a sign-in into the account dashboard or developer console.
 */
function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/oauth/authorize?") || value.includes("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  // Session state lives in browser storage, so render this screen client-side
  // only — SSR would emit markup that never matches the hydrated result.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { next?: string; mode?: "signup" } => {
    const next = safeNext(search["next"]);
    const mode = search["mode"] === "signup" ? ("signup" as const) : undefined;
    return { ...(next ? { next } : {}), ...(mode ? { mode } : {}) };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next, mode: initialMode } = Route.useSearch();
  const register = useServerFn(registerSession);
  const [pending, setPending] = useState<string | null>(null);
  const [mode, setMode] = useState<string>(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const getPasskeyOptions = useServerFn(passkeyLoginOptions);
  const verifyPasskey = useServerFn(passkeyLoginVerify);

  // `next` carries an intended destination (e.g. an OAuth consent screen a
  // third-party app sent the user to) through the whole sign-in flow.
  const goNext = useCallback(() => {
    if (next) {
      window.location.replace(next);
      return;
    }
    navigate({ to: "/account", replace: true });
  }, [navigate, next]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      void needsMfa().then((n) => (n ? setMfaPending(true) : goNext()));
    });
  }, [goNext]);

  async function afterAuth(method: "password" | "oauth" | "signup") {
    try {
      await register({ data: { method } });
    } catch {
      /* audit logging is best-effort and must never block sign-in */
    }
    if (await needsMfa()) {
      setMfaPending(true);
      return;
    }
    goNext();
  }

  async function handlePasskey() {
    setPending("passkey");
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const { challengeId, options } = await getPasskeyOptions();
      const response = await startAuthentication({ optionsJSON: JSON.parse(options) });
      const { tokenHash } = await verifyPasskey({ data: { challengeId, response } });
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      toast.success("Welcome back to EGREED");
      try {
        await register({ data: { method: "password" } });
      } catch {
        /* best-effort */
      }
      await afterAuth("password");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Passkey sign-in was cancelled.");
    } finally {
      setPending(null);
    }
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setPending("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back to EGREED");
    await afterAuth("password");
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password.");
      return;
    }
    setPending("signup");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: next
          ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
          : window.location.origin,
        data: { display_name: displayName },
      },
    });
    setPending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setEmailSent(true);
      return;
    }
    toast.success("Your EGREED ID is ready");
    await afterAuth("signup");
  }

  async function handleRecovery(event: React.FormEvent) {
    event.preventDefault();
    setPending("recovery");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: next
        ? `${window.location.origin}/reset-password?next=${encodeURIComponent(next)}`
        : `${window.location.origin}/reset-password`,
    });
    setPending(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Recovery link sent. Check your inbox.");
  }

  return (
    <div className="bg-hero relative flex min-h-screen items-center justify-center px-4 py-14">
      <div className="bg-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block" aria-label="EGREED Identity home">
            <EgreedLogo />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">{EGREED.tagline}</p>
        </div>

        <div className="surface-panel p-6 sm:p-8">
          {mfaPending ? (
            <MfaChallenge
              onVerified={goNext}
              onCancel={async () => {
                await supabase.auth.signOut();
                setMfaPending(false);
              }}
            />
          ) : emailSent ? (
            <div className="text-center">
              <ShieldCheck className="mx-auto size-6 text-primary" aria-hidden />
              <h1 className="mt-4 font-display text-xl font-semibold">Confirm your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="text-foreground">{email}</span>.
                Click it to activate your EGREED ID.
              </p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => setEmailSent(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create ID</TabsTrigger>
                <TabsTrigger value="recovery">Recover</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@egreedtech.org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={pending !== null}>
                    {pending === "signin" && <Loader2 className="size-4 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      required
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ada Lovelace"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={pending !== null}>
                    {pending === "signup" && <Loader2 className="size-4 animate-spin" />}
                    Create EGREED ID
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="recovery" className="mt-6">
                <BackupCodeRecovery next={next} />
                <Separator className="my-6" />
                <form onSubmit={handleRecovery} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-email">Email</Label>
                    <Input
                      id="recovery-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={pending !== null}>
                    {pending === "recovery" && <Loader2 className="size-4 animate-spin" />}
                    Send recovery link
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {!emailSent && !mfaPending && (
            <>
              <div className="my-6 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs tracking-widest text-muted-foreground uppercase">or</span>
                <Separator className="flex-1" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handlePasskey}
                disabled={pending !== null}
              >
                {pending === "passkey" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Fingerprint className="size-4" />
                )}
                Sign in with a passkey
              </Button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by EGREED Identity · audit logging and device trust enabled
        </p>
      </div>
    </div>
  );
}
