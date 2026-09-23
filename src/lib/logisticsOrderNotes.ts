import type { LogisticsPrintOrder } from './logisticsPrintOrders';

export const ORDER_NOTE_ROWS_PER_PAGE = 18;
export const DEFAULT_ORDER_NOTE_RATES = [13.5, 32, 43.2, 61.4, 42] as const;

export interface OrderNotePage {
  deliveryDate: string;
  pageNumber: number;
  pageCount: number;
  firstRowNumber: number;
  orders: LogisticsPrintOrder[];
}

function normalizedDeliveryDate(value: string): string {
  const date = value.trim();
  const local = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return date;
}

export function buildOrderNotePages(orders: LogisticsPrintOrder[]): OrderNotePage[] {
  const byDate = new Map<string, LogisticsPrintOrder[]>();
  for (const order of orders) {
    const date = normalizedDeliveryDate(order.deliveryDate);
    byDate.set(date, [...(byDate.get(date) || []), order]);
  }

  return Array.from(byDate, ([deliveryDate, datedOrders]) => {
    const pageCount = Math.ceil(datedOrders.length / ORDER_NOTE_ROWS_PER_PAGE);
    return Array.from({ length: pageCount }, (_, pageIndex) => ({
      deliveryDate,
      pageNumber: pageIndex + 1,
      pageCount,
      firstRowNumber: pageIndex * ORDER_NOTE_ROWS_PER_PAGE + 1,
      orders: datedOrders.slice(
        pageIndex * ORDER_NOTE_ROWS_PER_PAGE,
        (pageIndex + 1) * ORDER_NOTE_ROWS_PER_PAGE
      )
    }));
  }).flat();
}

export function selectedOrderNoteCardIndex(paymentMethod: string): number | null {
  if (/cuota\s+simple/i.test(paymentMethod)) return 4;
  const match = paymentMethod.match(/payway[^0-9]{0,16}(12|1|3|6)\b/i)
    || paymentMethod.match(/\b(12|1|3|6)\s*cuotas?\s*(?:con\s+)?payway\b/i);
  if (!match) return null;
  const index = [1, 3, 6, 12].indexOf(Number(match[1]));
  return index < 0 ? null : index;
}

export function orderNoteBaseAmount(order: LogisticsPrintOrder, rates: readonly number[]): number {
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  if (selectedIndex === null && !/payway/i.test(order.paymentMethod)) return order.pendingBalance;
  if (order.surcharge > 0) return Math.max(0, order.pendingBalance - order.surcharge);
  if (selectedIndex === null) return order.pendingBalance;
  return Math.round(order.pendingBalance / (1 + (rates[selectedIndex] || 0) / 100));
}

export function orderNoteCardAmounts(order: LogisticsPrintOrder, rates: readonly number[]): Array<number | null> {
  const selectedIndex = selectedOrderNoteCardIndex(order.paymentMethod);
  const baseAmount = orderNoteBaseAmount(order, rates);
  return rates.map((rate, index) => index === selectedIndex
    ? order.pendingBalance
    : Math.round(baseAmount * (1 + rate / 100)));
}
