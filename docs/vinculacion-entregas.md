# Vinculación de entregas — primera etapa

El código LOG_REC identifica la salida física. Los recorridos R1/R2 del ERP y las rendiciones REND conservan sus identificadores y pueden pertenecer a la misma salida. Un pedido conserva cada intento histórico; se enlaza a la entrega actual del ERP solamente cuando coincide el día, sin reemplazar esa entrega.

La pantalla /admin/logistica-vinculos permite consultar pedidos, rendiciones, movimientos existentes y cobros aprobados del pedido. Estos cobros se muestran separados de los movimientos identificados con la salida, porque pueden incluir anticipos. No calcula tarifas, costos por pedido ni márgenes.

La sincronización usa Entregados (CO), Seguimiento (ID_Entrega), Entregas por fletero (AU: COD LOG) y Caja (A: código). La vista previa se valida nuevamente al aplicar. La operación corre en una transacción y requiere un administrador. No crea ingresos ni egresos.

Los movimientos importados se adoptan sólo con coincidencia única en las fuentes y el ERP de cuenta, fecha argentina, concepto, tipo e importe. Los ambiguos se registran como pendientes. Las relaciones explícitas de rendiciones, pagos aprobados y movimientos generados mantienen su procedencia. Los pagos digitales no se asignan por importe.

Se importan únicamente rendiciones ausentes, con los importes y tickets de la fuente. Las existentes y las archivadas no se modifican. La rendición archivada puede aparecer como historia dentro de su salida y permanece archivada. Las nuevas tablas llevan RLS; la función de escritura sólo está disponible para service_role, con comprobación adicional del actor.

LOG_REC_05344 del 07/09/2026 pertenece a GyV. Los 13 pedidos planificados de Salcedo conservan su historia, pero executed=false; los 14 de GyV pertenecen a la salida ejecutada. REND07051 no se asocia a esa salida.

Verificación: parser, movimientos ambiguos y reversados, referencias financieras, permisos, consultas reales y navegador en inglés; fechas DD/MM/YYYY y horarios argentinos de 24 horas. La carga se ejecuta dos veces para comprobar idempotencia. Se comparan los registros originales completos de caja, cobros, rendiciones, entregas y recorridos antes de confirmar la transacción.

Carga inicial desde el 01/09/2026 hasta el 12/10/2026: 107 salidas, 1.165 intentos ejecutados, 115 rendiciones y 262 movimientos. Se agregaron 10 rendiciones que faltaban; se conservó una archivada. Permanecen 301 avisos de fuente o vinculación: 93 pedidos sin código, 35 pedidos no localizados en ERP, 162 movimientos sin coincidencia única, 8 discrepancias de fechas y 3 de resultados de intentos.

Para repetir una carga: node scripts/sync-logistics-dispatch-links.cjs --from=2026-09-01 --to=2026-10-12 (ensayo que se revierte); agregar --apply para confirmar. El script usa credenciales del entorno, no las imprime y registra un resumen privado en output/logistics-dispatch-links/.

La segunda etapa definirá tarifas vigentes, extras y reparto del costo por pedido. Hasta entonces, todos los importes mostrados corresponden a registros reales, sin asignaciones de costos estimadas.
