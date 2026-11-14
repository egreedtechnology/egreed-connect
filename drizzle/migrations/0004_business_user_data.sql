CREATE TABLE public.business_user_data (
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);
GRANT SELECT ON public.business_user_data TO authenticated;
GRANT ALL ON public.business_user_data TO service_role;
ALTER TABLE public.business_user_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_user_data_read_own ON public.business_user_data
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = business_id);
CREATE TRIGGER business_user_data_updated BEFORE UPDATE ON public.business_user_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();