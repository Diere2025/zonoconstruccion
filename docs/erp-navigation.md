# Navegación del ERP

El ingreso al ERP lleva a `/admin`, donde se muestran los módulos y sus accesos según el perfil verificado del usuario. El logotipo y el acceso fijo Inicio llevan a esa misma pantalla. Un enlace directo conserva su destino después del inicio de sesión.

La definición compartida está en `src/lib/erpNavigation.ts`. El menú lateral y la portada utilizan el mismo catálogo y la misma política de visibilidad. Las pantallas conservan sus URL anteriores.

## Organización

| Módulo | Funciones principales |
| --- | --- |
| Dirección General | Dashboard General, Meta Ads, EERR, Rentabilidad y Margen, Capital Estancado |
| Ventas Minoristas | Panel del Vendedor, pedidos, cotizador, presupuestos y clientes minoristas |
| Ventas Mayoristas | Dashboard Mayorista, pedidos, cotizador, presupuestos y clientes mayoristas |
| Tesorería y Finanzas | Chequeo de Pagos, rendiciones, cajas, movimientos, cuentas, comprobantes y comisiones |
| Logística y Distribución | Ruteo, transportistas, impresión, facturación pendiente, control de planillas, pedidos en espera, auditoría, zonas y tiempos de entrega |
| Compras y Proveedores | Órdenes, asistente, costos, proveedores, listas, recepción, historial, fórmulas e importación de compras |
| Fábrica y Producción | Producción, recetas, insumos, explorador, fabricar o comprar, stock y costos de fábrica |
| Inventario y Catálogo | Catálogo, stock, lista de precios mayorista y vinculación de productos |
| Postventa | Garantías y atención comercial; gestión operativa de reclamos y cambios |
| Soporte y Sistema | Incidencias, recursos, usuarios, configuración y sincronización de planillas |

Meta Ads mantiene su acceso de administrador. La reorganización de módulos conserva la política de permisos existente, incluidos los usuarios con varios roles, los vendedores restringidos y las capacidades independientes de Incidencias. Mi Caja se ofrece a vendedores que ya pueden acceder a esa pantalla; los vendedores restringidos conservan sus restricciones.

## Destinos y contexto

- Los parámetros de pestaña y canal determinan el acceso activo y la ubicación superior.
- Una búsqueda, un estado o la paginación no cambian el módulo del listado de pedidos.
- Las pestañas de Compras y del Dashboard Mayorista actualizan la URL, para permitir recargar y volver con Atrás.
- La pestaña `claims_exchanges` se acepta al abrir Compras mediante su URL.
- Las pantallas de producción alojadas en Compras muestran las pestañas de Producción. Pedidos en Espera y Reclamos muestran su propio contexto.
- `/vendedores/ruteo/remitos` conserva compatibilidad y se reconoce como Impresión Logística.
- Los detalles de rendiciones e incidencias conservan el contexto de sus listados.
- Las funciones de creación, detalle y configuración interna conservan los permisos y la navegación de su módulo.
- Las páginas comerciales y de recuperación de contraseña siguen fuera del catálogo de módulos del ERP.

## Dashboard General

El alcance inicial es **Todo el negocio**. Se ofrecen también Minorista, Mayorista y Sin clasificar. La fuente es el campo `orders.channel`:

| Segmento | Valores |
| --- | --- |
| Minorista | `minorista`, `web_organica`, `mostrador_minorista`, `vendedor_externo` |
| Mayorista | `mayorista` |
| Sin clasificar | Valores ausentes o no reconocidos |

La vista global incluye todos los segmentos. La distinción por canal siempre muestra el período y el vendedor seleccionados. Los importes excluyen Cancelado y Anulado; la cantidad de pedidos del desglose incluye todos los estados.

El canal se aplica a los indicadores del período, comparación anterior, hoy, mes actual, tendencias, productos, categorías, rankings y entregas. Los clientes y productos del catálogo son conteos globales. Los pedidos sin importar se identifican como información separada de todos los canales y vendedores y no se suman a las ventas consolidadas.

Las consultas de datos se paginan con orden estable por ID. La paginación continúa hasta una respuesta vacía, incluso cuando la base limita las filas por debajo del tamaño solicitado. La deduplicación distingue código, vendedor y canal. Las líneas de productos se limitan a los pedidos seleccionados por esa misma deduplicación.

Las entregas usan su fecha real de entrega y pueden corresponder a pedidos tomados antes del período. El Dashboard Mayorista conserva su función especializada; no se suman sus métricas a las generales.

## Verificación

Se agregaron pruebas de navegación y permisos, clasificación y paginación, y una prueba de integración de la carga real del dashboard con fuentes simuladas. Esta última comprueba la conciliación entre indicadores, canales, productos y entregas, incluidos códigos reutilizados y pedidos anteriores al período.

Se revisaron la portada y el menú en escritorio y en un viewport móvil de 390 px mediante componentes reales con identidad de prueba local. Esta revisión no utiliza sesiones de clientes ni modifica datos de producción.

La compilación del proyecto utiliza `npm run build -- --webpack`, porque la configuración existente contiene personalizaciones de Webpack. La cobertura de pruebas no sustituye una conciliación de las cifras de producción contra sus planillas de origen.
