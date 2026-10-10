# Resultado diario de entregas

Vista `/admin/rentabilidad-diaria`, acceso exclusivo de administración. Permite consultar hasta un año por fecha real de entrega, agrupar por día, desplegar productos por pedido y exportar los pedidos.

Solo se incluyen entregas exitosas con fecha real. Los intentos duplicados en el mismo día se cuentan una vez; fechas exitosas contradictorias se separan para revisión. Los registros sin fecha real no se asignan al día programado.

La ganancia del pedido es el subtotal comercial de productos después de descuentos más el flete cobrado, menos los materiales o costo de compra. Los gastos de fabricación se muestran aparte como referencia y no se descuentan. El flete cobrado se suma íntegramente; el costo del reparto no se descuenta. Los costos históricos guardados que no separan materiales y gastos quedan solo como referencia: se usan materiales actuales y se explica el motivo. Un costo desconocido nunca equivale a cero; los pedidos sin ítems o cantidades válidas tampoco producen una ganancia calculable.

El cálculo corresponde al alcance comercial elegido por el usuario; no representa el resultado neto de la empresa ni cobros efectivos. IVA, reparto, comisiones, impuestos y gastos comerciales quedan aclarados como referencia. Los gastos de fabricación siguen formando parte del costo integral del módulo de costos, pero se excluyen de esta vista diaria.

El informe muestra cada exclusión con código de pedido, motivo y alcance: cancelación, fechas reales contradictorias o ausencia de fecha real. Los pedidos sin costo permanecen en el detalle, con motivos visibles, pero no aportan ganancia al total calculable. Las exclusiones sin fecha pertenecen a toda la base y no se atribuyen al período seleccionado. El archivo exportado incluye estos motivos y los pedidos excluidos. Los registros de entrega incompletos no excluyen un pedido si otro registro exitoso proporciona una fecha real.

BDCosto se lee por sus pestañas de proveedores, identificadas desde su fórmula de consolidación. Se reconocen únicamente nombres y equivalencias explícitas del catálogo, precio positivo, fecha vigente y unidad convertible. Se utiliza costo sin IVA, guardando la tasa de IVA de la lista. No se aplica a productos fabricados o ensamblados terminados, cuyo costo proviene de su receta. Las unidades no declaradas como unidad requieren una conversión explícita antes de usar una lista.

Cada precio de lista conserva proveedor, fecha, fila, costo y fecha de observación. La evidencia más reciente entre lista y compra define el costo. Las versiones observadas se conservan en la publicación del sistema de costos y los cálculos se guardan como instantáneas. Las listas no crean compras, cantidades, existencias ni ponderación de compras. El histórico de listas anteriores a la primera observación no se ha reconstruido desde las columnas de los archivos individuales de proveedores; no debe presentarse como costo histórico real de una entrega.

La actualización se integra al mismo proceso de costos existente, con alertas por cambios y revisión de precios antiguos. La ejecución automática en producción depende de publicar estos cambios. El código permanece en el entorno local hasta su publicación.

Alertas de Costos en Compras consulta la misma publicación de costos actuales y usa materiales / compra (`material`) para la comparación contra factura y el margen sobre venta. La vinculación por producto, equivalencias o nombre inequívoco se comparte con el resultado diario. Si falta el cálculo, muestra costo pendiente sin usar el costo de catálogo anterior ni inventar margen. El acceso de Compras recibe únicamente las referencias necesarias; Ver cálculo lleva al módulo de costos.
