# Zono - Mercado Pago Monitor (Extensión Chrome)

Extensión de navegador para monitorear transferencias y cobros entrantes en **Mercado Pago Web** y transmitirlos en tiempo real a **Zono ERP** sin depender de teléfonos celulares ni de aplicaciones duales.

---

## 🚀 Instalación en 3 pasos (30 segundos)

1. Abrí Google Chrome y andá a:
   ```
   chrome://extensions/
   ```
2. Arriba a la derecha, activá el interruptor que dice **"Modo de desarrollador"**.
3. Arriba a la izquierda, tocá el botón **"Cargar descomprimida"** y seleccioná esta carpeta:
   ```
   d:\GitHub\zonoconstruccion\chrome-extension-mp
   ```

¡Listo! Ya tenés la extensión instalada.

---

## ⚙️ Configuración

1. Tocá el ícono de extensiones (el rompecabezas 🧩) en Chrome y fijá **Zono MP Monitor**.
2. Al abrir la extensión podés configurar:
   * **Cuenta:** Seleccioná el alias de la cuenta de Mercado Pago abierta en ese perfil de Chrome.
   * **Webhook URL:** `https://zono-erp.pages.dev/api/mp-webhook` (o tu URL local si estás probando).
   * **Clave secreta:** `mpchecker_secret_key_123`
   * **Intervalo de refresco:** 25 segundos (recomendado).
3. Tocá **"Guardar configuración"**.
4. Podés tocar el botón **"Enviar prueba ($100 a Zono)"** para verificar que la conexión funcione al 100%.

---

## 👥 Cómo monitorear varias cuentas de Mercado Pago a la vez

En Google Chrome podés tener **Perfiles separados**:
1. **Perfil 1 de Chrome:**
   * Entrás a `mercadopago.com.ar` y te logueás con la **Cuenta MP3** (`diegozono.mp`).
   * En la extensión seleccionás `diegozono.mp`.
2. **Perfil 2 de Chrome (Nuevo perfil de usuario):**
   * Entrás a `mercadopago.com.ar` y te logueás con la **Cuenta MP4**.
   * En la extensión seleccionás `pagoszono.26`.
3. **Perfil 3 de Chrome:**
   * Entrás a `mercadopago.com.ar` y te logueás con la cuenta `cobroszono`.
   * En la extensión seleccionás `cobroszono`.
4. Dejás abierta la pestaña de **"Actividades"** en cada perfil.

## Una sola pestaña de monitoreo por perfil

Después de actualizar la extensión, abrí **Actividades** en la pestaña que querés usar y tocá **«Activar aquí»** en el widget. Esa será la única pestaña que refresca, registra cobros y envía alertas. Podés abrir otras pestañas de Mercado Pago para operar normalmente: quedan ignoradas por el monitor.

Desde la versión 1.3.4, la pestaña elegida conserva la activación durante actualizaciones de la extensión y se recupera automáticamente cuando Chrome restaura una sesión con IDs de pestaña nuevos. **«Activar aquí»** solo hace falta para elegir otra pestaña de Actividades de forma manual.

Desde la versión 1.3.7, si la pestaña monitor sale de Actividades o se cierra, la extensión avisa al ERP después de unos 8 segundos aunque la navegación haya descargado el script de la página. Chrome puede demorar el aviso hasta unos 30 segundos si suspende el proceso de la extensión. Al volver a Actividades se restablece la detección para una próxima salida. Cambiar solamente a otra pestaña de Chrome no cuenta como salir de Actividades.

---

## 🛡️ Características
* **Lectura del listado:** Escanea movimientos cargados en Actividades, sin desplazar ni paginar. El modo automático procesa los de hoy; «Sincronizar visibles» también procesa fechas anteriores cargadas.
* **Confirmación y reintentos:** Un cobro se considera enviado cuando el ERP confirma `success: true`. Los errores se reintentan después de 30 segundos mientras el movimiento siga disponible en el listado; no se superponen envíos del mismo cobro.
* **Widget visual:** El punto indica conexión. «Lectura» muestra los cobros de hoy detectados y los envíos sin confirmar; el botón manual informa ingresados, duplicados y fallos.

## Actualizar y diagnosticar

1. En `chrome://extensions/`, recargá **Zono - Mercado Pago Monitor**.
2. Recargá también la pestaña de Mercado Pago para reemplazar el script que estaba ejecutándose.
3. Revisá «Lectura». Si muestra 0 pese a haber ingresos, tocá **Diagnóstico** y copiá el texto seleccionado. Incluye estructura y texto de algunos movimientos para identificar diferencias de diseño; no incluye cookies, configuración ni claves, y no se transmite automáticamente.

## Pruebas locales

Desde la raíz del proyecto:

```powershell
node chrome-extension-mp/tests/serve.cjs
```

Abrí `http://127.0.0.1:8766/activities`. Ejecuta el script real sobre listados de prueba con respuestas simuladas de Chrome y ERP. No envía pagos a servicios externos.

## Captura bancaria desde octubre de 2026 (v1.4.0)

Se pueden mantener abiertas dos pestañas activas por perfil: `/activities` para Chequeo de Pagos y `/banking/movements` para movimientos bancarios. Cada fuente conserva su propia pestaña monitor. La captura bancaria no sustituye las alertas de Chequeo.

Después de actualizar, recargá la extensión en `chrome://extensions` y ambas páginas. Confirmá el alias de la cuenta abierta. Para probar la implementación local, configurá `http://localhost:3000/api/mp-webhook` en el popup: las capturas utilizan automáticamente `/api/mp-bank-web` del mismo servidor. La nueva ruta es independiente del webhook de cobros; una instalación vieja devuelve un error y no registra pagos de prueba.

La captura sólo considera filas cargadas desde el 01/10/2026. No recorre páginas ni acredita cobertura completa del período. Podés cargar más filas y usar **Sincronizar visibles**. Los registros repetidos se actualizan; el número de operación agrupa varias partidas y no se utiliza como identificador único de fila.

En Finanzas → Importar extracto, seleccioná la cuenta y abrí **Movimientos capturados de Mercado Pago**. Consultá por fecha y filtrá por operación, cliente o pedido. Actividad completa nombres; los cruces con Chequeo se realizan sólo cuando son únicos. Una operación de reserva explícita conserva sus partidas positivas/negativas y se muestra como transferencia interna, sin requerir pedido.

El extracto mensual completa el identificador de movimiento y confirma filas coincidentes por cuenta, operación, importe con signo y minuto. Las coincidencias ambiguas siguen provisionales. Capturar o cruzar datos no registra dinero ni modifica saldos de pedidos. La publicación productiva de esta versión no se realiza con la actualización de la extensión; usar el endpoint local hasta que se publique el backend.


### Frecuencias independientes (v1.4.1)

El popup separa Chequeo de Pagos (Actividad) de Movimientos bancarios, con frecuencias en oficina y fuera de horario para cada circuito. Chequeo conserva los valores existentes; Movimientos inicia en 30 minutos/2 horas. Los horarios y el destino son compartidos. La frecuencia bancaria también controla la lectura complementaria de nombres/reservas en Actividad, sin retrasar Chequeo. Guardar aplica las frecuencias a las pestañas abiertas. Recargar la extensión y las páginas una vez para instalar esta versión. La lectura utiliza filas cargadas; no implica refresco remoto ni cobertura completa. Sincronizar visibles en Movimientos omite la espera.


### Verificar pagos ahora (v1.5.0)

En Chequeo de Pagos, todos los roles con acceso (incluidos fleteros y vendedores) pueden pedir una lectura inmediata de la cuenta filtrada o de todas. La extensión activa de Actividad consulta pedidos remotos cada aproximadamente 10 segundos, pulsa Actualizar listado y espera los envíos al ERP. Se informa lectura terminada, fallo, desconexión o vencimiento; nunca se confirma un pago por el solo hecho de refrescar. Las solicitudes simultáneas de una cuenta se agrupan y vencen a los 90 segundos. Ambos dispositivos deben usar el mismo destino ERP. Es necesaria la extensión 1.5.0 y la migración v175. Backend disponible localmente; pendiente publicar en producción.

### Referencias administrativas de Actividad (v1.5.2)

La lectura complementaria incluye destinatarios/comercios y tipos de operaciones de todas las filas cargadas con fecha, hora e importe único; se excluyen estados pendientes o fallidos explícitos. Compras, transferencias salientes, servicios y devoluciones se usan para identificar componentes bancarios, sin generar cobros en Chequeo ni modificar saldos. Los extractos guardados muestran referencias actualizadas de capturas asociadas a su entrada. Las referencias ambiguas quedan para revisión.


### Bandeja y relevamiento de referencias (v1.6.0)

Finanzas → Más acciones → Bandeja de extractos Mercado Pago abre /admin/finanzas/extractos. Las capturas preparan los ítems sin registrar dinero. Se conservan el texto original de Movimientos, el de Actividad y el concepto administrativo. Los filtros permiten revisar pendientes de movimiento, pendientes de documento oficial y actividades sin vínculo. El Excel confirma los mismos componentes: no vuelve a registrar sus importes. Los movimientos ya aprobados conservan sus conceptos, fechas e importes.

Al ingresar a la pantalla o pulsar Actualizar Mercado Pago se solicita lectura a ambas pestañas de la cuenta. Relevar período completo carga páginas desde octubre y declara cobertura parcial si no alcanza el inicio solicitado. Estas solicitudes usan /api/mp-bank-refresh, una cola independiente de Chequeo de Pagos. La lectura histórica sólo transmite referencias a /api/mp-bank-web; no reproduce cobranzas históricas en el webhook de pagos. Al terminar vuelve al listado actual para que el monitor continúe.

Actualizar requiere recargar la extensión y las pestañas de Actividad y Movimientos de cada perfil. Usar el mismo destino productivo https://zono-erp.pages.dev/api/mp-webhook y el alias correcto. Las frecuencias bancarias se mantienen configurables (30 minutos en oficina, 2 horas fuera de horario por defecto).

Cuando Logística vincula un pago a un pedido, la referencia del extracto se actualiza sin generar otro cobro. Un fallo de enriquecimiento se deja para reintentar sin deshacer el vínculo del pedido. Verificar pagos ahora dispone de tiempos máximos de consulta y estado por cuenta: un problema de conexión ya no deja el botón verificando indefinidamente.

## Corrección de centavos — versión 1.6.1

Lee importes cuyos centavos aparecen separados en el listado bancario. Antes de recargar esta versión contra producción, aplicar db_migration_v179_bank_capture_decimal_repair.sql: repara capturas y borradores, conserva el original y las clasificaciones manuales, y no modifica movimientos registrados. El relevamiento histórico usa Relevar período completo en la bandeja; requiere ambas pestañas monitor activas con el alias de la cuenta y el destino del ERP correcto.

### 1.6.2 — Referencias desde el 30/09/2026
La captura de Actividad y Movimientos bancarios incluye el 30/09/2026 en todas las cuentas. Se mantienen los límites de octubre para generar nuevos movimientos financieros. Recargar la extensión y las pestañas de Mercado Pago para aplicar el nuevo lector.
