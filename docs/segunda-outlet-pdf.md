# Catálogo PDF de Segunda y Outlet

En la carga de pedidos minoristas, abrir **Segunda y Outlet → Catálogo PDF**. Se descarga un archivo para compartir con clientes, con todas las unidades disponibles, ordenadas por código. La búsqueda del selector y las reservas del pedido editado no limitan ni amplían la exportación.

La consulta se actualiza cada vez que se genera el PDF. Incluye nombre, código, condición, precio de lista, descuento, precio final, motivo y falla, y hasta tres fotos por unidad. No incorpora costos ni datos internos. Los tanques incluyen aro, tapa, brida y aireador aunque no se vean en las fotos; esta aclaración figura en todas las páginas.

El PDF es una copia de la disponibilidad y los precios al momento de generarlo. No se actualiza después de enviarlo: se debe confirmar disponibilidad y precio al tomar el pedido. Generarlo no reserva unidades ni modifica stock o pedidos.

La descarga usa el acceso autenticado existente del vendedor. Si una foto no se puede obtener, se informa el código afectado y se solicita generar nuevamente el catálogo, sin descargar silenciosamente un documento incompleto. Las unidades sin fotografías se identifican como “Sin foto”. Las observaciones extensas continúan en otra ficha, sin recortarse.

Validar con `node --test tests/outlet-catalog-pdf.test.cjs`, TypeScript y ESLint. Revisar también una muestra renderizada con las unidades reales antes de publicar cambios de diseño.
