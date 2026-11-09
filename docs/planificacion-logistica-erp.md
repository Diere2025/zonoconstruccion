# Planificación y seguimiento logístico

El LOG identifica el servicio pagado al fletero. R1, R2 y R3 son cargas físicas separadas dentro del mismo LOG; su suma no representa capacidad simultánea del vehículo.

## Carga diaria

Desde **Logística → Planificación y seguimiento**, crear la salida para el próximo día de reparto. Fecha, fletero del catálogo, vehículo, acompañante y responsable del ruteo se cargan una sola vez. Cada carga tiene zona, cantidad de pedidos, kilómetros y duración de ruteo previstos, hora de carga y enlace propio. El mensaje se genera para copiarlo; no se envía automáticamente.

Al guardar una salida nueva, el servidor consulta los LOG reservados en Seguimiento, resúmenes logísticos y Caja. La base asigna el siguiente número bajo el mismo bloqueo usado por la sincronización logística. El identificador de solicitud evita duplicar el LOG ante un reintento.

**Consultar planilla** permite incorporar un LOG existente, conservando su código y el registro original para auditoría. Se comprueba de nuevo la fecha y el fletero antes de guardar. No modifica Sheets, pedidos, movimientos ni rendiciones. Los registros históricos con varios recorridos y un solo par de horarios deben completar los horarios por carga; no se replican automáticamente.

## Cierre

### Liquidación durante el recorrido (actualización del 23/10/2026)

Laura prepara la liquidación provisoria durante el reparto porque el fletero cobra en el día. Al pasar a **En recorrido**, el LOG aparece en **Liquidaciones de fletes**, con su tarea para Administración, sin exigir horario de llegada ni kilómetros definitivos. Tesorería confirma el importe provisorio y las compensaciones con la información disponible y su evidencia. No completar horarios ficticios para habilitar el pago.

Laura puede dejar el dinero a Matías para que pague cuando llegue el fletero. Preparar ese dinero no acredita el cobro: registrar el pago de flete cuando se entrega efectivamente al fletero, con fecha, cuenta y LOG. No registrar dos pagos por la preparación y la entrega.

Al finalizar se cargan llegada real, kilómetros y adicionales. Matías verifica esos datos y realiza el cierre definitivo al día siguiente. La liquidación provisoria vuelve a revisión final aunque ya se haya pagado: Tesorería confirma el costo definitivo y las compensaciones conservando el PAG original. Un aumento deja únicamente el saldo adicional pendiente; una disminución muestra el excedente para revisar su devolución o compensación documentada. No sobrescribir el pago original ni generar automáticamente movimientos de ajuste.

Los importes provisorios no acreditan un costo definitivo para rentabilidad. La revisión final es independiente del cierre operativo y del registro del pago. La migración `database/db_migration_20261109_freight_provisional_settlement.sql` habilita estos estados en la base; requiere aplicación junto con la versión de la aplicación.

Una salida histórica que ya tiene un pago pero carece de costo confirmado figura como **Pago registrado · costo por confirmar** en Liquidaciones de fletes. Se conserva el movimiento existente y se revisa el costo y las compensaciones con su respaldo. Los acuerdos históricos ya confirmados mantienen su liquidación.

Registrar salida y regreso reales por R, indicando si el regreso cruza medianoche. Los kilómetros realizados se cargan una sola vez para todo el LOG; P y Z históricos son el mismo dato. La llegada histórica N se trata como dato real, no como regreso previsto. Las horas efectivas se calculan por carga y se suman. Los kilómetros extras se calculan contra los incluidos en la tarifa guardada.

No se utiliza T («horas esperadas»), ni se replica O/Y (base de kilómetros). La duración de ruteo M se conserva por carga. La jornada incluida puede definirse en minutos en la tarifa para calcular horas extras. Si falta, se pide confirmarla; no se inventa una base. La tarifa horaria y los plus requieren confirmar el importe acordado.

Los estados son Planificada, En recorrido, Cerrada y No salió. La fecha y el fletero no se cambian después de generar el LOG. El cierre requiere los horarios reales completos (globales o por carga) y kilómetros totales. Los registros cerrados no se editan salvo el circuito específico de extras; No salió requiere motivo y se bloquea si ya existen pedidos ejecutados, rendiciones o movimientos. Cada cambio tiene versión y auditoría; una edición desactualizada se rechaza.

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
