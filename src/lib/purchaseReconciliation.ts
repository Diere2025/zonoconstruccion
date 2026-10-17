import { isAccountDate, isUuid } from './supplierAccount';

export interface BillLineInput {
  receiptItemId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vat: number;
}
export interface SupplierBillInput {
  id: string;
  requestId: string;
  version: number;
  supplierId: string;
  number: string;
  date: string;
  dueDate: string | null;
  type: 'Factura' | 'Boleta';
  currency: 'ARS' | 'USD';
  perceptionsBa: number;
  perceptionsCaba: number;
  perceptionsOther: number;
  declaredTotal: number;
  notes: string;
  resolution: string;
  confirm: boolean;
  lines: BillLineInput[];
}
export const moneyRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function billLineTotals(line: Pick<BillLineInput, 'quantity' | 'unitPrice' | 'discount' | 'vat'>) {
  const net = moneyRound(line.quantity * line.unitPrice * (1 - line.discount / 100));
  const tax = moneyRound(net * line.vat / 100);
  return { net, tax, gross: moneyRound(net + tax), cost: line.quantity > 0 ? net / line.quantity : 0 };
}
export function billTotals(lines: BillLineInput[], perceptions: number, declared: number) {
  const net = moneyRound(lines.reduce((sum, line) => sum + billLineTotals(line).net, 0));
  const tax = moneyRound(lines.reduce((sum, line) => sum + billLineTotals(line).tax, 0));
  const total = moneyRound(net + tax + perceptions);
  return { net, tax, total, difference: moneyRound(declared - total) };
}
export function validateSupplierBill(value: unknown): SupplierBillInput {
  const bill = value as SupplierBillInput;
  const amount = (n: unknown, max = 1e12): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
  if (!bill || !isUuid(bill.id) || !isUuid(bill.requestId) || !isUuid(bill.supplierId)
    || !Number.isSafeInteger(bill.version) || bill.version < 0
    || !['Factura', 'Boleta'].includes(bill.type) || !['ARS', 'USD'].includes(bill.currency)
    || !isAccountDate(bill.date) || (bill.dueDate !== null && !isAccountDate(bill.dueDate))
    || typeof bill.number !== 'string' || !bill.number.trim() || bill.number.trim().length > 100
    || typeof bill.confirm !== 'boolean' || typeof bill.notes !== 'string' || typeof bill.resolution !== 'string'
    || bill.notes.length > 4000 || bill.resolution.length > 4000
    || ![bill.perceptionsBa, bill.perceptionsCaba, bill.perceptionsOther, bill.declaredTotal].every(n => amount(n))
    || !Array.isArray(bill.lines) || !bill.lines.length || bill.lines.length > 500) throw new Error('Completá los datos del comprobante y sus artículos.');
  const ids = new Set<string>();
  for (const line of bill.lines) {
    if (!line || !isUuid(line.receiptItemId) || ids.has(line.receiptItemId)
      || !amount(line.quantity, 1e9) || line.quantity <= 0 || Math.abs(line.quantity * 1000 - Math.round(line.quantity * 1000)) > 1e-5
      || !amount(line.unitPrice) || !amount(line.discount, 100) || !amount(line.vat, 100)) throw new Error('Revisá cantidades, precios, descuentos e IVA. No repitas líneas de recepción.');
    ids.add(line.receiptItemId);
  }
  return { ...bill, number: bill.number.trim(), notes: bill.notes.trim(), resolution: bill.resolution.trim() };
}
