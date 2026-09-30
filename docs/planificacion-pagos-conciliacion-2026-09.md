# Conciliación inicial de Planificación de pagos

Fecha de carga: 30/09/2026 (Argentina). Base: la misma Supabase de producción que usa el localhost del ERP. Fuente: hoja `Actual` y configuración de `Escenarios` del [libro original](https://docs.google.com/spreadsheets/d/1WThcC4pw3cxDOppp79ZlC7V_OdUQrBUYUKo32NosFBk/edit?gid=1324631057#gid=1324631057). **Actualización posterior:** los 197 borradores históricos fueron marcados realizados manualmente por instrucción del usuario; siguen sin vínculo confirmado a Movimientos.

La captura usada se tomó el 30/09/2026 a las 00:00:57 de Argentina. El contenido de la hoja se comprobó nuevamente antes de aplicar y mantuvo el hash SHA-256 `401bcbdfb76434eb738568d6b148808e26474dfc64e05ea54a1f620bd262d0ff`. El archivo privado está en `output/payment-planning/source-b3aa7753bb35.json` y no debe publicarse.

## Corte y saldos

El período histórico comienza el **01/09/2026**. Se cargó su apertura y un punto de control al **30/09/2026** tomado del cierre del 29/09 en la hoja, para que la planificación posterior sea independiente de las filas históricas aún en revisión.

| Fondo | Apertura 01/09 | Punto de control 30/09 |
| --- | ---: | ---: |
| Efectivo | ARS 134.400,26 | ARS 408.919,78 |
| Cuentas personales | ARS 5.699.471,25 | ARS 926.083,88 |
| Cuentas ZONO | ARS -2.003.337,94 | ARS -3.048.904,65 |

El saldo de efectivo de origen arrastra una fracción de milésimo; el módulo opera a centavos. Estos valores provienen de la hoja y no se presentaron como saldos bancarios conciliados. El componente de reservas anterior al 01/09 no pudo reconstruirse de forma inequívoca; se parte de cero reservado para ese corte y se conservan sus filas históricas como material de revisión.

## Resultado aplicado

- **119** filas históricas se vincularon de manera única a Movimientos por fecha argentina, importe, dirección, cuenta compatible y concepto. Cada realización guarda `cash_transaction_id`; los movimientos existentes no se modificaron.
- **197** ítems históricos quedaron inicialmente en **Borrador por conciliar**. Luego se marcaron realizados manualmente, con nota y evento de auditoría, sin declarar una conciliación con Movimientos.
- **155** pagos o ingresos previstos entre el 30/09 y el 31/10 quedaron activos para planificar. Se cargaron **2** reservas internas de sueldos para ese tramo.
- **3** reglas de ingreso por escenario reproducen los selectores independientes de Efectivo, Cuentas personales y ZONO, vigentes hasta el 31/10. No se inventaron ingresos para días posteriores a la captura.
- Se conservaron **853** filas de origen con clasificación y estado: 119 confirmadas, 157 previstas, 210 para revisión y 367 controles. Los controles incluyen saldos diarios, escenarios históricos y filas sin importe; no se duplicaron como ingresos o pagos.
- La proyección reconsultada desde la base igualó los **96 cierres diarios por fondo** entre el 30/09 y el 31/10 con una diferencia máxima inferior a un centavo. El conteo de Movimientos permaneció en **11.860**.

## Límite de la conciliación

La **equivalencia de la proyección futura con la hoja se verificó al cargar la captura**. La conciliación histórica con Movimientos sigue **parcial**: las 197 realizaciones manuales no tienen un movimiento identificado y 13 filas históricas de reserva/liberación requieren revisión. El estado realizado de esas 197 filas se aplicó después por instrucción expresa del usuario; no equivale a una conciliación bancaria. Algunas entradas de ingresos de septiembre se calculan en la hoja a partir de saldos; se conservaron como controles y no se declararon cobros reales.

La hoja nueva puede cambiar de posición las filas. La identidad de importación está ligada a esta captura y un hash diferente se bloquea hasta comparar cambios. No se debe volver a importar el libro desde el botón de la pantalla como si fuera una fuente nueva sin ese cotejo.

**Aclaración de cuentas personales:** la columna agrupa MP3, MP4 y MP5; se elige entre ellas según disponibilidad. Los saldos importados representan el grupo y no permiten afirmar qué saldo o pago corresponde a cada cuenta individual.

**Cuentas ZONO:** los registros importados se conservan, pero esta caja permanece oculta por defecto en la planificación mientras no se usa. El control **Mostrar Cuentas ZONO** permite consultarla temporalmente. Los totales de la pantalla se calculan con las cajas visibles.

## Trabajo diario en la agenda

La vista **Semana** muestra fechas en filas alineadas y Efectivo, Cuentas ZONO y Cuentas personales en columnas. Cada intersección enseña apertura, ingresos, pagos, reserva interna y disponible proyectado. Se puede arrastrar un pago o ingreso activo con importe pendiente a otra fecha y caja. El botón **Mover fecha o caja** ofrece la misma operación para teclado y pantallas táctiles. El movimiento actualiza fecha programada y caja en una sola transacción, guarda el antes y después en el historial y recalcula la proyección. No modifica el vencimiento contractual ni los movimientos efectivamente registrados.

Las reservas internas asignadas a un pago impiden pasarlo a otra caja hasta resolver esa reserva. Los movimientos totalmente realizados, cerrados, cancelados o en borrador no se arrastran. Solo se admite un destino desde la fecha actual. La equivalencia verificada con la hoja corresponde a la captura original; una reprogramación posterior cambia el escenario y, por diseño, modifica los cierres proyectados.

El botón de tilde de cada tarjeta registra el importe pendiente, la fecha efectiva y la caja previa confirmación. Si se registra solo una parte, la tarjeta continúa visible con el importe restante. Cuando se completa el importe previsto, pasa al grupo plegado **Realizados (n)** de esa fecha y caja. Al expandir el grupo, las tarjetas realizadas aparecen en verde; al abrir una se ven sus realizaciones y se puede revertir una con motivo, devolviendo el importe a pendientes. Esta confirmación manual se distingue de la conciliación con un Movimiento real.

En **Registrar realización** se puede activar **Generar también un Movimiento**. Se elige una caja activa de Movimientos con la misma moneda y un concepto activo del catálogo financiero compatible con el ingreso o egreso. Para el fondo Efectivo ARS se propone **Caja Efectivo Pesos**; MP3, MP4 y MP5 se imputan al fondo agrupado de Cuentas personales. La realización y el Movimiento se guardan y vinculan en una sola transacción, con protección contra reintentos duplicados. Revertir la realización devuelve el pendiente a la agenda, pero conserva el Movimiento contable: cualquier corrección de ese asiento se hace en Movimientos. Las fechas visibles y editables de esta pantalla usan dd/mm/aaaa.

Los saldos anteriores al 30/09 se muestran como no confiables porque la conciliación histórica quedó parcial. Desde el 30/09 se usa el punto de control tomado del cierre del 29/09 y se aplican los ingresos de escenario, pagos, reservas y transferencias de cada día.

La agenda abre por defecto desde ayer, con fechas visibles en formato dd/mm/aaaa. Si aparece un pendiente con fecha anterior al período, se lleva visualmente al primer día planificable y se muestra su fecha original. Los totales consolidados y las tarjetas de saldo por fondo se retiraron de la cabecera; la configuración de escenarios y saldos de apertura quedó en un panel plegable.

## Comprobaciones reproducibles

1. `node scripts/payment-planning-read-sheet.cjs` toma una nueva captura privada de solo lectura.
2. `node scripts/payment-planning-match-movements.cjs output/payment-planning/source-b3aa7753bb35.json` reconstruye candidatos históricos sin escribir.
3. `node scripts/payment-planning-import-reconciled.cjs output/payment-planning/source-b3aa7753bb35.json` ensaya una carga completa y la revierte; luego de aplicada informa `already_imported`.
4. `node scripts/verify-payment-planning-import.cjs output/payment-planning/source-b3aa7753bb35.json` vuelve a calcular la proyección desde los registros persistidos y compara cada día y fondo.
