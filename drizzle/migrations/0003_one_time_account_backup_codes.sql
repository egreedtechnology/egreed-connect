CREATE TABLE public.account_backup_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, code_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), used_at timestamptz
);
GRANT ALL ON public.account_backup_codes TO service_role;
ALTER TABLE public.account_backup_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX account_backup_codes_owner_idx ON public.account_backup_codes(user_id);
CREATE TABLE public.account_recovery_limits (
 bucket_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.account_recovery_limits TO service_role;
ALTER TABLE public.account_recovery_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.allow_account_recovery_attempt(p_bucket text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.account_recovery_limits(bucket_hash, attempts) VALUES (p_bucket, 1)
 ON CONFLICT (bucket_hash) DO UPDATE SET
 attempts = CASE WHEN account_recovery_limits.window_start < now() - interval '15 minutes' THEN 1 ELSE account_recovery_limits.attempts + 1 END,
 window_start = CASE WHEN account_recovery_limits.window_start < now() - interval '15 minutes' THEN now() ELSE account_recovery_limits.window_start END
 RETURNING attempts INTO n;
 RETURN n <= 5;
END; $$;
REVOKE ALL ON FUNCTION public.allow_account_recovery_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allow_account_recovery_attempt(text) TO service_role;
CREATE OR REPLACE FUNCTION public.replace_account_backup_codes(p_user uuid, p_hashes text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF array_length(p_hashes, 1) IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'Ten backup codes required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 DELETE FROM public.account_backup_codes WHERE user_id = p_user;
 INSERT INTO public.account_backup_codes(user_id, code_hash) SELECT p_user, unnest(p_hashes);
END; $$;
REVOKE ALL ON FUNCTION public.replace_account_backup_codes(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_account_backup_codes(uuid, text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.consume_account_backup_code(p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid;
BEGIN
 UPDATE public.account_backup_codes SET used_at = now() WHERE code_hash = p_hash AND used_at IS NULL RETURNING user_id INTO owner_id;
 RETURN owner_id;
END; $$;
REVOKE ALL ON FUNCTION public.consume_account_backup_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_account_backup_code(text) TO service_role;