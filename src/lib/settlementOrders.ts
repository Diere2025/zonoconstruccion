export function isExcludedDeliveryStatus(status: string): boolean {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(postergad[oa]?|anulad[oa]?|cancelad[oa]?|no entregad[oa]?|fallid[oa]?)\b/.test(normalized);
}

export function settlementOrderAmount(order: { toCollectAmount?: number; totalAmount?: number; deliveryStatus?: string }): number {
  if (isExcludedDeliveryStatus(order.deliveryStatus || "")) return 0;
  return Math.max(0, Number(order.toCollectAmount ?? order.totalAmount ?? 0) || 0);
}

export function settlementOrdersTotal(orders: Array<{ toCollectAmount?: number; totalAmount?: number; deliveryStatus?: string }>): number {
  return orders.reduce((sum, order) => sum + settlementOrderAmount(order), 0);
}
