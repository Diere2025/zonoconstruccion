import type {ApplicationReference} from './financialOperations/references';
export type AccountStart = { supplier_id: string; start_date: string; opening_ars: number; opening_usd: number; notes: string };
export type AccountEntry = {
  applications?:ApplicationReference[];
  supplier_id: string; source: 'purchase' | 'payment'; source_id: string; entry_date: string;
  currency: 'ARS' | 'USD'; reference: string; kind: string; amount: number; voided: boolean;
  notes: string | null; purchase_order_id: string | null; purchase_reception_id: string | null; cash_transaction_id: string | null;
};
export type HistoryChoice = { source: string; source_id: string; included: boolean; notes: string };
export type LedgerEntry = AccountEntry & { historical: boolean; included: boolean; reconciled: boolean; reconciliation_note: string; balance: number | null };

export type LedgerPeriod = { from?: string; to?: string };

export function supplierLedger(start: AccountStart | null, entries: AccountEntry[], choices: HistoryChoice[], period: LedgerPeriod = {}) {
  if ((period.from && !isAccountDate(period.from)) || (period.to && !isAccountDate(period.to)) || (period.from && period.to && period.from > period.to)) throw new Error('Período de cuenta corriente inválido.');
  const overrides = new Map(choices.map(choice => [`${choice.source}:${choice.source_id}`, choice]));
  const balances = { ARS: Math.round(Number(start?.opening_ars || 0) * 100), USD: Math.round(Number(start?.opening_usd || 0) * 100) };
  const openingApplies = !!start && (!period.to || start.start_date <= period.to);
  if (!openingApplies) { balances.ARS = 0; balances.USD = 0; }
  const previous = { ...balances };
  const ordered = [...entries].filter(entry => !period.to || entry.entry_date <= period.to).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.source.localeCompare(b.source) || a.source_id.localeCompare(b.source_id));
  const rows: LedgerEntry[] = ordered.map(entry => {
    const choice = overrides.get(`${entry.source}:${entry.source_id}`);
    const historical = !!start && entry.entry_date < start.start_date;
    const included = openingApplies && !entry.voided && (choice?.included ?? !historical);
    if (included) {
      const cents = Math.round(Number(entry.amount) * 100);
      balances[entry.currency] += cents;
      if (period.from && entry.entry_date < period.from) previous[entry.currency] += cents;
    }
    return { ...entry, amount: Number(entry.amount), historical, included, reconciled: !!choice,
      reconciliation_note: choice?.notes || '', balance: included ? balances[entry.currency] / 100 : null };
  });
  return { rows: rows.filter(entry => !period.from || entry.entry_date >= period.from), balance_ars: balances.ARS / 100, balance_usd: balances.USD / 100,
    previous_balance_ars: period.from && start && start.start_date >= period.from ? (previous.ARS - (openingApplies ? Math.round(Number(start.opening_ars) * 100) : 0)) / 100 : previous.ARS / 100,
    previous_balance_usd: period.from && start && start.start_date >= period.from ? (previous.USD - (openingApplies ? Math.round(Number(start.opening_usd) * 100) : 0)) / 100 : previous.USD / 100,
    coverage: start ? 'configured' as const : 'missing_opening' as const };
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function isAccountDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function openingAmount(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error('Ingresá un saldo inicial válido.');
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e13 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) throw new Error('El saldo debe tener hasta dos decimales.');
  return amount;
}
