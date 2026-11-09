import { upsertEmployeeWithdrawalInOperationalSheets, removeEmployeeWithdrawalFromOperationalSheets, getGoogleAccessToken, type SheetOrderItem } from '@/lib/googleSheets';
import { EMPLOYEE_WITHDRAWAL_SOURCE } from '@/lib/advertisingSources';
import { displayDateField } from '@/lib/dates/dateFields';
import { EMPLOYEE_WITHDRAWAL_PAYMENT, employeeReviewLabels, withdrawalMapUrl } from '@/lib/employeeWithdrawals';
import { writeLegacyWithdrawal, type LegacyWithdrawal } from '@/lib/legacyWithdrawalSheet';

type Snapshot = LegacyWithdrawal & { reconcile_operational?: boolean };

async function syncHistoricalWithdrawal(snapshot: Snapshot) {
  if (process.env.EMPLOYEE_WITHDRAWAL_LEGACY_SHEET_ENABLED !== 'false' && /^RMRH\d{5,}$/.test(snapshot.code)) {
    await writeLegacyWithdrawal(await getGoogleAccessToken(), snapshot);
  }
}

export async function syncEmployeeWithdrawalSheets(snapshot: Snapshot) {
  if (snapshot.state !== 'approved') {
    await syncHistoricalWithdrawal(snapshot);
    if (snapshot.reconcile_operational) await removeEmployeeWithdrawalFromOperationalSheets(snapshot.code);
    return;
  }
  const items: SheetOrderItem[] = snapshot.items.map(item => {
    if (item.price == null || !Number.isFinite(item.price)) throw new Error('Falta el precio de un producto del retiro.');
    return { name: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.price };
  });
  if (snapshot.total == null || !Number.isFinite(snapshot.total)) throw new Error('Falta el total del retiro.');
  const gross = items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitPrice * 100), 0);
  const discount = gross - Math.round(snapshot.total * 100);
  if (discount < 0) throw new Error('El total del retiro supera el importe de sus productos.');
  const productSlots = discount > 0 ? 11 : 12;
  const extra = items.length > productSlots ? items.splice(productSlots - 1) : [];
  if (extra.length) {
    const extraGross = extra.reduce((sum, item) => sum + item.quantity * Math.round(item.unitPrice * 100), 0);
    items.push({ name: 'Varios', quantity: 1, unitPrice: extraGross / 100 });
  }
  if (discount > 0) items.push({ name: 'Descuento de empleado', quantity: 1, unitPrice: -discount / 100 });
  const beneficiary = snapshot.beneficiary_type;
  const type = beneficiary === 'carrier' ? 'Retiro de fletero' : beneficiary === 'external' ? 'Retiro de tercero' : EMPLOYEE_WITHDRAWAL_SOURCE;
  await upsertEmployeeWithdrawalInOperationalSheets(snapshot.code, {
    clientName: snapshot.employee,
    deliveryDate: displayDateField(snapshot.delivery_date ?? ''),
    orderDate: displayDateField(snapshot.order_date ?? ''),
    maxDeliveryDate: displayDateField(snapshot.deadline ?? snapshot.delivery_date ?? ''),
    phonePrimary: snapshot.phone,
    sellerName: snapshot.seller_name,
    source: EMPLOYEE_WITHDRAWAL_SOURCE,
    paymentMethod: type === EMPLOYEE_WITHDRAWAL_SOURCE ? EMPLOYEE_WITHDRAWAL_PAYMENT : undefined,
    deliveryNotes: [
      type, employeeReviewLabels[snapshot.state],
      snapshot.mode === 'pickup' ? 'Retiro en depósito' : undefined,
      type === EMPLOYEE_WITHDRAWAL_SOURCE ? 'Descuento por nómina. Sin cobro en la entrega.' : 'Acuerdo fuera de nómina.',
      snapshot.operational_note,
      extra.length ? 'Productos adicionales: ' + extra.map(item => `${item.quantity} × ${item.sku || item.name}`).join(' · ') : undefined,
    ].filter(Boolean).join(' · '),
    locality: snapshot.locality,
    address: snapshot.address,
    mapsLink: snapshot.mode === 'home'
      ? snapshot.maps_link || withdrawalMapUrl(snapshot.address ?? '', snapshot.locality ?? '')
      : undefined,
    category: snapshot.category,
    freightType: snapshot.mode === 'home' ? 'Flete Regular' : 'Retiro en depósito',
    items,
  }, snapshot.status === 'Entregado' ? '🟢 Entregado' : '🔸 Validado');
  await syncHistoricalWithdrawal(snapshot);
}
