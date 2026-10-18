import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { EgreedLogo } from "@/components/brand/EgreedLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeNext(search["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: AuthPage,
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6c-.1 1.1-.8 2.8-2.5 3.9l-.1.1 3.7 2.8c2.1-2 3.8-5 3.8-8.7Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.4 0 6.2-1.1 8.3-3l-3.9-3c-1.1.7-2.5 1.2-4.4 1.2-3.3 0-6.1-2.2-7.1-5.2l-.1.1-3.8 2.9C3 21.2 7.2 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M4.9 14c-.3-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5V8.9L1 6c-.8 1.7-1.3 3.6-1.3 5.6s.5 3.9 1.3 5.6l3.9-3.2Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2.3 0 3.9 1 4.8 1.9l3.5-3.4C18.2 1.2 15.4 0 12 0 7.2 0 3 2.8 1 6.9l3.9 3C5.9 6.9 8.7 4.7 12 4.7Z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const register = useServerFn(registerSession);
  const [pending, setPending] = useState<string | null>(null);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailSent, setEmailSent] = useState(false);

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
      if (data.session) goNext();
    });
  }, [goNext]);

  async function afterAuth(method: "password" | "oauth" | "signup") {
    try {
      await register({ data: { method } });
    } catch {
      /* audit logging is best-effort and must never block sign-in */
    }
    goNext();
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

  async function handleGoogle() {
    setPending("google");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: next
        ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
        : window.location.origin,
    });
    if (result.error) {
      setPending(null);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    await afterAuth("oauth");
  }

  async function handleRecovery(event: React.FormEvent) {
    event.preventDefault();
    setPending("recovery");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
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
          {emailSent ? (
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

          {!emailSent && (
            <>
              <div className="my-6 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs tracking-widest text-muted-foreground uppercase">or</span>
                <Separator className="flex-1" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={pending !== null}
              >
                {pending === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
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
