# Instalar y actualizar Zono MP Monitor

Para recibir las actualizaciones con Git, instalá Git para Windows y ejecutá:

```powershell
git clone --branch codex/extension-mp-1.7.0 https://github.com/Diere2025/zonoconstruccion.git C:\Zono\zonoconstruccion
```

En Chrome, abrí `chrome://extensions/`, activá Modo de desarrollador y pulsá Cargar descomprimida. Seleccioná `C:\Zono\zonoconstruccion\chrome-extension-mp`.

Configurá el alias de la cuenta, el destino `https://zono-erp.pages.dev/api/mp-webhook` y la misma clave que usás en la PC actual. Abrí Actividades y pulsá Activar aquí. Para varias cuentas, repetí en cada perfil de Chrome.

Para actualizar:

```powershell
cd C:\Zono\zonoconstruccion
git pull
```

Después recargá la extensión en `chrome://extensions/` y las pestañas de Mercado Pago. La rama conserva su nombre aunque cambie la versión.

Desde 1.7.1, Reserva Diego se activa automáticamente en perfiles nuevos; una pausa manual se conserva y se reanuda con Activar monitor. Mantené las pestañas monitor abiertas.

La configuración se guarda en cada perfil; no se copia con Git. Las funciones bancarias y de Reserva requieren sus servicios del ERP.
