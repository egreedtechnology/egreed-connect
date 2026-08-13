CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'employee',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX org_invites_unique_pending ON public.organization_invitations (organization_id, email) WHERE status = 'pending';
CREATE INDEX org_invites_email_idx ON public.organization_invitations (email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites_read" ON public.organization_invitations
FOR SELECT TO authenticated
USING (
  public.is_org_member(organization_id, auth.uid())
  OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "org_invites_insert_admins" ON public.organization_invitations
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = invited_by
  AND public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
);

CREATE POLICY "org_invites_update" ON public.organization_invitations
FOR UPDATE TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "org_invites_delete_admins" ON public.organization_invitations
FOR DELETE TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE TRIGGER org_invites_updated_at BEFORE UPDATE ON public.organization_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();