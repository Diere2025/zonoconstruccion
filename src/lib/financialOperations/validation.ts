import { operationLabels, type OperationInput } from './types';

export class OperationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function moneyValue(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new OperationError('Indicá un importe válido.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new OperationError('El importe debe ser positivo y tener hasta dos decimales.');
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number >= 1e12) throw new OperationError('Importe fuera de rango.');
  return Math.round(number * 100);
}
export function validateOperation(input: unknown): asserts input is OperationInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new OperationError('Datos inválidos.');
  const p = input as OperationInput;
  if (!Object.hasOwn(operationLabels, p.operation_type)) throw new OperationError('Tipo de operación inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.effective_date || '') || !Number.isFinite(Date.parse(p.effective_date))
    || new Date(p.effective_date).toISOString().slice(0,10) !== p.effective_date) throw new OperationError('Fecha inválida.');
  for (const field of ['account_id','payment_method_id'] as const) if (!isUuid(p[field])) throw new OperationError('Elegí cuenta y medio de pago.');
  for (const field of ['destination_account_id','cost_center_id','route_sheet_id','financial_concept_id','employee_id','person_id','supplier_id','client_id','order_id','client_payment_id'] as const) {
    if (p[field] && !isUuid(p[field])) throw new OperationError(`Referencia inválida: ${field}.`);
  }
  if (!['ingreso','egreso'].includes(p.direction)) throw new OperationError('Dirección inválida.');
  if (p.operation_type === 'customer_collection' && p.direction !== 'ingreso') throw new OperationError('Un cobro debe ingresar dinero.');
  if (['supplier_payment','payroll_payment','operating_expense','tax_payment'].includes(p.operation_type) && p.direction !== 'egreso') throw new OperationError('El pago debe ser un egreso.');
  const amount = moneyValue(p.amount);
  if (typeof p.concept !== 'string' || p.concept.trim().length < 2 || p.concept.length > 240) throw new OperationError('Indicá un detalle de entre 2 y 240 caracteres.');
  if (typeof p.category !== 'string' || !p.category.trim() || p.category.length > 160) throw new OperationError('Elegí la categoría.');
  for (const field of ['sub_category','efe_category','notes'] as const) if (p[field] !== undefined && (typeof p[field] !== 'string' || p[field]!.length > (field === 'notes' ? 4000 : 240))) throw new OperationError('Texto fuera de rango.');
  if (!p.detail || typeof p.detail !== 'object' || Array.isArray(p.detail)) throw new OperationError('Detalle inválido.');
  for (const [key,value] of Object.entries(p.detail)) {
    if (!['period','payroll_kind','beneficiary','reference','organism','supplier_kind','supplier_name','supplier_allocation_mode'].includes(key) || typeof value !== 'string' || value.length > 240) throw new OperationError('Detalle específico inválido.');
  }
  if (p.operation_type === 'internal_transfer' && (!isUuid(p.destination_account_id) || p.destination_account_id === p.account_id)) throw new OperationError('Elegí dos cuentas distintas.');
  if (p.detail.supplier_kind && (p.operation_type !== 'supplier_payment' || !['registered','eventual'].includes(p.detail.supplier_kind))) throw new OperationError('Variante de proveedor inválida.');
  if(p.detail.supplier_allocation_mode&&(p.operation_type!=='supplier_payment'||p.detail.supplier_kind==='eventual'||!['oldest_first','documents'].includes(p.detail.supplier_allocation_mode)))throw new OperationError('Forma de aplicar el pago a proveedor inválida.');
  if (p.operation_type === 'supplier_payment') {
    if (p.detail.supplier_kind === 'eventual') {
      if (p.supplier_id || (p.allocations?.length || 0) > 0) throw new OperationError('La compra eventual no lleva proveedor registrado ni imputaciones.');
    } else if (!isUuid(p.supplier_id)) throw new OperationError('Elegí un proveedor.');
  }
  if (p.operation_type === 'customer_collection' && !isUuid(p.order_id) && !isUuid(p.client_id)) throw new OperationError('Elegí un pedido o un cliente para registrar el saldo a favor.');
  if (p.client_id && p.operation_type !== 'customer_collection') throw new OperationError('Cliente incompatible con la operación.');
  if (p.client_payment_id && !p.order_id) throw new OperationError('Elegí el pedido del cobro existente.');
  if (['payroll_payment','tax_payment'].includes(p.operation_type) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.detail.period || '')) throw new OperationError('Indicá el período.');
  if (p.operation_type === 'payroll_payment') {
    if (!['salary','advance','temporary','agreement'].includes(p.detail.payroll_kind || '')) throw new OperationError('Elegí el concepto de personal.');
    if (!p.employee_id && !p.detail.beneficiary?.trim()) throw new OperationError('Identificá al empleado o beneficiario.');
  }
  if (p.operation_type === 'tax_payment' && !p.detail.organism?.trim()) throw new OperationError('Indicá el organismo.');
  if (p.allocations !== undefined && !Array.isArray(p.allocations)) throw new OperationError('Imputaciones inválidas.');
  const allocations = p.allocations || [];
  if (allocations.length > 100 || new Set(allocations.map(row=>row.purchase_id)).size !== allocations.length) throw new OperationError('No repitas documentos.');
  let allocated = 0;
  for (const row of allocations) { if (!isUuid(row.purchase_id)) throw new OperationError('Documento inválido.'); allocated += moneyValue(row.amount); }
  if (allocated > amount) throw new OperationError('Las imputaciones superan el pago.');
  if (allocations.length && p.operation_type !== 'supplier_payment') throw new OperationError('Las imputaciones corresponden a pagos de proveedor.');
  if (p.voucher_ids !== undefined && (!Array.isArray(p.voucher_ids) || p.voucher_ids.length > 20 || p.voucher_ids.some(id=>!isUuid(id)))) throw new OperationError('Comprobantes inválidos.');
}
