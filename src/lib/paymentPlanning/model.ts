export type Currency = 'ARS' | 'USD';
export type Scenario = 'optimista' | 'intermedio' | 'pesimista';
export type ItemKind = 'income' | 'expense';
export type Fund = { id: string; name: string; currency: Currency; kind: 'cash' | 'personal' | 'company' | 'other'; scenario: Scenario; active: boolean };
export type Balance = { id: string; fund_id: string; effective_date: string; amount: string | number; reserved_amount: string | number; notes: string | null };
export type Item = {
  id: string; fund_id: string; kind: ItemKind; title: string; amount: string | number | null; closed_amount?: string | number;
  scheduled_date: string | null; due_date: string | null; status: 'draft' | 'active' | 'cancelled';
  priority: 'normal' | 'high'; notes: string | null; source: 'manual' | 'scenario' | 'recurrence' | 'import';
  scenario_rule_id?: string | null; supplier_id?: string | null; employee_id?: string | null;
  version: number; created_at?: string; updated_at?: string;
};
export type Realization = { id: string; item_id: string; fund_id: string; amount: string | number; effective_date: string; reversed_at: string | null; cash_transaction_id?: string | null };
export type Reservation = { id: string; fund_id: string; amount: string | number; effective_date: string; kind: 'reserve' | 'release' | 'consume'; target_item_id: string | null; reversed_at: string | null };
export type Transfer = { id: string; source_fund_id: string; destination_fund_id: string; amount: string | number; effective_date: string; notes: string | null; reversed_at: string | null };
export type ScenarioRate = { id: string; fund_id: string; title: string; valid_from: string; valid_until: string | null; weekdays: number[]; optimistic: string | number; intermediate: string | number; pessimistic: string | number; active: boolean };
export type ProjectionRow = { date: string; fund_id: string; opening: number; income: number; expense: number; closing: number; reserved: number; free: number; missing: number; overdue: number };

export function cents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error('Importe sin definir');
  const raw = String(value).replace(',', '.').trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Importe inválido');
  const negative = raw.startsWith('-');
  const [units, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  const result = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Importe fuera de rango');
  return negative ? -result : result;
}
export const money = (value: number) => value / 100;
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`))
  && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
export const nextDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
export const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export function scenarioAmount(rate: ScenarioRate, scenario: Scenario): number {
  return cents(scenario === 'optimista' ? rate.optimistic : scenario === 'pesimista' ? rate.pessimistic : rate.intermediate);
}

export function project(input: {
  funds: Fund[]; balances: Balance[]; items: Item[]; realizations: Realization[];
  reservations: Reservation[]; transfers?: Transfer[]; rates: ScenarioRate[]; from: string; to: string; today: string;
}): ProjectionRow[] {
  const { funds, balances, items, realizations, reservations, rates, from, to, today } = input;
  if (!validDate(from) || !validDate(to) || !validDate(today) || from > to) throw new Error('Rango de fechas inválido');
  const output: ProjectionRow[] = [];
  const liveRealizations = realizations.filter(row => !row.reversed_at);
  const liveReservations = reservations.filter(row => !row.reversed_at);
  for (const fund of funds) {
    const fundBalances = balances.filter(row => row.fund_id === fund.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    const fundItems = items.filter(row => row.fund_id === fund.id);
    const earliest = fundBalances.filter(row => row.effective_date <= from).at(-1);
    const start = earliest?.effective_date ?? (from > today ? today : from);
    let closing = earliest ? cents(earliest.amount) : 0;
    let reserved = earliest ? cents(earliest.reserved_amount) : 0;
    const reservedByItem = new Map<string,number>();
    const byItem = new Map<string, number>();
    for (const row of liveRealizations) byItem.set(row.item_id, (byItem.get(row.item_id) || 0) + cents(row.amount));
    for (let date = start; date <= to; date = nextDate(date)) {
      const observation = fundBalances.find(row => row.effective_date === date);
      if (observation) { closing = cents(observation.amount); reserved = cents(observation.reserved_amount); }
      const opening = closing;
      let income = 0, expense = 0, missing = 0, overdue = 0;
      for (const event of liveReservations) {
        if (event.fund_id !== fund.id || event.effective_date !== date) continue;
        const effect = cents(event.amount) * (event.kind === 'reserve' ? 1 : -1);
        reserved += effect;
        if (event.target_item_id) reservedByItem.set(event.target_item_id, Math.max(0,(reservedByItem.get(event.target_item_id) || 0)+effect));
      }
      for (const item of fundItems) {
        const realized = byItem.get(item.id) || 0;
        const amount = item.amount === null ? null : cents(item.amount);
        const pending = amount === null ? null : Math.max(0, amount - realized - cents(item.closed_amount ?? 0));
        if (item.status === 'active' && amount === null && (!item.scheduled_date || item.scheduled_date <= date)) missing++;
        if (item.status !== 'active' || pending === null || pending === 0) continue;
        const effective = item.scheduled_date && item.scheduled_date < today ? today : item.scheduled_date;
        if (effective !== date) continue;
        if (item.scheduled_date && item.scheduled_date < today) overdue++;
        if (item.kind === 'income') income += pending;
        else {
          expense += pending;
          const assigned = reservedByItem.get(item.id) || 0;
          const consumed = Math.min(pending,assigned);
          reserved -= consumed;
          reservedByItem.set(item.id,assigned-consumed);
        }
      }
      for (const realization of liveRealizations) {
        if (realization.fund_id !== fund.id || realization.effective_date !== date) continue;
        const item = items.find(row => row.id === realization.item_id);
        if (!item) continue;
        if (item.kind === 'income') income += cents(realization.amount);
        else expense += cents(realization.amount);
      }
      for (const rate of rates) {
        if (rate.fund_id !== fund.id || !rate.active || date < rate.valid_from || (rate.valid_until && date > rate.valid_until)) continue;
        if (!rate.weekdays.includes(isoWeekday(date))) continue;
        if (items.some(item => item.scenario_rule_id === rate.id && item.scheduled_date === date)) continue;
        income += scenarioAmount(rate, fund.scenario);
      }
      for (const transfer of input.transfers || []) {
        if (transfer.reversed_at || transfer.effective_date !== date) continue;
        if (transfer.source_fund_id === fund.id) expense += cents(transfer.amount);
        if (transfer.destination_fund_id === fund.id) income += cents(transfer.amount);
      }
      closing += income - expense;
      if (date >= from) output.push({ date, fund_id: fund.id, opening: money(opening), income: money(income), expense: money(expense), closing: money(closing), reserved: money(reserved), free: money(closing - reserved), missing, overdue });
    }
  }
  return output;
}
