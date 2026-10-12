import {operationLabels,type OperationType} from './types';
export const operationDescriptions:Record<OperationType,string>={
 supplier_payment:'Facturas, anticipos y compras a proveedor eventual.',customer_collection:'Cobros de pedidos y comprobantes existentes.',
 payroll_payment:'Sueldo, adelanto, eventual o acuerdo.',operating_expense:'Servicios, Telecentro, alquiler y gastos de funcionamiento.',
 tax_payment:'Organismo, período y cuota.',internal_transfer:'Dinero entre cuentas propias de la misma moneda.',
 custody_fund:'Entrega, gastos rendidos, devolución, viáticos y reintegro.',currency_exchange:'Dos monedas, cotización y comisión.',
 financing:'Capital recibido o prestado, devolución y costos.',partner_equity:'Extracción, aporte, retiro y pagos personales del socio.',
 asset_trade:'Bien, contraparte y documento.',cash_count:'Conteo de billetes al corte, arqueo, apertura y ajuste confirmado.',
 general:'Excepciones que no pertenecen a otra familia.'};
// Manual entries in the 90-day audit: expenses 70, suppliers 49, payroll 48, collections 13, transfers 9.
// Legacy general rows are intentionally kept as the final exception.
export const manualOperationOrder:OperationType[]=['operating_expense','supplier_payment','payroll_payment','customer_collection',
 'internal_transfer','partner_equity','custody_fund','cash_count','currency_exchange','tax_payment','financing','asset_trade','general'];
export function orderedOperationTypes(frequency:Partial<Record<OperationType,number>>={}) {
 return [...manualOperationOrder].sort((a,b)=>a==='general'?1:b==='general'?-1:
   (frequency[b]||0)-(frequency[a]||0)||manualOperationOrder.indexOf(a)-manualOperationOrder.indexOf(b));
}
export const operationInstructions:Record<OperationType,string[]>={
 supplier_payment:['Seleccioná proveedor e importe. El pago se aplica a los comprobantes pendientes o queda como anticipo.','Si el proveedor es eventual, identificá a quién pagaste y adjuntá el comprobante.'],
 customer_collection:['Seleccioná el pedido o cliente y el importe efectivamente recibido. El excedente queda como saldo a favor.'],
 payroll_payment:['Elegí la persona y el tipo de pago. Sueldo, adelanto y eventual usan los campos correspondientes a cada caso.'],
 operating_expense:['Cargá el servicio o gasto y el importe pagado. Para un débito bancario, importá primero el movimiento.','Si el pago es personal de un socio, usá Asignar a retiro de socio sobre el movimiento guardado. Podés asignar todo o una parte.'],
 tax_payment:['Identificá el organismo y período. Completá la cuota cuando corresponda.'],
 internal_transfer:['Seleccioná origen, destino e importe. Las cuentas deben ser propias y tener la misma moneda.','Para otra moneda, usá Cambio de moneda. Los movimientos bancarios habituales se cargan mediante importación.'],
 custody_fund:['Un fondo a rendir es dinero de la empresa que entregás a una persona para pagar gastos. La entrega mueve dinero a custodia; el gasto se registra al rendir comprobantes.','Ejemplo: entregás $100.000, rinde $70.000 y devuelve $30.000. La custodia queda en cero. Si paga con dinero propio, queda un reintegro pendiente.','La cuenta de custodia es una cuenta interna exclusiva del fondo. Se crea automáticamente: por ejemplo, Custodia · Juan Pérez · Materiales Pellegrini. Su dinero se muestra separado del efectivo disponible.','Rendí gastos con comprobante, registrá devoluciones o reintegros y cerrá el fondo cuando ambos saldos estén en cero.'],
 currency_exchange:['Indicá cuánto entregás y cuánto recibís en la otra moneda. La comisión se registra por separado.'],
 financing:['Registrá capital recibido o prestado. En las cuotas, separá capital e intereses para conservar el saldo pendiente.'],
 partner_equity:['Un retiro identifica dinero destinado al socio, tanto efectivo como pagos personales realizados por la empresa.','Usá Registrar salida para una extracción nueva. Usá Vincular pagos existentes para asignar servicios o transferencias ya registradas, sin duplicar la salida.','Ejemplo: Telecentro Pellegrini por $45.000, correspondiente al domicilio personal de Diego Bóveda, se vincula como retiro por $45.000. Si el pago es mixto, asigná solo la parte personal.'],
 asset_trade:['Identificá el bien, contraparte y documento. Si la compra ya está registrada, pagala desde Pago a proveedor.'],
 cash_count:['Guardá cuánto efectivo había en una caja a una fecha y hora determinada. Podés cargar billetes o ingresar el total. Guardar el conteo no mueve dinero.','Desde Conteo de efectivo podés elegir un conteo guardado y ajustar esa misma caja. El ajuste utiliza el saldo a la hora del corte.','Ejemplo: a las 15:00 el saldo esperado es $100.000 y contás $98.000. El ajuste es −$2.000, aunque después haya entrado otro cobro.','Las cargas manuales del día conservan su hora real. Las cargas de días anteriores y las importaciones bancarias sin hora se imputan a las 12:00 de Buenos Aires. Si un movimiento retroactivo cambia el corte, revisá y confirmá la nueva diferencia antes de ajustar. La apertura se usa únicamente en cuentas sin movimientos.'],
 general:['Usá esta opción para operaciones que no encajen en otra familia. Indicá dirección, importe, detalle y clasificación.']};
export const operationTitle=(kind:OperationType)=>operationLabels[kind];
