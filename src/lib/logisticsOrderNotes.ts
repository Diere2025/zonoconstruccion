import { LogisticsPrintOrder, LogisticsTrip, LOGISTICS_TRIP_FIELDS, logisticsTripKey, normalizedDeliveryDate } from './logisticsPrintOrders';

export const ORDER_NOTE_ROWS_PER_PAGE = 18;
export const DEFAULT_ORDER_NOTE_RATES = [13.5, 32, 43.2, 61.4, 42] as const;

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
  if (/cuota\s+simple/i.test(paymentMethod)) return 4;
  const match = paymentMethod.match(/payway[^0-9]{0,16}(12|1|3|6)\b/i)
    || paymentMethod.match(/\b(12|1|3|6)\s*cuotas?\s*(?:con\s+)?payway\b/i);
  if (!match) return null;
  const index = [1, 3, 6, 12].indexOf(Number(match[1]));
  return index < 0 ? null : index;
}

function simpleAmount(order: LogisticsPrintOrder): number {
  return Math.max(0, order.pendingBalance - Math.max(0, order.surcharge));
}

export function orderNoteBaseAmount(order: LogisticsPrintOrder, rates: readonly number[]): number {
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  if (selectedIndex === null && !/payway/i.test(order.paymentMethod)) return order.pendingBalance;
  if (selectedIndex === 4) {
    // En Cuota Simple los precios de los artículos ya incluyen el recargo.
    // La columna de recargo de la planilla vuelve a sumarlo al saldo.
    const appliedRate = order.surcharge > 0 && order.productsSubtotal > 0
      ? order.surcharge / order.productsSubtotal
      : (rates[4] || 0) / 100;
    const subtotalWithoutRate = order.productsSubtotal / (1 + appliedRate);
    return Math.max(0, Math.round(simpleAmount(order) - order.productsSubtotal + subtotalWithoutRate));
  }
  if (order.surcharge > 0) return Math.max(0, order.pendingBalance - order.surcharge);
  if (selectedIndex === null) return order.pendingBalance;
  return Math.round(order.pendingBalance / (1 + (rates[selectedIndex] || 0) / 100));
}

export function orderNoteCardAmounts(order: LogisticsPrintOrder, rates: readonly number[]): Array<number | null> {
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  const baseAmount = orderNoteBaseAmount(order, rates);
  const selectedAmount = selectedIndex === 4
    ? simpleAmount(order)
    : order.pendingBalance;
  return rates.map((rate, index) => index === selectedIndex
    ? selectedAmount
    : Math.round(baseAmount * (1 + rate / 100)));
}
