import { LogisticsPrintOrder, LogisticsTrip, LOGISTICS_TRIP_FIELDS, logisticsTripKey, normalizedDeliveryDate } from './logisticsPrintOrders';
import { CUOTA_SIMPLE_PLANS, POINT_ONE_PAYMENT_PLAN, isPointOnePaymentMethod, cuotaSimpleInstallments } from './cuotaSimple';

export const ORDER_NOTE_ROWS_PER_PAGE = 22;
export const DEFAULT_ORDER_NOTE_RATES = CUOTA_SIMPLE_PLANS.map(plan => plan.surcharge_percentage);

export interface OrderNoteGroup {
  key: string;
  deliveryDate: string;
  trip: LogisticsTrip;
  orders: LogisticsPrintOrder[];
}

export interface OrderNotePage extends OrderNoteGroup {
  pageNumber: number;
  pageCount: number;
  firstRowNumber: number;
  orders: LogisticsPrintOrder[];
}

export function orderNoteRoutes(orders: LogisticsPrintOrder[]): string {
  const routes = new Map<string, string>();
  for (const order of orders) {
    const label = [order.trip?.zone, order.trip?.route].map(value => value?.trim()).filter(Boolean).join(' / ');
    if (label) routes.set(label.replace(/\s+/g, ' ').toLocaleLowerCase('es'), label);
  }
  return [...routes.values()].join(' · ') || 'Sin recorrido';
}

export function buildOrderNoteGroups(orders: LogisticsPrintOrder[], fallback: Partial<LogisticsTrip> = {}): OrderNoteGroup[] {
  const groups = new Map<string, OrderNoteGroup>();
  for (const order of orders) {
    const deliveryDate = normalizedDeliveryDate(order.deliveryDate);
    const trip = Object.fromEntries(LOGISTICS_TRIP_FIELDS.map(field => [field, order.trip?.[field]?.trim() || fallback[field]?.trim() || ''])) as unknown as LogisticsTrip;
    const key = logisticsTripKey(deliveryDate, trip);
    const group = groups.get(key);
    if (group) group.orders.push(order);
    else groups.set(key, { key, deliveryDate, trip, orders: [order] });
  }
  return [...groups.values()];
}

export function buildOrderNotePages(orders: LogisticsPrintOrder[], fallback: Partial<LogisticsTrip> = {}): OrderNotePage[] {
  return buildOrderNoteGroups(orders, fallback).flatMap(group => {
    const pageCount = Math.ceil(group.orders.length / ORDER_NOTE_ROWS_PER_PAGE);
    return Array.from({ length: pageCount }, (_, pageIndex) => ({
      ...group,
      pageNumber: pageIndex + 1,
      pageCount,
      firstRowNumber: pageIndex * ORDER_NOTE_ROWS_PER_PAGE + 1,
      orders: group.orders.slice(
        pageIndex * ORDER_NOTE_ROWS_PER_PAGE,
        (pageIndex + 1) * ORDER_NOTE_ROWS_PER_PAGE
      )
    }));
  });
}

export function selectedOrderNoteCardIndex(paymentMethod: string): number | null {
  const index = CUOTA_SIMPLE_PLANS.findIndex(plan => plan.name.toLowerCase() === paymentMethod.trim().toLowerCase());
  if (index >= 0) return index;
  const installments = agreedOrderNoteInstallments(paymentMethod);
  const legacyIndex = CUOTA_SIMPLE_PLANS.findIndex(plan => plan.installments === installments);
  return legacyIndex < 0 ? null : legacyIndex;
}

export function agreedOrderNoteInstallments(paymentMethod: string): number | null {
  if (isPointOnePaymentMethod(paymentMethod)) return 1;
  const payway = paymentMethod.match(/payway\s*\(?\s*(18|12|9|6|3|2|1)\b/i);
  if (payway) return Number(payway[1]);
  return cuotaSimpleInstallments(paymentMethod);
}

export function hasLegacyOrderNotePlan(paymentMethod: string): boolean {
  return agreedOrderNoteInstallments(paymentMethod) !== null
    && !isPointOnePaymentMethod(paymentMethod)
    && !CUOTA_SIMPLE_PLANS.some(plan => plan.name.toLowerCase() === paymentMethod.trim().toLowerCase());
}

export function isOrderNotePaid(order: LogisticsPrintOrder): boolean {
  if (order.pendingBalance > 0) return false;
  const status = order.paymentStatus.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /^(abonado|pagado|pago|paid|pedido pago|pago completo)$/.test(status)
    || (order.orderTotal > 0 && order.paidAmount >= order.orderTotal);
}

function simpleAmount(order: LogisticsPrintOrder): number {
  return Math.max(0, order.pendingBalance - Math.max(0, order.surcharge));
}

export function orderNoteBaseAmount(order: LogisticsPrintOrder, rates: readonly number[], pointRate: number = POINT_ONE_PAYMENT_PLAN.surcharge_percentage): number {
  if (isPointOnePaymentMethod(order.paymentMethod)) {
    return order.surcharge > 0 ? simpleAmount(order) : Math.round(order.pendingBalance / (1 + pointRate / 100));
  }
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  const isLegacySimple = /cuota\s+simple/i.test(order.paymentMethod) && hasLegacyOrderNotePlan(order.paymentMethod);
  if (selectedIndex === null && !/payway/i.test(order.paymentMethod) && !isLegacySimple) return order.pendingBalance;
  if (isLegacySimple) {
    // En Cuota Simple los precios de los artículos ya incluyen el recargo.
    // La columna de recargo de la planilla vuelve a sumarlo al saldo.
    const appliedRate = order.surcharge > 0 && order.productsSubtotal > 0
      ? order.surcharge / order.productsSubtotal
      : 0.42;
    const subtotalWithoutRate = order.productsSubtotal / (1 + appliedRate);
    return Math.max(0, Math.round(simpleAmount(order) - order.productsSubtotal + subtotalWithoutRate));
  }
  if (order.surcharge > 0) return Math.max(0, order.pendingBalance - order.surcharge);
  if (/payway/i.test(order.paymentMethod)) {
    const installments = agreedOrderNoteInstallments(order.paymentMethod);
    const oldRate = ({ '1': 13.5, '3': 32, '6': 43.2, '12': 61.4 } as Record<string, number>)[String(installments || '')];
    return oldRate ? Math.round(order.pendingBalance / (1 + oldRate / 100)) : order.pendingBalance;
  }
  // Sin columna de recargo, quitarlo del total ya calculado del pedido.
  if (selectedIndex === null || cuotaSimpleInstallments(order.paymentMethod) === null) return order.pendingBalance;
  return Math.round(order.pendingBalance / (1 + (rates[selectedIndex] || 0) / 100));
}

export function orderNoteCardAmounts(order: LogisticsPrintOrder, rates: readonly number[], pointRate: number = POINT_ONE_PAYMENT_PLAN.surcharge_percentage): Array<number | null> {
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  const baseAmount = orderNoteBaseAmount(order, rates, pointRate);
  const selectedAmount = order.pendingBalance;
  return rates.map((rate, index) => index === selectedIndex
    ? selectedAmount
    : Math.round(baseAmount * (1 + rate / 100)));
}

export function selectedOrderNotePoint(paymentMethod: string): boolean {
  return isPointOnePaymentMethod(paymentMethod) || (/payway/i.test(paymentMethod) && agreedOrderNoteInstallments(paymentMethod) === 1);
}

export function orderNotePointAmount(order: LogisticsPrintOrder, rates: readonly number[], pointRate: number = POINT_ONE_PAYMENT_PLAN.surcharge_percentage): number {
  return selectedOrderNotePoint(order.paymentMethod)
    ? order.pendingBalance
    : Math.round(orderNoteBaseAmount(order, rates, pointRate) * (1 + pointRate / 100));
}
