import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { zonoAccounts } from '@/lib/metaZonoBalance.mjs';

export type MetaLoadCurrency = 'USD' | 'ARS';
export type MetaLoadEventType = 'ad_account_update_spend_limit' | 'funding_event_successful';
export type MetaLoadSource = 'meta_api' | 'telegram_webhook' | 'meta_ads_live' | 'manual';
export type MetaLoadReconciliationStatus = 'pending' | 'verified' | 'discrepancy';

export interface MetaActivityInput {
  event_time?: string;
  event_type?: string;
  extra_data?: string | Record<string, unknown> | null;
}

export interface MetaAdAccountConfig {
  id: string;
  name: string;
  expectedCurrency: MetaLoadCurrency;
  token: string;
  version: string;
}

export interface ParsedMetaLoad {
  event_key: string;
  account_id: string;
  account_name: string;
  event_type: MetaLoadEventType;
  event_time: string;
  event_date_ar: string;
  currency: MetaLoadCurrency;
  amount_cents: number;
  amount: number;
  old_limit_cents: number | null;
  new_limit_cents: number | null;
  raw_extra_data: Record<string, unknown> | null;
}

export interface MetaAccountSnapshot {
  id: string;
  name: string;
  currency: MetaLoadCurrency;
  spendCap: number | null;
  amountSpent: number | null;
  remaining: number | null;
  balance: number | null;
  isPrepay: boolean | null;
}

export interface MetaAccountSyncResult {
  accountId: string;
  accountName: string;
  currency: MetaLoadCurrency;
  ok: boolean;
  fetchedLoads: number;
  inserted: number;
  updated: number;
  pagesFetched: number;
  snapshot?: MetaAccountSnapshot;
  error?: string;
}

const AR_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toArgentinaDateISO(timestampMs: number): string {
  const parts = AR_DATE_FORMATTER.formatToParts(new Date(timestampMs));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function parseExtraData(raw: MetaActivityInput['extra_data']): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function extractMetaLoadsFromActivities(
  account: { id: string; name: string; currency: MetaLoadCurrency },
  activities: MetaActivityInput[] = []
): ParsedMetaLoad[] {
  const byKey = new Map<string, ParsedMetaLoad>();

  for (const activity of activities) {
    if (!activity?.event_type || !activity?.event_time) continue;
    const timestamp = Date.parse(activity.event_time);
    if (!Number.isFinite(timestamp)) continue;

    const details = parseExtraData(activity.extra_data);
    if (!details) continue;

    const eventTimeIso = new Date(timestamp).toISOString();
    const eventDateAr = toArgentinaDateISO(timestamp);

    if (activity.event_type === 'ad_account_update_spend_limit') {
      const oldValue = Number(details.old_value);
      const newValue = Number(details.new_value);
      if (
        details.type !== 'payment_amount' ||
        !Number.isSafeInteger(oldValue) ||
        !Number.isSafeInteger(newValue) ||
        newValue <= oldValue
      ) {
        continue;
      }
      const amountCents = newValue - oldValue;
      const eventKey = `${account.id}|ad_account_update_spend_limit|${eventTimeIso}|${oldValue}|${newValue}`;
      byKey.set(eventKey, {
        event_key: eventKey,
        account_id: account.id,
        account_name: account.name,
        event_type: 'ad_account_update_spend_limit',
        event_time: eventTimeIso,
        event_date_ar: eventDateAr,
        currency: account.currency,
        amount_cents: amountCents,
        amount: Number((amountCents / 100).toFixed(2)),
        old_limit_cents: oldValue,
        new_limit_cents: newValue,
        raw_extra_data: details,
      });
      continue;
    }

    if (activity.event_type === 'funding_event_successful') {
      const amountCents = Number(details.amount);
      const currency = String(details.currency || '').toUpperCase();
      if (
        currency !== account.currency ||
        !Number.isSafeInteger(amountCents) ||
        amountCents <= 0
      ) {
        continue;
      }
      const eventKey = `${account.id}|funding_event_successful|${eventTimeIso}|${amountCents}|${currency}`;
      byKey.set(eventKey, {
        event_key: eventKey,
        account_id: account.id,
        account_name: account.name,
        event_type: 'funding_event_successful',
        event_time: eventTimeIso,
        event_date_ar: eventDateAr,
        currency: account.currency,
        amount_cents: amountCents,
        amount: Number((amountCents / 100).toFixed(2)),
        old_limit_cents: null,
        new_limit_cents: null,
        raw_extra_data: details,
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) => Date.parse(b.event_time) - Date.parse(a.event_time)
  );
}

export function getConfiguredMetaAccounts(accountFilter?: string | null): MetaAdAccountConfig[] {
  const primaryAccountId = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  const primaryToken = process.env.META_ACCESS_TOKEN;
  const zonoToken = process.env.META_ZONO_ACCESS_TOKEN;
  const primaryVersion = process.env.META_API_VERSION || 'v21.0';
  const zonoVersion = process.env.META_ZONO_API_VERSION || 'v24.0';

  const configs: MetaAdAccountConfig[] = [];
  if (primaryToken) {
    configs.push({
      id: primaryAccountId,
      name: 'S731.04',
      expectedCurrency: 'USD',
      token: primaryToken,
      version: primaryVersion,
    });
  }
  if (zonoToken) {
    for (const zono of zonoAccounts) {
      configs.push({
        id: zono.id,
        name: zono.name,
        expectedCurrency: 'ARS',
        token: zonoToken,
        version: zonoVersion,
      });
    }
  }

  const normalized = (accountFilter || '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return configs;

  return configs.filter(
    cfg => cfg.id.toLowerCase() === normalized || cfg.name.toLowerCase() === normalized
  );
}

export function createMetaServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function persistMetaLoads(
  loads: ParsedMetaLoad[],
  source: MetaLoadSource = 'meta_api',
  db?: SupabaseClient | null
): Promise<{ total: number; inserted: number; updated: number }> {
  if (!loads.length) return { total: 0, inserted: 0, updated: 0 };
  const client = db || createMetaServiceClient();
  if (!client) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY para guardar cargas de Meta.');
  }

  const keys = loads.map(item => item.event_key);
  const existingKeys = new Set<string>();
  const chunkSize = 200;

  for (let i = 0; i < keys.length; i += chunkSize) {
    const slice = keys.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('meta_ad_account_loads')
      .select('event_key')
      .in('event_key', slice);
    if (error) {
      throw new Error(`No se pudieron verificar cargas existentes: ${error.message}`);
    }
    for (const row of data || []) {
      if (row.event_key) existingKeys.add(row.event_key);
    }
  }

  const nowIso = new Date().toISOString();
  const toInsert = loads
    .filter(item => !existingKeys.has(item.event_key))
    .map(item => ({
      ...item,
      source,
      first_seen_at: nowIso,
      last_synced_at: nowIso,
      updated_at: nowIso,
    }));

  const toUpdate = loads
    .filter(item => existingKeys.has(item.event_key))
    .map(item => ({
      ...item,
      last_synced_at: nowIso,
      updated_at: nowIso,
    }));

  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const slice = toInsert.slice(i, i + chunkSize);
    const { error } = await client
      .from('meta_ad_account_loads')
      .upsert(slice, { onConflict: 'event_key' });
    if (error) {
      throw new Error(`No se pudieron insertar cargas de Meta: ${error.message}`);
    }
  }

  for (let i = 0; i < toUpdate.length; i += chunkSize) {
    const slice = toUpdate.slice(i, i + chunkSize);
    const { error } = await client
      .from('meta_ad_account_loads')
      .upsert(slice, { onConflict: 'event_key' });
    if (error) {
      throw new Error(`No se pudieron actualizar cargas de Meta: ${error.message}`);
    }
  }

  return {
    total: loads.length,
    inserted: toInsert.length,
    updated: toUpdate.length,
  };
}

export async function fetchMetaAccountActivitiesAndSnapshot(
  cfg: MetaAdAccountConfig,
  options: { maxPages?: number; limit?: number; fetcher?: typeof fetch } = {}
): Promise<{
  snapshot: MetaAccountSnapshot;
  activities: MetaActivityInput[];
  pagesFetched: number;
}> {
  const fetcher = options.fetcher || fetch;
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 20, 50));
  const limit = Math.max(10, Math.min(options.limit ?? 200, 200));

  const accountUrl = new URL(`https://graph.facebook.com/${cfg.version}/${cfg.id}`);
  accountUrl.searchParams.set(
    'fields',
    'id,name,currency,spend_cap,amount_spent,balance,is_prepay_account'
  );

  const accountRes = await fetcher(accountUrl, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(15000),
  });
  const accountData: any = await accountRes.json().catch(() => null);
  if (!accountRes.ok || !accountData || accountData.error || accountData.id !== cfg.id) {
    throw new Error(
      `Meta rechazó la consulta de ${cfg.name} (código ${accountData?.error?.code || accountRes.status}).`
    );
  }
  if (accountData.currency !== cfg.expectedCurrency) {
    throw new Error(
      `La cuenta ${cfg.name} devolvió moneda ${accountData.currency} en lugar de ${cfg.expectedCurrency}.`
    );
  }

  const spendCap = accountData.spend_cap != null ? Number(accountData.spend_cap) / 100 : null;
  const amountSpent = accountData.amount_spent != null ? Number(accountData.amount_spent) / 100 : null;
  const balance = accountData.balance != null ? Number(accountData.balance) / 100 : null;
  const remaining =
    spendCap !== null && spendCap > 0 && amountSpent !== null
      ? Math.max(0, Number((spendCap - amountSpent).toFixed(2)))
      : null;

  const snapshot: MetaAccountSnapshot = {
    id: cfg.id,
    name: accountData.name || cfg.name,
    currency: cfg.expectedCurrency,
    spendCap: Number.isFinite(spendCap as number) ? spendCap : null,
    amountSpent: Number.isFinite(amountSpent as number) ? amountSpent : null,
    remaining: Number.isFinite(remaining as number) ? remaining : null,
    balance: Number.isFinite(balance as number) ? balance : null,
    isPrepay: typeof accountData.is_prepay_account === 'boolean' ? accountData.is_prepay_account : null,
  };

  const activities: MetaActivityInput[] = [];
  let nextUrl: URL | null = new URL(`https://graph.facebook.com/${cfg.version}/${cfg.id}/activities`);
  nextUrl.searchParams.set('fields', 'event_time,event_type,extra_data');
  nextUrl.searchParams.set('limit', String(limit));

  const seenUrls = new Set<string>();
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < maxPages) {
    if (nextUrl.origin !== 'https://graph.facebook.com' || seenUrls.has(nextUrl.href)) {
      break;
    }
    seenUrls.add(nextUrl.href);

    const headers: Record<string, string> = {};
    if (!nextUrl.searchParams.has('access_token')) {
      headers.Authorization = `Bearer ${cfg.token}`;
    }

    const res = await fetcher(nextUrl, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(20000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body || body.error || !Array.isArray(body.data)) {
      throw new Error(
        `No se pudo leer el historial de actividades de ${cfg.name} (código ${body?.error?.code || res.status}).`
      );
    }

    activities.push(...body.data);
    pagesFetched += 1;
    nextUrl = body.paging?.next ? new URL(body.paging.next) : null;
  }

  return { snapshot, activities, pagesFetched };
}

export async function syncMetaAccountLoads(options: {
  accountFilter?: string | null;
  maxPages?: number;
  source?: MetaLoadSource;
  db?: SupabaseClient | null;
  fetcher?: typeof fetch;
} = {}): Promise<{
  accounts: MetaAccountSyncResult[];
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
}> {
  const configs = getConfiguredMetaAccounts(options.accountFilter);
  if (!configs.length) {
    throw new Error('No hay credenciales de Meta configuradas para sincronizar cuentas.');
  }

  const db = options.db || createMetaServiceClient();
  const settled = await Promise.allSettled(
    configs.map(async cfg => {
      const { snapshot, activities, pagesFetched } = await fetchMetaAccountActivitiesAndSnapshot(cfg, {
        maxPages: options.maxPages,
        fetcher: options.fetcher,
      });
      const loads = extractMetaLoadsFromActivities(
        { id: cfg.id, name: snapshot.name || cfg.name, currency: cfg.expectedCurrency },
        activities
      );
      const saved = await persistMetaLoads(loads, options.source || 'meta_api', db);
      return {
        accountId: cfg.id,
        accountName: snapshot.name || cfg.name,
        currency: cfg.expectedCurrency,
        ok: true,
        fetchedLoads: loads.length,
        inserted: saved.inserted,
        updated: saved.updated,
        pagesFetched,
        snapshot,
      } satisfies MetaAccountSyncResult;
    })
  );

  const accounts: MetaAccountSyncResult[] = settled.map((result, idx) => {
    const cfg = configs[idx];
    if (result.status === 'fulfilled') return result.value;
    return {
      accountId: cfg.id,
      accountName: cfg.name,
      currency: cfg.expectedCurrency,
      ok: false,
      fetchedLoads: 0,
      inserted: 0,
      updated: 0,
      pagesFetched: 0,
      error: result.reason instanceof Error ? result.reason.message : 'Error al consultar Meta',
    };
  });

  return {
    accounts,
    totalFetched: accounts.reduce((sum, a) => sum + a.fetchedLoads, 0),
    totalInserted: accounts.reduce((sum, a) => sum + a.inserted, 0),
    totalUpdated: accounts.reduce((sum, a) => sum + a.updated, 0),
  };
}
