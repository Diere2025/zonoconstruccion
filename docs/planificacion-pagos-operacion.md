# Planificación de pagos: puesta en marcha

Estado: implementación incorporada al checkout local y disponible en la ruta `/admin/finanzas/planificacion`. Las migraciones `v115` y `v116` y la [carga inicial conciliada](planificacion-pagos-conciliacion-2026-09.md) se aplicaron a la base Supabase de producción configurada en `.env.local` entre el 29 y el 30/09/2026. La aplicación no se publicó.

## Alcance de esta entrega

- Tres fondos ARS independientes: Efectivo, Cuentas personales y Cuentas ZONO. Solo usuarios con rol `admin` pueden abrir el módulo o usar sus endpoints.
- Agenda semanal, tabla, proyección de 7/30/90 días, filtros, búsqueda y exportación CSV.
- Ingresos y pagos previstos; importes a confirmar; fechas programadas y vencimientos; prioridades; cuotas, realizaciones parciales, reversión, cierre de remanente, cancelación e historial.
- Saldos observados, reservas internas, liberaciones, transferencias previstas, ingresos por escenario y rutinas diarias/semanales/mensuales.
- Vista previa e importación selectiva de la hoja `Actual` desde XLSX. Ninguna fila se selecciona inicialmente. La importación crea previsiones; no registra pagos reales.
- La reserva de sueldos se modela como dinero separado del **disponible libre** dentro del mismo fondo. El reingreso es una liberación. No son movimientos entre cuentas.

El módulo no escribe en caja, movimientos financieros, cuentas corrientes ni sueldos. Las conexiones con esos circuitos quedan para la etapa de integración descrita en [el plan](plan-planificacion-pagos.md).

## Activación

1. Integrar esta rama con las migraciones que estén vigentes en el entorno de destino y comprobar que el número `v115` sigue libre. La rama de trabajo se creó desde `origin/main` y puede carecer de cambios locales recientes del checkout principal.
2. Las migraciones `v115` y `v116` ya se aplicaron a la base configurada en `.env.local`. Para otro entorno, ejecutar los scripts `apply-payment-planning.cjs` y `apply-payment-planning-reconciliation.cjs` primero como ensayo reversible y luego con `--apply`. Comprobar con `verify-payment-planning.cjs`.
3. Publicar la aplicación con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` configurados en el servidor. La clave de servicio nunca debe exponerse al navegador.
4. Abrir **Tesorería y Finanzas → Planificación de pagos** como administrador. Los saldos del 01/09 y 30/09, escenarios y pagos futuros ya están cargados. Elegir el período deseado para verlos.
5. Para revisar septiembre, ir a **Tabla**, seleccionar un rango que incluya los días históricos y filtrar **Borradores por conciliar**. Activar solo los compromisos que siguen pendientes; registrar una realización únicamente cuando se confirme un pago o cobro.
6. Una captura posterior de la hoja requiere comparación con la ya importada. El importador bloquea otro hash para evitar duplicaciones o sobrescribir decisiones de conciliación.

## Reglas operativas

- **Saldo observado** es una foto de dinero total del fondo al inicio de un día; **reservado** es la porción ya separada internamente. El disponible libre es total menos reservado.
- Una realización registra lo ocurrido solo en esta planificación. Puede ser parcial. Una reversión exige motivo y restituye el pendiente. Cerrar un remanente también exige motivo y deja de proyectar ese importe, sin inventar una realización. Puede reabrirse con otro motivo auditado.
- Una reserva general reduce el disponible libre. Al reservar para un pago concreto, la proyección consume esa reserva cuando vence el pago. Al registrar la realización, se registra también el consumo de la reserva asignada para evitar un doble descuento.
- Un pago atrasado conserva su fecha original y su pendiente se arrastra a hoy en la proyección. Los importes sin confirmar quedan fuera de las sumas y requieren revisión.
- Las cuotas se crean como ítems independientes con grupo común y distribución exacta de centavos. Las rutinas se generan hasta la fecha visible; repetir la generación no duplica ocurrencias.
- Reimportar la misma captura y las mismas filas no duplica. Una nueva captura con hash diferente se bloquea hasta reconciliar la anterior. Esto evita superponer versiones de la planilla sin revisar cambios.

## Verificaciones hechas

- `tsc --noEmit --incremental false` y ESLint de los archivos nuevos: correctos.
- Pruebas de proyección: reservas, transferencias, parciales, escenarios y saldo cero.
- Migración ejecutada en PGlite con operaciones de creación idempotente, parcial, reversión, cierre, cuotas, reserva, transferencia, recurrencia e importación duplicada.
- `next build --webpack` no completó en el worktree: `node_modules` está enlazado como junction al checkout principal y Webpack intenta resolver las entradas de Next desde una ruta relativa inválida. Hace falta instalar dependencias dentro del checkout de integración o ejecutar la compilación allí.

## Límites antes de conciliar la planilla

- No se fijó fecha de corte ni se validaron saldos de apertura o pendientes históricos contra una captura definitiva. La importación no puede declararse conciliada todavía.
- La vista previa propone clasificaciones a partir del efecto numérico y el texto; los ajustes, reintegros y transferencias ambiguos requieren decisión humana. Las filas de escenario y apertura no se importan automáticamente.
- No hay selección de cuenta bancaria individual dentro de cada fondo ni permisos separados para un rol de Administración. El acceso inicial es solo de administradores.
- La proyección es operativa y no sustituye la conciliación bancaria o contable. Su cobertura es incompleta cuando existen importes a confirmar, compromisos sin fecha o fondos sin saldo observado.
