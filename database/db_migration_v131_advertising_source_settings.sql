BEGIN;

ALTER TABLE public.advertising_sources
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'minorista'
    CHECK (channel IN ('minorista', 'mayorista', 'ambos')),
  ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE public.advertising_sources
SET channel = 'mayorista'
WHERE name IN ('Cliente', 'Página web', 'Reenviado de Minorista', 'Recomendado', 'Otro')
  AND sort_order IS NULL;

-- Conservar el orden inicial conocido; las nuevas opciones se administran en Ajustes.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY
    CASE name
      WHEN 'Meta - Escaleras' THEN 1
      WHEN 'Meta - Tanques Aquafort' THEN 2
      WHEN 'Meta - Termotanques Universal' THEN 3
      WHEN 'Meta - Termotanques Cooper' THEN 4
      WHEN 'Meta - Biodigestores Biofort' THEN 5
      WHEN 'Meta - MEPS / Equilibrio' THEN 6
      WHEN 'Meta - Látex Zono' THEN 7
      WHEN 'Orgánico / Cliente Habitual / Recomendado' THEN 8
      WHEN 'Cliente' THEN 101
      WHEN 'Página web' THEN 102
      WHEN 'Reenviado de Minorista' THEN 103
      WHEN 'Recomendado' THEN 104
      WHEN 'Otro' THEN 105
      WHEN 'Mayorista' THEN 1000000
      ELSE 100 END, name, id) AS position
  FROM public.advertising_sources
)
UPDATE public.advertising_sources source
SET sort_order = ordered.position::integer
FROM ordered WHERE source.id = ordered.id AND source.sort_order IS NULL;

ALTER TABLE public.advertising_sources ALTER COLUMN sort_order SET DEFAULT 1000000;

-- Guardar el orden completo en una transacción y respetar las políticas de la tabla.
CREATE OR REPLACE FUNCTION public.reorder_advertising_sources(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE affected integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo los administradores pueden ordenar procedencias.' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.advertising_sources IN SHARE ROW EXCLUSIVE MODE;
  IF p_ids IS NULL OR cardinality(p_ids) <> (SELECT count(*) FROM public.advertising_sources)
    OR cardinality(p_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_ids) id) THEN
    RAISE EXCEPTION 'La lista cambió. Actualizá e intentá nuevamente.';
  END IF;
  UPDATE public.advertising_sources source SET sort_order = ordered.position::integer
  FROM unnest(p_ids) WITH ORDINALITY AS ordered(id, position)
  WHERE source.id = ordered.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'No se pudo guardar el orden completo.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_advertising_sources(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_advertising_sources(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
