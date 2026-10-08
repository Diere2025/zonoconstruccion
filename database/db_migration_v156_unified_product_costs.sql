BEGIN;
CREATE TABLE IF NOT EXISTS public.cost_system_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at timestamptz,
  last_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text
);
INSERT INTO public.cost_system_state(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.cost_settings (
  code text NOT NULL,
  effective date NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(code,effective)
);
CREATE TABLE IF NOT EXISTS public.cost_source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  definition jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS cost_source_versions_effective ON public.cost_source_versions(effective,recorded_at);
CREATE TABLE IF NOT EXISTS public.cost_purchase_events (
  source_key text PRIMARY KEY,
  code text NOT NULL,
  purchase_date date NOT NULL,
  data jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_purchase_events_lookup ON public.cost_purchase_events(code,purchase_date) WHERE active;
CREATE TABLE IF NOT EXISTS public.cost_purchase_event_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_key text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL,
  data jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION public.cost_audit_purchase() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR OLD.data IS DISTINCT FROM NEW.data OR OLD.active IS DISTINCT FROM NEW.active THEN
    INSERT INTO cost_purchase_event_revisions(source_key,active,data) VALUES(NEW.source_key,NEW.active,NEW.data);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cost_audit_purchase_trigger ON public.cost_purchase_events;
CREATE TRIGGER cost_audit_purchase_trigger AFTER INSERT OR UPDATE ON public.cost_purchase_events FOR EACH ROW EXECUTE FUNCTION public.cost_audit_purchase();
CREATE TABLE IF NOT EXISTS public.cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  as_of date NOT NULL,
  fingerprint text NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(code,as_of,fingerprint)
);
CREATE TABLE IF NOT EXISTS public.cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  acknowledged_at timestamptz
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unified_cost numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unified_cost_status text;
-- Private management data: only the authenticated admin API, using service_role, accesses these tables.
ALTER TABLE public.cost_system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_purchase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_purchase_event_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_system_state,public.cost_settings,public.cost_source_versions,public.cost_purchase_events,public.cost_snapshots,public.cost_alerts FROM anon,authenticated;
REVOKE ALL ON public.cost_purchase_event_revisions FROM anon,authenticated;
GRANT ALL ON public.cost_system_state,public.cost_settings,public.cost_source_versions,public.cost_purchase_events,public.cost_snapshots,public.cost_alerts TO service_role;
GRANT ALL ON public.cost_purchase_event_revisions TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.cost_purchase_event_revisions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.cost_claim_sync() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token uuid := gen_random_uuid();
BEGIN
  UPDATE cost_system_state SET lease_token=token,lease_until=now()+interval '10 minutes',last_attempt_at=now() WHERE id AND (lease_until IS NULL OR lease_until<now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN token;
END $$;
CREATE OR REPLACE FUNCTION public.cost_publish_sync(token uuid, document jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
  PERFORM 1 FROM cost_system_state WHERE id AND lease_token=token AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La actualización perdió su reserva; no se publicaron cambios.'; END IF;
  UPDATE cost_purchase_events SET active=false WHERE active AND source_key NOT IN (SELECT value->>'key' FROM jsonb_array_elements(document->'purchases'));
    INSERT INTO cost_purchase_events(source_key,code,purchase_date,data,active)
    SELECT value->>'key',value->>'code',(value->>'date')::date,value,true FROM jsonb_array_elements(document->'purchases')
    ON CONFLICT(source_key) DO UPDATE SET code=excluded.code,purchase_date=excluded.purchase_date,data=excluded.data,active=true,updated_at=now()
    WHERE cost_purchase_events.data IS DISTINCT FROM excluded.data OR NOT cost_purchase_events.active;
  IF document->'version' IS NOT NULL AND document->'version' <> 'null'::jsonb THEN
    INSERT INTO cost_source_versions(effective,fingerprint,definition) VALUES((document->'version'->>'captured')::date,document->>'versionHash',document->'version');
  END IF;
    INSERT INTO cost_snapshots(code,as_of,fingerprint,data)
    SELECT value->'data'->>'code',(value->'data'->>'date')::date,value->>'fingerprint',value->'data' FROM jsonb_array_elements(document->'snapshots') ON CONFLICT DO NOTHING;
    INSERT INTO cost_alerts(fingerprint,data)
    SELECT value->>'fingerprint',value->'data' FROM jsonb_array_elements(document->'alerts') ON CONFLICT(fingerprint) DO NOTHING;
    UPDATE cost_alerts SET acknowledged_at=now() WHERE acknowledged_at IS NULL AND (
      (data->>'type'='Datos pendientes' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(document->'payload'->'current') AS c WHERE c.value->>'code'=cost_alerts.data->>'code' AND c.value->>'coverage'=cost_alerts.data->>'reason'))
      OR (data->>'type'='Precio antiguo' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(document->'alerts') AS a WHERE a.value->>'fingerprint'=cost_alerts.fingerprint))
    );
  -- Only complete integrated costs become authoritative for new commercial calculations.
  -- Original BOM material costs, selling prices, and historical order costs are preserved.
  UPDATE products SET unified_cost=CASE WHEN current.value->>'coverage'='Completo' THEN (current.value->>'total')::numeric ELSE NULL END,unified_cost_status=current.value->>'coverage'
  FROM jsonb_array_elements(document->'payload'->'current') AS current(value)
  WHERE products.id=(current.value->>'id')::uuid OR (current.value->'equivalentIds') ? products.id::text;
  -- Discounts are commercial adjustments, not inventory or missing manufacturing costs.
  UPDATE products SET cost_price=0,unified_cost=0,unified_cost_status='Descuento'
  WHERE (name ~* '^\s*descuentos?\y' OR sku ~* '^\s*descuentos?\y')
    AND (cost_price IS DISTINCT FROM 0 OR unified_cost IS DISTINCT FROM 0 OR unified_cost_status IS DISTINCT FROM 'Descuento');
  UPDATE cost_system_state SET payload=document->'payload',updated_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id;
END $$;
CREATE OR REPLACE FUNCTION public.cost_release_sync(token uuid, failure text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE cost_system_state SET lease_token=NULL,lease_until=NULL,last_error=left(failure,500) WHERE id AND lease_token=token;
$$;
REVOKE ALL ON FUNCTION public.cost_claim_sync(),public.cost_publish_sync(uuid,jsonb),public.cost_release_sync(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cost_claim_sync(),public.cost_publish_sync(uuid,jsonb),public.cost_release_sync(uuid,text) TO service_role;
COMMIT;
