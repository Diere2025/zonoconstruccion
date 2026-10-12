type CashAccount = { id: string; name: string; currency: string; is_active: boolean; type?: string; is_custody?: boolean };
export function defaultCashAccount<T extends CashAccount>(accounts: T[]): T | undefined {
  const available = accounts.filter(a => a.is_active && !a.is_custody);
  const pesos = available.filter(a => a.currency === 'ARS');
  return pesos.find(a => /efectivo.*pesos|pesos.*efectivo/i.test(a.name))
    || pesos.find(a => a.type === 'efectivo') || pesos.find(a => /efectivo/i.test(a.name)) || pesos[0] || available[0];
}
