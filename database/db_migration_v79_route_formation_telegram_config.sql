-- Migration V79: grupo operativo para avisos de formación de recorridos

INSERT INTO public.site_settings (id, value, updated_at)
VALUES (
  'route_formation_telegram_config',
  '{"chat_id":"-1002044363540","title":"Pedidos (formación de recorridos)"}',
  timezone('utc'::text, now())
)
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;
