-- Migration V38: Seed active phone lines
DO $$
DECLARE
  v_names TEXT[] := ARRAY['Línea 3690', 'Línea 3881', 'Línea 3375'];
  v_numbers TEXT[] := ARRAY['1140473690', '1123783881', '1164743375'];
  i INT;
BEGIN
  FOR i IN 1..3 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.phone_lines WHERE phone_number = v_numbers[i]) THEN
      INSERT INTO public.phone_lines (name, phone_number, is_active) VALUES (v_names[i], v_numbers[i], true);
    ELSE
      UPDATE public.phone_lines SET name = v_names[i], is_active = true WHERE phone_number = v_numbers[i];
    END IF;
  END LOOP;
END $$;
