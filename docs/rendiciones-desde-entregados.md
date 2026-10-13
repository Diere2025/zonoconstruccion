# Rendiciones desde Entregados

La lectura para generar rendiciones utiliza exclusivamente la hoja 🔴 Entregados, hasta la columna CO (código LOG). Entregando no se ofrece en la pantalla y su importación se rechaza en el servidor, incluso desde un cliente anterior.

Cada carga R1/R2 conserva su hoja de ruta y rendición, vinculadas a un mismo LOG cuando corresponden al servicio común del fletero. Esta vinculación no genera ni duplica pagos. El flete se consulta y suma en el LOG.

Si no se encuentra un LOG en la carga, un modal permite elegir una salida de la misma fecha y fletero o ingresar su código. El servidor vuelve a leer Entregados antes de generar y valida formato, fecha, fletero, vínculos existentes y conflictos. No se escribe en la planilla. El ERP conserva la asignación y la reutiliza al leer los vínculos logísticos; el historial identifica esa procedencia.

Los alias del catálogo se agrupan sin duplicar pedidos. R1 y R2 permanecen separadas. Un mismo número de carga con varios LOG incompatibles requiere corregir la fuente.

Las rendiciones confirmadas sin LOG pueden vincularse sin modificar sus importes. Los snapshots importados equivalentes se consolidan únicamente en la lectura, conservando los registros originales. Laura, con rol Administración, puede utilizar esta lectura y asignación; el acceso al análisis de costos sigue restringido a administradores.

Validación: lectura de Entregados hasta CO; bloqueo de Entregando antes de lecturas y escrituras; códigos con sufijo; conflictos de fecha, fletero y código; agrupación de alias; R1/R2 con LOG común; conservación de importes y pago único; reasignación de tickets; persistencia de la asignación manual; compilación y navegador en inglés con fechas DD/MM/YYYY. Las pruebas de UI usan datos y escrituras sintéticos.
