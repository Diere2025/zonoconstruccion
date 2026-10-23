# Recuperación de Movimientos — versión 1.7.4

El monitor de Movimientos verifica una captura confirmada por el ERP. La conexión
del refresco remoto por sí sola no acredita una lectura. Muestra la hora de la
última lectura confirmada en horario de Argentina, con reloj de 24 horas.

Una alarma de la extensión revisa la pestaña cada 30 segundos, incluso si el
script de la página dejó de responder. Tras aproximadamente 90 segundos de falla
(más la demora de la alarma), genera una notificación de Chrome y envía una alerta
al ERP. El ERP utiliza Telegram si sus avisos están habilitados y configurados.
Si el ERP está desconectado, la notificación local se intenta igualmente y el
envío se vuelve a intentar. Los permisos y ajustes del sistema pueden silenciar
las notificaciones locales.

Intenta hasta tres recargas por cada ventana de 15 minutos. El límite persiste
al recargar la página o reiniciarse el proceso de la extensión. Las recargas
normales respetan el intervalo de Movimientos configurado; una captura histórica
en curso posterga esa recarga normal. No se considera falla que los movimientos
no hayan cambiado, siempre que la captura se confirme.

Una página de inicio de sesión o una pestaña cerrada genera aviso y requiere
intervención: no se reinicia Chrome, no se inicia sesión automáticamente y no se
crean nuevas pestañas. El monitor necesita Chrome abierto, la extensión habilitada
y la PC despierta. No detecta desde afuera el apagado de la computadora.

## Preparar el paquete

Ejecutar desde la raíz del repositorio:

```powershell
node scripts/package-mp-watchdog.cjs
node --test tests/mp-banking-health.test.cjs tests/mp-banking-watchdog.test.cjs
```

El paquete se genera en `output/mp-extension-1.7.4`. Usa la versión 1.7.3 con la
interfaz unificada que está en `.codex-worktrees/extension-mp-1.7.0` y el popup del
paquete anterior, porque `background.js` y `popup.html` están eliminados en el
árbol principal. No restaura esas eliminaciones ni modifica aquel worktree.

## Actualizar la instalación actual

1. Abrir `chrome://extensions` y localizar Zono - Mercado Pago Monitor.
2. Conservar una copia de la carpeta que Chrome tiene cargada actualmente.
3. Copiar el contenido del paquete 1.7.4 dentro de esa misma carpeta, reemplazando
   los archivos. Mantener la misma carpeta evita cambiar la identidad de la
   extensión y sus ajustes guardados.
4. Pulsar Recargar en la extensión y después recargar las pestañas de Mercado Pago.
5. Confirmar versión 1.7.4, alias correcto y «Última lectura confirmada» en
   Movimientos. Si falla, el panel debe indicar el motivo y no mostrar salud verde.

La entrega del paquete no actualiza por sí sola ninguna instalación de Chrome.
