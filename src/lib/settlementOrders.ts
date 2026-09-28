export function isExcludedDeliveryStatus(status: string): boolean {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(postergad[oa]?|anulad[oa]?|cancelad[oa]?|no entregad[oa]?|fallid[oa]?|pendiente[_ ]ruteo)\b/.test(normalized);
}

// A generic routing synchronization must not erase the result of this attempt.
export function settlementDeliveryStatus(status?: string | null, failureReason?: string | null): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "entregado" || normalized === "entregada") return status || "Entregado";
  if (isExcludedDeliveryStatus(failureReason || "")) return failureReason!;
  return normalized === "fallido" ? (failureReason || "No entregado") : (status || "");
}

export function settlementOrderAmount(order: { toCollectAmount?: number; totalAmount?: number; deliveryStatus?: string }): number {
  if (isExcludedDeliveryStatus(order.deliveryStatus || "")) return 0;
  return Math.max(0, Number(order.toCollectAmount ?? order.totalAmount ?? 0) || 0);
}

export function settlementOrdersTotal(orders: Array<{ toCollectAmount?: number; totalAmount?: number; deliveryStatus?: string }>): number {
  return orders.reduce((sum, order) => sum + settlementOrderAmount(order), 0);
}

export interface SettlementTicketReference {
  amount: number;
  orderId?: string | null;
  orderCode?: string | null;
  mpPaymentId?: string | null;
}

export interface SettlementOrderReference {
  orderId?: string | null;
  orderCode?: string | null;
  deliveryStatus?: string | null;
  linkedPayments?: Array<{ id: string }>;
}

const normalizeCode = (code?: string | null) => String(code || "").trim().toUpperCase();

export function isExcludedSettlementTicket(ticket: SettlementTicketReference, orders: SettlementOrderReference[]): boolean {
  const code = normalizeCode(ticket.orderCode);
  return orders.some(order => {
    if (!isExcludedDeliveryStatus(order.deliveryStatus || "")) return false;
    return Boolean(
      (ticket.orderId && order.orderId && ticket.orderId === order.orderId) ||
      (code && normalizeCode(order.orderCode) === code) ||
      (ticket.mpPaymentId && order.linkedPayments?.some(payment => payment.id === ticket.mpPaymentId)),
    );
  });
}

export function settlementElectronicTicketTotals<T extends SettlementTicketReference>(
  tickets: T[], orders: SettlementOrderReference[],
): { included: number; excluded: number; excludedCount: number } {
  return tickets.reduce((totals, ticket) => {
    const amount = Number(ticket.amount) || 0;
    if (isExcludedSettlementTicket(ticket, orders)) {
      totals.excluded += amount;
      totals.excludedCount += 1;
    } else {
      totals.included += amount;
    }
    return totals;
  }, { included: 0, excluded: 0, excludedCount: 0 });
}
