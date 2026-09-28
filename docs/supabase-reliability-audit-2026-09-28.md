# Auditoría de disponibilidad de Supabase — 28/09/2026

Proyecto: Zonoconstruccion_Website. Horarios locales de Argentina (UTC−3).

## Conclusión

Hay fallas reales del servidor que afectan simultáneamente consultas, autenticación y actualizaciones en tiempo real. Se observaron consultas lentas, rechazo de conexiones y reinicios de PostgreSQL. También hay defectos del cliente que pueden producir bloqueos o conexiones innecesarias. La capacidad Nano es un riesgo concreto; no está demostrado que sea la única causa de los reinicios ni que estos fueran automáticos.

## Evidencia y alcance

- Captura inicial: 17.377 solicitudes y 92,1% de éxito; 865 errores Gateway, 251 Postgres, 135 Auth y 91 Realtime.
- Durante la revisión el panel mostró estado Unhealthy y mayores contadores. Son mediciones de momentos distintos.
- Ventana de registros seleccionada: 27/09 aproximadamente 14:26 hasta 28/09 aproximadamente 14:26. Se completó la paginación de errores Postgres (346), Auth (160) y Realtime (102). Los números son registros, no solicitudes únicas; no se deben sumar entre servicios ni equiparar a la captura.
- Gateway y PostgREST: revisión de muestras de errores y rutas afectadas; no se descargó un inventario completo de cada solicitud HTTP.
- Diagnóstico SQL con una conexión y transacción de solo lectura. No se ejecutaron tareas de procesamiento ni pruebas de integración que escriban en producción.

## Clasificación de todos los errores Postgres de la ventana

| Código / motivo | Registros | Interpretación |
|---|---:|---|
| 57P03 shutting down | 154 | Base cerrándose; los demás servicios pierden acceso |
| 57P03 not accepting connections | 10 | Base rechaza nuevas conexiones |
| 57P03 starting up | 2 | Recuperación/inicio de la base |
| 57P01 administrator command | 40 | Terminación administrativa; no identifica quién ni por qué reinició |
| 57014 statement timeout | 88 | Consulta excedió su plazo; incluye algunos diagnósticos propios posteriores a las 14:21 |
| 57014 user request | 24 | Consulta cancelada; no demuestra caída por sí misma |
| 08006 client lost | 11 | Conexión perdida; puede ser consecuencia de demora o desconexión del cliente |
| 55P03 lock timeout | 1 | Espera de bloqueo excedida |
| 42703 columna inexistente | 3 | clients.full_name, clients_1.full_name, sellers.name |
| 23503 cuenta financiera inexistente | 3 | Validación de integridad al crear movimiento |
| P0001 pedido ajeno a rendición | 4 | Validación de negocio |
| P0001 movimientos cambiaron | 3 | Validación de concurrencia |
| P0001 movimientos ya generados | 3 | Protección contra duplicación |

Los errores de tesorería de las 13:00–13:02 coinciden con casos deliberados del script existente `scripts/test-treasury-generation.cjs`. Es una inferencia por horario y mensajes; no está verificado el origen de cada registro. No son evidencia suficiente de la causa del reinicio.

## Fallas de disponibilidad

- Autenticación: 36 registros con 500, 123 con 504 y uno sin estado. Predominan `context deadline exceeded`, cancelaciones y errores al consultar usuarios o refresh tokens porque PostgreSQL no responde. No deben presentarse al usuario como contraseña incorrecta.
- Realtime: saturación de las colas de conexiones, solicitudes descartadas tras aproximadamente 10–12 segundos, fallas al preparar/recuperar replicación y agotamiento de reintentos.
- PostgREST: PGRST002, imposibilidad de consultar la base para construir el caché del esquema, acompañado por HTTP 503. Afecta site_settings, sellers, order_sync_jobs y mp_accounts. No implica por sí mismo que falte una migración.
- Gateway: muestras 503/504 en pedidos de sincronización, vendedores, Mercado Pago y autenticación. Riesgo de demora en cobros/sincronización; no se verificó pérdida de transacciones.
- Storage: el resumen mostró cero errores y nueve advertencias; no se inspeccionó cada advertencia. Edge Functions: cero errores en el resumen.
- Terminaciones administrativas alrededor de 11:38 y 14:16; rechazo/cierre de conexiones también alrededor de 14:10. PostgreSQL reportó último inicio el 28/09 a las 14:19:28. Debe contrastarse con eventos de infraestructura y acciones de operadores para explicar los reinicios.
- Worker de sincronización: 12 fallas consecutivas `job startup timeout` desde aproximadamente 14:07, continuando hasta la muestra de 14:25. La tarea ni siquiera logra iniciar. Revisar pendientes e idempotencia antes de cualquier recuperación manual.

## Capacidad y consultas

- Instancia t4g.nano, hasta 0,5 GB de memoria, máximo 60 conexiones. Panel de infraestructura con período 21–28/09: CPU/compute 96%, Disk IO 81%, memoria 51%, disco 5%. Estos valores del gráfico semanal no describen todo el día ni prueban agotamiento de memoria.
- Instantánea posterior: CPU 15%, memoria 50%, 24/60 conexiones. No demuestra ausencia de saturación en las ventanas de caída.
- SQL: base aproximadamente 83 MB, sin bloqueos en la muestra, dos slots de replicación activos sin acumulación relevante de WAL. Índices principales de pedidos, movimientos y pagos válidos.
- Estadísticas posteriores al reinicio: consulta interna de extensiones ~50,8 s; Realtime list_changes promedio ~10,16 s. Hay lentitud también en servicios internos.
- Timeout de las 09:41:22: función `get_account_balances_prior_to`, agregación histórica de movimientos. Conviene analizar su plan con datos y parámetros representativos una vez estabilizada la base, conservando la exactitud contable.
- Timeout de las 10:06:57: búsqueda de pedidos con cinco condiciones `legacy_code ilike`. El repositorio ya contiene trabajo de optimización de búsqueda/importación; verificar qué versión está desplegada y medir el plan antes de crear índices adicionales.
- Algunas métricas de conexiones/IOPS y consultas del catálogo no cargaron o excedieron el plazo. El reinicio limita la validez histórica de pg_stat_statements y otros contadores. No se obtuvo evidencia de OOM, agotamiento de créditos o disco lleno.

## Correcciones preparadas en el código local

1. Restituida la coordinación de renovación de tokens del SDK en ambos clientes Supabase; eliminada la función vacía que reemplazaba su bloqueo.
2. Consulta de rol del administrador diferida fuera del evento de autenticación para evitar el bloqueo documentado por Supabase. Cancelación del temporizador al cerrar sesión/desmontar.
3. Clientes del servidor sin persistencia ni renovación automática de una sesión global de usuario.
4. Canal Realtime de cobros estable: modificar estadísticas ya no destruye y crea la suscripción.
5. Mensajes de acceso distinguen indisponibilidad del servidor, exceso de intentos y credenciales rechazadas. Eliminada la afirmación estática de servidores operativos.
6. Caja de vendedores consulta `clients.business_name`; eliminadas las referencias a `clients.full_name`, inexistente según los registros.
7. Script reutilizable `scripts/audit-supabase-reliability.cjs` para diagnóstico de solo lectura con plazos acotados.

La consulta `sellers.name` de las 14:05 provino de PostgREST. No se encontró ese selector incorrecto en el código activo inspeccionado; queda por identificar cliente/versión que lo envió. No se agregó una columna para ocultar el error.

Verificación: 12 pruebas de autenticación, renovación concurrente y ciclo de suscripciones aprobadas; TypeScript sin errores. No se publicó el código ni se cambió infraestructura. El repositorio contiene numerosos cambios anteriores que deben preservarse y revisarse para preparar una publicación acotada.

## Orden de intervención

1. **Cambio Nano a Micro realizado manualmente por el usuario**. El panel muestra Micro seleccionado. La recuperación de PostgreSQL se confirmó a las 14:45; último inicio 14:44:54. Mantiene máximo 60 conexiones.
2. Publicar únicamente las correcciones revisadas; validar ingreso, renovación de sesión, caja y cobros después de la publicación.
3. Confirmar recuperación del worker, ausencia de 503/504/PGRST002 y estabilidad de Realtime. Reconciliar pendientes sin reejecutar pagos ni escrituras a ciegas.
4. Investigar eventos de infraestructura/reinicios y optimizar consultas de saldos e importaciones mediante planes medidos. Si persisten terminaciones sin acción de un operador, abrir caso de soporte con horarios y códigos; no se envió un caso durante esta auditoría.
5. Antes de aumentar uso: comparar latencia y errores con concurrencia representativa en un entorno de prueba. Considerar Small solo si Micro y las consultas optimizadas resultan insuficientes; no se contrató capacidad adicional.

Subir a Micro es una mitigación razonable sin costo adicional mostrado, no una garantía de resolver todas las causas. La estabilidad debe comprobarse con mediciones posteriores y uso real.

## Documentación oficial consultada

- [Compute and Disk: tamaños, costos y reinicio al cambiar capacidad](https://supabase.com/docs/guides/platform/compute-and-disk).
- [Bloqueo de llamadas dentro del evento de autenticación](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0).
- [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
- [CPU elevada](https://supabase.com/docs/guides/troubleshooting/high-cpu-usage).
- [Plazos de consultas](https://supabase.com/docs/guides/database/postgres/timeouts).
- [Estado del proveedor](https://status.supabase.com/): se observaron avisos globales de JWT y de ingestión de logs; no se comprobó que expliquen las fallas de este proyecto.

## Intervención posterior al cambio a Micro

Mediciones del 28/09, aproximadamente 14:45–14:46, mediante consultas de solo lectura con EXPLAIN ANALYZE y límites de ejecución.

### Aplicado en producción

- Se confirmó que `idx_orders_legacy_code_trgm` no existía. La búsqueda parcial de dos códigos recorría los 13.412 pedidos y 1.675 bloques de la tabla.
- Se creó **únicamente ese índice**, con `CREATE INDEX CONCURRENTLY`, sin modificar pedidos, funciones contables, permisos ni controles de integridad. Extensión pg_trgm ya instalada en public. Índice válido y listo, tamaño 512 kB.
- Migración registrada en `database/db_migration_v105_postgres_code_search.sql`; aplicación reproducible en `scripts/apply-postgres-code-search.cjs`.
- Plan posterior: Bitmap Heap Scan con dos Bitmap Index Scan sobre el índice nuevo. Ejecución de la búsqueda de muestra: **67,544 ms antes y 0,150 ms después**. Caché fría antes y caliente después; no atribuir toda la diferencia de tiempo al índice. El cambio de plan y la reducción de bloques sí están comprobados (1.675 bloques de tabla antes frente a 23 bloques totales después).
- `get_account_balances_prior_to(current_date)` devolvió 13 cuentas en **55,818 ms** y **66,103 ms** en las dos mediciones. No se reemplazó su lógica: actualmente responde sin timeout.
- Sin bloqueos activos en ambas muestras. Último inicio de PostgreSQL: 14:44:54.
- Cron de sincronización: ejecución de las 14:45 exitosa. Esto demuestra inicio de la tarea programada; no prueba por sí solo la entrega de todas sus llamadas HTTP.
- Cola de sincronización: 351 completed, 18 attention; sin pending, processing ni awaiting_items. Los 18 attention son históricos, desde 17/09 hasta 28/09 13:59. No se reejecutaron operaciones externas.
- Panel de logs no devolvió errores Postgres en la ventana breve posterior al inicio (14:44:55–aproximadamente 14:46). Hay posibles demoras de ingestión; no es todavía evidencia de estabilidad durante un día entero.

### Código corregido, pendiente de publicación

- Se verificó el esquema real de clients: `business_name` existe, `full_name` no. La corrección de Caja del primer tramo queda confirmada contra la base.
- Finanzas ahora interrumpe la respuesta si falla la lectura del saldo inicial, en vez de mostrar movimientos con un saldo inicial ficticio de cero. Timeout responde 503; payload inválido responde error.
- Dos pruebas adicionales ejecutan el endpoint y verifican que un fallo de saldo inicial impida consultar y devolver movimientos. Las cuatro pruebas existentes de búsqueda de pedidos también aprobaron. TypeScript sin errores.
- Las correcciones de autenticación, suscripciones, Caja y Finanzas siguen locales; no se publicó el árbol de trabajo que contiene otros cambios anteriores.

### Errores que conservan una explicación o seguimiento

- 57P01/57P03 durante reinicio: corresponden al cierre/inicio de la base; no se deben ocultar mediante reintentos ilimitados. Comprobar si reaparecen fuera de cambios administrativos.
- 55P03 histórico: no hay bloqueos activos en la muestra posterior; falta identificar la operación original si vuelve a ocurrir.
- P0001/23503: conservados los controles contra duplicados, cambios concurrentes, pedidos de otra rendición y cuentas inexistentes. Los casos observados coinciden con el script de integración existente; no se volvieron a generar en producción.
- `sellers.name`: selector incorrecto aislado de las 14:05, no encontrado en el código inspeccionado. La base usa `full_name`; queda pendiente identificar el cliente o versión que hizo esa solicitud si reaparece. Agregar una columna redundante no corregiría el origen.
- No se puede afirmar que todos los errores históricos estén resueltos con una observación de pocos minutos. La mitigación de la búsqueda está activa; falta publicar los cambios del cliente y observar nuevas solicitudes reales.
