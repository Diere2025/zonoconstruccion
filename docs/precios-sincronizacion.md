# Cambios de precios: ERP, BD PRECIOS y Telegram

Cada modificación real de `products.price` registra un evento en `price_change_events`, con el producto, el precio anterior, el nuevo y la fecha de Argentina. No genera eventos al guardar el mismo precio ni al crear un producto. El trigger cubre ediciones, importaciones, SQL y precios programados.

Al confirmar la transacción, `pg_net` llama al webhook autenticado del worker `zono-price-sync`. El webhook acepta el trabajo en Cloudflare Queues antes de responder HTTP 202. No hay cron ni consultas periódicas en reposo. Una importación con varios cambios dentro de una transacción genera un solo despertar; el consumidor procesa la cola pendiente.

El consumidor agrega la vigencia en **BD PRECIOS → PVP por Fecha**, columnas A:C. Conserva el historial y escribe una fecha nativa con formato DD/MM/YYYY. La fila y un identificador de evento se guardan en una operación atómica de Sheets: una respuesta perdida no duplica la fila al reintentar. Después envía al grupo **Precios 💲** el producto, los precios anterior y nuevo y la fecha del cambio.

La cola `zono-price-changes` procesa una ejecución a la vez. Los lotes pendientes continúan mediante eventos nuevos; las operaciones con errores se reintentan con demora. Al agotar 20 reintentos, el mensaje queda en `zono-price-changes-failed` para revisión. Los eventos originales permanecen en Postgres. Si Telegram no confirma una entrega, queda en estado `unknown` y requiere revisar el grupo antes de reenviar, porque Telegram no ofrece una clave de idempotencia para `sendMessage`.

Las credenciales de Google y Telegram y el token de control son secretos del worker. La credencial del webhook de Postgres está cifrada en Vault. Las tablas de configuración y eventos no tienen acceso público; las funciones de procesamiento exigen el token de control.

## Archivos y despliegue

- Aplicar primero `database/price_change_sync.sql` y después `database/price_change_webhook.sql`.
- Desplegar `workers/price-sync/index.mjs` con las colas de `wrangler.toml` y los secretos `CONTROL_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY` y `TELEGRAM_BOT_TOKEN`. Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- Guardar el token de control en Vault y referenciarlo mediante `price_change_sync_settings.dispatch_secret_id`; configurar el destino `/wake`. Conservar el hash de autorización y el grupo verificado de la configuración existente.
- La lista de cron de este worker debe estar vacía. No volver a activar la programación por minuto del despliegue inicial.

## Verificación y seguimiento

`node --test tests/price-change-sync.test.mjs` verifica la escritura idempotente, el orden de las operaciones, los fallos y el procesamiento de la cola. `scripts/test-price-change-sync-db.cjs` y `scripts/test-price-webhook-db.cjs` usan transacciones revertidas: no alteran precios reales ni envían mensajes de prueba.

`last_webhook_request_id` identifica la respuesta en `net._http_response`; `last_webhook_requested_at` y `last_worker_at` permiten comprobar que llegó al consumidor. Un fallo de transporte antes de la aceptación HTTP 202 queda registrado en `pg_net`; se puede volver a ejecutar `request_price_sync_wake()` como administrador para recuperar los eventos pendientes. Un cambio posterior también despierta el procesamiento de esos eventos.

El precio de Satinado Polacrin 10L se verificó en ERP y en la vigencia del **04/11/2026**, a **$87.800**. El aviso original fue confirmado por Telegram con identificador 39. La verificación del webhook no modificó precios ni repitió ese aviso.

## Limitación de la planilla

La fórmula protegida de «LISTA PRECIOS ACTUAL» ordena únicamente por fecha. Está pendiente ajustar el desempate para que, ante varios cambios del mismo producto en un día, el último registro sea el elegido. El webhook conserva todas las vigencias; esta limitación afecta a las fórmulas que calculan la lista actual.
