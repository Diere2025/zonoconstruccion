# Familias de movimientos: revisión local

Estado al 01/10/2026: las doce familias de negocio y la entrada general para excepciones están disponibles en el selector de localhost. Las seis familias nuevas tienen formularios, reglas de servidor y RPC de v138. **V138 fue ensayada con reversión completa y activada en producción por autorización expresa del usuario, con copia previa privada. La aplicación no se desplegó.**

## Acceso y agrupación

En `/admin/finanzas`, Nuevo movimiento abre el selector de familias con búsqueda. Los accesos directos incluyen Pago al personal; sueldo, adelanto, eventual y acuerdo se eligen dentro del formulario. Se mantienen los formularios existentes y sus escrituras habilitadas mediante v136/v137.

Transferencia entre cuentas pide fecha, origen, destino, importe, detalle y observaciones. No expone medio de pago, catálogo ni clasificaciones manuales: cliente y servidor asignan la clasificación interna de movimiento de cuentas y resuelven el medio técnico Transferencia requerido por el esquema existente. Se eliminan referencias comerciales heredadas. Administrar comprobantes abre otra pestaña y Actualizar comprobantes recarga la lista conservando los campos del formulario, tanto básico como especializado. Esta corrección solo cambia código local; no agrega migraciones ni despliegue.

Las familias nuevas son Fondo a rendir, Cambio de moneda, Préstamo/financiación, Aporte/retiro de socio, Compra/venta de bien y Apertura/arqueo/ajuste. En localhost su guardado ya está habilitado para usuarios con permiso y escribe en producción. `/vista-previa-movimientos` intercepta sus altas y permite encadenar simulaciones en memoria con cuentas y catálogos reales; desaparecen al recargar. Las anulaciones simuladas no se envían a la base. Un gasto rendido requiere un comprobante de tesorería existente. Los catálogos y selecciones largos usan búsqueda.

## Reglas implementadas

- Fondos generales: cuenta exclusiva de custodia, entrega como transferencia, gastos desde custodia, devolución como transferencia, exceso pagado por la persona como obligación de reintegro y reintegro desde caja disponible. Cierre solamente con saldo y obligación en cero. Una cuenta con movimientos ajenos no puede convertirse en custodia; se permite reutilizar una cuenta de fondos saldada. Las escrituras ajenas en una cuenta de fondo abierto se rechazan. Disponible en cuentas y dinero bajo custodia se muestran por separado.
- Divisas: cuentas en monedas distintas, dos importes independientes, cotización con unidad explícita y comisión en su cuenta/moneda. Se anulan las líneas juntas.
- Financiación: contraparte y referencia de contrato, recibir o prestar capital, devolver o cobrar capital según el lado del contrato, costos/intereses separados. La referencia es única por contraparte/moneda/lado. No se devuelve más capital del pendiente. No se genera automáticamente un calendario de cuotas ni obligaciones fiscales.
- Socios: aporte como ingreso y retiro como egreso; socio y referencia identificados, sin convertirlos en sueldos.
- Bienes: identificación del bien, contraparte y número de documento; compra o venta. Un documento ya presente en Compras se paga por Pago a proveedor, con verificación dentro de la transacción para evitar otra salida. No se implementa inventario de activos ni depreciación.
- Arqueos: corte con fecha y hora, conteo, saldo esperado y huella de los movimientos. Registrar conteo no mueve dinero. Ajustar exige motivo, confirmación y una huella vigente; una carga retroactiva obliga a repetir el conteo. Apertura solamente para una cuenta sin movimientos. El ajuste se fecha al corte y no modifica una apertura anterior.

No se regeneran movimientos de Rendiciones ni se reutilizan reservas de Planificación como custodia. Los fondos de cambio de recorridos que ya usa Rendiciones continúan por su circuito; su enlace automático con este nuevo registro de fondos generales queda pendiente. No se ejecutó reclasificación masiva del histórico ni se modificaron fuentes de EERR/EFE.

## Integridad y permisos

`/api/admin/special-financial-operations` usa sesión verificada; consulta con permiso de tesorería y escribe solo con permiso de administrar operaciones financieras. El servidor construye el plan tipado; el navegador no puede proporcionar líneas arbitrarias a la RPC. `persist_special_financial_operation` solo es ejecutable por service_role, verifica actor, claves idempotentes, FK, recursos, versiones y huellas, y persiste todo junto. Los recursos y los importes críticos tienen columnas y restricciones SQL.

Las operaciones especializadas son inmutables: se corrigen anulando el conjunto y registrando nuevamente. Los fondos y financiaciones exigen anular primero sus operaciones posteriores. La compensación conserva el original y su fecha. Los arqueos sin líneas monetarias también quedan en el historial del circuito. Las solicitudes repetidas devuelven el mismo resultado. Planificación excluye estas operaciones de la conciliación genérica; las operaciones originadas en otros módulos conservan su flujo.

La migración usa PK independientes en las tablas nuevas para evitar la ambigüedad de relaciones que se corrigió con v137. Los fallos de permisos, saldos o conexión no se convierten en saldos cero. Sin esquema nuevo se mantiene la lectura antigua y el corte de arqueo se calcula solo para revisión, sin permitir confirmación real.

## Verificación

- 34 pruebas locales aprobadas: familias, selector inicial, reglas monetarias, custodia, divisas, financiación, socios/bienes, arqueos, permisos existentes y búsqueda.
- Comprobación de tipos de archivos afectados aprobada.
- Ensayo PostgreSQL con BEGIN/ROLLBACK: v138 repetida, registros existentes sin cambios; fondo 30.000/24.000/6.000; aislamiento de custodia; divisas y comisión con reversión conjunta; financiación con saldo 600; rechazo de documento existente; conteo sin caja, carga retroactiva rechazada, ajuste y anulación en orden; actor no autorizado rechazado.
- Activación: copia privada de public/auth; comparación dentro de la transacción de todos los registros y saldos financieros antes/después sin diferencias. Conservados 11.882 movimientos, 6.573 pagos de clientes y 21 pagos de proveedores. No se crearon operaciones de prueba permanentes.
- Consultas reales existentes: 104 proveedores, 15 cuentas, 1.401 movimientos en los últimos 30 días, 1.098 conceptos y relaciones. La capacidad especializada está activa y el saldo al corte responde mediante RPC. El lector de la versión publicada sigue respondiendo 200 con 1.401 movimientos.
- No se completó revisión visual automática: el control del navegador está bloqueado por su política. Revisar los formularios en localhost; usar la vista previa para simulaciones sin guardado real.

## Activación realizada

El usuario autorizó expresamente aplicar v138 en producción manteniendo la aplicación sin desplegar. Se repitió `node scripts/test-special-financial-operations.cjs` con reversión completa y se aplicó mediante `node scripts/apply-special-financial-operations.cjs --activate-production-v138`. La copia previa y el informe de conservación quedaron bajo `scratch/financial-operations-activation/`, ignorado por Git. Pasaron los lectores local y publicado. No desplegar la aplicación sin autorización. Conservar los recursos y su trazabilidad si después se revierte el código.
