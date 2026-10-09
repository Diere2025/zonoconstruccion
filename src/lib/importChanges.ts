export function importValuesEqual(before: unknown, after: unknown): boolean {
  if (before == null && after == null) return true;
  if (typeof before === 'number' || typeof after === 'number') {
    if (before == null || after == null || before === '' || after === '') return false;
    return Number.isFinite(Number(before)) && Number.isFinite(Number(after)) && Math.abs(Number(before) - Number(after)) < 0.005;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    return Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every((value, index) => importValuesEqual(value, after[index]));
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => importValuesEqual(a[key], b[key]));
  }
  return before === after;
}

export function changedImportFields(before: Record<string, unknown>, candidate: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(candidate).filter(([key, value]) => !importValuesEqual(before[key], value)));
}

const labels: Record<string, string> = {
  status: 'estado', channel: 'canal', advertising_source_id: 'procedencia', client_id: 'cliente vinculado',
  whaticket_link: 'enlace de Whaticket', order_medium_id: 'medio de contacto', payment_method_id: 'medio de pago',
  total_amount: 'importe total', delivery_detail: 'detalle de entrega', category: 'categoría',
  order_discount_type: 'tipo de descuento', order_discount_value: 'valor del descuento', order_discount_amount: 'descuento',
  subtotal: 'subtotal', freight: 'flete', payment_surcharges: 'recargo', deposit_amount: 'abonado', pending_balance: 'saldo pendiente'
};
const amounts = new Set(['total_amount', 'order_discount_value', 'order_discount_amount', 'subtotal', 'freight', 'payment_surcharges', 'deposit_amount', 'pending_balance']);
export function describeImportChanges(before: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  return Object.entries(patch).flatMap(([key, value]) => {
    if (key === 'totals') return describeImportChanges((before.totals || {}) as Record<string, unknown>, changedImportFields((before.totals || {}) as Record<string, unknown>, value as Record<string, unknown>));
    const label = labels[key] || key;
    const money = (amount: unknown) => amount == null ? 'sin valor' : '$' + Number(amount).toLocaleString('es-AR', {maximumFractionDigits: 2});
    return [amounts.has(key) ? `${label}: ${money(before[key])} → ${money(value)}` : label];
  });
}
