interface CommissionOrder {
  totals?: { items_subtotal?: unknown; subtotal?: unknown } | null;
  order_items?: { subtotal?: unknown; unit_price?: unknown; quantity?: unknown }[];
}

export function commissionItemSubtotal(item: NonNullable<CommissionOrder['order_items']>[number]): number {
  return Number(item.subtotal ?? Number(item.unit_price ?? 0) * Number(item.quantity ?? 0)) || 0;
}

export function sellerCommissionBase(order: CommissionOrder): { netSales: number; scaleFactor: number } {
  const itemTotal = (order.order_items ?? []).reduce((sum, item) => sum + commissionItemSubtotal(item), 0);
  // Current ERP orders store gross items and a separate net product subtotal.
  // Imported historical items already include discounts, even when totals metadata is stale.
  const totals = order.totals;
  const hasNetSubtotal = totals?.items_subtotal != null && totals?.subtotal != null
    && Number.isFinite(Number(totals.items_subtotal)) && Number.isFinite(Number(totals.subtotal))
    && Number(totals.subtotal) <= itemTotal
    && Math.abs(Number(totals.items_subtotal) - itemTotal) < 0.01;
  const netSales = Math.max(0, hasNetSubtotal ? Number(totals!.subtotal) : itemTotal);
  return { netSales, scaleFactor: itemTotal > 0 ? netSales / itemTotal : 0 };
}

export function sellerCommissionLines<T extends NonNullable<CommissionOrder['order_items']>[number]>(
  order: CommissionOrder & { order_items: T[] },
): { item: T; netSales: number }[] {
  const productLines = order.order_items
    .map(item => ({ item, subtotal: commissionItemSubtotal(item) }))
    .filter(line => line.subtotal >= 0);
  const grossSales = productLines.reduce((sum, line) => sum + line.subtotal, 0);
  const { netSales } = sellerCommissionBase(order);
  // The order net already includes negative discount lines. Allocate it once across the products.
  const factor = grossSales > 0 ? netSales / grossSales : 0;
  return productLines.map(({ item, subtotal }) => ({ item, netSales: subtotal * factor }));
}
