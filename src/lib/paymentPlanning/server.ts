import { createClient } from '@supabase/supabase-js';
import { isoWeekday, money, project, scenarioAmount, validDate, type Balance, type Fund, type Item, type Realization, type Reservation, type ScenarioRate, type Transfer } from './model';

export class PlanningError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function planningContext(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new PlanningError('La sesión venció. Volvé a ingresar.', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !secret) throw new PlanningError('Planificación no está configurada en el servidor.', 503);
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) throw new PlanningError('La sesión venció. Volvé a ingresar.', 401);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const byId = await db.from('sellers').select('role,roles,is_active').eq('id', user.id).maybeSingle();
  if (byId.error) throw byId.error;
  const seller = byId.data ? byId : user.email
    ? await db.from('sellers').select('role,roles,is_active').ilike('email', user.email.replace(/[%_]/g, '\\$&')).maybeSingle()
    : byId;
  if (seller.error) throw seller.error;
  const roles = [seller.data?.role, ...(Array.isArray(seller.data?.roles) ? seller.data.roles : [])]
    .map(role => String(role || '').toLowerCase());
  if (seller.data?.is_active === false || !roles.includes('admin')) {
    throw new PlanningError('No tenés acceso a Planificación de pagos.', 403);
  }
  return { db, actor: user.id, admin: true };
}

type PagedQuery<T> = { range: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }> };
async function allRows<T>(query: PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data?.length) return rows;
  }
}

export async function planningSnapshot(request: Request, from: string, to: string) {
  if (!validDate(from) || !validDate(to) || from > to || (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) > 93 * 86400000) {
    throw new PlanningError('Elegí un rango de hasta 93 días.');
  }
  const { db, admin } = await planningContext(request);
  const [funds, balances, items, realizations, reservations, rates, transfers, recurrences, imports] = await Promise.all([
    allRows<Fund>(db.from('payment_planning_funds').select('*').order('kind').order('id')),
    allRows<Balance>(db.from('payment_planning_balances').select('*').lte('effective_date',to).order('effective_date').order('id')),
    allRows<Item>(db.from('payment_planning_items').select('*').order('created_at').order('id')),
    allRows<Realization>(db.from('payment_planning_realizations').select('*').lte('effective_date',to).order('effective_date').order('id')),
    allRows<Reservation>(db.from('payment_planning_reservations').select('*').lte('effective_date',to).order('effective_date').order('id')),
    allRows<ScenarioRate>(db.from('payment_planning_scenario_rates').select('*').lte('valid_from',to).order('valid_from').order('id')),
    allRows<Transfer>(db.from('payment_planning_transfers').select('*').lte('effective_date',to).order('effective_date').order('id')),
    allRows<{ id: string; fund_id: string; title: string; cadence: string; active: boolean }>(db.from('payment_planning_recurrences').select('*').order('created_at').order('id')),
    allRows<{ source_hash: string; source_name: string; created_at: string }>(db.from('payment_planning_import_batches').select('source_hash,source_name,created_at').order('created_at').order('id'))
  ]);
  const visibleFunds = funds.filter(fund => admin || fund.kind !== 'personal');
  const allowed = new Set(visibleFunds.map(fund => fund.id));
  const shownItems = items.filter(item => allowed.has(item.fund_id));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const projectionReliableFrom = imports.some(row => row.source_hash === '401bcbdfb76434eb738568d6b148808e26474dfc64e05ea54a1f620bd262d0ff')
    ? '2026-09-30' : null;
  const importedSourceRows = projectionReliableFrom
    ? await allRows<{ source_key: string; fund_id: string; source_date: string; sheet_row: number; title: string; classification: string; source_effect: number | null; source_balance: number | null }>(
      db.from('payment_planning_source_rows')
        .select('source_key,fund_id,source_date,sheet_row,title,classification,source_effect,source_balance')
        .gte('source_date', from).lte('source_date', to)
        .in('classification', ['opening', 'scenario', 'reserve', 'release'])
        .order('source_date').order('sheet_row')
    ) : [];
  const historicalOpenings = new Map<string, { fund_id: string; date: string; opening: number }>();
  const incomeEntries: { fund_id: string; date: string; title: string; amount: number; origin: 'sheet' | 'scenario' }[] = [];
  const reserveEntries: { fund_id: string; date: string; title: string; amount: number; kind: 'reserve' | 'release'; origin: 'sheet' | 'planned' }[] = [];
  const sourceTitles = new Map(importedSourceRows.map(row => [row.source_key, row.title]));
  for (const row of importedSourceRows) {
    if (!allowed.has(row.fund_id)) continue;
    if (row.source_date >= projectionReliableFrom!) continue;
    const key = `${row.source_date}:${row.fund_id}`;
    if (!historicalOpenings.has(key) && row.source_balance !== null && ['opening', 'scenario'].includes(row.classification)) {
      const opening = Number(row.source_balance) - (row.classification === 'scenario' ? Number(row.source_effect || 0) : 0);
      historicalOpenings.set(key, { fund_id: row.fund_id, date: row.source_date, opening });
    }
    if (row.classification === 'scenario' && Number(row.source_effect || 0) > 0) {
      incomeEntries.push({ fund_id: row.fund_id, date: row.source_date, title: row.title.replace(/^[^\p{L}\p{N}]+/u, '').trim(), amount: Number(row.source_effect), origin: 'sheet' });
    }
    if ((row.classification === 'reserve' || row.classification === 'release') && Number(row.source_effect || 0) !== 0) {
      reserveEntries.push({ fund_id: row.fund_id, date: row.source_date, title: row.title, amount: Math.abs(Number(row.source_effect)), kind: row.classification, origin: 'sheet' });
    }
  }
  for (const event of reservations as (Reservation & { import_source_key?: string | null })[]) {
    if (event.reversed_at || !allowed.has(event.fund_id) || event.effective_date < from || event.effective_date > to) continue;
    if (projectionReliableFrom && event.effective_date < projectionReliableFrom) continue;
    if (event.kind !== 'reserve' && event.kind !== 'release') continue;
    reserveEntries.push({ fund_id: event.fund_id, date: event.effective_date,
      title: event.import_source_key ? sourceTitles.get(event.import_source_key) || (event.kind === 'reserve' ? 'Reserva interna' : 'Reingreso de reserva') : event.kind === 'reserve' ? 'Reserva interna' : 'Reingreso de reserva',
      amount: Number(event.amount), kind: event.kind, origin: 'planned' });
  }
  const projection = project({
    funds: visibleFunds, balances: balances.filter(row => allowed.has(row.fund_id)), items: shownItems,
    realizations: realizations.filter(row => allowed.has(row.fund_id) && shownItems.some(item => item.id === row.item_id)),
    reservations: reservations.filter(row => allowed.has(row.fund_id)),
    rates: rates.filter(row => allowed.has(row.fund_id)),
    transfers: transfers.filter(row => allowed.has(row.source_fund_id) && allowed.has(row.destination_fund_id)), from, to, today
  });
  for (const row of projection) {
    if (projectionReliableFrom && row.date < projectionReliableFrom) continue;
    const fund = visibleFunds.find(entry => entry.id === row.fund_id);
    if (!fund) continue;
    for (const rate of rates) {
      if (rate.fund_id !== fund.id || !rate.active || row.date < rate.valid_from || (rate.valid_until && row.date > rate.valid_until)) continue;
      if (!rate.weekdays.includes(isoWeekday(row.date))) continue;
      if (shownItems.some(item => item.scenario_rule_id === rate.id && item.scheduled_date === row.date)) continue;
      const amount = money(scenarioAmount(rate, fund.scenario));
      if (amount > 0) incomeEntries.push({ fund_id: fund.id, date: row.date, title: rate.title, amount, origin: 'scenario' });
    }
  }
  return {
    funds: visibleFunds, balances: balances.filter(row => allowed.has(row.fund_id)),
    items: shownItems, realizations: realizations.filter(row => shownItems.some(item => item.id === row.item_id)),
    reservations: reservations.filter(row => allowed.has(row.fund_id)), rates: rates.filter(row => allowed.has(row.fund_id)),
    transfers: transfers.filter(row => allowed.has(row.source_fund_id) && allowed.has(row.destination_fund_id)),
    recurrences: recurrences.filter(row => allowed.has(row.fund_id)),
    projection, today, from, to, canImport: admin && imports.length === 0, importedSource: imports.at(-1) || null,
    projectionReliableFrom,
    historicalOpenings: [...historicalOpenings.values()],
    incomeEntries,
    reserveEntries,
    unanchoredFunds: visibleFunds.filter(fund => !balances.some(row => row.fund_id === fund.id && row.effective_date <= from)).map(fund => fund.id)
  };
}
