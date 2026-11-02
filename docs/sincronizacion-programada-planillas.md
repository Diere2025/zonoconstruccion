# Sincronización programada de planillas

El ejecutor `workers/planillas-sync` usa las mismas APIs y reglas de negocio de la sincronización manual del ERP. Se publica como Worker independiente en la cuenta de Cloudflare existente; no necesita una computadora encendida ni una pantalla abierta.

Horarios diarios de Argentina (`America/Argentina/Buenos_Aires`): **07:00, 14:00 y 23:30**. Los disparadores internos UTC son `0 10 * * *`, `0 17 * * *` y `30 2 * * *`. Son horas de inicio; la finalización depende del volumen de pedidos y de las fuentes.

## Alcance y secuencia

1. Lee el índice de pedidos y descarga las cuatro planillas de vendedores, Central y Stock. Valida encabezados y errores de fórmula antes de escribir.
2. Procesa vendedores y luego Central, de forma secuencial y en lotes adaptables de 5 a 20 pedidos. Conserva las reglas de continuación de filas del importador manual. Usa coincidencias completas de códigos y respeta la prioridad de Central.
3. Concilia estados, artículos y fechas con logística por lotes. Usa la revisión de tres días más los pendientes operativos y la revisión completa semanal que determina el ERP.
4. Vuelve a comprobar la fuente de Stock y sus productos vinculados. Solo después actualiza el stock físico y recalcula las reservas mediante la API existente.

Mantiene las opciones actuales: omite ENC, incluye CAMB y no sincroniza las reglas de medios de pago. No introduce reglas de reclasificación ni una importación indiscriminada del historial de vendedores. Un pedido histórico terminado en Central solo se procesa si sigue activo en el ERP, como en la pantalla manual.

## Registro y exclusión

`scheduled_sheet_sync_runs` guarda inicio, progreso, cantidades, cierre y error. Las marcas de tiempo se almacenan como instantes; al presentarlas se deben formatear en Argentina y con fecha DD/MM/YYYY.

La reserva de turno es atómica y dura 20 minutos; una ejecución tiene un plazo de 12 minutos. Una clave única evita repetir el mismo evento del programador. Una nueva ejecución recupera y registra como fallida una corrida cuyo turno venció sin cierre. Ante una falla conserva el turno hasta vencer para dejar terminar posibles solicitudes HTTP en el ERP. Respeta también trabajos activos del importador antiguo `import_jobs`.

Esta exclusión cubre el ejecutor automático y sus controles `/run` y `/preview`. La pantalla manual actual procesa los lotes desde el navegador y no participa de este bloqueo. No iniciar ambas sincronizaciones simultáneamente; integrar el mismo turno en esa pantalla requiere publicar ese cambio en el ERP.

Una fuente inválida, un lote con advertencias, un error HTTP, un cursor sin avance o un conflicto de fechas interrumpe la corrida y registra el fallo. Los cambios de etapas ya completadas se conservan. No se reintentan escrituras ante fallos de red ambiguos ni se presenta una corrida parcial como completa. No se envían mensajes a terceros.

## Credencial exclusiva

El Worker **no recibe la clave privada general de Supabase ni una sesión de administrador**. Usa la clave pública anónima y una credencial nueva de 256 bits para el registro, la exclusión y la ejecución de esta sincronización. La base solo conserva su SHA-256. Las tablas de registro y credenciales tienen RLS y no son accesibles directamente para usuarios anónimos o autenticados.

La API de importación admite esa credencial únicamente durante una corrida real con turno vigente y en la etapa del vendedor correspondiente. Verifica las cinco fuentes, vendedor, canal, opciones fijas, identidad de corrida y lotes de hasta 20 filas. La autorización de esa capacidad es una función exclusiva del servidor; no crea una identidad administradora ni da acceso general al ERP. Las solicitudes manuales conservan su autenticación de administrador.

Los controles HTTP del Worker exigen la misma credencial. No incluir su valor en repositorios, documentación o salidas de consola. El archivo local `output/scheduled-sheet-sync/control-token` y la evidencia de ejecuciones están excluidos de Git.

## Operación

Desde la raíz del repositorio, con Node y los certificados confiables del sistema:

```powershell
node --test tests/scheduled-sheet-sync.test.mjs
node scripts/setup-scheduled-sheet-sync.cjs check-db
node scripts/setup-scheduled-sheet-sync.cjs apply-db
node --use-system-ca scripts/setup-scheduled-sheet-sync.cjs deploy
node --use-system-ca scripts/setup-scheduled-sheet-sync.cjs preview
node --use-system-ca scripts/setup-scheduled-sheet-sync.cjs run
node --use-system-ca scripts/setup-scheduled-sheet-sync.cjs activate
node --use-system-ca scripts/setup-scheduled-sheet-sync.cjs status
```

`check-db` ensaya SQL y revierte todos los cambios. `apply-db` instala el registro y registra el hash de la credencial local. `deploy` publica el Worker sin crear disparadores nuevos y conserva los horarios si ya existían. `preview` verifica las fuentes y logística sin escribir pedidos o stock. `activate` exige evidencia de una vista previa y una corrida completas antes de crear los tres disparadores. `deactivate` elimina únicamente los disparadores de este Worker; conserva código y registros.

El despliegue requiere autorización para guardar la credencial limitada en la cuenta de Cloudflare. El estado operativo se verifica leyendo los horarios instalados y el registro real; la existencia de los archivos de código no demuestra que la programación esté activa.
