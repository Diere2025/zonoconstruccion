# Avisos de nuevas incidencias por Telegram

Al crear una incidencia, el grupo configurado recibe su código y título, el nombre de quien la creó, su prioridad en español y el enlace privado al ERP con el botón «Abrir incidencia». El acceso al enlace conserva los permisos normales del ERP. No se envían descripciones, notas internas ni archivos. Las solicitudes de envío y los cambios posteriores del ticket no generan este aviso.

## Configuración

Aplicar `database/db_migration_v235_support_telegram.sql`. La configuración inicial está desactivada y no genera avisos retroactivos. El token se toma exclusivamente del servidor: `SUPPORT_TELEGRAM_BOT_TOKEN`, o el bot existente de `LOGISTICS_TELEGRAM_BOT_TOKEN`.

El webhook existente conserva su secreto y sus demás funciones. Un mensaje `/incidencias` en un grupo llamado «Incidencias» registra su ID y nombre en `support_telegram_candidates`. Esto solo permite identificar el grupo: no activa los avisos ni cambia su destino. Después de verificar el grupo mediante Telegram y la indicación del administrador, configurar el ID numérico en la fila única de `support_telegram_settings` y habilitar `enabled`. Los destinos no se deducen automáticamente del nombre.

Las tablas de configuración, identificación y envíos están reservadas al servidor. No almacenar tokens en ellas. Para desactivar los avisos, establecer `enabled=false`; las incidencias siguen funcionando.

## Entrega y revisión

Aplicar también `database/db_migration_v236_support_personal_alert_scope.sql` para el alcance solicitado por Diego Bóveda: incidencias creadas por él, asignadas a él o del área TI / Sistemas, incluso si TI tiene otro responsable asignado. La campana del ERP aplica el mismo alcance; los demás usuarios conservan sus suscripciones de equipo. Las incidencias ajenas de Logística y de otras áreas no generan avisos para Diego. Las solicitudes de envío siguen excluidas de Telegram.

El filtro de Telegram se comprueba al crear el aviso y al tomar un trabajo pendiente. Los trabajos anteriores que quedan fuera del alcance se conservan sin enviarse. La campana oculta los avisos anteriores fuera del alcance sin borrar su historial. Ensayo transaccional con reversión: `node scripts/apply-support-personal-alert-scope.cjs`; activación: agregar `--apply`.

Un trigger guarda un único aviso por ticket dentro de la transacción de creación. La API intenta enviarlo después de guardar el ticket. La ruta de mantenimiento `/api/keep-alive` procesa también tickets creados por SQL y reintentos. La falla de Telegram no revierte la incidencia.

Los trabajos se toman con bloqueo y `skip locked`, y cada resultado se guarda con el identificador del intento. Un rechazo explícito de Telegram queda en `error` y se reintenta hasta cinco veces, respetando la demora indicada por Telegram. `last_error` conserva un diagnóstico genérico, sin credenciales ni respuestas del proveedor. Los fallos de red y los envíos que quedan sin confirmar pasan a `unknown`: revisar el grupo antes de reponerlos en `pending`, porque Telegram no ofrece una clave de idempotencia para `sendMessage`.

Para supervisar, consultar `support_telegram_jobs` por `state`, `attempts`, `next_attempt_at`, `sent_at` y `telegram_message_id`. Los avisos guardan el destino y los datos del momento de creación. Cambiar la configuración no redirige avisos ya pendientes.

Validación: `node --test tests/support-telegram.test.cjs`. Incluye formato, creación sin bloquear por errores externos, destinatario explícito, cola privada y transaccional, prioridades, exclusión de envíos, reintentos, concurrencia y tratamiento de entregas ambiguas.
