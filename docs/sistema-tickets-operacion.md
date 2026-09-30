# Incidencias: uso y operación

## Estado de la implementación

El módulo se integra al ERP de `src/` en `/incidencias`, con acceso desde “Soporte y Configuración → Incidencias y Tickets”. Cuenta con bandeja propia y de gestión, creación, conversación pública, notas internas, capturas por pegado/selección/arrastre, visor original, responsables por sector, avisos persistentes y configuración.

La migración `database/db_migration_v106_support_tickets.sql` agrega únicamente entidades `support_*`, funciones propias y un bucket privado. Fue aplicada a la base configurada en el proyecto el 28/09/2026, luego de probar permisos y transiciones dentro de una transacción de ensayo. Diego es el único administrador inicial. La publicación de la aplicación requiere desplegar la versión que incluye este módulo.

Se trasladaron las 8 incidencias de la planilla histórica el 28/09/2026, por pedido del usuario. Carolina Ibarra es la solicitante verificada de todas ellas según su indicación; Diego es el responsable. Hay 6 en revisión, 1 esperando información y 1 cerrada administrativamente. Se conservaron las fechas originales, descripciones, prioridades, observaciones privadas y las 2 imágenes originales. No hay integraciones de correo/WhatsApp ni cierre por vencimiento.

## Para quienes cargan incidencias

1. Abrir Incidencias y elegir Nuevo ticket.
2. Escribir título y descripción, elegir el área responsable y asignar la atención a una persona o al equipo de esa área. Indicar por separado el área o módulo afectado y el tipo de solicitud.
3. Pegar una captura con Ctrl+V en el mensaje o zona de adjuntos, arrastrarla o seleccionarla. Se aceptan JPG, PNG y WebP. Hasta 5 imágenes y 25 MB por envío; cada una hasta 10 MB.
4. Enviar. El ticket aparece en Mis solicitudes; otros solicitantes no pueden verlo.
5. Cuando se solicite información o una acción, elegir Responder solicitud. Un comentario común conserva el estado pendiente.
6. Cuando la solución esté lista para probar, seguir las instrucciones. Elegir Funciona, cerrar solo después de comprobarlo. Si falla, elegir Sigue fallando y explicar qué ocurrió.
7. Si vuelve a ocurrir después del cierre, reabrir el mismo ticket con una explicación.

## Para Diego y responsables

- Gestión muestra únicamente los sectores autorizados; Diego tiene acceso global al módulo.
- La entrada `/incidencias` abre Gestión para administradores y responsables de sector. Para los solicitantes abre sus propias solicitudes. La pestaña Mis solicitudes permite a un gestor consultar solo los tickets que solicitó personalmente, mediante `/incidencias/mis`.
- La tabla de Gestión distingue solicitante y responsable en columnas. En las 8 incidencias históricas, Carolina Ibarra es la solicitante y Diego el responsable; por eso aparecen en Gestión para Diego y en Mis solicitudes para Carolina.
- `scripts/test-support-landing.cjs` comprobó en Chrome que un administrador entra directamente a Gestión, ve las 8 incidencias de Carolina y su nombre como solicitante, puede abrir el detalle y mantiene separadas sus solicitudes personales. Utiliza una cuenta temporal; no cambia los tickets importados. La revisión de tipos y el lint de las pantallas modificadas también pasaron.
- Cada incidencia tiene como responsable una persona o el equipo del área elegida. Los tickets del equipo aparecen en Pendientes de sus gestores; A mi cargo muestra las asignaciones personales. Área responsable y área o módulo afectado son datos diferentes.
- Pedir información o pedir una acción conserva al responsable y coloca la siguiente tarea en manos del creador.
- Solicitar prueba requiere explicar la solución y cómo probarla.
- Mensajes públicos y notas internas tienen áreas distintas. Las notas y sus imágenes quedan reservadas a los gestores habilitados.
- Un cierre administrativo exige motivo y queda identificado como cierre sin validación del solicitante.
- Configuración permite agregar/renombrar áreas y habilitar sus integrantes. Quitar un permiso devuelve el trabajo abierto de esa persona al equipo del área si pierde capacidad para gestionarlo.
- Para desactivar un sector, transferir primero sus tickets abiertos. Para otorgar administración global, usar el control específico: no cambia roles del ERP.
- Al navegar mediante “Ver como”, la interfaz aplica la identidad del usuario efectivo y bloquea los cambios a través de las rutas del módulo.

## Interfaz compacta y circuito de cierre

La bandeja muestra columnas de ticket, estado, solicitante, responsable, sector, prioridad y actualización. En pantallas pequeñas conserva ticket/estado y permite desplegar los otros datos por fila. Los filtros quedan en la URL y se restauran con «Volver a la bandeja». Las ocho incidencias históricas caben en una pantalla de 1440 × 900.

1. Abrir el ticket y elegir **Enviar a revisión**, visible arriba. Completar **Qué se resolvió** y **Qué debe probar**. Se puede enviar directamente desde Nuevo, sin tomarlo antes.
2. El estado queda **En revisión** y la bandeja indica quién debe probar. El solicitante ve las instrucciones y las acciones **Funciona, cerrar** o **Sigue fallando**. Si falla, explica el resultado y el caso vuelve a atención.
3. El administrador puede elegir **Cerrar ahora** en cualquier estado abierto y registrar el motivo. El sistema cancela la solicitud pendiente y registra cierre administrativo sin atribuir validación al solicitante. No hay cierre por tiempo transcurrido.
4. Pedir información, pedir una acción, retomar atención, cancelar y reabrir están en **Más acciones**. Responsable, clasificación y transferencia están en **Editar datos**.

El detalle muestra los datos principales en una fila y el reporte junto a la conversación. La captura original permanece visible. **Conversación** muestra mensajes públicos recientes, **Actividad** conserva eventos e importaciones desplegables y **Notas internas** está reservada a gestores. La categoría se filtra en servidor antes de paginar 20 eventos, sin descargar notas privadas para ocultarlas después.

La migración `db_migration_v109_support_compact_workflow.sql` está aplicada: habilita revisión desde Nuevo y entrega nombres de participantes exclusivamente de tickets que el usuario puede leer. `node scripts/apply-support-compact.cjs` ensaya la migración en una transacción revertida; `--apply` confirma DDL y recarga el esquema.

La verificación de aplicación pasó 45 controles: captura pegada y visor, privacidad de archivos/notas, paginación por categoría, rechazo y nueva revisión, cierre confirmado desde móvil, revisión directa desde Nuevo, cierre administrativo que cancela la prueba pendiente, filas compactas y ausencia de desbordamiento a 1280, 768 y 390 px. Las cuentas y los datos de ensayo fueron eliminados. La prueba de navegación comprobó las ocho filas de Carolina, separación de Mis solicitudes y conservación de filtros al volver. Capturas: `output/support-tests/carolina-table-desktop.png`, `compact-table-desktop.png`, `compact-table-mobile.png` y `validacion-mobile.png`.

## Identidad y privacidad

El módulo verifica la sesión con Supabase Auth y usa permisos de la base. El vínculo con `sellers` se registra por ID; el fallback exige correo confirmado y coincidencias exactas únicas. Un usuario nuevo del ERP se registra al ingresar al módulo si tiene un vínculo válido. Los casos sin perfil o ambiguos se rechazan.

El creador es inmutable y deriva de la sesión. Los roles comerciales, nombres de correo y metadatos editables no otorgan gestión de incidencias. Las lecturas de mensajes, acciones, notificaciones y adjuntos heredan el permiso del ticket. Las notas internas agregan un permiso de gestión. Los archivos se entregan después de autorizar cada descarga, sin URL pública ni caché compartido.

## Configuración del entorno

Se reutilizan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La clave de servicio se usa únicamente en servidor para operaciones de almacenamiento verificadas. `DATABASE_URL` se requiere solo para scripts administrativos y pruebas SQL; no se expone al navegador.

Controles opcionales de despliegue:

- `SUPPORT_ENABLED=false`: deshabilita las rutas del módulo, conservando los datos. No es una revocación de permisos de base; para detener también RPC/REST directos, revocar su ejecución/lectura mediante una operación administrativa de base controlada.
- `SUPPORT_PILOT_USER_IDS`: lista de UUID separados por coma para limitar las rutas de aplicación durante un piloto. No amplía permisos RLS y no sustituye sus reglas. Sin esta variable, cualquier usuario con perfil activo puede cargar incidencias propias.

Las rutas API se implementan en `src/app/api/support/[...path]/route.ts`. El contrato mantiene `/api/support/me`, tickets, timeline, mensajes, acciones, adjuntos, notificaciones y configuración. La carga multipart reúne reserva, subida y finalización en `/api/support/uploads`; la publicación del mensaje/ticket vincula luego los archivos de forma transaccional. Cada imagen incluye hash para verificar reintentos. Una falla conserva el texto en la pantalla y permite reintentar con la misma clave.

## Comprobaciones

- `node --test tests/support-validation.test.cjs`: validación de imágenes, tamaños, operaciones y errores sin exposición de datos de base.
- `node scripts/test-support-database.cjs`: ensaya con roles reales `authenticated` y `anon`, usuarios sintéticos, circuito completo, revocación, archivo interno, permisos directos y volumen de 5.000 tickets / 50.000 mensajes. Revierte todas las filas al finalizar. Si el esquema ya está instalado, los números de secuencia pueden avanzar: los códigos admiten huecos.
- `node scripts/test-support-live.cjs`: prueba rutas, Storage y navegador con cuentas/tickets de ensayo que se eliminan al finalizar. Requiere la aplicación local, Playwright y Chrome. `SUPPORT_TEST_URL` define su URL; por defecto usa `http://localhost:3106`. Si Playwright no está en dependencias locales, definir `PLAYWRIGHT_MODULE` con el paquete disponible del entorno.
- `npx eslint src/lib/support src/components/support src/app/incidencias 'src/app/api/support/[...path]/route.ts'`, `npx tsc --noEmit` y compilación Next.js.

Para la verificación de compilación en este entorno Windows se usa `node scripts/build-support-check.cjs`. Activa `SUPPORT_BUILD_NO_CACHE=1` y `SUPPORT_DIST_DIR=output/support-next` exclusivamente en ese proceso, evitando fallos de snapshots y conflictos con otros builds locales. Los builds habituales mantienen `.next`. El registro se escribe en `output/support-tests/build.log`. Para servir esta compilación, usar el mismo `SUPPORT_DIST_DIR` al iniciar Next.js.

El primer ensayo SQL final pasó 41 comprobaciones. La consulta paginada medida en ese ensayo ejecutó en 4,009 ms: es una medición de ejecución de base, no una latencia de red ni un p95 de producción.

El ensayo final de aplicación pasó 35 comprobaciones sobre la versión compilada: creación desde Chrome con captura pegada, visor a tamaño original, reintento idempotente, respuestas 404 para usuarios ajenos, imágenes internas privadas incluso mediante acceso directo a Storage, solicitud/respuesta, prueba rechazada y reenviada, cierre confirmado desde una pantalla de 390 px, gestión con rol laboral Logística y pérdida de acceso tras transferencia. Los datos y las cuentas de ensayo se eliminaron. Las capturas con datos ficticios quedaron en `output/support-tests/`.

La compilación final sin caché, la revisión de tipos y el lint del módulo terminaron correctamente. Pasaron también 21 pruebas unitarias combinadas de validación del módulo y regresión del manejo de sesión/roles existente, incluyendo `tests/support-session.test.cjs`.

Si el servidor no puede consultar Auth, el módulo responde 503 y permite reintentar sin renovar la sesión. El mensaje de sesión vencida se reserva para credenciales rechazadas. Las consultas concurrentes reutilizan un token que ya fue renovado por otra consulta o pestaña. Todas las consultas de Supabase del módulo omiten la caché de Next.js. En el entorno local, un servidor iniciado sin acceso de red mostró falsamente «La sesión venció» incluso con cuentas recién creadas; reiniciar el servidor con acceso al servicio de autenticación restableció las consultas de identidad y notificaciones.

Tras esta corrección, el ensayo completo pasó nuevamente sus 35 comprobaciones en `http://localhost:3000`, incluyendo captura pegada, cierre desde móvil y privacidad de tickets y adjuntos. Se eliminaron todas las cuentas y los datos de ensayo; la inspección posterior confirmó cero usuarios de ensayo restantes.

## Importación histórica

La fuente es «Control de Pruebas y Mejoras - Implementación Sistema», spreadsheet `18H-pW18IfljVS8M0ktND0utplFo360dRZgppj2XjThI`, hoja `1388968269`. Se leyó con la cuenta de servicio configurada, sin modificar la planilla. La exportación nativa de Sheets permitió recuperar las imágenes aunque la API de Drive no estaba habilitada.

El usuario identificó expresamente a Carolina Ibarra como solicitante. Se verificó una sola cuenta activa vinculada con ese nombre; no se dedujo autoría de los nombres mencionados en las descripciones. Los casos son de TI / Sistemas y conservan «Tesorería y Finanzas» como módulo afectado.

«Finalizado» con «Probar» pasó a Listo para probar con una solicitud abierta para Carolina. La incidencia pendiente con pedido de especificaciones pasó a Esperando tu respuesta. El ID original 6, finalizado sin prueba pendiente, pasó a cierre administrativo histórico, sin afirmar validación del solicitante. La planilla no registra hora ni fecha de cierre: la fecha original se conserva como fecha del reporte y el cierre administrativo utiliza la fecha de importación, con esta distinción en la procedencia.

Los códigos nuevos son INC-000018 a INC-000025; los IDs originales 1 a 8 permanecen en la procedencia. Las observaciones completas quedan como notas internas, y las solicitudes de prueba/información aparecen como mensajes públicos explícitamente identificados como trasladados de la planilla. No se enviaron avisos masivos ni mensajes externos.

`database/db_migration_v107_support_imports.sql` agrega un registro privado de procedencia, visible únicamente a administradores de soporte, sin permisos de escritura desde el cliente. `scripts/support-read-sheet.cjs` obtiene una instantánea de solo lectura; `scripts/support-extract-sheet-images.py` extrae las imágenes y sus anclajes sin modificarlas. `scripts/support-import-sheet.cjs` prepara una vista previa; `--apply` ejecuta la importación autorizada. El importador está limitado a esta fuente y estos 8 IDs; detiene filas desconocidas. Repetir una fuente idéntica no duplica; cambios en una fila ya importada requieren revisión y no sobrescriben tickets intervenidos.

La preparación del esquema se confirma antes de subir imágenes: los hooks de DDL de esta base bloquean temporalmente Auth y Storage, por lo que no se mantiene DDL abierto durante una transferencia. Las filas del lote se confirman juntas; si falla, se revierten y se eliminan los objetos subidos en ese intento.

`node scripts/support-verify-import.cjs` comprobó los 8 tickets, integridad de los 2 originales por SHA-256, privacidad de las notas y del registro de importación, acceso de Carolina y bloqueo de usuarios ajenos. Probó confirmar, rechazar y responder dentro de una transacción revertida. No altera permanentemente los estados. Los archivos de instantánea, inventario y resultado están en `output/support-import/` para auditoría administrativa.

## Mantenimiento y reversión

`node scripts/apply-support-migration.cjs` consulta el estado sin modificar. `--apply` instala v106 si no existe, en una transacción; valida el administrador inicial y recarga el esquema de la API. Si ya existe, no ejecuta nuevamente el DDL. Cambios futuros requieren nuevas migraciones.

`node scripts/support-maintenance.cjs` inventaría reservas vencidas. Con `--apply`, elimina hasta 200 objetos vencidos no publicados y marca sus reservas como rechazadas. No toca archivos vinculados a tickets. Ejecutar periódicamente desde un host administrativo configurado; repetir hasta vaciar lotes grandes. No se creó una automatización externa durante esta implementación.

Los adjuntos publicados y el historial no tienen borrado desde la interfaz. Acordar una política de retención antes de agregar eliminación automática. Mantener respaldo de Postgres y de los objetos de Storage por separado; no asumir que uno contiene al otro.

Para revertir una publicación, volver a la versión anterior de la aplicación y desactivar las rutas del módulo. Conservar tablas y archivos para poder retomar. No deshacer v106 mediante borrado de datos. El cambio de navegación en `AdminLayout` es acotado: agrega el acceso para usuarios de todos los sectores.


## Solicitudes a Logística: cotización de envíos

El acceso está en Logística y Distribución → Solicitudes a Logística, ruta /solicitudes-logistica. Reutiliza los permisos, conversación, adjuntos privados y avisos de soporte, con una bandeja y circuito propios. La migración v123 está aplicada. Pablo Jara (cuenta de Logística pablojara@zono.com.ar) y Matías Vega son responsables habilitados en el sector de Logística; no se modificaron sus roles del ERP. La otra cuenta homónima de Pablo no recibió permisos.

1. Ventas elige Solicitar cotización y completa localidad, provincia, CP y productos con cantidades. Puede agregar cliente, dirección, condiciones, referencia de presupuesto/pedido e imágenes. La referencia es descriptiva: no cambia un pedido ni confirma un despacho.
2. Logística ve todas las solicitudes abiertas de su sector. Puede tomar una, asignarla entre los responsables habilitados o pedir información al solicitante.
3. Publicar cotización permite hasta cinco alternativas con expreso, costo de transporte, importe al cliente en ARS, pago en origen/destino, plazo, vigencia y condiciones. Si no hay transporte posible, Finalizar sin elección requiere motivo.
4. Ventas elige una opción vigente y finaliza, pide recotización con motivo o cancela la solicitud. Logística también puede cancelar. Restaurar una cancelada requiere administrador. La selección no programa una entrega ni modifica importes comerciales.
5. Una cotización vencida no puede elegirse. La fecha incluye todo el día indicado en Buenos Aires. Después de reabrir o pedir recotización, las alternativas anteriores se muestran como referencia y requieren nueva publicación.

Los estados son Pendiente, Cotizando, Faltan datos, Cotizada, Finalizada y Cancelada. Internamente usan los estados existentes con workflow=shipping; las incidencias conservan workflow=incident y su circuito original. La bandeja inicial de envíos muestra todas las abiertas, incluyendo las que están a cargo del equipo de Logística. Todas incluye también finalizadas y canceladas. Los avisos enlazan a la sección correspondiente.

La función support_command valida datos y transiciones también ante RPC directa. support_command_core queda privada; los cambios conservan control de versión, permisos e idempotencia. Las alternativas publicadas quedan en el mensaje y evento histórico, además de la cotización actual. El solicitante continúa viendo solo sus solicitudes; los gestores habilitados ven su sector. No se comparte un tarifario entre vendedores ni se envían mensajes externos.

Validación: 44 controles transaccionales de base (datos ficticios revertidos), 18 pruebas unitarias/de regresión, lint del módulo y revisión de tipos de src. El ensayo scripts/test-shipping-live.cjs verificó creación, publicación, recotización y selección desde Chrome, avisos con enlaces correctos, acceso ajeno denegado y separación de incidencias; elimina sus cuentas y tickets al finalizar. Capturas en output/shipping-tests/. La revisión de tipos global encuentra errores en copias históricas bajo output/contado-2026-09-30/code-before; la configuración de comprobación acotada a src está en output/shipping-tests/tsconfig.json.

node scripts/apply-shipping-requests.cjs ensaya dentro de una transacción revertida. --apply instala si falta, ejecuta los controles, habilita las dos cuentas verificadas y recarga el esquema. No reaplicar v109 después de v123: reemplazaría la función envolvente. La aplicación publicada necesita un despliegue con estas rutas; la migración sola no publica pantallas.


## Integración de incidencias y solicitudes a Logística (30/09/2026)

Los cambios de los chats «Mostrar incidencias nuevas» y «Evaluar gestión en sistema de ticket» conviven en la misma carpeta de trabajo, `D:/GitHub/zonoconstruccion`, en la rama `codex/optimizacion-rendimiento`. El trabajo del módulo continúa en «Mostrar incidencias nuevas» con ambos contextos consolidados. No hay una segunda rama de estos chats que se deba fusionar.

- La campana de la barra superior funciona en todo el ERP y reúne avisos de incidencias y solicitudes a Logística. Prioriza los avisos sin leer, cuenta también los que exceden la vista previa y abre cada ticket en su sección correspondiente. Se actualiza cada 30 segundos y después de leer un ticket.
- Las incidencias requieren elegir un responsable desde su creación: una persona habilitada o el equipo del área. Las solicitudes de cotización se destinan automáticamente al equipo de Logística, donde Pablo Jara y Matías Vega conservan sus permisos.
- **Editar datos** presenta una sola selección de área y responsable, prioridad y tipo. El motivo se pide solo si cambia el área. **Guardar cambios** guarda la edición completa en una transacción; si falla una parte, no se aplican cambios parciales. En cotizaciones se conserva el área de Logística y el tipo de solicitud operativa.
- El encabezado del detalle acompaña el desplazamiento normal de la página para que no se superponga al formulario.
- Las migraciones `db_migration_v123_shipping_requests.sql`, `db_migration_v124_support_responsibility.sql` y `db_migration_v125_support_edit_ticket.sql` están aplicadas. La última corrige también la validación duplicada que bloqueaba transferencias. No reaplicar v109 ni reemplazar las funciones de soporte con definiciones anteriores a estas migraciones.

Validación conjunta: `node --test tests/support-session.test.cjs tests/support-validation.test.cjs tests/support-notifications.test.cjs tests/support-responsibility.test.cjs tests/shipping-requests.test.cjs`. Los ensayos SQL de `scripts/apply-shipping-requests.cjs` y `scripts/test-support-responsibility-database.cjs`, sin `--apply`, revierten todos sus datos. La aplicación local usa el código conjunto; la publicación del sitio sigue pendiente de un despliegue de ese mismo conjunto.
