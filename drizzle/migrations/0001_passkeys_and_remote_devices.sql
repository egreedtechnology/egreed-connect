CREATE TABLE public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  name text NOT NULL DEFAULT 'Passkey',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT, UPDATE, DELETE ON public.passkeys TO authenticated;
GRANT ALL ON public.passkeys TO service_role;
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own passkeys read" ON public.passkeys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own passkeys update" ON public.passkeys FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own passkeys delete" ON public.passkeys FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  challenge text NOT NULL,
  kind text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trusted_devices
  ADD COLUMN signout_requested_at timestamptz,
  ADD COLUMN locked boolean NOT NULL DEFAULT false,
  ADD COLUMN last_sign_in_at timestamptz NOT NULL DEFAULT now();