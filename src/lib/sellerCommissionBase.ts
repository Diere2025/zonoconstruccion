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
    && Math.abs(Number(totals.items_subtotal) - itemTotal) < 0.01;
  const netSales = Math.max(0, hasNetSubtotal ? Number(totals!.subtotal) : itemTotal);
  return { netSales, scaleFactor: itemTotal > 0 ? netSales / itemTotal : 0 };
}
