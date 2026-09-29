# Revisión de las 18 sincronizaciones con aviso

Revisión del 28/09/2026 mediante lecturas de Supabase y Google Sheets. Se consultaron Central pedidos, Cancelados de Logística, las 12 hojas operativas existentes de Entregas Actual y las tres planillas de vendedores asociadas. No se modificaron pedidos, planillas ni estados de tareas. No se reenviaron avisos.

## Resultado

- Los 17 pedidos de anulación figuran Cancelado en el ERP y no aparecen en las 12 hojas operativas revisadas de Entregas Actual.
- Los 17 tienen una fila en Cancelados de Logística: las anulaciones están verificadas por su ubicación y coinciden con el ERP.
- Dieciséis tienen fila en Central pedidos; DB0036 no aparece allí. La ausencia histórica no demuestra una sincronización pendiente ni justifica recrear el pedido.
- El pedido nuevo JS25715 está en Central, en Pendientes de la vendedora y en L2. Producto, cantidad y precio coinciden con el ERP. En L2 faltan fórmulas e importes calculados.
- Los avisos históricos no se cerraron. La comprobación de planillas no acredita la entrega de mensajes de Telegram.

## Criterio operativo confirmado por el usuario

La presencia en la hoja Cancelados significa que el pedido está cancelado/anulado, independientemente del texto de estado de su fila. Los estados de las planillas sirven como guía del traslado entre hojas y no representan necesariamente el estado real del pedido.

Se retira la clasificación inicial de seis inconsistencias basada en estados distintos en Cancelados y la observación sobre Pasado en Central para JS25121. Esas diferencias no requieren corrección ni reejecución de las anulaciones.

## Anulaciones verificadas

JS24412, JS25111, JS25175, JS25259, JS25315, JS25324, JS25121, ENC579, JS24002, JS24801, JS24901, JS25177, JS25413, DEP00852, LK01604, DB0036 y CAMB1502 están en Cancelados y fuera de las 12 hojas operativas revisadas de Entregas Actual.

ENC579, DEP00852 y CAMB1502 no tienen fila por ese código en Pendientes del vendedor asociado. Estas ausencias y la de DB0036 en Central no invalidan la anulación ya verificada. No se crearon filas ni se repitieron tareas.

## Pedido nuevo JS25715

- ERP: Pendiente, un termotanque Cooper eléctrico 80 L, cantidad 1, precio y total $277.000.
- Central pedidos, fila 2685: Pasado; producto, cantidad, precio, total y saldo coinciden.
- Vendedora, Pendientes, fila 2220: Pasado; producto, cantidad, precio, total y saldo coinciden.
- Entregas Actual, L2, fila 18: Confirmado; producto, cantidad y precio coinciden. AB18 (total de productos) y AC18 (saldo) están vacías y sin fórmulas. Y18 (recargo calculado) también está vacía. Debe verificarse/restaurarse el cálculo de la fila sin volver a crear el pedido.
- No se confirmó el envío de todos sus avisos: la tarea interrumpida no conserva resultado completo.

## Fuentes

- [Central pedidos](https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/edit).
- [Cancelados de Logística](https://docs.google.com/spreadsheets/d/1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg/edit).
- [Entregas Actual](https://docs.google.com/spreadsheets/d/1mESHu4klY3N1XBXVgFT_Q7ZwlLtiA8GTi5NCCFFboZs/edit).
- Planillas de vendedores configuradas en el ERP y registros order_sync_jobs/orders/order_items de Supabase.

Las posiciones de filas corresponden a la revisión y pueden cambiar. Cualquier ajuste posterior debe volver a verificar el código de la fila antes de escribir.
