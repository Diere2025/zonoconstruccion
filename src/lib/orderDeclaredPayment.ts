type PaymentOrder = {
  payment_status?: string | null;
  total_amount?: number | string | null;
  totals?: { deposit_amount?: unknown } | null;
};

/** Payment terms and breakdown amounts do not prove that money was collected. */
export function orderDeclaredPayment(order: PaymentOrder) {
  const money = (value: unknown) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
  };
  const total = money(order.total_amount);
  if (order.payment_status === 'Abonado') {
    return { paymentStatus: 'Abonado', depositOrPaidAmount: total };
  }
  if (order.payment_status === 'Seniado') {
    return { paymentStatus: 'Señado', depositOrPaidAmount: Math.min(total, money(order.totals?.deposit_amount)) };
  }
  return { paymentStatus: 'No Abonado', depositOrPaidAmount: 0 };
}
