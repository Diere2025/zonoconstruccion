# Vinculación y costos reales de entregas

El código LOG_REC identifica la salida física. Los pedidos conservan el historial de postergaciones y los recorridos R1/R2 y rendiciones REND mantienen sus identificadores. Los códigos con un sufijo, como LOG_REC_05395B, identifican salidas distintas.

La pantalla /admin/logistica-vinculos está disponible exclusivamente para administradores. Su API comprueba la identidad autenticada y el permiso en el servidor tanto para consultar como para sincronizar.

La consulta cruza las planillas Entregados, Seguimiento, Entregas por fletero y Caja con los pedidos, rendiciones y movimientos del ERP. Los pagos de Servicio de Flete registrados en Caja se muestran como fuente cuando no tienen un movimiento ERP identificado inequívocamente; consultarlos no crea movimientos. Una reversión de un movimiento identificado se excluye del costo. Las tarifas teóricas no se utilizan.

El reparto principal asigna el flete pagado únicamente a los pedidos entregados que admiten costo. La vista comparativa reparte también entre los pedidos postergados, anulados y no entregados para analizar las salidas fallidas; es una distribución analítica, no una medición de gasto por parada. CAMB y ENC quedan fuera del reparto y de la facturación y ganancia ordinarias; conservan su historial. Los retiros de depósito y las salidas no realizadas no requieren flete.

El resumen muestra facturación, flete pagado, porcentaje de flete, costo por entrega, índice de entrega y ganancia antes y después del flete. Se agrupa por día o fletero; cada fecha puede expandirse para ver los fleteros. El período predeterminado es Este mes. El detalle se abre en un modal.

La ganancia reutiliza Resultado diario de entregas: ventas descontadas, flete cobrado y recargos menos materiales y servicios registrados, descontando después el costo de la salida. Los costos de materiales que sean estimaciones conservan esa indicación. No equivale al resultado neto de la empresa. Los datos faltantes de un pedido ordinario se muestran pendientes, sin sustituirlos por cero.

Los cobros digitales se cruzan con tickets de rendición y operaciones verificadas; los importes ambiguos no se asignan automáticamente. Se eliminaron del detalle los historiales repetidos de cobros aprobados sin evidencia que los atribuya a esa salida.

La sincronización requiere vista previa vigente y transacción. Vincula registros existentes e importa únicamente rendiciones ausentes; conserva las existentes y archivadas. No crea ingresos ni egresos. En localhost la acción sigue siendo una revisión sin persistencia. En producción actualiza los vínculos y vuelve a leer las fuentes.

Migración v200: permite una letra mayúscula al final de LOG_REC, sin renumerar códigos existentes. El ensayo de publicación sincroniza dos veces y compara los registros originales de caja, cobros, rendiciones, entregas y recorridos antes de confirmar.

Validación: pruebas de reparto, centavos, reversión, postergaciones, excepciones CAMB/ENC, identidad de fleteros, pagos digitales, permisos, sincronización idempotente y navegador en inglés con fechas DD/MM/YYYY.
