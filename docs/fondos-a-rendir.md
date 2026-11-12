# Instructivo: fondos a rendir

Un fondo a rendir es dinero que la empresa entrega a una persona para gastos o para llevar cambio. No requiere código de pedido ni cliente.

## Crear el fondo

1. Entrá a **Finanzas → Movimientos → Carga rápida**.
2. Presioná **Crear o rendir un fondo**. También está en **Ver otros tipos de operación → Fondo a rendir**.
3. Elegí la acción **Entregar fondo**.
4. Completá **Fecha**, **Caja de origen**, **Importe**, **Quién recibe** y **Finalidad** (por ejemplo, “Logística Ferretería”).
5. Presioná **Entregar fondo**.

La fecha se muestra como DD/MM/YYYY. Si ya completaste fecha, caja, importe u observaciones en la carga rápida, se conservan al abrir el fondo. El código y la cuenta interna se generan automáticamente. En **Más opciones** podés agregar un detalle o una referencia propia.

La entrega separa ese dinero del efectivo disponible y lo deja en custodia de la persona. El gasto se registra cuando se rinde el comprobante.

## Registrar gastos y devolver el sobrante

Abrí nuevamente **Crear o rendir un fondo** y seleccioná la acción que corresponda:

| Acción | Qué completar |
| --- | --- |
| **Rendir gasto** | Fondo abierto, fecha, importe gastado, referencia del gasto y comprobante adjunto o existente. Repetí por cada gasto. |
| **Devolver dinero** | Fondo abierto, fecha, caja que recibe la devolución e importe devuelto. |
| **Pagar reintegro** | Fondo abierto, fecha, caja que paga e importe que se devuelve a la persona por gastos pagados con su dinero. |
| **Cerrar fondo** | Fondo abierto. Debe tener saldo en custodia y reintegros pendientes en cero. |

Si el gasto supera el saldo del fondo y la persona pagó la diferencia, marcá **El exceso fue pagado por la persona y debe reintegrarse** al rendir. Esa diferencia queda pendiente hasta que se registre **Pagar reintegro**.

Ejemplo: entregaste $60.000, la persona gastó $45.000 y devolvió $15.000. Registrá el gasto con comprobante y la devolución; después cerrá el fondo. Si solo llevaba cambio y devuelve los $60.000 completos, registrá la devolución completa y cerralo.

## La clasificación de la captura

**Cambio (Rendir / Rendido)** es una clasificación antigua de Recaudación. La carga rápida ahora la agrupa en **Fondos a rendir** y abre el formulario correspondiente. Elegí la acción según lo que ocurrió: entrega, gasto o devolución.

Para registrar dinero recibido de un cliente, usá **Cobro de cliente**, que sí requiere elegir pedido o cliente. Un cliente puede seleccionarse por nombre sin ingresar un código de pedido.

Los movimientos anteriores conservan sus datos. Esta mejora no convierte automáticamente cargas antiguas en fondos: antes de crear un fondo por una entrega ya registrada, revisá esa carga para evitar duplicar la salida de dinero.
