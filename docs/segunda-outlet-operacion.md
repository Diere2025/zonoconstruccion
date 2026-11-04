# Segunda y Outlet

Actualizado: 04/11/2026.

## Cargar y publicar

Abrir Inventario y Catálogo → Segunda y Outlet → Nueva unidad. Cada ficha representa un objeto físico, aunque haya varias unidades del mismo modelo.

Elegir Segunda u Outlet, cargar fotos y describir el motivo y la falla cuando corresponda. La primera foto es la portada; «Usar de portada» permite cambiarla. Vincular el modelo de referencia o ingresar una lista manual y el descuento. El precio final se calcula automáticamente. Segunda admite 5 % a 50 %; Outlet admite un porcentaje especial mayor a 0 % y menor a 100 %.

Los borradores admiten datos incompletos. Para ofrecer una unidad, elegir Disponible y Publicar. El sistema exige nombre, categoría, motivo, foto, lista positiva y descuento válido. Si la unidad sale del inventario de un producto normal, marcar «Reclasificar una unidad del stock del producto base»: al publicar se descuenta una existencia del modelo y se registra la unidad individual. No marcarlo para unidades físicas que ya se registran por separado.

«Seguir lista del producto base» acompaña su lista de venta vigente. «Lista manual» conserva el importe ingresado. El costo es opcional e independiente del descuento.

## Vender

En Cargar Pedido, abrir Segunda y Outlet, buscar el código y revisar fotos y falla. Agregar al pedido y completar el circuito habitual. El sistema reserva la unidad al guardar y la quita de disponibles. Cada línea admite una unidad; no permite modificar su precio especial ni sumarle descuentos. En un pedido mixto, el descuento general se aplica al resto de los artículos.

Dos vendedores no pueden reservar la misma unidad. Si alguien la reservó primero, el guardado informa el conflicto y no deja un pedido parcial. Reabrir el selector para actualizar disponibilidad.

El pedido y sus documentos/planillas operativas conservan código, condición y descripción. La lista, el descuento y el precio pactado se guardan con la reserva y no cambian si se modifica la lista del modelo después.

## Cambios, cancelación y devolución

Editar un pedido pendiente conserva sus unidades y precios. Al quitar una unidad se libera; reemplazarla por otra se realiza en una única operación. Cancelar antes de entregar vuelve a dejarla disponible. Reactivar vuelve a comprobar disponibilidad.

Al completar la entrega queda Vendido. Revertir una entrega o cancelarla después requiere revisión: no se considera recibido el objeto ni se publica automáticamente. Administración debe verificar el retorno físico, registrar el motivo de revisión y publicar nuevamente si corresponde. El historial anterior se conserva.

Retirado permite sacar una unidad de la oferta sin borrarla. Las unidades con ventas conservan su identidad y no se eliminan mediante borrado de pedidos.

## Catálogo inicial y corte

Se importaron 24 fichas y 66 fotos desde la planilla y las carpetas de Drive. A16 y O038 continúan sin identificar y sin fotos; O056 no tiene capacidad informada. Las fotos están en almacenamiento privado del ERP y funcionan sin una sesión de Drive.

Las 24 fichas se importaron como borradores porque la fuente no tenía lista de venta ni descuento aprobado por unidad. Completar esos datos y confirmar la existencia física antes de publicar. No se asignaron descuentos por interpretación automática de las fotos.

Desde el corte, las altas, cambios y fotos se gestionan en el ERP. La planilla del catálogo se conserva como respaldo histórico y no se sincroniza. Las planillas operativas de vendedores, Central y Entregas Actual continúan su circuito habitual.

## Validación técnica

Pruebas de migraciones, permisos, stock, edición de pedidos mixtos, precios pactados, códigos repetidos, devolución, reclasificación y normalización de planillas. También se verificó con dos sesiones PostgreSQL en un esquema temporal aislado que solo una reserva concurrente crea pedido. No se crearon ventas de prueba en las tablas comerciales de producción.

Pruebas: tests/outlet-drafts.test.cjs, tests/outlet-sales.test.cjs y tests/outlet-sheet.test.cjs. Las dos primeras usan PGlite; OUTLET_PGLITE_MODULE permite indicar su instalación. La prueba PostgreSQL aislada es scripts/test-outlet-concurrency.cjs. La verificación autenticada de lectura, fotos privadas y publicación incompleta es scripts/verify-outlet-api.cjs.

Para revisar una importación, scripts/import-outlet-catalog.cjs genera una vista previa sin escribir; --apply importa por source_key estable y omite fichas existentes. Los nombres de archivos y hashes determinan rutas de foto estables. No usar la importación como sincronización periódica.
