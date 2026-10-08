# Personal y prestadores

Implementado el 01/10/2026 para localhost. Migración v139 y carga inicial aplicadas en producción por instrucción del usuario, con copia previa privada, ensayo transaccional y comparación de registros financieros/saldos antes y después. No se desplegó la aplicación.

## Acceso

Movimientos → Más acciones → Personal y prestadores (`/admin/personal`). En Pago al personal se abre el mismo padrón con Alta / habilitar personal; en Gasto o servicio, con Alta / habilitar prestador. El formulario del movimiento conserva sus datos. Tras guardar un alta o cambio, se actualizan los selectores.

Permite crear, editar, habilitar y deshabilitar empleados, eventuales, fleteros, profesionales, limpieza, empresas de transporte y otros prestadores. Una ficha puede tener varias relaciones. Nombre obligatorio; CUIT/CUIL, puesto/actividad y sueldo base opcionales. No se inventaron CUIT ni sueldos reales durante la carga inicial. Las ediciones requieren motivo y versión vigente; cada cambio se audita. El API y la RPC exigen permiso de administrar operaciones financieras para modificar. La consulta mantiene los permisos actuales de tesorería.

## Carga inicial y equivalencias

112 fichas, 22 habilitadas inicialmente por uso en movimientos entre el 01/08/2026 y el 01/10/2026, según la fecha de negocio. El catálogo, por sí solo, no acredita uso. No se cuentan compensaciones ni operaciones anuladas. La regla sirve para la carga inicial; habilitar o deshabilitar manualmente no se sobrescribe al repetir el script. Los tres empleados de ejemplo se conservaron deshabilitados. Se mantienen referencias históricas y los IDs de transportistas; este cambio no altera los selectores ni las habilitaciones de Ruteo.

- Olivera Matías y Olivera Matías Nahuel: una ficha.
- Vega Matías Ricardo y Vega Matías (Combustible): una ficha de empleado; combustible/diligencias conserva su concepto de gasto, sin convertirse en sueldo.
- Monotributo Mariano Bravo y Monotributo Tomás Ranaldi: conceptos vinculados a Bravo Mariano Ernesto y Ranaldi Lucas Tomas, respectivamente.
- Gianluca Vallarino: deshabilitado por baja confirmada, aun si tuviera uso reciente.
- Mercedes Arce (Pachi): profesional, actividad Contadora.
- Pato: servicio de limpieza.
- GYV: empresa de transporte.
- Las variantes confirmadas de Sergio Radice y los duplicados de Furgón Reparto Chico 2 y Logística Tercerizada: una ficha financiera con referencias a sus registros anteriores.
- Nombres con las mismas palabras en distinto orden, mayúsculas o acentos se comparan para vincular catálogo y transportistas. No se fusionan por similitud parcial nombres no confirmados, como las dos variantes de Pablo Lavayen.

Cada ficha conserva alias, conceptos y transportistas asociados. Conceptos y movimientos históricos no se reescriben ni se eliminan. Las fichas y conceptos de personas deshabilitadas quedan fuera de los selectores financieros nuevos; Mostrar deshabilitados permite recuperarlas en la gestión. Altas y cambios del personal se sincronizan atómicamente con `employees` para conservar la compatibilidad de nómina. Pagos y gastos identifican la ficha en `financial_operations.person_id`; una ficha deshabilitada se rechaza también en la base. Un pago de personal libre sin padrón no permite eludir esta validación.

## Verificación

39 pruebas locales aprobadas y comprobación de tipos aprobada. Ensayo con BEGIN/ROLLBACK de migración y carga repetidas, altas idempotentes, versiones obsoletas, alias duplicados, permisos, habilitación/deshabilitación sincronizada con empleados y asociación de ficha al movimiento dentro de la misma transacción. Se rechazaron gastos a personas deshabilitadas y pagos de personal libre sin padrón. La aplicación conserva su ejecución local; su guardado usa producción. La revisión visual automática no se realizó por el bloqueo previo del control de navegador.

Scripts: `scripts/financial-people-seed.cjs`, `scripts/test-financial-people.cjs`, `scripts/apply-financial-people.cjs --activate-production-v139`. Copia e informe privados bajo `scratch/financial-operations-activation/`, ignorado por Git. La carga se ejecuta en bloque para reducir el tiempo de bloqueo del registro financiero.

Comprobación posterior: lector publicado 200 con 1.401 movimientos; lectores locales con 12 empleados/eventuales, 22 fichas habilitadas, 104 proveedores y 15 cuentas. Padrón completo 112 fichas. El catálogo financiero local devuelve 1.018 conceptos tras excluir los conceptos vinculados a fichas deshabilitadas. La activación conservó íntegros 11.882 movimientos, 6.606 pagos de clientes y 21 pagos de proveedores, además de los saldos e identidades de las operaciones existentes. Las lecturas de la aplicación local volvieron a responder 200 después de la activación.
