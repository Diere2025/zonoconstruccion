-- Migration V37: Normalize and sync advertising sources and order mediums
DO $$
DECLARE
  v_source TEXT;
  v_sources TEXT[] := ARRAY['Recomendado', 'Catálogo de WB', 'Estados de WB', 'Publicidad Meta', 'Recupero', 'Transferido', 'Marketplace FB', 'Pagina Web', 'Local o Depósito', 'Cliente', 'No definido'];
  
  v_medium_name TEXT;
  v_medium_req BOOLEAN;
  v_mediums_names TEXT[] := ARRAY['Messenger FB', 'Llamado 3690', 'Llamado 3881', 'Llamado', 'WhatsApp 3690', 'WhatsApp 3881', 'WP Mayorista 3375', 'Whaticket', 'Otro'];
  v_mediums_reqs BOOLEAN[] := ARRAY[false, true, true, true, true, true, true, true, false];
  i INT;
BEGIN
  -- 1. Deactivate all existing options
  UPDATE public.advertising_sources SET is_active = false;
  UPDATE public.order_mediums SET is_active = false;

  -- 2. Sync advertising sources (upsert by name)
  FOREACH v_source IN ARRAY v_sources LOOP
    IF EXISTS (SELECT 1 FROM public.advertising_sources WHERE name = v_source) THEN
      UPDATE public.advertising_sources SET is_active = true WHERE name = v_source;
    ELSE
      INSERT INTO public.advertising_sources (name, is_active) VALUES (v_source, true);
    END IF;
  END LOOP;

  -- 3. Sync order mediums (upsert by name)
  FOR i IN 1..array_length(v_mediums_names, 1) LOOP
    v_medium_name := v_mediums_names[i];
    v_medium_req := v_mediums_reqs[i];
    IF EXISTS (SELECT 1 FROM public.order_mediums WHERE name = v_medium_name) THEN
      UPDATE public.order_mediums SET is_active = true, requires_phone_line = v_medium_req WHERE name = v_medium_name;
    ELSE
      INSERT INTO public.order_mediums (name, requires_phone_line, is_active) VALUES (v_medium_name, v_medium_req, true);
    END IF;
  END LOOP;
END $$;
