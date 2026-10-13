type TicketAssignment = {
  amount?: number;
  mp_payment_id?: string | null;
  order_code?: string | null;
  order_id?: string | null;
  original_order_code?: string | null;
  original_order_id?: string | null;
};
const code = (value?: string | null) => String(value || '').trim().toUpperCase();

/** Only explicit edits are synchronized; saving an untouched ticket must never overwrite a newer payment link. */
export function settlementPaymentReassignments(tickets: TicketAssignment[]) {
  return tickets.filter(ticket => Number(ticket.amount) > 0 && ticket.mp_payment_id &&
    ticket.original_order_code !== undefined &&
    (code(ticket.original_order_code) !== code(ticket.order_code) ||
      (ticket.original_order_id || null) !== (ticket.order_id || null)))
    .map(ticket => ({
      payment_id: ticket.mp_payment_id!,
      previous_order_code: code(ticket.original_order_code) || null,
      previous_order_id: ticket.original_order_id || null,
      order_code: code(ticket.order_code) || null,
      order_id: ticket.order_id || null,
    }));
}
