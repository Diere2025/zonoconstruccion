# Cuentas corrientes de proveedores

## Estado operativo al 31/10/2026

El circuito ampliado forma parte del ERP. La base configurada tiene las migraciones 243–265 instaladas; la publicación de la versión de aplicación y la conciliación de los proveedores se verifican por separado. El diagnóstico no aprobó automáticamente las filas históricas. Los antecedentes de abajo conservan decisiones de implementaciones anteriores y no sustituyen este estado.

La cuenta usa una única apertura por proveedor, con ARS/USD independientes. Cuenta 1 = facturado, Cuenta 2 = por remito; Cuenta 3 está fuera de uso. Zono/Aquafort son etiquetas internas. La recepción genera la deuda; la factura de mercadería regulariza el cargo recibido. Un servicio sin recepción usa su circuito específico y no genera stock.

Pagos, notas de crédito y crédito inicial comparten controles de disponibilidad. Reaplicar no vuelve a generar caja. El FIFO del pago nuevo contempla las partidas de apertura y los documentos incluidos, por fecha de origen. El excedente queda a cuenta. Para editar o anular un pago con aplicaciones a apertura, liberarlas primero desde **Aplicar pagos y créditos a apertura**.

La apertura puede mantenerse sin detalle o descomponerse en partidas firmadas que suman exactamente su saldo por moneda. El detalle no se suma otra vez al extracto. El pendiente firmado está en **Aplicar pagos y créditos a apertura**; el control de saldo compara apertura pendiente más documentos pendientes menos créditos/anticipos disponibles con el extracto.

**Ver partidas y vencimientos** conserva el total de cada cargo. Una factura puede agrupar remitos y tener cuotas. Un pago parcial sin atribución exacta a cuotas se identifica como distribución pendiente; no se inventa su vencido. **Distribuir por cuotas** atribuye el importe ya aplicado al documento, sin cambiar caja ni su aplicación general.

**Consultar estado registrado a fecha** conserva versiones desde su activación el 31/10/2026. Consulta el estado conocido al cierre de cada día en Buenos Aires. No certifica saldos anteriores a esa activación. El filtro de movimientos del extracto vigente sigue usando los importes actuales.

### Instructivo de Caro

1. Abrir Finanzas → Cuentas corrientes → elegir proveedor. Si falta apertura, definir corte y respaldo o preparar la puesta al día desde la captura revisada. No usar una diferencia sin explicar como ajuste de apertura.
2. Para mercadería, registrar recepción desde Compras → Recepciones. Usar **Completar comprobante y conciliar** para su factura. Revisar diferencias antes de confirmar.
3. Para mano de obra, honorarios u otro servicio sin mercadería, usar **Registrar servicio o ajuste**. Completar número, fechas, moneda, detalle, IVA, total y respaldo. También admite NC/ND relacionadas con un documento del mismo proveedor y moneda.
4. Consultar **Ver partidas y vencimientos**. **Programar vencimientos** permite cuotas cuya suma debe coincidir con el comprobante. **Pagar documento** abre el editor financiero habitual con proveedor e importe precargados; se puede pagar parcialmente.
5. Para un pago nuevo sin documento puntual, usar **Registrar pago al proveedor**. Elegir fecha, cuenta, importe y comprobante. La aplicación automática incluye la apertura por antigüedad. Un excedente queda a cuenta; para un anticipo deliberado, elegir documentos específicos y dejar sin imputaciones.
6. Para asociar dinero ya registrado, usar **Ver pagos, anticipos y créditos → Revisar aplicación**. Elegir documentos e importes y explicar el motivo. No crear otro pago para asociar el existente.
7. Para cancelar con NC, usar **Aplicar crédito**. Por ejemplo, factura 100, pago 70 y NC 30: pendiente cero; caja solo contiene el pago 70.
8. Para deuda o crédito inicial, usar **Aplicar pagos y créditos a apertura**. Un pago 40 sobre apertura 100 deja apertura pendiente 60 y conserva el saldo 60, sin compra ficticia. El crédito inicial puede cancelar deuda inicial o documentos incluidos.
9. Cuando un documento tiene cuotas, usar **Distribuir por cuotas** sobre el pago o NC ya aplicado. Esta acción distribuye su importe entre las cuotas; no registra dinero adicional. Para modificar el total aplicado al documento, volver a la aplicación general.
10. Revisar planillas y equivalencias antes de migrar: verificar proveedor, moneda, fechas y evidencia de cada fila. **Preparar puesta al día desde planilla** muestra los bloqueos. El corte reciente cubre los documentos/pagos anteriores por una única apertura; guarda la revisión y permite reversión auditada si su estado no cambió.

11. Para reservar un anticipo sin cancelar deuda, abrir **Ver pagos, anticipos y créditos → Reservar a OC**. La reserva comparte disponibilidad con las aplicaciones. Si la OC no declara moneda, confirmarla; las OCs históricas se mantienen sin moneda hasta esa confirmación. Para asociar el anticipo a una recepción posterior, liberar su reserva y aplicar el pago existente. No registrar otro pago.
12. **Ver sincronización de recepciones** muestra copias pendientes, fallos e intentos. La recepción y la deuda permanecen registradas en el ERP si falla Google Sheets. Usar **Reintentar copia**; el reenvío identifica recepción/artículo para evitar duplicaciones. No se reenvían recepciones anteriores a la activación automáticamente.

Las OCs nuevas permiten elegir ARS/USD. No se pueden agrupar recepciones ni mover líneas entre OCs de distinta moneda confirmada. La planilla de OCs existente no identifica moneda: las OCs en USD se conservan en el ERP y su copia monetaria requiere un espejo con moneda o conversión explícita. No se copian importes USD como si fueran ARS.

### Verificación y despliegue

`scripts/check-supplier-account-readiness.cjs` ejecuta controles de solo lectura y guarda prueba de importes y cantidades en `output/cc-planning/readiness.json`. La instalación se ensaya con `node scripts/apply-supplier-review.cjs`; `--apply` instala lo faltante, y `--stage` carga únicamente evidencia y equivalencias propuestas. Ese comando nunca aplica saldos históricos.

Los pilotos en `output/cc-planning/pilots` se generan con `node scripts/prepare-supplier-pilots.cjs`. Cada fila conserva captura, hash y candidatos; ninguna se selecciona por similitud. La puesta al día exige revisión completa, equivalencias verificadas, firma actual y aprobación del corte concreto. Se conserva el antes/después y no se borran pagos reales para revertir.

`NEXT_PUBLIC_SUPPLIER_CC_EXTENSIONS=0` oculta las extensiones de interfaz al reconstruir la aplicación. NEXT_PUBLIC_SUPPLIER_CC_PILOT_IDS permite limitar las extensiones a una lista explícita de proveedores. Las protecciones de base siguen vigentes. La desactivación visual no revierte aplicaciones o cortes; deben liberarse o revertirse con sus acciones auditadas.

## Antecedentes de implementación

Revisión del código y de los datos de producción: 29/09/2026. Las migraciones 112, 113 y 114 fueron aplicadas y verificadas en producción. Los cambios de interfaz siguen siendo locales hasta su publicación.

## Criterio acordado e implementación local

La deuda nace con la recepción, con o sin impacto en stock. Cada proveedor tiene un punto de partida independiente: fecha inclusive, saldo inicial ARS, saldo inicial USD y criterio de apertura. Un importe positivo representa deuda y uno negativo saldo a favor. No hay un inicio automático: la interfaz indica qué proveedores faltan configurar.

El historial anterior queda fuera del saldo hasta incorporarlo expresamente. También se pueden excluir documentos del período por conciliación. Cada cambio conserva motivo, usuario y valores anteriores/nuevos en una tabla de auditoría. Incorporar un documento no vuelve a generar stock ni movimientos de caja. Si un saldo inicial ya incluye una deuda histórica, no incorporar nuevamente el mismo importe.

En Finanzas → Cuentas corrientes se reemplazó el resumen de proveedores por un extracto con apertura, cargos, créditos, saldos por moneda e historial para conciliar. Los pagos vinculados a caja usan la fecha original del movimiento en Buenos Aires. El saldo inicial y los movimientos se muestran por moneda; no se convierten automáticamente.

La recepción manual se guarda con sus artículos, OC, moneda y deuda en una única transacción. El botón de recibir sin stock ahora abre el mismo formulario de recepción. Las cantidades administrativas antiguas sin detalle se conservan como una cantidad histórica separada; no se crean remitos ni deudas retrospectivos. Cerrar faltantes conserva lo originalmente pedido. Reintentar la misma solicitud no duplica el registro; un número de remito repetido para el proveedor se rechaza.

Una factura vinculada a una recepción que ya tiene deuda no puede generar un segundo documento positivo: se deben completar los datos de la factura sobre el documento existente. Las notas de crédito continúan siendo documentos separados. No se infieren vínculos históricos por similitud de números o importes.

Movimientos permite registrar pagos al proveedor sin compra vinculada, para anticipos. La imputación directa a una compra exige misma moneda e importe no mayor al pendiente. La distribución de un pago entre varios documentos y la conciliación parcial de documentos históricos requieren una ampliación posterior; por ahora se incorpora o excluye el importe completo de cada registro.

### Activación

Las migraciones `database/db_migration_v112_supplier_account_start.sql`, `database/db_migration_v113_supplier_receipt_debt.sql` y `database/db_migration_v114_supplier_circuit_guard.sql` ya están aplicadas en producción. La 114 impide que una versión antigua de la interfaz registre compras o recepciones por rutas directas para el período nuevo. Las migraciones no eliminan el historial.

Configurar primero cada proveedor desde Finanzas: fecha real de inicio, saldo conocido (o cero) y una nota que indique qué incluye. Luego incorporar compras y pagos anteriores a medida que se concilien. Las selecciones explícitas se conservan si se cambia la fecha de inicio.

### Validación local

- `node tests/supplier-account.test.cjs`: corte por fecha, ARS/USD, apertura, notas de crédito, anulaciones y selección histórica.
- `node tests/supplier-account-api.test.cjs`: permisos, validación de aperturas y pertenencia del documento al proveedor.
- `node tests/supplier-receipt-database.test.cjs`: migraciones ejecutadas en PostgreSQL local (PGlite), transacción de recepción/deuda, stock mixto, reintentos, errores con reversión, cantidades históricas, cierre de faltantes, apertura, conciliación y auditoría.
- `node tests/erp-navigation.test.cjs`: navegación autorizada sin las entradas de compra directa e importación antigua.

Para la prueba de base local: `npm install --no-save --package-lock=false --prefix .codex-tmp/supplier-account-check @electric-sql/pglite`.

## Hallazgos previos que motivaron el cambio

- `src/app/admin/compras/page.tsx`, `handleSaveReception`: con stock guarda cabecera y artículos; sin stock guarda solamente cabecera y actualiza directamente las cantidades de la OC. El detalle del remito administrativo queda vacío.
- `handleFulfillPOWithoutStock`: marca cantidades como recibidas y OC como cumplida, sin generar una recepción. El estado de la OC no prueba la existencia de un remito.
- `sync_purchase_order_quantities`, migración 63: recalcula lo recibido desde los artículos de recepción. Una recepción posterior con stock puede reemplazar las cantidades administrativas porque estas no forman parte de esa suma.
- La recepción manual genera una compra por pagar en ARS, sin `document_type`, `purchase_order_id` ni `purchase_reception_id`. El esquema permite esos vínculos, pero este circuito no los completa. El error al generar la deuda solo se registra en consola y la interfaz anuncia éxito.
- El balance de Finanzas suma documentos no anulados, resta notas de crédito y pagos, por moneda. No evita por sí mismo contar un remito valorizado y una factura que representen la misma deuda.
- La vista de cuentas corrientes muestra saldos por proveedor; falta un extracto con documentos, pagos, imputaciones y saldo acumulado.
- Movimientos permite registrar un pago asociado al proveedor y opcionalmente a una compra. Debe distinguirse el pago completo de la distribución de ese pago entre documentos.
- El vínculo de un egreso desde Compras usa el menor entre el saldo de la compra y el importe del egreso. Hay que conservar cualquier excedente como anticipo del proveedor y permitir distribuirlo sin registrar una segunda salida de dinero.

## Circuito a desarrollar

1. **OC:** compromiso comercial, cantidades, precios y condiciones. Mostrar pedido, recibido, pendiente y documentos relacionados. Conservar la cantidad originalmente pedida cuando se cierre un faltante.
2. **Recepción:** siempre guardar cabecera y artículos vinculados a las líneas de OC. Una opción persistida determina si impacta stock; ambas modalidades cuentan como recepción. Validar proveedor, líneas canceladas, cantidades y duplicación del remito.
3. **Documento por pagar:** nace con el remito valorizado. Registrar tipo, número, fecha, vencimiento, moneda, importe y vínculos a OC/recepción. Si la factura sustituye al remito valorizado, debe regularizar el mismo compromiso sin duplicarlo.
4. **Pago:** asociar el movimiento al proveedor aunque todavía no exista una factura. El importe completo disminuye su saldo; las imputaciones distribuyen ese pago entre uno o varios documentos. El saldo no imputado queda disponible como anticipo.
5. **Cuenta corriente:** extracto por proveedor y moneda con cargos, créditos, pagos y saldo acumulado. Abrir desde cada renglón el documento o movimiento de origen; mostrar deuda pendiente, vencida y anticipos disponibles.
6. **Correcciones:** anulación o reversión trazable; registro y efectos en stock, deuda y pagos deben ser consistentes. Evitar escrituras parciales mediante operaciones de base transaccionales.

## Orden de implementación

1. Unificar recepción con y sin stock y resolver los registros históricos sin detalle.
2. Implementar documentos y su vínculo con recepción/OC según el criterio de deuda elegido.
3. Centralizar pagos e imputaciones, incluidos anticipos y pagos parciales.
4. Agregar extracto y conciliación por proveedor a Finanzas.

Los registros históricos sin artículos no deben convertirse automáticamente en remitos inventados: auditar cantidades y comprobantes antes de reconstruirlos. La reconstrucción administrativa no debe volver a incrementar stock ni crear deuda ya existente.

## Auditoría del circuito (29/09/2026)

En producción hay 273 recepciones vinculadas a documentos por pagar y ninguna recepción sin deuda, comprobante duplicado por remito, remito vacío o diferencia entre cantidades recibidas y detalle de OC. Hay una compra independiente anterior al corte; se conserva para conciliación. Ningún proveedor tiene aún configurado su punto de partida.

Se retiraron de Compras el alta directa «Registrar compra», la importación y sincronización de compras desde planilla y el alta o desvinculación de pagos desde el historial. El historial sigue disponible para consulta y para completar datos del comprobante ligado a un remito. La fecha de recepción, la OC y el estado de pago de ese comprobante no se pueden alterar desde el editor; la base impide anularlo sin reversión de la recepción.

La creación, imputación y reversión de pagos en Finanzas todavía usa varias escrituras sucesivas. Conviene llevarlas a una operación transaccional de base antes de ampliar la distribución de un pago entre varias facturas o automatizar reversos; mientras tanto, ante un error de guardado se debe verificar el movimiento y su vínculo en la cuenta corriente.

### Cooper: conciliación de la captura de planilla

Se incorporaron 8 cargos históricos por mercadería recibida ($48.686.430 ARS) con referencias técnicas `CC-COOPER-<fila>` y sin OC, remito detallado ni impacto en stock. Se vincularon 16 pagos ($32.542.100 ARS) a egresos de Cooper ya existentes en Movimientos; no se generaron nuevas salidas de caja. El script idempotente y su transcripción están en `scripts/import-cooper-cc-2026-09.cjs`.

Seis pagos de la captura ($9.214.940 ARS; filas 1327, 1349, 1364, 1368, 1369 y 1370) no tuvieron un movimiento identificable: no se vincularon ni se crearon. El neto provisional de los 24 registros incorporados es $16.144.330 ARS, pero no representa un saldo conciliado: faltan esos seis pagos y Cooper no tiene punto de partida configurado. Para asociar las OC posteriormente se deberán verificar sus líneas y evitar que una nueva recepción vuelva a generar la misma deuda.

## Casos de aceptación

- OC de 10 unidades: recibir 4 sin stock y 6 con stock produce 10 recibidas, OC cumplida y aumento físico solo de 6.
- Dos recepciones parciales conservan sus respectivos detalles y pendientes.
- Una recepción sin OC conserva artículos y proveedor; la interfaz debe reflejar si realmente crea una OC de respaldo.
- Un remito y su factura no duplican la deuda bajo el criterio elegido.
- Pago de 100 sobre documento de 80: una salida de 100, imputación de 80 y anticipo de 20.
- Pago de 100 distribuido entre dos documentos: una salida, dos imputaciones y un solo crédito de 100 en el extracto.
- ARS y USD mantienen saldos independientes; no imputar entre monedas sin conversión explícita.
- Fallo al guardar: no quedan recepciones, cantidades, stock ni deudas parcialmente registrados.
- Doble envío o reintento: no duplica remitos, deuda ni pagos.

## Criterio confirmado

La deuda nace al recibir el pedido. El saldo se computa desde el punto de partida elegido por proveedor, con conciliación histórica progresiva.


## Entrega mediante Incidencias

El tipo Nueva Implementación identifica la entrega operativa. Los instructivos PDF y las capturas se adjuntan a la incidencia privada, conservando sus permisos. Los PDF se descargan autenticados; no forman parte de los artefactos públicos de la aplicación. La aceptación manual y las capturas de la sesión operativa se registran por separado de las pruebas automatizadas.
