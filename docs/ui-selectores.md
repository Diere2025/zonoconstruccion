# Convención de selectores

Preferencia del usuario: cuando un desplegable supera cuatro opciones seleccionables, debe permitir búsqueda. Los controles con hasta cuatro alternativas pueden conservar un selector simple.

Usar `src/components/ui/AdaptiveSelect.tsx` para controles con opciones variables. Mantiene un selector nativo cuando la lista es pequeña y utiliza `SearchableSelect` al superar cuatro opciones (sin contar la opción vacía). Las búsquedas ignoran mayúsculas y acentos, permiten teclado y seleccionan identificadores existentes; escribir texto no crea un registro.

Indicar `aria-label` o `searchLabel` con el nombre del campo. Conservar `required` y `disabled`, y limpiar referencias dependientes solo al cambiar la selección. Para selectores que siempre necesitan búsqueda puede utilizarse `SearchableSelect` directamente.

Aplicado a formularios de operaciones, proveedores/personal, filtros de Movimientos, controles de cuentas/validación y vista local.
