# Convenciones del ERP

## Fechas y horarios

- Mostrar siempre las fechas al usuario en formato **DD/MM/YYYY** (día/mes/año), con día y mes de dos dígitos. Si se omite el año, usar **DD/MM**. Esta regla se aplica a pantallas, filtros, formularios, mensajes, tablas y documentos generados.
- Mantener **YYYY-MM-DD / ISO 8601** únicamente en valores internos, almacenamiento y contratos de API. No cambiar el dato guardado por un cambio de presentación.
- No depender del idioma del navegador o del sistema operativo para mostrar fechas. Un input HTML nativo de tipo date puede mostrar MM/DD/YYYY aunque la aplicación esté en español: usar controles que garanticen el formato visual, preferentemente el selector reutilizable ReportDateRangePicker para rangos.
- Mostrar horarios en formato de 24 horas y usar America/Argentina/Buenos_Aires para instantes presentados al usuario. Las fechas sin hora deben conservar su día de calendario sin conversiones de zona horaria.
- Al crear o modificar controles de fecha, verificar su presentación también con navegador configurado en inglés. No es necesario pedir nuevamente al usuario su preferencia de formato.
