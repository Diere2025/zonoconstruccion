# Accesos a pantallas por rol

La configuración se encuentra en **Soporte y Sistema → Accesos por rol**
(`/admin/accesos`), también accesible desde Gestión de Usuarios.
Solo los administradores pueden modificarla.

## Activación

Aplicar `database/db_migration_v241_role_screen_access.sql` y desplegar el código.
La migración crea la configuración con valores predeterminados, su historial y
una función de guardado exclusiva del servidor. Antes de aplicar la migración,
el ERP conserva la navegación existente y la pantalla informa que el guardado
todavía no está disponible.

## Comportamiento

- Cada rol tiene habilitaciones y deshabilitaciones por pantalla; las entradas
  sin personalización conservan las reglas anteriores.
- Los usuarios con varios roles reciben la unión de sus accesos. Para quitar
  una pantalla, ninguno de sus roles debe habilitarla.
- Administrador mantiene sus accesos. La administración de usuarios,
  configuración general y accesos, y las pantallas personales reservadas,
  no pueden delegarse desde esta pantalla.
- Las restricciones comerciales individuales siguen vigentes.
- Los cambios afectan menú, inicio y apertura por URL; las pestañas que comparten
  una ruta tienen identificadores independientes.
- Se actualizan al navegar, al volver a la ventana y cada minuto. Una pantalla
  denegada no monta su contenido y vuelve al inicio.
- Restaurar un rol elimina sus personalizaciones, pero requiere Guardar cambios.
- Cada guardado registra actor autenticado, configuración anterior y nueva y
  versión, en una transacción. Un conflicto entre administradores exige recargar.

Esta configuración **no modifica** políticas de datos, funciones SQL ni permisos
para consultar, crear, editar o eliminar. Una pantalla habilitada puede conservar
restricciones operativas propias de su módulo.

## Validación local

`node --test tests/role-screen-access.test.cjs tests/system-admin-access.test.cjs`

`tests/role-screen-access-ui.cjs` prueba la interfaz con Playwright contra un
servidor local. Requiere el módulo Playwright, opcionalmente indicado en
`PLAYWRIGHT_MODULE`, y acepta `PLAYWRIGHT_CHANNEL` y `ROLE_ACCESS_TEST_URL`.
Intercepta todas las APIs autenticadas, usa sesiones ficticias y bloquea
peticiones externas ajenas a sus simulaciones. No usa datos reales.
