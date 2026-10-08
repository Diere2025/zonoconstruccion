# Costos y rentabilidad de productos

El módulo `/admin/costos` reúne recetas desglosadas, conciliaciones de compras y gastos de fábrica. Requiere una sesión de administrador. Los códigos permanecen internos.

## Uso

1. Buscar por familia, capacidad o nombre. Seleccionar un producto para ver su receta y la fuente de cada precio.
2. Consultar enero hasta el mes actual: última compra válida al cierre, promedio ponderado de compras y cantidades. Los puntos amarillos usan una receta actual en un período anterior a su primera captura y son estimaciones.
3. Elegir Compra, Fabricación o Ensamblado por producto. Los campos de operación permiten ajustes con fecha de vigencia y clasificación Medido, Asignado o Estimado.
4. Revisar alertas de cambios de costo, componentes antiguos y datos pendientes. Los umbrales iniciales son 10% en insumos, 5% en productos, $1.000 de impacto mínimo y 90 días sin compras. Son configurables.
5. Simular margen y precio objetivo. La simulación no modifica precios de venta. Los importes de compra y venta deben compararse con el mismo tratamiento de IVA.

## Reglas

- Merma del 5% en todos los materiales de fabricación y ensamblado, aplicada una sola vez. Los productos terminados comprados no llevan merma.
- Descuentos de promoción, combo o cantidad: costo cero, fuera del catálogo de costos. Reducen el ingreso de venta. Tapa Rosca F/A y Extensor Cámaras quedan fuera de productos vigentes; se conserva su referencia histórica.
- Los cortes de caño usan longitud / 400 cm. Las recetas vigentes definen PVC, conservando Awaduct en Autolimpiable 700 L.
- Polietileno de Centuma, Victech y Mundileno se importa por kg; no se divide su precio por 20. Las bolsas de las recepciones generales anteriores sí se convierten cuando corresponde. Negro y negro económico se usan indistintamente.
- Se excluyen notas de crédito, fechas futuras, cantidades y precios no positivos, y operaciones sin cargo.
- Las etiquetas propias se suman a los productos comprados. El kit de tapa, brida y descompresor reemplaza esos componentes, sin duplicarlos.
- Tachos comprados de 1000/3000 L incluyen tapa y aro; no se vuelven a sumar esos accesorios. Los de fabricación usan su receta. Los Slim conservan el origen Compra acordado.
- La consulta de gastos de fábrica aporta solo operación; sus antiguos materiales no se suman. Las estimaciones heredadas quedan identificadas. Los ensamblados necesitan asignación propia de electricidad y estructura.
- Si falta un costo, se muestra pendiente. Si no hay compra pero existe una referencia sin fecha, se identifica como tal. El promedio de compras no representa costo de existencias.

## Actualización y conservación

El botón Actualizar costos y el botón de Compras usan el mismo motor. El heartbeat existente `/api/keep-alive` actualiza las fuentes cada seis horas, una vez inicializado el módulo y publicado el código. También existe `POST /api/admin/costos/sync`, protegido por `COST_SYNC_SECRET`, para un programador externo.

Una reserva evita ejecuciones concurrentes. La publicación de compras, fuentes versionadas, instantáneas y alertas se hace en una transacción. Si falla una fuente o la publicación, se conserva el último resultado válido. Las correcciones y retiros de compras quedan auditados; las instantáneas mensuales se conservan con su fecha de cálculo. Las alertas de pendientes resueltos se cierran automáticamente.

Los costos completos quedan en `products.unified_cost`. No se sobrescribe el material original de `cost_price`, el precio de venta ni los costos históricos de ventas. El cálculo comercial conserva el precio de venta existente y utiliza el costo completo vigente para ventas nuevas. En costos incompletos conserva el costo previo disponible. Rentabilidad de ventas sigue priorizando el costo histórico y solo usa el actual como referencia cuando aquel falta.

## Puesta en servicio

- Migración: `database/db_migration_v156_unified_product_costs.sql`. Tablas privadas con RLS y acceso mediante servicio, desde endpoints que verifican administración.
- Variables existentes: credenciales de Sheets y Supabase con service role. `COST_SYNC_SECRET` es opcional, solo para el endpoint del programador externo.
- Publicar los archivos del módulo con el despliegue habitual del sistema. La carga inicial de la base ya fue ejecutada; la interfaz y el heartbeat nuevos requieren publicar el código.
- Verificar que el heartbeat se ejecute periódicamente: si el programador existente deja de llamarlo, las compras no se actualizan en segundo plano. La fecha de última actualización queda visible.
- Las recetas anteriores a la primera captura no constituyen un registro histórico confirmado. Flete, embalaje, financiación, comisiones e impuestos de venta necesitan definición específica para analizar rentabilidad completa.

## Verificación

Pruebas de merma, cortes, faltantes, fechas, versiones por vigencia, kits, compras con accesorios, ciclos, margen, costos comerciales fijos y asignaciones de fábrica en `tests/unified-*.test.cjs`. El contraste de materiales contra la planilla paralela se realiza sin alterar esa planilla.
