# Movimientos: implementación de 0, A1 y A2

Estado al 01/10/2026: código local implementado. **La migración 136 se aplicó en producción por autorización explícita del usuario; la aplicación no se desplegó y se revisa en localhost.**

La activación se realizó con `scripts/apply-financial-operations.cjs --activate-production-v136`, después de repetir con éxito el ensayo reversible. La transacción de activación verificó que se conservaran los saldos por cuenta/moneda y los 11.882 movimientos, 21 pagos a proveedores y 6.536 cobros de clientes existentes. El respaldo lógico anterior y la comprobación de saldos permanecen en archivos locales ignorados bajo `scratch/`. Se detuvo y revirtió la restauración del proyecto de pruebas al elegir producción; `.env.local` mantiene la conexión productiva. Guardar desde los formularios normales de localhost modifica datos reales.

Corrección de compatibilidad posterior: la versión publicada todavía consultaba `supplier_purchases(...)` desde pagos sin indicar FK. La clave primaria compuesta de las imputaciones hacía que PostgREST detectara una segunda relación y respondiera PGRST201. Se aplicó v137, ensayada con reversión y repetida para verificar idempotencia: las imputaciones tienen una PK independiente y conservan la unicidad pago/factura y ambas FK. No se cambiaron permisos ni registros comerciales. La consulta completa del lector publicado volvió a responder 200 con 1.401 movimientos, y pasó nuevamente el ensayo transaccional completo. Laura Guerra tiene consulta habilitada y escritura de las nuevas operaciones deshabilitada según las reglas actuales. No se desplegó la aplicación.

Después de activar se corrigió la relación explícita `supplier_payments_purchase_id_fkey` en Movimientos y Caja de vendedores, que evita la ambigüedad introducida por las imputaciones de pagos a facturas. El catálogo de relaciones concepto/tipo ahora se pagina completo: 1.098 relaciones verificadas. Pasaron 19 pruebas enfocadas, la comprobación de tipos y las consultas reales de catálogos y movimientos. La revisión visual automática quedó bloqueada por la política del navegador y debe completarse manualmente.

## Resultado

Los formularios de proveedor, cliente, personal, gasto, impuesto y transferencia comparten controles, con campos y validaciones propios. Se conserva una entrada general para excepciones. La API verifica sesión y permisos, obtiene el actor del token y llama una única RPC para guardar, corregir, vincular o anular.

`financial_operations` agrupa las líneas de `cash_transactions`. Solicitudes idempotentes, versiones, eventos antes/después y comprobantes privados vinculados acompañan la operación. Los importes definitivos siguen viviendo en el libro existente.

- Proveedores: un pago total, varias imputaciones y remanente como anticipo. Los pagos históricos/reemplazados conservan sus IDs y las reversiones usan `reversed_at`. Compras consulta imputaciones por documento y señala los pagos anulados. La cuenta corriente cuenta una vez el pago total activo.
- Clientes: reutiliza comprobantes existentes cuando corresponde; evita duplicarlos al actualizar pedidos y recalcula deuda. La edición de datos no financieros del pedido conserva sus cobros gestionados.
- Personal: período, sueldo/adelanto/eventual/acuerdo y empleado o beneficiario. Elegir empleado no cambia el importe; usar sueldo base es una acción explícita.
- Impuestos: período, organismo y referencia. Gastos: controles comunes y clasificación del catálogo.
- Transferencias: dos líneas inseparables, misma moneda y cuentas distintas. Conserva MP2 → MP1 y el origen elegido desde Cuentas; reconoce grupos históricos `TRF-GROUP` verificables.
- Anulación: conserva el original y registra compensaciones en la fecha efectiva original. Corrige una carga; una devolución real requiere otra operación de negocio. Los pagos comerciales se revierten y sus documentos se recalculan en la misma transacción.
- Orígenes: Rendiciones y caja de vendedores se corrigen desde sus módulos; vínculos de Planificación impiden una corrección financiera aislada. Planificación excluye anulaciones, compensaciones y transferencias internas de candidatos, con guarda adicional en la base.

Se retiraron los modales monolíticos y sus escrituras secuenciales del navegador para movimientos manuales. Las filas heredadas siguen consultables sin cabecera y se adoptan al corregirlas, conservando su identidad. Los demás productores mantienen sus caminos para filas no gestionadas.

## Pruebas

```powershell
node --test tests/financial-operations.test.cjs tests/finance-workspace.test.cjs tests/finance-opening-balance.test.cjs tests/financial-concepts.test.cjs tests/supplier-account.test.cjs tests/authenticated-request.test.cjs tests/payment-planning-auth.test.cjs tests/bank-sheet-import.test.cjs
node node_modules/typescript/bin/tsc --project scripts/tsconfig.financial-operations.json --pretty false
node scripts/test-financial-operations.cjs
```

29 pruebas locales aprobadas y comprobación estricta de tipos de los archivos afectados y sus dependencias aprobada. La comprobación global encuentra errores en copias anteriores bajo `output/contado-2026-09-30/code-before/`; no se modificó ese material ajeno a esta entrega.

El ensayo PostgreSQL contiene la migración completa y fixtures dentro de `BEGIN`, límites de tiempo y `ROLLBACK` obligatorio en `finally`. Verificó:

- Migración repetible sin cambios de saldos del libro.
- Alta y reintento idéntico sin duplicar; rechazo de misma clave con otros datos.
- Actor sin permisos y escritura directa autenticada rechazados.
- Adopción de histórico conservando ID; edición y rechazo de versión desactualizada.
- Anulación con original/compensación cuyo neto es cero.
- Fallo posterior al alta por comprobante inexistente: ningún movimiento parcial.
- Pago a varias facturas con anticipo y anulación que restituye pendientes.
- Reutilización/edición de un cobro sin duplicar; edición no financiera del pedido; anulación que restituye deuda.
- Transferencia consistente desde cualquiera de sus líneas y rechazo como conciliación de una obligación.

No se probaron solicitudes concurrentes en conexiones independientes ni el recorrido visual completo del navegador. Los bloqueos y restricciones están implementados; esos controles deben completarse en el entorno de activación.

## Activación

Los botones de alta de `/admin/finanzas` ya abren los formularios nuevos en localhost con datos reales. Cuando falta la migración, solo en desarrollo permiten completar y revisar campos y mantienen el guardado deshabilitado. En otros entornos, las altas permanecen deshabilitadas hasta activar el esquema. Los desplegables con más de cuatro opciones usan búsqueda, según [la convención de selectores](ui-selectores.md).

Para revisar los formularios sin activar la base: iniciar el servidor de desarrollo y abrir `http://localhost:3000/vista-previa-movimientos` con la sesión administrativa local. Consulta proveedores, empleados, cuentas, compras pendientes, catálogo y movimientos reales. Las cargas de prueba son simulaciones en memoria, separadas del listado real, y desaparecen al recargar. El adaptador de la vista intercepta las escrituras y no las envía al servidor. La ruta solo está habilitada en desarrollo. El listado habitual detecta el esquema anterior, conserva la consulta y sus saldos y muestra el enlace a esta vista. Las escrituras nuevas siguen necesitando la migración 136. Compras conserva la lectura histórica y Planificación evita solicitar las nuevas columnas mientras no estén disponibles. La compatibilidad no encubre fallos de permisos ni del saldo inicial.

La verificación de consultas (`node scripts/check-financial-preview-readonly.cjs`, solo GET, sin imprimir filas ni credenciales) obtuvo 104 proveedores, 15 cuentas, 282 compras pendientes, 1098 conceptos y 1401 movimientos en el período de 30 días revisado. Los catálogos de proveedores y compras se leen por páginas para evitar truncamiento. Los conteos pueden variar con nuevas cargas del sistema.

1. Revisar `database/db_migration_v136_financial_operations.sql` y repetir el ensayo reversible contra el destino. El script usa `.env.local` sin imprimir credenciales ni filas comerciales.
2. Guardar el estado del entorno y la definición vigente de `sync_order_payment_to_ledger`. La migración conserva su implementación y agrega una guarda para cobros gestionados.
3. Migración 136 aplicada. Publicar conjuntamente API e interfaz únicamente cuando el usuario autorice el despliegue; por ahora se mantiene el código nuevo en localhost.
4. Verificar sesiones de escritura/lectura, los seis formularios, corrección/anulación, Compras, cuentas corrientes, Rendiciones, Planificación e importación bancaria. Comparar saldos antes/después con las operaciones controladas previstas.
5. Si se revierte la aplicación después de crear operaciones nuevas, conservar una versión capaz de gestionarlas. El código anterior tiene bloqueadas las escrituras directas sobre esas operaciones; eliminar cabeceras/compensaciones destruye trazabilidad.

El mapeo concepto–tipo se inicia con el catálogo actual y admite varios tipos por concepto. Su administración posterior requiere configurar las relaciones en la base; no se implementó un motor arbitrario de formularios. Los comprobantes se adjuntan desde el catálogo privado existente; se administran desde Comprobantes de tesorería.

## Alcance restante

Las familias de B/C y el arqueo/apertura de D ahora tienen implementación local específica y migración v138 activada en producción por autorización expresa, con copia previa y conservación de registros/saldos comprobada. La aplicación continúa sin desplegar. Ver [familias especializadas](movimientos-familias-especializadas.md). El enlace automático a cambios de recorridos y la reclasificación masiva del histórico quedan pendientes; EERR/EFE conservan sus fuentes. No se simulan estos circuitos mediante presets generales.

Modelo ER y decisiones: [plan-movimientos-formularios.md](plan-movimientos-formularios.md).
