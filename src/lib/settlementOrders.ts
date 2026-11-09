export function isExcludedDeliveryStatus(status: string): boolean {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(postergad[oa]?|anulad[oa]?|cancelad[oa]?|no entregad[oa]?|fallid[oa]?|pendiente[_ ]ruteo)\b/.test(normalized);
}

export function isNoCollectionTerm(value?: string | null): boolean {
  const term = (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").replace(/ \)/g, ")").trim();
  return /^(?:(?:cuenta corriente|cta cte)(?:\s*\(?(?:a\s+)?\d+\s+dias\)?)?|sin cobro(?: en (?:la entrega|destino))?(?:\s*\((?:cuenta corriente|cta cte)\))?)$/.test(term);
}

export function settlementNoCollectionTotal(
  orders: Array<{ noCollection?: boolean; routeCollectionAmount?: number; deliveryStatus?: string }>,
  gross: number,
): number {
  const total = orders.reduce((sum, order) =>
    order.noCollection && !isExcludedDeliveryStatus(order.deliveryStatus || "")
      ? sum + Math.max(0, Number(order.routeCollectionAmount) || 0) : sum, 0);
  return Math.min(Math.max(0, gross), Math.round(total * 100) / 100);
}

// A generic routing synchronization must not erase the result of this attempt.
export function settlementDeliveryStatus(status?: string | null, failureReason?: string | null): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "entregado" || normalized === "entregada") return status || "Entregado";
  if (/^pendiente[_ ]ruteo$/i.test(String(failureReason || "").trim())) return normalized === "fallido" ? "Entregando" : (status || "");
  if (isExcludedDeliveryStatus(failureReason || "")) return failureReason!;
  return normalized === "fallido" ? (failureReason || "No entregado") : (status || "");
}

// Routing placeholders are not a manually recorded failed delivery.
export function isSettlementDeliveryCorrection(status?: string | null, failureReason?: string | null): boolean {
  const reason = String(failureReason || '').trim().toLowerCase();
  if (reason === 'pendiente_ruteo' || reason === 'pendiente ruteo') return false;
  return isExcludedDeliveryStatus(settlementDeliveryStatus(status, failureReason));
}

// An explicit outcome from the logistics sheet wins over an older draft correction.
export function settlementPreviewDeliveryStatus(sheetStatus: string, correction?: string): string {
  return correction && sheetStatus === 'Entregando' ? correction : sheetStatus;
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
  noCollection?: boolean;
  linkedPayments?: Array<{ id: string }>;
}

const normalizeCode = (code?: string | null) => String(code || "").trim().toUpperCase();

export function isExcludedSettlementTicket(ticket: SettlementTicketReference, orders: SettlementOrderReference[]): boolean {
  const code = normalizeCode(ticket.orderCode);
  return orders.some(order => {
    if (!order.noCollection && !isExcludedDeliveryStatus(order.deliveryStatus || "")) return false;
    return Boolean(
      (ticket.orderId && order.orderId && ticket.orderId === order.orderId) ||
      (code && normalizeCode(order.orderCode) === code) ||
      (!ticket.orderId && !code && ticket.mpPaymentId && order.linkedPayments?.some(payment => payment.id === ticket.mpPaymentId)),
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
