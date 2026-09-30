export const CUOTA_SIMPLE_PLANS = [
  { name: 'Cuota Simple x2 (oct26)', installments: 2, surcharge_percentage: 22 },
  { name: 'Cuota Simple x3 (oct26)', installments: 3, surcharge_percentage: 28 },
  { name: 'Cuota Simple x6 (oct26)', installments: 6, surcharge_percentage: 45.5 }
] as const;

export function cuotaSimpleInstallments(name: string): number | null {
  if (!/cuota\s+simple/i.test(name)) return null;
  const match = name.match(/cuota\s+simple\s*x\s*(2|3|6)\b/i);
  return match ? Number(match[1]) : 6;
}

export function isRetiredPaymentMethod(name: string): boolean {
  return /payway/i.test(name) || (/cuota\s+simple/i.test(name)
    && !CUOTA_SIMPLE_PLANS.some(plan => plan.name.toLowerCase() === name.trim().toLowerCase()));
}
