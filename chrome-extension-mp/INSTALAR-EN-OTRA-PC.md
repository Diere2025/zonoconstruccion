# Instalar Zono MP Monitor 1.7.0 en otra PC

1. Descargá `downloads/zono-mp-extension-1.7.0.zip` desde esta rama de GitHub. En la vista del archivo, pulsá **Download raw file**.
2. Descomprimí el ZIP en una carpeta permanente, por ejemplo `C:\Zono`. No borres ni muevas la carpeta después de instalar.
3. En Google Chrome, abrí `chrome://extensions/` y activá **Modo de desarrollador**.
4. Pulsá **Cargar descomprimida** y seleccioná la carpeta `chrome-extension-mp` extraída, que contiene `manifest.json`.
5. Abrí la extensión y elegí el alias de la cuenta de Mercado Pago que usarás en ese perfil.
6. Configurá el destino `https://zono-erp.pages.dev/api/mp-webhook` y la misma clave secreta que usás en la PC actual. Guardá la configuración.
7. Iniciá sesión en Mercado Pago, abrí **Actividades** y pulsá **Activar aquí**. Mantené esa pestaña abierta.

Para varias cuentas, repetí la instalación y configuración en cada perfil de Chrome. La configuración del otro equipo no se copia con el ZIP.

El ZIP incluye todos los archivos necesarios. No requiere instalar Git, Node.js ni el ERP en la otra PC.

Las funciones de Movimientos bancarios y Reserva requieren sus respectivos servicios del ERP. Para Chequeo de Pagos, el monitor se activa en Actividades.
