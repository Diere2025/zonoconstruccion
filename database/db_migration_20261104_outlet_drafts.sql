-- Primera etapa: catálogo privado. No habilita ventas hasta integrar reservas.
BEGIN;
CREATE TABLE public.outlet_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE DEFAULT ('OUT-' || upper(substr(gen_random_uuid()::text,1,8))),
 condition text NOT NULL CHECK (condition IN ('segunda','outlet')),
 name text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT '',
 base_product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
 reason text NOT NULL DEFAULT '',
 defect text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '',
 attributes jsonb NOT NULL DEFAULT '{}',
 list_price numeric(14,2) CHECK (list_price >= 0),
 discount numeric(5,2) CHECK (discount > 0 AND discount < 100),
 photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(photos)='array'),
 state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','withdrawn')),
 source_key text UNIQUE,
 version integer NOT NULL DEFAULT 1,
 created_by uuid REFERENCES auth.users(id),
 updated_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (condition <> 'segunda' OR discount IS NULL OR discount BETWEEN 5 AND 50),
 CHECK (length(trim(code)) > 0),
 CHECK (jsonb_array_length(photos)<=20)
);
CREATE TABLE public.outlet_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 unit_id uuid NOT NULL REFERENCES public.outlet_units(id),
 actor_id uuid,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 before_data jsonb,
 after_data jsonb NOT NULL
);
CREATE UNIQUE INDEX outlet_code_normalized ON public.outlet_units(lower(trim(code)));
CREATE FUNCTION public.outlet_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.sellers s WHERE s.id=auth.uid() AND s.is_active IS TRUE
 AND (s.role='admin' OR to_jsonb(s.roles) ? 'admin'));
$$;
-- AFTER audit is needed for the foreign key on newly created units.
CREATE FUNCTION public.outlet_audit_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.outlet_audit(unit_id,actor_id,before_data,after_data)
 VALUES(NEW.id,auth.uid(),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
 RETURN NEW;
END; $$;
-- Metadata trigger deliberately contains no audit insert before the new row exists.
CREATE FUNCTION public.outlet_record_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.version <> OLD.version THEN RAISE EXCEPTION 'La ficha cambió. Actualizala antes de guardar.'; END IF;
  NEW.version:=OLD.version+1;
  NEW.id:=OLD.id; NEW.created_at:=OLD.created_at; NEW.created_by:=OLD.created_by; NEW.source_key:=OLD.source_key;
 ELSE NEW.version:=1; NEW.created_by:=auth.uid(); END IF;
 NEW.updated_by:=auth.uid(); NEW.updated_at:=now();
 RETURN NEW;
END; $$;
CREATE TRIGGER outlet_metadata BEFORE INSERT OR UPDATE ON public.outlet_units FOR EACH ROW EXECUTE FUNCTION public.outlet_record_change();
CREATE TRIGGER outlet_history AFTER INSERT OR UPDATE ON public.outlet_units FOR EACH ROW EXECUTE FUNCTION public.outlet_audit_after();
ALTER TABLE public.outlet_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outlet_units,public.outlet_audit FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.outlet_units TO authenticated;
GRANT SELECT ON public.outlet_audit TO authenticated;
CREATE POLICY outlet_admin_read ON public.outlet_units FOR SELECT TO authenticated USING(public.outlet_is_admin());
CREATE POLICY outlet_admin_insert ON public.outlet_units FOR INSERT TO authenticated WITH CHECK(public.outlet_is_admin());
CREATE POLICY outlet_admin_update ON public.outlet_units FOR UPDATE TO authenticated USING(public.outlet_is_admin()) WITH CHECK(public.outlet_is_admin());
CREATE POLICY outlet_admin_history ON public.outlet_audit FOR SELECT TO authenticated USING(public.outlet_is_admin());
REVOKE ALL ON FUNCTION public.outlet_is_admin(),public.outlet_record_change(),public.outlet_audit_after() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outlet_is_admin() TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('outlet-images','outlet-images',false,8388608,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY outlet_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='outlet-images' AND public.outlet_is_admin());
CREATE POLICY outlet_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='outlet-images' AND public.outlet_is_admin());
COMMIT;

