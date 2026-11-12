import type { SupabaseClient } from '@supabase/supabase-js';
import { metaCostStart, valueWalletConsumption, type Advertising, type Funding } from './advertising';

type LedgerEntry = Funding & {void_reason: string | null};

async function readFunding(db: SupabaseClient, request: Request, cutoff: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Falta sesión.');
  const {data: auth, error: authError} = await db.auth.getUser(token);
  if (authError || !auth.user) throw new Error('Falta sesión.');
  const funding: Funding[] = [];
  // The reconciliation RPC enforces financial permissions and returns one extra row for pagination.
  for (let offset = 0; offset < 5000; offset += 50) {
    const {data, error} = await db.rpc('read_crypto_reconciliation', {p_actor: auth.user.id, p_offset: offset});
    if (error || !Array.isArray(data?.entries)) throw new Error('No se pudo leer Binance.');
    const page = data.entries as LedgerEntry[];
    funding.push(...page.slice(0, 50).filter(row => row.day <= cutoff && !row.void_reason));
    if (page.length <= 50) return funding;
  }
  throw new Error('No se pudo completar la lectura de Binance.');
}

async function graph(path: string, params: Record<string, string>) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('Meta no configurado.');
  const url = new URL('https://graph.facebook.com/' + (process.env.META_API_VERSION || 'v21.0') + '/' + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {headers: {Authorization: 'Bearer ' + token}, cache: 'no-store', signal: AbortSignal.timeout(12000)});
  const body = await response.json();
  if (!response.ok || body.error) throw new Error('Meta no pudo completar la consulta.');
  return body;
}

async function readMeta(cutoff: string) {
  const id = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  const months: {since: string; until: string}[] = [];
  for (let since = new Date(metaCostStart + 'T00:00:00Z'); since.toISOString().slice(0, 10) <= cutoff;) {
    const first = since.toISOString().slice(0, 10);
    since.setUTCMonth(since.getUTCMonth() + 1);
    const last = new Date(since.getTime() - 86400000).toISOString().slice(0, 10);
    months.push({since: first, until: last < cutoff ? last : cutoff});
  }
  const [account, ...insights] = await Promise.all([
    graph(id, {fields: 'id,name,currency,timezone_name,spend_cap,amount_spent'}),
    ...months.map(range => graph(id + '/insights', {
      fields: 'date_start,spend', level: 'account', time_increment: '1', limit: '100',
      time_range: JSON.stringify(range),
    })),
  ]);
  if (account.id !== id || account.currency !== 'USD' || account.timezone_name !== 'America/Argentina/Buenos_Aires') {
    throw new Error('Los datos de Meta no corresponden a la cuenta.');
  }
  const spend = new Map<string, number>();
  for (const [index, report] of insights.entries()) {
    if (!Array.isArray(report.data) || report.paging?.next) throw new Error('Meta devolvió un período incompleto.');
    const {since, until} = months[index];
    for (const row of report.data) {
      const value = Number(row.spend);
      if (typeof row.date_start !== 'string' || row.date_start < since || row.date_start > until ||
          spend.has(row.date_start) || typeof row.spend !== 'string' || row.spend.trim() === '' ||
          !Number.isFinite(value) || value < 0) {
        throw new Error('Meta devolvió un gasto diario inválido.');
      }
      spend.set(row.date_start, value);
    }
  }
  const cap = Number(account.spend_cap);
  const used = Number(account.amount_spent);
  const availableUsd = cap > 0 && Number.isSafeInteger(cap) && account.amount_spent != null &&
    Number.isSafeInteger(used) && used >= 0 ? Math.max(0, cap - used) / 100 : null;
  return {account: String(account.name || 'Meta'), availableUsd, checkedAt: new Date().toISOString(), spend};
}

export async function readAdvertising(db: SupabaseClient, request: Request, days: string[]): Promise<Advertising> {
  const cutoff = days[days.length - 1];
  const [meta, ledger] = await Promise.allSettled([
    readMeta(cutoff),
    readFunding(db, request, cutoff),
  ]);
  const valued = valueWalletConsumption(days, meta.status === 'fulfilled' ? meta.value.spend : new Map(),
    ledger.status === 'fulfilled' ? ledger.value : []);
  if (meta.status === 'rejected') return {
    ...valued,
    account: 'Meta', availableUsd: null, checkedAt: null, days: [], arsPerUsdt: null, feeRate: null,
    issue: 'No se pudo obtener el consumo de Meta. La publicidad queda pendiente de conciliar.',
  };
  const {account, availableUsd, checkedAt} = meta.value;
  const issue = ledger.status === 'rejected' || valued.days.some(day => day.unvaluedUsd || day.feeArs === null)
    ? 'Hay consumo de Meta pendiente de valuar por saldo inicial, compras, recargas o comisiones por conciliar.'
    : null;
  return {account, availableUsd, checkedAt, ...valued, issue};
}
