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
   * Entrás a `mercadopago.com.ar` y te logueás con la cuenta `cesara.daiana.010.mp`.
   * En la extensión seleccionás `cesara.daiana.010.mp`.
4. Dejás abierta la pestaña de **"Actividades"** en cada perfil.

## Una sola pestaña de monitoreo por perfil

Después de actualizar la extensión, abrí **Actividades** en la pestaña que querés usar y tocá **«Activar aquí»** en el widget. Esa será la única pestaña que refresca, registra cobros y envía alertas. Podés abrir otras pestañas de Mercado Pago para operar normalmente: quedan ignoradas por el monitor.

Desde la versión 1.3.4, la pestaña elegida conserva la activación durante actualizaciones de la extensión y se recupera automáticamente cuando Chrome restaura una sesión con IDs de pestaña nuevos. **«Activar aquí»** solo hace falta para elegir otra pestaña de Actividades de forma manual.

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
