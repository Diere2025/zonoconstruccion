BEGIN;
CREATE TABLE public.outlet_managers (
 user_id uuid PRIMARY KEY REFERENCES public.sellers(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES auth.users(id),
 granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outlet_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outlet_managers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.outlet_managers TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.outlet_managers TO service_role;
CREATE POLICY outlet_manager_self ON public.outlet_managers FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.outlet_is_admin());
CREATE FUNCTION public.outlet_can_manage() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.outlet_is_admin() OR EXISTS(
  SELECT 1 FROM public.outlet_managers m JOIN public.sellers s ON s.id=m.user_id
  WHERE m.user_id=auth.uid() AND m.enabled AND s.is_active
 );
$$;
REVOKE ALL ON FUNCTION public.outlet_can_manage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outlet_can_manage() TO authenticated;
ALTER POLICY outlet_admin_read ON public.outlet_units USING(public.outlet_can_manage());
ALTER POLICY outlet_admin_history ON public.outlet_audit USING(public.outlet_can_manage());
ALTER POLICY outlet_image_read ON storage.objects USING(bucket_id='outlet-images' AND public.outlet_can_manage());
ALTER POLICY outlet_image_insert ON storage.objects WITH CHECK(bucket_id='outlet-images' AND public.outlet_can_manage());
CREATE POLICY outlet_manager_assignments ON public.outlet_assignments FOR SELECT TO authenticated USING(public.outlet_can_manage());
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.outlet_save_unit(uuid,integer,jsonb)'::regprocedure) INTO definition;
 IF position('NOT public.outlet_is_admin()' IN definition)=0 THEN RAISE EXCEPTION 'Revisar la autorización vigente antes de actualizarla.'; END IF;
 definition:=replace(definition,'NOT public.outlet_is_admin()','NOT public.outlet_can_manage()');
 definition:=replace(definition,'Solo administración puede modificar unidades.','Tu cuenta no puede administrar Segunda y Outlet.');
 EXECUTE definition;
END;
$guard$;
NOTIFY pgrst,'reload schema';
COMMIT;
