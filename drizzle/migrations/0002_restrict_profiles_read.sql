DROP POLICY IF EXISTS profiles_read_all ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY profiles_read_own_or_org ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id AND public.is_org_member(m.organization_id, auth.uid())
  )
);