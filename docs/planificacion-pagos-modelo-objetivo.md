# Modelo objetivo de previsión de tesorería

## Decisión de diseño

La pantalla operativa tendrá **fechas en filas y cuentas/cajas en columnas**, con los pagos arrastrables entre intersecciones. El dato principal será la cuenta real por entidad y moneda; Efectivo, Cuentas ZONO y Cuentas personales serán agrupaciones de presentación hasta que se incorporen las cuentas individuales. **Cuentas personales agrupa MP3, MP4 y MP5**, utilizadas según disponibilidad; la captura importada no separa de forma confiable el saldo y la asignación de cada movimiento entre ellas. Un saldo disponible en una cuenta personal no debe tratarse automáticamente como liquidez transferible de la empresa.

## Posición y previsión

Por cada cuenta y día se calculará: saldo inicial confirmado + cobros previstos + transferencias entrantes − pagos previstos − transferencias salientes = saldo final previsto. La reserva interna reduce el **disponible libre**, sin reducir el saldo bancario. Se distinguirán saldo bancario, saldo contable y saldo disponible cuando las fuentes lo permitan. Un pago tendrá fecha de vencimiento, fecha programada y, al realizarse, fecha valor bancaria: son conceptos distintos.

La vista diaria abarcará inicialmente 30 días; el pronóstico de liquidez se mantendrá **13 semanas móviles**, con detalle diario cercano y resumen semanal a distancia. Un horizonte mensual posterior podrá servir para decisiones de financiación, sin presentar la misma precisión que el corto plazo.

## Fuentes y estados

- **Confirmado:** extracto bancario o movimiento conciliado. Es el punto de partida de cada cuenta.
- **Comprometido:** factura aprobada, sueldo, impuesto, cuota u obligación con importe y vencimiento verificables.
- **Estimado:** cobranzas y pagos variables, con fuente, responsable, fecha de revisión y supuesto explícitos.
- **Escenario:** cambio de fecha, importe o probabilidad para análisis, identificado y versionado; nunca reemplaza el hecho realizado.

Las cuentas por pagar, cobrar, sueldos y movimientos alimentarán el pronóstico sin duplicar filas. Una realización parcial reducirá solo el remanente previsto. Las transferencias moverán liquidez entre cuentas sin crear ingresos consolidados. Cada reprogramación guardará quién la hizo, cuándo, origen, destino y motivo.

## Rutina de control

1. **Cada mañana:** importar saldos y movimientos bancarios, conciliar, revisar partidas sin asignar y fijar el saldo inicial de cada cuenta.
2. **Cada día:** actualizar cobros esperados y pagos exigibles, resaltar saldo bajo mínimo por cuenta y priorizar decisiones antes del vencimiento.
3. **Cada semana:** guardar una versión del pronóstico de 13 semanas, comparar pronóstico anterior contra realizado por cuenta, fecha y categoría, y explicar desvíos relevantes de importe o fecha.
4. **Cada mes:** revisar supuestos recurrentes y sesgos de cobranza/pagos. Ajustar modelos de estimación con evidencia, sin reescribir versiones históricas.

## Orden de implementación

1. Registrar cuentas bancarias y cajas reales, entidad propietaria, moneda, límites y saldos observados; mapear las tres agrupaciones actuales a esas cuentas.
2. Vincular movimientos conciliados para saldos y realización automática de pagos/cobros, con revisión de coincidencias ambiguas.
3. Incorporar obligaciones desde cuentas corrientes, compras, sueldos e impuestos, con responsables y estados de aprobación.
4. Versionar previsiones y escenarios; mostrar desvíos pronóstico versus realizado y error por fuente/categoría.
5. Añadir alertas por faltante, mínimo operativo, pagos críticos, concentración de cobros y retrasos recurrentes.

La primera versión actual reproduce la captura de la hoja y permite mover pagos. Aún no tiene posición bancaria diaria por cuenta individual, importación automática de extractos, versiones congeladas del pronóstico ni medición sistemática de error; esos son los siguientes pasos para aumentar la previsibilidad.

## Referencias

- [Association of Corporate Treasurers: cash-flow forecasting](https://hub.treasurers.org/bedrock-of-treasury-cash-flow-forecasting/)
- [Association of Corporate Treasurers: short-term account forecasts](https://www.treasurers.org/ACTmedia/Knowledge%20Hub/hsbc-treasurers-global-guide-investing-cash-2019.pdf)
- [AFP: cash forecast methodology](https://www.afponline.org/training-resources/resources/articles/Details/selecting-a-cash-forecasting-methodology)
- [AFP: forecast policy and variance](https://www.afponline.org/training-resources/resources/articles/Details/why-cash-flow-forecasting-is-important-to-treasury)
- [Oracle: cash position by bank account](https://docs.oracle.com/en/cloud/saas/financials/26a/fappp/cash-positioning.html)
- [Oracle: daily forecast variance](https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/cashu/cash_analyzing.html)
