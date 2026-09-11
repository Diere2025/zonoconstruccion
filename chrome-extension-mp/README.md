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
   * **Cuenta:** Seleccioná si esa ventana monitorea `diegozono.mp (Cuenta MP3)` o `Cuenta MP4 (Logística)`.
   * **Webhook URL:** `https://zono-erp.pages.dev/api/mp-webhook` (o tu URL local si estás probando).
   * **Clave secreta:** `mpchecker_secret_key_123`
   * **Intervalo de refresco:** 25 segundos (recomendado).
3. Tocá **"Guardar configuración"**.
4. Podés tocar el botón **"Enviar prueba ($100 a Zono)"** para verificar que la conexión funcione al 100%.

---

## 👥 Cómo monitorear las 2 cuentas de Mercado Pago a la vez

En Google Chrome podés tener **Perfiles separados**:
1. **Perfil 1 de Chrome:**
   * Entrás a `mercadopago.com.ar` y te logueás con la **Cuenta MP3** (`diegozono.mp`).
   * En la extensión seleccionás `diegozono.mp`.
2. **Perfil 2 de Chrome (Nuevo perfil de usuario):**
   * Entrás a `mercadopago.com.ar` y te logueás con la **Cuenta MP4**.
   * En la extensión seleccionás `Cuenta MP4 (Logística)`.
3. Dejás abierta la pestaña de **"Actividades"** en ambos perfiles.

---

## 🛡️ Características
* **Doble motor de captura:** Intercepta las llamadas de red internas de Mercado Pago y escanea el DOM visible con `MutationObserver`.
* **Anti-duplicados:** Registra los IDs de pagos transmitidos para jamás enviar una misma transferencia dos veces.
* **Widget visual:** Muestra una pequeña insignia verde en la esquina inferior derecha de la pantalla de Mercado Pago indicando que el monitoreo está activo y enviando pagos.
