# Plan de implementación de Planificación de pagos

Fecha: 29/09/2026. Destinatario: modelo Sol, como ejecutor posterior. Estado: especificación propuesta a partir de la planilla y del código local. Este trabajo entrega la planificación; la implementación, las migraciones y la publicación se realizarán en una ejecución posterior.

## 1. Resultado esperado

Agregar al ERP un módulo **Planificación de pagos**, dentro de Tesorería y Finanzas, que permita organizar cobros esperados y pagos, anticipar faltantes de dinero y reprogramar compromisos con una lectura diaria y semanal clara. La primera versión debe permitir reemplazar el trabajo cotidiano de la hoja Actual, manteniendo sus tres fondos, escenarios e intervenciones manuales.

La información de planificación tendrá persistencia propia. Programar, reprogramar o dar por realizado un ítem manual no registrará automáticamente un movimiento contable, una deuda de proveedor ni una liquidación de sueldo. La pantalla distinguirá las previsiones, las realizaciones declaradas manualmente y, cuando exista la integración, las ejecuciones conciliadas con Movimientos.

La unidad central será un ítem con identidad estable, fecha, fondo, concepto, importe y estado. Las filas y columnas de la planilla se convertirán en distintas vistas de esos mismos registros. No habrá un archivo o conjunto de registros nuevo por cada mes.

## 2. Evidencia revisada y límites

### Planilla

Referencia: [ZONO Planificación Cobros y Pagos 2025, hoja Actual](https://docs.google.com/spreadsheets/d/1WThcC4pw3cxDOppp79ZlC7V_OdUQrBUYUKo32NosFBk/edit?gid=1324631057#gid=1324631057).

Se abrió la hoja en el navegador y se examinó una exportación XLSX del libro el 29/09/2026, incluyendo valores guardados, fórmulas, hojas, validaciones y formato condicional. No se modificó el original. La exportación es una captura: no acredita por sí sola que sus saldos estén conciliados con caja o bancos. No se ejecutaron las fórmulas de Google Sheets en otro motor.

Observaciones verificadas:

| Elemento | Evidencia | Consecuencia para el diseño |
| --- | --- | --- |
| Hoja principal | Actual, con 3.965 filas en la exportación; fechas observadas de enero a octubre de 2026 | El título del archivo dice 2025, pero no debe fijar el año de la aplicación |
| Efectivo | B:H; fecha, día, detalle, monto, monto con signo, saldo y observaciones | Primer fondo de planificación |
| Cuentas personales del dueño | J:P; segundo bloque con acumulado independiente | Segundo fondo; no asumir que equivale a una única cuenta bancaria |
| Cuentas de la empresa ZONO | R:X; tercer bloque con acumulado independiente | Tercer fondo; mantener visible su déficit aunque el consolidado sea positivo |
| Escenarios separados | C1 y K1: Intermedio; S1: Pesimista | Un selector por fondo; un cambio global debe ser una acción explícita |
| Consolidación | AA=W, AB=G+O y AC=AA+AB en las filas examinadas | Ofrecer ZONO, efectivo más personales y total, sin volver a sumar subtotales |
| Ingresos previstos | Rendiciones y ventas de depósito, ventas mayoristas e ingresos estimados | Incluir cobros esperados en el alcance inicial |
| Reglas semanales | Algunas fórmulas de ingreso usan WEEKDAY(...,2)=7 para devolver cero en domingo | Configurar días de aplicación por regla, sin bloquear pagos dominicales |
| Saldos observados | O3526 usa IF(M3526="",O3525+N3526,M3526); equivalente en W | Un saldo informado puede reemplazar el arrastre; no constituye un ingreso |
| Signos | F/N/V suelen negar el monto; en filas de ingreso lo conservan | Importar la dirección efectiva, no deducirla solamente de que el monto sea positivo |
| Reintegros | Reingreso Sueldos y otros conceptos tienen monto de entrada negativo en una fila de egreso | Normalizar dirección e importe conservando la referencia original |
| Ajustes | Existen filas AJUSTE y reservas/reintegros | Distinguir ajuste, reserva interna, liberación y transferencia |
| Colores | Formato condicional para negativos y rellenos manuales visibles | Un color no demuestra por sí solo que un pago esté realizado |
| Observaciones calculadas | P3527 y X3527 infieren un ingreso a partir del saldo siguiente y egresos intermedios | Conservar trazabilidad y comparar lo inferido; no importarlo además como otro ingreso |
| Hojas auxiliares | Escenarios, TERMOTANQUES, Servicios Vs, Lineas Actualizadas Personal, 2025 y hojas históricas ocultas | Revisar dependencias; no importar todo el libro como pagos |

En Actual se contaron 2.248 filas con detalle en efectivo, 1.372 en personales y 848 en empresa. Son conteos de filas con texto, incluyendo saldos, ingresos y plantillas, **no cantidades de pagos**. Hay filas con descripción pero sin monto: no convertirlas automáticamente en obligaciones de cero pesos.

### Escenarios observados

La correspondencia se obtuvo siguiendo VLOOKUP desde Actual, porque la columna D de Escenarios no tiene una etiqueta explicativa en las filas revisadas.

| Escenario | Efectivo: columna B | Empresa: columna C | Personales: columna D |
| --- | ---: | ---: | ---: |
| Optimista | 6.000.000 | 700.000 | 3.000.000 |
| Intermedio | 4.000.000 | 500.000 | 2.500.000 |
| Pesimista | 3.000.000 | 0 | 1.800.000 |

Estos valores son la referencia de la captura, no constantes permanentes del producto. Su uso por moneda requiere confirmar la moneda de cada fondo al migrar; ARS es la propuesta inicial. Las ventas mayoristas tienen una línea separada y no deben recibir automáticamente los valores de estas reglas.

### Repositorio

Se revisó el árbol local en la rama `codex/optimizacion-rendimiento`, HEAD `f6f422eb2e40a76a735368fe84f577edcff8c1bf`. Hay numerosos cambios y archivos sin seguimiento de otros trabajos. El ejecutor deberá revisar el estado actualizado y preservar esos trabajos; esta referencia no es una instrucción para implementar sobre un commit antiguo ni para desplegar todo el árbol.

Stack observado en package.json: Next.js 16.1.7, React 19, TypeScript, Tailwind 4 y Supabase. Ya están disponibles lucide-react, xlsx y herramientas de PDF. No introducir otra aplicación, framework o sistema visual para este módulo.

| Referencia local | Utilidad y precaución |
| --- | --- |
| `src/app/admin/finanzas/page.tsx` | Movimientos, cuentas, proveedores, empleados y pagos; es una pantalla extensa, mantener el módulo nuevo separado |
| `src/components/finanzas/FinanceToolbar.tsx` | Controles compactos y adaptación al ancho |
| `src/components/finanzas/SupplierAccounts.tsx` | Extractos y navegación financiera |
| `src/lib/financialConcepts.ts` | Catálogo y normalización de conceptos |
| `src/lib/financialAccountLabels.ts` | Etiquetas existentes de cuentas |
| `src/lib/treasuryTransactionTime.ts` | Fecha de negocio en Buenos Aires |
| `src/lib/authenticatedRequest.ts` | Cliente con renovación de sesión y lecturas compartidas |
| `src/lib/erpNavigation.ts` | Catálogo único de navegación |
| `src/components/ui/AdminLayout.tsx` | Verificación de rutas y roles; Administración solo tiene admitida la ruta exacta de Finanzas en la regla examinada |
| `src/lib/financeAdminAccess.ts` | Guard de informes solo para administradores; no reutilizarlo sin adaptar si se admite Administración |
| `src/app/api/admin/supplier-accounts/route.ts` | Ejemplo de API autenticada y lectura de cuentas corrientes |
| `database/db_migration_v46_employees_and_payroll.sql` | Directorio de empleados y vínculo employee_id en caja; no prueba que exista una liquidación de haberes completa |
| `database/db_migration_v94_financial_concepts.sql` y v95 | Conceptos financieros y relación con movimientos |
| `database/db_migration_v112_supplier_account_start.sql`, v113 y v114 | Aperturas de proveedores y circuito recepción/deuda |
| `docs/cuentas-corrientes-proveedores.md` | Decisiones recientes y límites de imputación/registro de pagos |
| `tests/finance-workspace.test.cjs`, `tests/supplier-account*.test.cjs`, `tests/erp-navigation.test.cjs` | Convenciones de pruebas y regresiones |

La documentación local indica que la deuda de proveedor nace con la recepción y que la creación/imputación/reversión de pagos todavía contiene escrituras sucesivas. Verificarlo sobre la base de implementación elegida. La planificación no debe introducir una segunda deuda ni ampliar ese circuito antes de resolver su atomicidad.

## 3. Alcance por entregas

### Primera versión utilizable

1. Tres fondos configurables, con moneda y saldo inicial/observado con fecha.
2. Alta manual de pagos, cobros previstos, ajustes y transferencias de planificación.
3. Agenda semanal, tabla editable y proyección diaria de saldos sobre los mismos datos.
4. Escenarios de ingresos por fondo y reglas semanales, con excepciones manuales y vigencia.
5. Fechas de vencimiento y programación separadas; prioridades, notas y estados explícitos.
6. Duplicación, cuotas, recurrencias acotadas y reprogramación individual o masiva.
7. Registro manual de realización total/parcial y reversión dentro de la planificación, con trazabilidad.
8. Reservas internas y liberación, según la confirmación del usuario; clasificación pendiente solo para filas cuyo significado siga siendo ambiguo.
9. Importación revisable de Actual y Escenarios, conciliación de resultados y exportación de la vista.
10. Permisos, historial, protección frente a reintentos y edición concurrente.

El alcance no se considerará cumplido con una pantalla de demostración, datos en localStorage o totales calculados únicamente sobre la página visible.

### Ampliaciones posteriores

| Entrega | Resultado | Dependencia |
| --- | --- | --- |
| Integración con Movimientos | Conciliar lo planificado con egresos/ingresos existentes y registrar la ejecución desde un circuito transaccional | Contrato de imputaciones y reversión, fechas y saldos verificados |
| Cuentas corrientes | Proponer pagos desde documentos pendientes y anticipos disponibles | Aperturas y pendientes de proveedor confiables; distribución de pagos ampliada |
| Sueldos | Crear previsiones por período/persona y comparar con pagos | Fuente real de liquidaciones y permisos de nómina definidos |
| Automatización de ingresos | Alimentar previsiones con rendiciones, ventas o cobros identificados | Reglas que eviten sumar una venta, su cobro y su rendición como tres ingresos |
| Automatizaciones adicionales | Avisos, escenarios comparados, feriados y sugerencias de reprogramación | Primera versión estabilizada y preferencias acordadas |

La primera versión reutiliza catálogos e identificadores existentes cuando estén disponibles, pero no necesita conectar automáticamente sus operaciones. Las ampliaciones deben conservar la identidad y el historial de los ítems creados manualmente.

## 4. Diseño de pantalla y uso diario

Ruta propuesta: `/admin/finanzas/planificacion`. Entrada **Planificación de pagos** en Tesorería y Finanzas. Usar AdminLayout y sus componentes. Actualizar tanto el catálogo como las restricciones de ruta; agregar un enlace en el menú no alcanza.

### Cabecera

Título, botón **Nuevo pago**, acción secundaria **Nuevo ingreso** y menú para transferencia, reserva, importación, exportación y configuración. Selector de período con Hoy, Semana, Mes y rango personalizado. Moneda visible. Fondo: Todos o uno específico. Búsqueda por detalle, tercero y referencia.

Resumen compacto:

- Saldo de apertura/observado con su fecha y procedencia.
- Ingresos previstos y pagos pendientes dentro del período.
- Saldo proyectado al cierre y saldo mínimo del período con su fecha.
- Aviso de pagos atrasados, ítems sin importe y datos pendientes de clasificación.

Mostrar cada fondo por separado y un consolidado por moneda. Un total positivo no debe ocultar un fondo negativo. El saldo estimado no se rotulará como saldo bancario disponible ni como saldo conciliado.

### Vista Semana predeterminada

Agenda de siete días. En cada día: ingresos previstos, pagos pendientes, reservas/transferencias y saldo de cierre. Una fila compacta de pago muestra concepto o tercero, importe, fondo y estado; prioridad o vencimiento solo cuando aporta información. Encabezados fijos y apertura del detalle sin perder período ni filtros.

En escritorio se puede ofrecer una matriz con días en columnas y fondos en filas. El detalle abundante se abre en una lista del día; no colocar decenas de tarjetas altas en cada celda. En pantallas angostas usar lista diaria y selector de fondo. No depender de arrastrar para reprogramar: acción **Cambiar fecha** accesible por teclado desde la primera versión; arrastre es una mejora posterior.

### Vista Tabla

Campos visibles por defecto: fecha programada, concepto/tercero, fondo, ingreso o egreso, importe, pendiente y estado. Vencimiento, categoría, cuenta prevista, responsable y observaciones son columnas opcionales. Agrupación por día o fondo, subtotales y saldo de cierre. Mantener filas compactas y montos alineados.

Edición rápida de fecha, importe previsto y notas; Enter guarda, Escape cancela. Indicar guardado y errores sin perder lo escrito. Para cambios de fondo, moneda, realización o cancelación, abrir un formulario explícito. Las acciones masivas muestran cuántos ítems y cuánto dinero afectan antes de aplicar.

Filtros por estado o proveedor modifican lista y subtotal de selección. La proyección de caja conserva todos los flujos de los fondos/moneda seleccionados, con etiqueta **Saldo completo del fondo**; buscar un proveedor no debe convertir su subtotal en el supuesto saldo de caja.

### Vista Proyección

Serie diaria sencilla con saldo de cierre y umbral cero, acompañada de una tabla de saldos por fondo. Resaltar primera fecha con déficit y máximo faltante. El cambio de escenario actualiza el cálculo y permite abrir los ítems del día. Mantener accesibles los mismos resultados sin depender del gráfico ni solo del color.

### Alta y detalle

Campos obligatorios: dirección/tipo, detalle, fondo, moneda heredada y fecha programada si ya está decidida. Permitir **Sin programar**, visible en una bandeja separada. El importe puede quedar **A confirmar**; no tratarlo como cero ni anunciar cobertura completa mientras existan pendientes sin monto.

Opcionales: vencimiento, prioridad normal/alta, proveedor, empleado, concepto financiero, cuenta prevista compatible, referencia y notas. Mostrar opciones avanzadas solo al necesitarlas. Si se selecciona un tercero registrado, usar su ID y etiqueta; también aceptar una descripción libre para gastos sin tercero. No crear proveedores o empleados por semejanza de texto.

Detalle con resumen previsto/realizado/pendiente, realizaciones, origen e historial. Para acciones manuales usar **Registrar realización** y aclarar **Registrado en planificación**. Cuando exista conciliación real, mostrar **Conciliado con Movimientos** y enlace al origen.

## 5. Reglas de negocio y cálculos

### Fechas y cantidades

- Fechas de vencimiento/programación como DATE; timestamps de auditoría en UTC. Día de negocio: America/Argentina/Buenos_Aires, usando las utilidades existentes.
- Vencimiento es la fecha del compromiso; programación es cuándo se prevé disponer del dinero. Reprogramar no borra el vencimiento.
- Usar importes positivos más dirección explícita. Ajustes llevan dirección propia. Normalizar los signos de la hoja durante importación, con fuente conservada.
- NUMERIC en base; operar en unidades menores enteras o aritmética decimal en código. No acumular flotantes binarios como dinero. Serializar importes de forma consistente.
- ARS y USD se calculan por separado. No ofrecer un total combinado sin un proceso explícito de conversión, que queda fuera de la primera versión.
- Cero, dato ausente y valor estimado tienen significados distintos. Cero de escenario es válido. Un pago de importe cero solo puede guardarse como borrador explicativo, sin considerarlo pagado.

### Saldos observados y proyección

Cada fondo tendrá una apertura con fecha efectiva al inicio de un día. Una nueva observación de saldo también entra al inicio del día y reemplaza el arrastre anterior para la proyección desde esa fecha. Conservar autor, motivo y diferencia respecto del saldo esperado. Prohibir dos observaciones activas del mismo fondo/moneda/fecha; corregir por versión y auditoría.

Si un saldo se tomó al cierre, registrarlo como apertura del día siguiente. La primera versión no admite cortes intradiarios ambiguos. Un saldo nulo significa sin observación nueva; cero significa saldo observado cero.

Para cada fondo y día, desde la última apertura válida anterior o igual al período:

`Cierre(d) = Apertura(d) + ingresos realizados(d) - egresos realizados(d) + ingresos pendientes(d) - egresos pendientes(d) + transferencias netas(d) + ajustes(d)`

`Apertura(d+1) = observación al inicio de d+1, si existe; en otro caso Cierre(d)`

Las realizaciones entran en su fecha real; el remanente entra en su fecha programada. No sumar el importe completo previsto junto al completo realizado. No reconstruir un período filtrado empezando arbitrariamente en cero: calcular el arrastre previo o cargar una apertura equivalente verificable.

Los ítems cancelados o borradores no aportan remanente; las realizaciones vigentes de un ítem cancelado sí conservan su efecto hasta que se reviertan. Lo realizado antes de la última observación está absorbido por esa observación y no se vuelve a sumar. No cambiar el pasado porque se editó un escenario futuro. Las transferencias y ajustes deben aparecer una sola vez en esta fórmula: no sumarlos también dentro de ingresos/egresos si se exponen como términos separados.

La fórmula expresa una vista operativa revisada a una fecha de corte explícita. Para comparar un plan histórico con lo ocurrido después, usar versiones/eventos a esa fecha; no presentar la proyección recalculada hoy como si fuera la previsión que se conocía entonces. La primera entrega puede mostrar historial y diferencias por ítem; un comparador completo entre versiones queda para ampliaciones.

Pagos o ingresos pendientes con fecha anterior a hoy permanecen visibles como **Atrasados de programación**. Para la proyección operativa su remanente se ubica en hoy, con indicación **Arrastre pendiente**, hasta reprogramarlo o cancelarlo; la fecha original se conserva. Los compromisos sin fecha o monto quedan fuera de la suma cuantificada y generan un indicador de cobertura incompleta. Distinguir atraso de programación de vencimiento contractual vencido.

### Estados y realización parcial

Guardar el ciclo de vida `draft`, `active`, `cancelled`; derivar Sin programar, Programado, Parcial, Realizado y Vencido/Atrasado con fechas y realizaciones. No dejar un campo editable de estado que contradiga los importes.

Realización manual: importe, fecha real, fondo real, nota/referencia y actor. Puede diferir del fondo previsto, manteniendo la misma moneda. Cada realización es un evento reversible, no un booleano. Cancelar un compromiso parcialmente realizado cancela solo su pendiente. Para deshacer un pago declarado, revertir la realización con motivo.

`Pendiente = max(Importe previsto vigente - suma de realizaciones vigentes - remanente cerrado explícitamente, 0)`

Para ítems cancelados el pendiente proyectable es cero. El cierre de remanente tiene importe y motivo, por ejemplo un ingreso diario que terminó por debajo de lo previsto. Se conserva separado de las realizaciones para que cerrar una expectativa no declare un cobro inexistente. Reabrirlo también es una acción auditada.

Un importe real superior al previsto requiere elegir explícitamente aumentar la previsión o registrar un excedente. Conservar el previsto original, el revisado y la diferencia; no ocultar un exceso truncándolo a cero. No permitir reducir silenciosamente la previsión por debajo de lo realizado. Duplicar un ítem copia datos operativos pero no realizaciones, IDs externos, importaciones ni historial.

### Escenarios

Mantener Optimista, Intermedio y Pesimista configurables y un selector por fondo. Los parámetros tendrán vigencia desde una fecha; cambiar una expectativa futura no sobrescribe cifras históricas realizadas. La lectura inicial puede reproducir Intermedio/Intermedio/Pesimista de la captura.

Reglas de ingreso por fondo, canal, días de semana y vigencia. Para cada ocurrencia hay un importe derivado del escenario o una excepción manual. Una excepción cero es válida. Mostrar si el importe es **Estimado** o **Fijado manualmente**. Cambiar escenario conserva las excepciones, los gastos y lo realizado.

El ingreso esperado de un día es un total esperado. Si ya se declararon 700 de un esperado de 1.000, quedan 300 previstos; nunca 1.700 en proyección. Al cerrar el ingreso diario, permitir dar por terminado el remanente no percibido conservando la diferencia. Los ingresos extraordinarios son ítems separados e identificados como tales.

Las reglas dominicales se aplican solo a los ingresos configurados. No desplazar fechas automáticamente por fines de semana o feriados. Para la primera versión, feriados se resuelven como excepciones de fecha/importes; una automatización futura requiere calendario acordado.

### Transferencias, reservas y ajustes

Una transferencia de planificación tiene origen y destino, misma moneda, importe y fecha. Crea dos efectos vinculados de igual magnitud y signos opuestos, en una operación atómica. El consolidado de ambos fondos no cambia. Si el usuario consulta solo uno, sí ve su efecto. No etiquetarla como ingreso comercial o gasto operativo.

**Decisión confirmada por el usuario el 29/09/2026: “Reserva de sueldos” y “Reingreso Sueldos” representan una reserva interna de dinero disponible.** Una reserva interna reduce dinero libre, conservando dinero total. Mostrar `Disponible libre = Saldo proyectado - reservas activas no consumidas`. La liberación aumenta libre, no total. Si un pago consume una reserva, reducirla en la misma operación para que el disponible no se descuente dos veces. Para estas líneas, la columna Saldo de la hoja refleja el efecto sobre disponible libre. Al migrar una apertura que ya descuenta reservas, reconstruir total como libre más reserva pendiente validada; nunca tratar ese saldo libre como total y descontar nuevamente la reserva.

Vincular cada liberación o consumo a una reserva existente; impedir liberar más de lo reservado. Si el corte ocurre con una reserva ya abierta, registrar su saldo pendiente de apertura sin volver a generar el egreso histórico. No asumir que toda liberación corresponde a un pago: “Reingreso Sueldos” libera disponibilidad y el pago se registra separadamente cuando ocurra. Si una línea futura representa dinero realmente movido a otro fondo, usar transferencia explícita. Otros casos históricos ambiguos pueden conservarse como ajuste legado con su efecto original y marca **Clasificación pendiente**; las reservas de sueldos ya confirmadas deben importarse como reserva/liberación.

Para proyectar reservas futuras, mantener eventos con fecha efectiva y monto pendiente por día, no un único saldo actual restado a toda la serie. Vincular la porción de reserva destinada a cada pago: en su fecha programada, la proyección simula el consumo de esa porción junto con el egreso, sin mutar todavía la reserva real. Así, un pago futuro ya cubierto no descuenta otra vez el disponible libre. Al registrar un pago contra una reserva, la reducción del saldo total y el consumo de la reserva ocurren en la fecha real; el remanente se mantiene reservado. Cancelar o reprogramar un pago actualiza ese consumo proyectado. Los cambios de escenario no modifican las reservas confirmadas.

Ajuste de planificación: dirección, importe y motivo obligatorios. Una nueva observación de saldo puede explicar la diferencia pero no debe crear además un ajuste duplicado. Ninguna de estas acciones crea asientos en la primera versión.

### Cuotas y recurrencias

Cuotas: dividir un total en N ítems con vencimientos/programación independientes y grupo común; repartir centavos conservando exactamente el total. Mostrar cuota x/N. Un pago parcial es realización de una cuota, no creación automática de otra deuda.

Recurrencias: diarias con días elegidos, semanales y mensuales; fecha inicial/final u horizonte acotado de generación. Para el día 29/30/31 inexistente, usar último día del mes y mostrar esa regla al crear. Generar por acción explícita **Generar próximo período**, con vista previa; sin cron en la primera entrega.

Cada ocurrencia tiene clave única `(regla, fecha de ocurrencia, secuencia)`. Una reprogramación conserva la clave original. Reejecutar no duplica. Editar ofrece esta ocurrencia o esta y futuras no realizadas; no alterar lo realizado ni excepciones individuales sin mostrarlas. Cancelar una ocurrencia deja registro para que no reaparezca al regenerar.

## 6. Modelo de datos propuesto

Los nombres son orientativos y deben adaptarse al esquema vigente. Crear migraciones aditivas con el siguiente número libre, sin reservar v115 a ciegas. No alterar saldos reales para inicializar el módulo.

| Entidad | Campos y responsabilidad |
| --- | --- |
| `payment_planning_funds` | id, nombre, tipo efectivo/personales/empresa/otro, moneda, orden, activo; identidad independiente de financial_accounts |
| `payment_planning_fund_accounts` | Relación futura o configurada con financial_accounts; impedir contar una cuenta simultáneamente en dos fondos del mismo cálculo |
| `payment_planning_balances` | Fondo, fecha de apertura, monto, fuente manual/importada/futura integración, motivo, versión y auditoría |
| `payment_planning_items` | id, tipo/dirección, detalle, fondo, moneda, importe original y vigente nullable, remanente cerrado y motivo, fecha programada nullable, vencimiento nullable, ciclo de vida, prioridad, clasificación, proveedor/empleado/concepto/cuenta prevista opcionales, notas, orden estable, grupo de cuotas/regla, versión |
| `payment_planning_realizations` | Ítem, monto, fecha real, fondo real, fuente manual/movimiento, referencia externa futura, actor, reversión; relación 1:N con ítem |
| `payment_planning_transfers` | Cabecera y efectos vinculados origen/destino; validación de moneda, importes y reversión conjunta |
| `payment_planning_reservations` | Fondo, destino conceptual, monto reservado, eventos de reserva/liberación/consumo, asignaciones a pagos previstos y vínculos a realizaciones; validar reserva disponible bajo bloqueo |
| `payment_planning_scenarios` y `payment_planning_scenario_rates` | Nombres y valores por fondo/canal, escenario y fecha de vigencia |
| `payment_planning_settings` | Escenario activo por fondo y configuración compartida versionada; preferencias visuales personales aparte |
| `payment_planning_rules` y excepciones | Tipo de recurrencia, calendario, plantilla, parámetros de ingreso, horizonte generado y overrides por ocurrencia |
| `payment_planning_import_batches` y filas | Archivo/hash, hoja, rango, estado, conteos, errores, mapeos y relación de origen con ítems |
| `payment_planning_events` | Entidad, acción, autor, fecha, valores antes/después y motivo; historial inmutable |
| `payment_planning_requests` | Clave idempotente, usuario/operación, hash de payload y resultado para reintentos |

Preferir relaciones explícitas y FKs para entidades ya existentes. No introducir un source_id genérico sin validación que permita vincular cualquier UUID. Los vínculos futuros con documentos externos pueden residir en tablas específicas sin poblar referencias inventadas desde ahora.

Restricciones mínimas en base: moneda compatible con fondo/cuenta, importes válidos, proveedor/empleado existentes cuando se referencian, fecha válida, fuente externa única según alcance, ocurrencia única, no sobreconsumo de reserva y realizaciones reversibles. No borrar físicamente ítems con historial financiero.

Índices para `(fund_id, scheduled_date, id)`, `(lifecycle, scheduled_date, id)`, vencimiento pendiente, proveedor, regla/ocurrencia, realizaciones por ítem/fecha y origen de importación. Diseñar totales y serie diaria en servidor sobre todo el conjunto, con paginación estable para el detalle.

## 7. API, consistencia y permisos

Propuesta de carpeta `src/app/api/admin/payment-planning/` y librería `src/lib/paymentPlanning/` con types, validation, dates, calculations, scenarios, recurrence, import, server y client. Evitar copiar la lógica de cálculo dentro de cada componente.

| Operación | Contrato |
| --- | --- |
| GET resumen/proyección | Rango, moneda y fondos; devuelve totales completos, serie diaria, alertas de cobertura y revisión de datos |
| GET ítems | Filtros, cursor y tamaño acotado; orden estable, mismo alcance autorizado |
| GET detalle | Ítem, realizaciones, origen e historial paginado |
| POST crear/duplicar/cuotas | Validación, clave idempotente, respuesta canónica |
| PATCH editar/reprogramar | expectedVersion obligatorio; conflicto 409 si fue modificado |
| POST realizar/revertir/cancelar | Motivo cuando corresponde; transacción con historial y actualización de versión |
| POST operación masiva | IDs/versiones explícitos, vista previa, límite de lote y operación atómica por lote |
| POST transferencia/reserva | Efectos relacionados y auditoría en una sola transacción |
| POST reglas/generación | Vista previa y aplicación idempotente con horizonte acotado |
| POST importación | Validar, previsualizar y aplicar lote; decisiones ambiguas resueltas antes de aplicar |
| GET exportación | Misma autorización, filtros y totalidad de registros seleccionados |

API privada con respuestas no almacenables públicamente. Validar sesión y roles en servidor; no confiar en localStorage, ocultamiento de botones, roles enviados por cliente o nombres de usuario. El actor del historial se resuelve en servidor. Considerar impersonación si el sistema vigente la admite.

Permisos propuestos: admin configura, importa, realiza y corrige; administracion opera la planificación y sus realizaciones manuales. Otros roles no acceden inicialmente. La información de cuentas personales y sueldos requiere confirmar si Administración verá los tres fondos: si se restringe, aplicar alcance también a consultas agregadas, detalle, búsquedas, eventos y exportación, sin filtrar solamente la UI. Por defecto técnico conservar el acceso a fondos personales restringido a admin hasta que se defina su alcance.

No ampliar globalmente requireFinanceAdmin ni las políticas de cuentas corrientes para habilitar este módulo. Crear un guard propio coherente con los roles admitidos y actualizar AdminLayout para la ruta precisa.

Definir un único camino de escritura mediante RPC transaccionales protegidas. Las funciones validan permisos y todas las invariantes en base. Revocar escritura directa si permitiría saltarse auditoría o versionado. RLS para lectura y protección de tablas; documentar el uso de service role en servidor y no exponerlo al cliente. Si se usan funciones SECURITY DEFINER, fijar search_path y restringir EXECUTE.

Idempotencia: repetir misma clave y payload devuelve el mismo resultado; misma clave y payload distinto falla. Versionado: dos operadores no sobrescriben un pago sin aviso. No reintentar a ciegas mutaciones fallidas; consultar el resultado por clave ante una respuesta incierta.

Los bloqueos de fila deben evitar doble realización, doble reserva o importación concurrente duplicada. Crear ítem, realizaciones, efectos de transferencia y evento de auditoría dentro de la misma transacción cuando forman una sola acción.

Refrescar al volver a la pestaña y después de guardar. Mantener el formulario abierto si hay error de red. No refrescar campos que el usuario está editando; avisar si cambió el registro. Realtime es opcional, con suscripciones acotadas y liberadas al salir. Un error de consulta no se muestra como saldo cero ni lista vacía legítima.

## 8. Importación y paridad con la planilla

### Preparación

1. Obtener una exportación reciente de la fuente. Registrar hash, fecha y versión del mapeo. Conservar el original fuera de public/ y de fixtures públicos; contiene información financiera y personal.
2. Usar Actual como fuente operativa y Escenarios como configuración. Tratar 2025 e históricos ocultos como consulta, sin mezclarlos automáticamente.
3. Inspeccionar fórmulas y valores guardados juntos. No ejecutar fórmulas arbitrarias del archivo en servidor ni asumir que todas las funciones de Sheets se exportan correctamente.
4. Inventariar referencias a TERMOTANQUES y otras auxiliares antes de fijar importes derivados. TERMOTANQUES contiene costo unitario por unidades vendidas y total a separar; su automatización futura puede originar reservas, no pagos duplicados.
5. Seleccionar fecha de corte, fondos, moneda y período a traer. Propuesta: apertura verificada del corte, compromisos pendientes anteriores identificados expresamente y proyecciones desde el corte. Preservar históricos en la referencia y permitir importarlos después como consulta.

### Transformación

- Cada bloque horizontal produce registros propios: una misma fila de Excel puede representar hasta tres operaciones distintas.
- Mapeo base: fecha B/J/R; detalle D/L/T; entrada E/M/U; efecto F/N/V; saldo G/O/W; notas H/P/X. Los saldos y AA:AC son controles, no operaciones adicionales.
- Clave técnica de origen: libro + hoja + bloque + fila + versión de captura. Dentro de una captura garantiza unicidad, pero insertar filas en Sheets cambia posiciones: no usarla sola para sincronización continua.
- Primera importación y repetición del mismo hash son idempotentes. Una captura posterior con filas movidas requiere comparación y decisiones explícitas; no fusionar pagos iguales por fecha/importe/nombre.
- Rechazar filas sin fecha efectiva válida cuando contienen un importe, y reportar montos sin detalle. Filas vacías con fórmulas de arrastre no son ítems.
- Distinguir observación de saldo, ingreso estimado por escenario, ingreso fijado, pago, reintegro y ajuste. Llevar los colores a evidencia auxiliar, sin inferir pago realizado por relleno.
- Al importar ingresos derivados de escenarios, crear una sola ocurrencia vinculada a su regla y conservar excepciones. No cargar además el valor calculado como ingreso manual independiente. Para nuevas ocurrencias, guardar la identidad y el origen de la regla, y resolver su monto desde parámetros versionados o una excepción; la realización congela lo ocurrido y no se recalcula por cambiar escenarios.
- Convertir importes negativos según el efecto F/N/V y clasificar. No tratar un reintegro, transferencia o liberación como facturación.
- Inferencias en P/X y observaciones con fórmulas deben quedar como control o nota identificada. No sumar además su resultado como cobro confirmado.
- Conservar valores originales con precisión y normalizar a dos decimales para operar. Se observó un saldo con tres decimales residuales: registrar el efecto del redondeo y cualquier diferencia acumulada, sin inventar un ajuste para hacer coincidir.

### Previsualización y aplicación

Tabla por fondo/día con filas válidas, ignoradas y que requieren decisión; estado propuesto y motivo. Mostrar cantidad de pagos, cobros, saldos observados, reservas/ajustes, total por dirección/moneda, primer y último día, y diferencias frente al saldo original.

Antes de aplicar, toda fila financiera debe tener una clasificación o exclusión explícita. Si no se conoce si ya fue pagada, queda en revisión y bloquea declarar la migración conciliada; no asumir pendiente ni realizado por estar en una fecha pasada. Se permite aplicar un subconjunto revisado con un reporte de lo excluido, sin presentarlo como importación completa.

Aplicación transaccional por lote acotado, recuperable e idempotente. Para una importación dividida en lotes, publicar sus resultados al usuario solo cuando el batch esté completo; un fallo conserva progreso y permite continuar sin duplicar. Un rollback de importación afecta solo registros aún no modificados/usados, mediante cancelación trazable, nunca borrando movimientos reales.

### Verificación de equivalencia

Comparar por fondo y día: apertura, ingresos, egresos, ajustes, saldo de cierre y consolidado. Reproducir los tres escenarios y los selectores independientes. Diferenciar saldo total y libre si se normalizaron reservas; documentar la correspondencia con la columna Saldo de origen.

Casos de referencia concretos:

- Actual filas 3513–3538: 28 y 29 de septiembre, con ingresos manuales, pagos, reservas/reintegros y ajustes.
- O3526: observación de saldo que reemplaza arrastre.
- Actual filas 3539–3551: 30 de septiembre, con ingresos por escenario y reintegro negativo en el segundo bloque.
- Un domingo posterior: ingresos sujetos a la regla dominical y pagos que conservan su fecha.
- Escenario Pesimista de empresa: ingreso cero válido y saldo negativo visible.

Los tests versionados usarán datos sintéticos equivalentes. Las cifras privadas se verificarán en un reporte local de migración con acceso restringido. La tolerancia monetaria propuesta es un centavo tras normalización, con diferencia de redondeo desglosada cuando el origen arrastra mayor precisión. Una diferencia mayor exige explicación o corrección, no una tolerancia ampliada para ocultarla.

## 9. Integraciones futuras y prevención de duplicados

### Movimientos

Agregar una relación de asignación entre realizaciones de planificación y cash_transactions. Un movimiento puede cubrir varios ítems y un ítem varios movimientos; la suma asignada no supera el importe elegible del movimiento. Validar moneda, dirección, fondo/cuenta y estado del movimiento. La confirmación del usuario resuelve coincidencias; sugerir por nombre/fecha/importe no autoriza vincular automáticamente.

Conciliar una realización manual existente la convierte en respaldada por el movimiento, conservando su identidad y efecto; no agregar una segunda realización. Si el movimiento tiene otra fecha o monto, mostrar diferencias y ajustar con historial. Las anulaciones y ediciones del movimiento deben invalidar o actualizar la conciliación en el mismo circuito transaccional.

Cuando la proyección use saldos y movimientos reales, mostrar un corte explícito por fondo: **Real hasta fecha/hora, previsto desde corte**. Los movimientos incluidos en el saldo de corte no se suman otra vez. Los pendientes se agregan solo por su remanente. Cambiar de apertura manual a saldo real requiere una conciliación de transición, no sumar ambas aperturas.

Antes de ofrecer **Registrar movimiento desde planificación**, llevar creación, imputaciones a proveedor, realización y auditoría a una operación transaccional e idempotente. La planificación no envía dinero a bancos: registra o vincula hechos en el ERP.

### Cuentas corrientes de proveedores

Crear propuestas desde documentos pendientes efectivamente incluidos en el extracto, respetando apertura, exclusiones históricas, moneda, notas de crédito y anticipos. Evitar usar el saldo global del proveedor como si fuera un documento con vencimiento. Si no tiene apertura configurada, mostrar esa limitación y no certificar deuda conciliada.

Una propuesta conserva vínculos al documento y cuota; aceptar una segunda propuesta no duplica la parte ya planificada. Una cancelación o nota de crédito posterior actualiza el pendiente o genera una revisión visible. La suma de cuotas activas no puede exceder la porción acordada a planificar sin una decisión explícita. Planificar no crea supplier_purchases ni supplier_payments.

### Sueldos

Reutilizar employees y employee_id solo como identificación. Confirmar dónde vive la liquidación y qué conceptos incluye; base_salary no equivale automáticamente a sueldo neto a pagar. Clave por empleado, período, concepto y versión de liquidación; considerar adelantos y parciales para no pagarlos dos veces.

Permitir desde la primera versión un gasto manual Sueldos y una reserva general. La futura liquidación podrá distribuir esa previsión en personas y conservar trazabilidad, evitando sumar el total general más sus componentes. Limitar acceso a importes individuales según permisos acordados.

## 10. Secuencia de ejecución para Sol

### Paso 0. Preparar base y registrar decisiones

- Leer instrucciones del repositorio y este documento; revisar estado de Git, rama, cambios ajenos y esquema actual.
- Elegir checkout utilizable o worktree gestionado si hace falta aislamiento. No descartar, copiar en bloque ni publicar cambios de otras tareas.
- Verificar dependencias locales necesarias: si los componentes financieros examinados aún no están en la base elegida, incorporar solo los cambios necesarios o adaptar el módulo con una dependencia explícita.
- Respetar la semántica confirmada de reservas internas y cerrar acceso a fondos personales, moneda y corte de migración. Documentar cualquier supuesto pendiente antes de importar.
- Establecer la situación inicial de build y pruebas relevantes, para distinguir errores previos.

Entregable: mapa actualizado de dependencias y decisiones; ningún movimiento de producción alterado.

### Paso 1. Dominio y motor de proyección

- Implementar tipos, validaciones, dinero, fechas, estados derivados y proyección como funciones puras que puedan probarse de forma independiente.
- Implementar observaciones de saldo, escenarios por fondo, excepciones, arrastres, parciales, transferencias y reservas.
- Preparar fixtures sintéticos que repliquen las fórmulas identificadas.

Salida verificable: resultados correctos para los casos de la sección 11, antes de acoplar la interfaz.

### Paso 2. Persistencia y API

- Crear migración aditiva, índices, RLS, permisos, versionado, auditoría e idempotencia.
- Implementar RPC transaccionales y endpoints, lecturas paginadas y agregaciones completas.
- Ejecutar migración y pruebas en base local o entorno de prueba compatible, nunca escribiendo pagos reales para probar.

Salida verificable: crear, editar, reintentar, realizar parcialmente, revertir y consultar desde dos sesiones sin duplicación ni sobreescritura silenciosa.

### Paso 3. Pantallas operativas

- Integrar ruta, navegación y guard de Administración.
- Crear agenda semanal, tabla, formularios y detalle/historial.
- Incorporar proyección, saldos por fondo y selectores de escenario independientes.
- Implementar carga, vacío, error, sesión vencida y conflicto de edición; revisar ancho real del ERP.

Salida verificable: ciclo manual completo desde la UI con persistencia tras recargar, en escritorio y móvil.

### Paso 4. Operaciones que reemplazan trabajo manual

- Cuotas, duplicación, reglas recurrentes, excepciones y generación con vista previa.
- Edición masiva con selección por ID/versiones, reservas y transferencias completas.
- Exportación de tabla/agenda con período, escenario, moneda y procedencia de saldos; proteger texto exportado contra interpretación como fórmula.

Salida verificable: preparar una semana nueva sin copiar fórmulas ni duplicar lo realizado.

### Paso 5. Importador y conciliación

- Implementar lectura de Actual/Escenarios, clasificación, dry run y reporte de diferencias.
- Validar una semana de referencia, un cambio de mes, un domingo y un saldo reemplazado.
- Ejecutar ensayo en prueba con datos autorizados y preparar la selección de corte; no considerar el dry run una importación aplicada.

Salida verificable: reporte reproducible de paridad o diferencias explicadas, con todas las filas contempladas.

### Paso 6. Validación y entrega de primera versión

- Completar regresiones, revisión visual y conciliación funcional.
- Preparar instrucciones de apertura, operación, importación, corrección y recuperación.
- Presentar el módulo revisable y la migración preparada. Para producción, verificar autorización vigente, aplicar migración antes del frontend y registrar exactamente qué se publica.
- Si falta el esquema en un entorno, mostrar “Planificación todavía no habilitada” con diagnóstico, no una pantalla vacía que parezca lista.

Salida verificable: primera versión aceptada con checklist, evidencia y limitaciones concretas. Las integraciones siguientes constituyen entregas separadas.

### Paso 7. Integrar por orden de dependencia

1. Consultar y conciliar Movimientos existentes.
2. Resolver atomicidad de registro de pagos y habilitar registro desde el plan.
3. Proponer compromisos desde cuentas corrientes.
4. Integrar liquidaciones de sueldos y cobros/rendiciones.
5. Agregar automatizaciones programadas cuando estén definidas.

## 11. Pruebas y criterios de aceptación

### Cálculos y comportamiento

| Caso | Resultado esperado |
| --- | --- |
| Apertura 100, ingreso 80 y pago 120 | Cierre 60 |
| Abrir solamente una semana futura | Mismo saldo que al calcular desde la apertura, usando arrastre correcto |
| Nueva observación cero al inicio del día | Apertura cero; no usar saldo anterior por evaluar cero como falso |
| Saldo observado 200 después de un cierre esperado 150 | Nueva base 200 y diferencia visible de 50; no ingreso adicional de 200 |
| Pago de 100 con realización 40 | Realizado 40 y pendiente 60, sin sumar 140 de egreso |
| Parcial en otra fecha/fondo | Efecto real en su fecha/fondo; remanente en programación prevista |
| Cancelar pago con 40 ya realizados | Se elimina solo pendiente; 40 continúan hasta reversión explícita |
| Revertir una realización | Se restituye pendiente y se recalcula saldo con historial |
| Ingreso previsto 100, percibido 40 | Proyección incorpora 40 realizados + 60 pendientes |
| Cambiar a Pesimista | Cambian solo estimaciones elegibles; quedan excepciones y realizaciones |
| Tres selectores distintos | Cada fondo usa el propio; consolidado coincide con suma de fondos |
| Domingo | Cero solo en reglas de ingreso con domingo excluido; pago dominical permanece |
| Transferir 30 de efectivo a personales | -30/+30; consolidado sin variación |
| Reservar 30 sobre saldo 100 | Total 100, libre 70; pagar 20 consumiendo reserva deja total 80 y libre 70 |
| Programar para mañana un pago de 20 cubierto por esa reserva | Hoy libre 70 y mañana libre proyectado 70; reserva real se consume al realizar, no al calcular |
| Importar una línea de ingreso por escenario y generar su período | Una única ocurrencia, sin duplicar regla más valor importado |
| ARS y USD | Totales separados; cuenta incompatible rechazada |
| Importe ausente | “A confirmar”, cobertura incompleta; no cero ni pago realizado |
| Pago atrasado 25 | Visible con fecha original; afecta hoy como arrastre una sola vez |
| Cuotas de 100 en tres partes | Suma exacta 100, con centavo residual asignado explícitamente |
| Regla mensual día 31 | Febrero usa último día, manteniendo intención de día 31 para marzo |
| Buscar proveedor | Lista filtrada y subtotal correctos; saldo del fondo mantiene todos sus flujos |
| Fondo negativo con total positivo | Déficit de ese fondo visible |

### Persistencia y seguridad

- Reintentar alta, realización, transferencia, generación o importación con la misma clave no duplica.
- Dos realizaciones concurrentes y dos consumos de una misma reserva no exceden límites.
- Dos ediciones sobre la misma versión producen un éxito y un conflicto recuperable.
- Fallo inducido entre efectos relacionados revierte la transacción entera.
- Usuario no autorizado no lee datos por URL directa, API, RPC, exportación ni agregados; usuario inactivo no opera.
- Autor/roles no se pueden falsificar en payload. Auditoría conserva valores y motivo.
- Consultas con más de 1.000 ítems conservan totales y paginación completa; resúmenes no dependen de la página visible.
- Regenerar recurrencias no revive canceladas ni borra excepciones.
- Repetir XLSX idéntico no duplica; otro archivo con filas desplazadas no se fusiona automáticamente.
- Confirmar que operaciones del módulo no cambian cash_transactions, supplier_payments, supplier_purchases ni saldos reales en la primera versión.

### UI y regresiones

- Revisar 1440 px, 1024 px y 390 px; importes y botones legibles, desplazamiento horizontal limitado a la tabla.
- Crear, editar, reprogramar, realizar parcialmente, revertir, cambiar escenario e importar desde controles reales.
- Probar teclado, foco, cierre/cancelación, feedback de guardado y conservación de formulario tras error.
- Recargar y volver atrás conserva URL/filtros; cambiar sesión limpia preferencias/datos sensibles de la anterior.
- Ejecutar pruebas nuevas del dominio/API/base y regresiones de finanzas, proveedores y navegación que correspondan.
- Ejecutar `npm run build` y lint de archivos modificados; reportar fallos previos separadamente, sin desactivar validaciones generales para ocultarlos.

No hace falta añadir una prueba por cada clase CSS. Priorizar invariantes monetarias, permisos, concurrencia y flujos reales. Un build exitoso no reemplaza la conciliación contra la hoja.

## 12. Archivos de trabajo sugeridos

| Área | Destino propuesto |
| --- | --- |
| Página | `src/app/admin/finanzas/planificacion/page.tsx` |
| Componentes | `src/components/finanzas/planning/PaymentPlanningWorkspace.tsx`, `PlanningWeek.tsx`, `PlanningTable.tsx`, `PlanningProjection.tsx`, `PlanningItemForm.tsx`, `PlanningItemDetail.tsx`, `PlanningImportPreview.tsx` |
| Dominio | `src/lib/paymentPlanning/` |
| API | `src/app/api/admin/payment-planning/` |
| Base | Nuevas migraciones `database/db_migration_vNNN_payment_planning*.sql` |
| Navegación | `src/lib/erpNavigation.ts`, `src/components/ui/AdminLayout.tsx` |
| Tests | `tests/payment-planning-calculations.test.cjs`, `tests/payment-planning-api.test.cjs`, `tests/payment-planning-database.test.cjs`, `tests/payment-planning-import.test.cjs` y prueba de flujo UI con herramientas existentes |
| Documentación | Este plan y `docs/planificacion-pagos-operacion.md` |

Evitar una reescritura completa de Finanzas o de cuentas corrientes como requisito de la primera versión. Extraer componentes compartidos solo cuando el nuevo módulo los necesite y se cubra su comportamiento previo.

## 13. Decisiones pendientes y valores propuestos

| Decisión | Propuesta ejecutable | Qué requiere confirmar |
| --- | --- | --- |
| Nombre y ubicación | Planificación de pagos en Tesorería y Finanzas | Sin bloqueo para desarrollar |
| Pantalla de entrada | Semana con acceso inmediato a Tabla | Validación visual durante revisión |
| Horizonte | Semana inicial; mes y rango; recurrencias generadas hasta fecha elegida | Sin generación ilimitada |
| Fondos | Efectivo, personales del dueño y empresa | Cuentas reales que los componen y moneda |
| Escenarios | Tres nombres actuales, selector independiente por fondo | Valores vigentes al momento de migrar |
| Reserva/reingreso | Confirmado: reserva interna; separar total, reservado y libre | Validar reservas pendientes al corte y correspondencia entre reserva/liberación |
| Marcas de pagado | Realizaciones explícitas | Significado de colores y si existe otra señal operativa |
| Roles | Admin completo; Administración operativa; personales inicialmente solo admin | Acceso de Administración a personales y detalle de sueldos |
| Corte inicial | Saldo verificado al inicio de día y compromisos abiertos | Fecha, saldos y pagos históricos realmente pendientes |
| Fuente futura de sueldos | Directorio existente como vínculo | Sistema de liquidación y conceptos netos |

Los pendientes de importación no impiden construir el dominio, persistencia e interfaz con datos sintéticos. Sí impiden afirmar que datos históricos ambiguos están correctamente conciliados. Registrar las respuestas nuevas en este documento antes de ejecutar la migración real.

## 14. Instrucción lista para el modelo Sol

> Implementá la primera versión de Planificación de pagos definida en `docs/plan-planificacion-pagos.md`. Leé primero la evidencia de la planilla, las reglas de cálculo y las decisiones pendientes. Revisá la base actual del repositorio y preservá cambios ajenos. Seguí los pasos 0 a 6, con persistencia real, permisos, auditoría, escenarios independientes por fondo, agenda semanal, tabla editable, proyección, parciales, recurrencias e importación revisable. Usá pruebas sintéticas para las invariantes y conciliá la migración contra una captura reciente de Actual y Escenarios. No consideres cumplida la tarea con una maqueta. Las operaciones iniciales pertenecen a planificación y no deben generar movimientos contables o deuda. Dejá las integraciones del paso 7 para entregas posteriores. Documentá diferencias de origen, decisiones nuevas, pruebas y el procedimiento de activación; comprobá la autorización vigente antes de publicar o aplicar cambios en producción.

## 15. Condición de cierre de la primera entrega

La primera versión está terminada cuando un operador puede preparar una semana, cambiar un escenario por fondo, detectar un déficit, reprogramar pagos, registrar parciales, generar el período siguiente y recuperar todo tras recargar; las cifras se explican desde los ítems y saldos observados; la migración identifica y concilia sus diferencias; los permisos y reintentos están probados; y existe una guía operativa. Debe quedar explícito qué registros son previstos, declarados manualmente o conciliados con una fuente real.
