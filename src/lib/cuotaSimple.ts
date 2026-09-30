export const CUOTA_SIMPLE_PLANS = [
  { name: 'Cuota Simple x2 (oct26)', installments: 2, surcharge_percentage: 22 },
  { name: 'Cuota Simple x3 (oct26)', installments: 3, surcharge_percentage: 28 },
  { name: 'Cuota Simple x6 (oct26)', installments: 6, surcharge_percentage: 45.5 },
  { name: 'Cuota Simple x9 (oct26)', installments: 9, surcharge_percentage: 70 },
  { name: 'Cuota Simple x12 (oct26)', installments: 12, surcharge_percentage: 93 },
  { name: 'Cuota Simple x18 (oct26)', installments: 18, surcharge_percentage: 141 }
] as const;

export const CUOTA_SIMPLE_PAYMENT_PLANS = CUOTA_SIMPLE_PLANS;

export const POINT_ONE_PAYMENT_PLAN = { name: 'Point 1 Pago (oct26)', installments: 1, surcharge_percentage: 7 } as const;

export function isPointOnePaymentMethod(name: string): boolean {
  return name.trim().toLowerCase() === POINT_ONE_PAYMENT_PLAN.name.toLowerCase();
}

export function isCuotaSimplePaymentMethod(name: string): boolean {
  return CUOTA_SIMPLE_PAYMENT_PLANS.some(plan => plan.name.toLowerCase() === name.trim().toLowerCase());
}

export function cuotaSimpleInstallments(name: string): number | null {
  if (!/cuota\s+simple/i.test(name)) return null;
  const match = name.match(/cuota\s+simple\s*x\s*(18|12|9|6|3|2)\b/i);
  return match ? Number(match[1]) : 6;
}

export function isRetiredPaymentMethod(name: string): boolean {
  return /payway/i.test(name) || (/cuota\s+simple/i.test(name)
    && !isCuotaSimplePaymentMethod(name));
}
