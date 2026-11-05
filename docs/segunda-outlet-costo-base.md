# Identidad y costo del producto base

Las líneas de Segunda y Outlet muestran **nombre original · código de unidad**, por ejemplo **AquaFort - TRIC 500L Gris · O045**. La falla y condición siguen guardadas en la ficha y en la reserva. El código no reemplaza al nombre en el detalle ni en la confirmación del pedido.

El costo de una unidad se obtiene exclusivamente del producto base vinculado, priorizando el costo integrado disponible y luego el costo de catálogo, igual que los demás cálculos comerciales del ERP. El descuento de segunda/outlet modifica el precio de venta, nunca el costo.

Al modificar el costo del producto base, los productos únicos vinculados reciben el nuevo costo automáticamente. La reserva registra el costo vigente y el identificador del producto base en su snapshot. Una edición posterior conserva ese costo registrado. Si el modelo carece de costo, queda pendiente en lugar de inventar un valor.

El sistema de costos y rentabilidad identifica las unidades mediante su vínculo al producto base para usar sus materiales y gastos calculados. No crea una receta independiente para cada tanque ni aplica el descuento a los materiales. Esa relación se agrega al leer los resultados y no se publica como una nueva receta ni como una nueva compra.

La migración actualiza únicamente el nombre y los costos de los registros de producto de las unidades existentes. No modifica líneas históricas de pedidos, precios de venta, disponibilidad, cantidades ni movimientos de inventario. Los pedidos anteriores conservan sus datos; la presentación puede mostrar su identidad completa desde el snapshot existente.

Pruebas: `tests/outlet-base-cost.test.cjs`, `tests/outlet-sales.test.cjs` y `tests/unified-costs.test.cjs`. Para PostgreSQL local se usa el módulo PGlite ya instalado, configurable mediante `OUTLET_PGLITE_MODULE`.
