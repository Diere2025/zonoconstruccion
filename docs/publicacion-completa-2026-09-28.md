# Publicación completa del ERP · 28/09/2026

## Incluido

- Inicio con módulos, menú y navegación unificados; Meta Ads y Dashboard General en Dirección General.
- Dashboard General con todos los canales, segmentación explícita, paginación y conciliación de métricas.
- Acceso de administrador y Ver como usuario con roles múltiples y perfiles vinculados por correo.
- Incidencias con bandeja compacta, revisión del solicitante, cierre y adjuntos privados.
- Sesiones y lecturas de Supabase, importación, finanzas, rendiciones y generación de movimientos.
- Restauración de formatos de planillas respetando celdas protegidas y ampliación automática de filas.
- Archivos de documentación y pruebas de los cambios previos, incluyendo actualización ya publicada de la extensión de pagos.

## Verificación previa

- Compilación completa Next.js y TypeScript: aprobada.
- 220 pruebas aprobadas en la suite completa; una prueba antigua requería registrar los nuevos imports. Tras corregirla, sus dos casos pasaron: 222 comprobaciones en total.
- Las 8 incidencias importadas siguen presentes: 6 en revisión, 1 esperando al solicitante y 1 cerrada.
- Las funciones de revisión y nombres de participantes, el centro de costos Producción y el archivo de rendiciones están instalados.
- Los tres pedidos recuperados de Ludmila están verificados en las tres planillas: LK01705, LK01706 y LK01707.

Los registros de recuperación y respaldos de pedidos quedan en el espacio local de trabajo. El paquete de publicación contiene código, pruebas, migraciones, documentación y recursos de la aplicación.
