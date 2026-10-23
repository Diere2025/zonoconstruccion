export const POSNET_INSTALLMENT_PLANS = [
  { name: 'Posnet x3 (Nov26)', installments: 3, surcharge_percentage: 25 },
  { name: 'Posnet x6 (Nov26)', installments: 6, surcharge_percentage: 43 }
] as const;

// Compatibility exports shared by orders, budgets and delivery notes.
export const CUOTA_SIMPLE_PLANS = POSNET_INSTALLMENT_PLANS;
export const CUOTA_SIMPLE_PAYMENT_PLANS = CUOTA_SIMPLE_PLANS;

export const POINT_ONE_PAYMENT_PLAN = { name: 'Posnet x1 (Nov26)', installments: 1, surcharge_percentage: 10 } as const;

export function isPointOnePaymentMethod(name: string): boolean {
  return name.trim().toLowerCase() === POINT_ONE_PAYMENT_PLAN.name.toLowerCase();
}

export function isCuotaSimplePaymentMethod(name: string): boolean {
  return CUOTA_SIMPLE_PAYMENT_PLANS.some(plan => plan.name.toLowerCase() === name.trim().toLowerCase());
}

export function cuotaSimpleInstallments(name: string): number | null {
  const posnet = name.match(/posnet\s*x\s*(\d+)\b/i);
  if (posnet) return Number(posnet[1]);
  if (!/cuota\s+simple/i.test(name)) return null;
  const match = name.match(/cuota\s+simple\s*x\s*(18|12|9|6|3|2)\b/i);
  return match ? Number(match[1]) : 6;
}

export function isRetiredPaymentMethod(name: string): boolean {
  if (isPointOnePaymentMethod(name) || isCuotaSimplePaymentMethod(name)) return false;
  return /payway|cuota\s+simple|posnet|point\s*(?:1\s*pago|tarjeta)|tarjeta\s+naranja/i.test(name);
}
