type StoredTicket = {
  amount: number | string;
  reference?: string | null;
  payment_type?: string | null;
  order_id?: string | null;
  order_code?: string | null;
  mp_payment_id?: string | null;
  notes?: string | null;
};

type LinkedPayment = {
  id: string;
  amount: number | string;
  payment_type?: string | null;
  order_id?: string | null;
  order_code?: string | null;
};

const amountInCents = (value: number | string) => Math.round(Number(value) * 100);

/** Match a uniquely identifiable imported sheet ticket to its later MP payment.
 * The result is display-only; callers decide whether to persist anything.
 */
export function reconcileImportedTickets<T extends StoredTicket, P extends LinkedPayment>(
  storedTickets: T[],
  linkedPayments: P[],
  source: string,
): { tickets: T[]; unmatchedPayments: P[] } {
  const tickets = storedTickets.map(ticket => ({ ...ticket }));
  const existingPaymentIds = new Set(tickets.map(ticket => ticket.mp_payment_id).filter(Boolean));
  const candidates = linkedPayments.filter(payment => !existingPaymentIds.has(payment.id));
  const paymentCounts = new Map<number, number>();
  for (const payment of candidates) {
    const amount = amountInCents(payment.amount);
    paymentCounts.set(amount, (paymentCounts.get(amount) || 0) + 1);
  }

  const unmatchedPayments: P[] = [];
  for (const payment of candidates) {
    const amount = amountInCents(payment.amount);
    const matchingIndexes = source === "spreadsheet" && Number.isFinite(amount) && amount > 0
      ? tickets.flatMap((ticket, index) =>
        !ticket.mp_payment_id && !ticket.order_id && !ticket.order_code &&
        /^Ticket \d+$/i.test(String(ticket.reference || "").trim()) && amountInCents(ticket.amount) === amount
          ? [index] : [])
      : [];
    if (paymentCounts.get(amount) !== 1 || matchingIndexes.length !== 1) {
      unmatchedPayments.push(payment);
      continue;
    }

    const index = matchingIndexes[0];
    const ticket = tickets[index];
    tickets[index] = {
      ...ticket,
      order_id: payment.order_id || null,
      order_code: payment.order_code || null,
      mp_payment_id: payment.id,
      payment_type: String(payment.payment_type || "POINT").toUpperCase(),
      notes: [ticket.notes, "Conciliado con Chequeo de Pagos por importe único"].filter(Boolean).join(" · "),
    };
  }
  return { tickets, unmatchedPayments };
}
