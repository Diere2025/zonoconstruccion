# Planificación y seguimiento logístico

El LOG identifica el servicio pagado al fletero. R1, R2 y R3 son cargas físicas separadas dentro del mismo LOG; su suma no representa capacidad simultánea del vehículo.

## Carga diaria

Desde **Logística → Planificación y seguimiento**, crear la salida para el próximo día de reparto. Fecha, fletero del catálogo, vehículo, acompañante y responsable del ruteo se cargan una sola vez. Cada carga tiene zona, cantidad de pedidos, kilómetros y duración de ruteo previstos, hora de carga y enlace propio. El mensaje se genera para copiarlo; no se envía automáticamente.

Al guardar una salida nueva, el servidor consulta los LOG reservados en Seguimiento, resúmenes logísticos y Caja. La base asigna el siguiente número bajo el mismo bloqueo usado por la sincronización logística. El identificador de solicitud evita duplicar el LOG ante un reintento.

**Consultar planilla** permite incorporar un LOG existente, conservando su código y el registro original para auditoría. Se comprueba de nuevo la fecha y el fletero antes de guardar. No modifica Sheets, pedidos, movimientos ni rendiciones. Los registros históricos con varios recorridos y un solo par de horarios deben completar los horarios por carga; no se replican automáticamente.

## Cierre

Registrar salida y regreso reales por R, indicando si el regreso cruza medianoche. Los kilómetros realizados se cargan una sola vez para todo el LOG; P y Z históricos son el mismo dato. La llegada histórica N se trata como dato real, no como regreso previsto. Las horas efectivas se calculan por carga y se suman. Los kilómetros extras se calculan contra los incluidos en la tarifa guardada.

No se utiliza T («horas esperadas»), ni se replica O/Y (base de kilómetros). La duración de ruteo M se conserva por carga. La jornada incluida puede definirse en minutos en la tarifa para calcular horas extras. Si falta, se pide confirmarla; no se inventa una base. La tarifa horaria y los plus requieren confirmar el importe acordado.

Los estados son Planificada, En recorrido, Cerrada y No salió. La fecha y el fletero no se cambian después de generar el LOG. El cierre requiere horarios de todas las cargas y kilómetros totales. Los registros cerrados no se editan; No salió requiere motivo y se bloquea si ya existen pedidos ejecutados, rendiciones o movimientos. Cada cambio tiene versión y auditoría; una edición desactualizada se rechaza.

## Tarifas y pagos

Administradores pueden importar referencias de TarifaVehicular y cargar nuevas tarifas por fletero o empresa, zona y vigencia. GyV comparte tarifa entre Ramallo/Gomez, preservando cada chofer. La Plata/Zárate tiene variante. Una tarifa de cero es pendiente de acordar, nunca un viaje gratuito. Importaciones repetidas de la misma fila y valores no crean duplicados.

La tarifa seleccionada se guarda como copia dentro del LOG. La estimación se calcula una sola vez: base + acompañante si corresponde + kilómetros extra sobre el total de cargas. Un total acordado reemplaza esa estimación. Las tarifas horarias, plus y peajes no confirmados se muestran para revisar.

**La planificación no genera pagos.** Los costos reales siguen tomando los movimientos efectivamente abonados al LOG. Entregados y rendiciones pueden usar el LOG creado aquí; si la celda no está cargada, Laura conserva el modal de asignación.

## Permisos

Administradores y Logística cargan y cierran. Administración consulta. Las tarifas se gestionan solo por administradores. La API valida el usuario y su perfil mantenido por el servidor; no confía en el rol editable de la sesión. Las tablas no admiten escritura directa del navegador.

## Dependencias de Sheets comprobadas

Auditoría de siete libros vigentes del circuito logístico/tesorería; no constituye un relevamiento de todo Drive. Archivo privado: `output/logistics-planning/source-audit.json`.

- Entregas Actual Zono: `TarifaVehicular!A4 = IMPORTRANGE(B1;B2)`, con B1 apuntando al archivo Costo por Entregas y B2 a TarifaVehicular.
- Entregados, Entregando y Cancelados: `ResumenCostoEntrega!A1` y `ResumenCostoPorEntregas!A1` importan `ResumenCostoEntregas` del mismo archivo de costos.
- No se encontraron imports directos a ese archivo en los otros cinco libros revisados. Esto no excluye referencias desde libros ajenos al alcance o código externo.

Los imports siguen funcionando. La nueva carga ERP no escribe el cuadro tarifario ni el seguimiento en Sheets: durante la transición ambos orígenes se identifican explícitamente. Una referencia importada no recibe automáticamente los cambios posteriores de tarifa; el administrador debe importar la nueva versión o cargarla en el ERP.

Migración requerida: `database/db_migration_v204_logistics_planning.sql`. Es aditiva: crea planificación, tarifas y auditoría sin modificar importes ni registros financieros existentes.
