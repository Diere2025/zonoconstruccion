# Cooper: cotejo de entregas, OC y cuenta corriente

Fuente: [🔴Recibidos ZONO, pestaña `gid=134506688`](https://docs.google.com/spreadsheets/d/1orAhg5O_8AHeFihgeXvT512TvokQmf3qDQWQAVVjpNk/edit?gid=134506688#gid=134506688), consultada el 29/09/2026. Se filtraron las 28 líneas de Cooper. La columna U contiene el costo unitario tras el descuento; el total de cada entrega es la suma de cantidad × columna U (también coincide con los parciales de la columna V).

| N.º de hoja | Fecha de la hoja | Líneas | Costo final ARS | Cargo ya incorporado | OC existentes que suman las mismas cantidades | Diferencia entre total OC y costo final |
| --- | --- | ---: | ---: | --- | --- | ---: |
| 3386 | 14/08/2026 | 4 | 3.842.760 | CC-COOPER-1119 | Ninguna identificable | — |
| 3393 | 14/08/2026 | 4 | 7.394.430 | CC-COOPER-1121 | OP-AUTO-00275 | 163.470 |
| 3405 | 29/08/2026 | 4 | 7.176.810 | CC-COOPER-1180 | OP-AUTO-00276 + 00277 | 150.790 |
| 3415 | 04/09/2026 | 4 | 7.767.360 | CC-COOPER-1216 | OP-AUTO-00278 + 00280 | 87.740 |
| 3427 | 14/09/2026 | 4 | 4.015.740 | CC-COOPER-1277 | OP-AUTO-00284 | 90.460 |
| 3441 | 21/09/2026 | 4 | 3.959.940 | CC-COOPER-1324 | OP-AUTO-00285 | 0 |
| 3447 | 25/09/2026 | 4 | 7.583.220 | CC-COOPER-1355 | OP-AUTO-00288 + 00289 | 0 |

Las siete entregas totalizan **$41.740.260 ARS** y ya están reflejadas una sola vez en la cuenta corriente mediante los cargos existentes. La diferencia de $492.460 entre cuatro grupos de OC y costo final corresponde a los precios de OC anteriores frente al costo final descontado; no se debe sumar como deuda adicional. El N.º 3405 tiene **29/08** como fecha física de recepción en esta hoja, pero el cargo de la planilla de cuenta corriente muestra **28/08**. La OC 00275 fue cargada el 18/08, después de la entrega 3393 del 14/08, aunque sus cuatro cantidades coinciden exactamente.

En el ERP no existen recepciones de Cooper con detalle. Las OC identificadas aparecen cumplidas por `legacy_received_quantity`; crear nuevas recepciones por el flujo actual sumaría cantidades y generaría deuda de nuevo. Tres entregas abarcan dos OC, mientras que la recepción actual admite una sola OC. Para reconstruir el historial se requiere un vínculo de una entrega con varias OC y trasladar las cantidades históricas sin impacto nuevo en stock ni caja. Hasta hacerlo, conservar los cargos y las cantidades ya registradas.

El cargo **CC-COOPER-1371** del 29/09 por **$6.946.170 ARS** coincide en importe con **OP-AUTO-00290**, marcada cumplida, pero aún no tiene líneas en la pestaña de recepciones consultada. Por eso sus cantidades recibidas no pueden cotejarse con esa fuente y no está validado allí como entrega física. Cooper aún no tiene punto de partida configurado; tampoco se debe inferir saldo inicial cero a partir de una hoja filtrada.
