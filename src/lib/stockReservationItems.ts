interface ReservationItem {
  product_id?: string | null;
  product_name?: string | null;
  orders?: { id?: string; legacy_code?: string | null } | null;
}

/** Keep every line in an order; exclude copies of that product in duplicate orders. */
export function deduplicateReservationItems<T extends ReservationItem>(items: T[]): T[] {
  const sourceOrders = new Map<string, string>();
  return items.filter(item => {
    const code = item.orders?.legacy_code?.trim();
    const orderId = item.orders?.id;
    const product = item.product_id || item.product_name;
    if (!code || !orderId || !product) return true;

    const key = JSON.stringify([code, product]);
    const sourceOrder = sourceOrders.get(key);
    if (sourceOrder) return sourceOrder === orderId;
    sourceOrders.set(key, orderId);
    return true;
  });
}
