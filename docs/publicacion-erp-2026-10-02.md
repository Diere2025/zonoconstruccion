# Publicación autorizada del ERP: 02/10/2026

El usuario autorizó aplicar la corrección de permisos de pagos a proveedores y publicar los cambios anteriores pendientes del ERP.

La migración 142 se aplicó en producción y conserva las cantidades e importes de los movimientos y pagos existentes. Administración puede registrar pagos propios asociados a un egreso consistente. Los formularios antiguos obtienen `created_by` de la sesión. La API financiera permite el rol Administración y conserva la verificación del actor en el servidor.

Esta entrega incorpora los formularios financieros que guardan movimientos, pagos e imputaciones en una única transacción; Personal y prestadores; y la herramienta privada de Prompts de campañas. Conserva los cambios de la rama vigente de ERP y sus módulos publicados.

Validación: 66 pruebas locales aprobadas, prueba real de guardado antiguo y atómico como Laura dentro de una transacción revertida, y ensayo financiero completo revertido que cubre reintentos, edición, anulaciones, imputaciones, cobros y transferencias. Todas las tablas requeridas existen en producción. Los movimientos previos que quedaron parcialmente guardados requieren revisión contable separada.
