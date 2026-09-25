import type { OrderDiscountItem } from '@/types';

export function calculateCascadingDiscounts(subtotal: number, discounts: OrderDiscountItem[]) {
  let remaining = Math.max(0, subtotal);
  return discounts.map(discount => {
    const value = Math.max(0, Number(discount.value) || 0);
    const amount = discount.type === 'percentage'
      ? Math.round(remaining * Math.min(100, value) / 100)
      : Math.min(remaining, value);
    remaining = Math.max(0, remaining - amount);
    return { ...discount, amount };
  });
}
