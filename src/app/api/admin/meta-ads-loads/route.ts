import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getConfiguredMetaAccounts,
  syncMetaAccountLoads,
  type MetaLoadCurrency,
  type MetaLoadReconciliationStatus,
} from '@/lib/metaAdAccountLoads';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set([
  'admin',
  'superadmin',
  'owner',
  'gerencia',
  'finanzas',
  'tesoreria',
  'marketing',
]);

const VALID_STATUSES = new Set<MetaLoadReconciliationStatus>([
  'pending',
  'verified',
  'discrepancy',
]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function authorizeAdmin(request: NextRequest): Promise<{
  db: SupabaseClient;
  user: { id: string; email?: string | null };
  actorName: string;
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!url || !anonKey || !serviceKey || !token) return null;

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);
  if (authError || !user) return null;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  let seller: { name?: string | null; role?: string | null } | null = null;
  const { data: byId } = await db
    .from('sellers')
    .select('name,role')
    .eq('id', user.id)
    .maybeSingle();
  seller = byId;

  if (!seller && user.email) {
    const { data: byEmail } = await db
      .from('sellers')
      .select('name,role')
      .ilike('email', user.email)
      .maybeSingle();
    seller = byEmail;
  }

  const role = String(seller?.role || '').trim().toLowerCase();
  let allowed = ALLOWED_ROLES.has(role);

  if (!allowed) {
    const { data: canManage } = await db.rpc('can_manage_treasury_settlements', {
      p_user_id: user.id,
    });
    allowed = Boolean(canManage);
  }

  if (!allowed) return null;

  return {
    db,
    user: { id: user.id, email: user.email },
    actorName: (seller?.name || user.email || 'Admin').trim(),
  };
}

export async function GET(request: NextRequest) {
  const ctx = await authorizeAdmin(request);
  if (!ctx) return jsonError('No tenés permisos para consultar cargas de Meta.', 403);

  const { db } = ctx;
  const params = request.nextUrl.searchParams;
  const dateFrom = (params.get('dateFrom') || '').trim();
  const dateTo = (params.get('dateTo') || '').trim();
  const accountFilter = (params.get('accountId') || 'all').trim();
  const currencyFilter = (params.get('currency') || 'all').trim().toUpperCase();
  const statusFilter = (params.get('status') || 'all').trim().toLowerCase();
  const search = (params.get('q') || '').trim().toLowerCase();
  const rawLimit = Number(params.get('limit') || 500);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 2000)) : 500;

  let query = db
    .from('meta_ad_account_loads')
    .select('*')
    .order('event_time', { ascending: false })
    .limit(limit);

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    query = query.gte('event_date_ar', dateFrom);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    query = query.lte('event_date_ar', dateTo);
  }
  if (accountFilter && accountFilter !== 'all') {
    if (accountFilter.startsWith('act_')) {
      query = query.eq('account_id', accountFilter);
    } else {
      query = query.eq('account_name', accountFilter);
    }
  }
  if (currencyFilter === 'USD' || currencyFilter === 'ARS') {
    query = query.eq('currency', currencyFilter);
  }
  if (VALID_STATUSES.has(statusFilter as MetaLoadReconciliationStatus)) {
    query = query.eq('reconciliation_status', statusFilter);
  }

  const [{ data: rows, error }, { data: metaRows }] = await Promise.all([
    query,
    db
      .from('meta_ad_account_loads')
      .select('account_id,account_name,currency,last_synced_at,event_time')
      .order('event_time', { ascending: false })
      .limit(1000),
  ]);

  if (error) {
    return jsonError(`No se pudieron cargar los registros de Meta: ${error.message}`, 500);
  }

  let loads = (rows || []) as Array<{
    id: string;
    event_key: string;
    account_id: string;
    account_name: string;
    event_type: string;
    event_time: string;
    event_date_ar: string;
    currency: MetaLoadCurrency;
    amount_cents: number;
    amount: number | string;
    old_limit_cents: number | null;
    new_limit_cents: number | null;
    source: string;
    reconciliation_status: MetaLoadReconciliationStatus;
    reconciliation_note: string;
    reconciliation_reference: string;
    reconciled_at: string | null;
    reconciled_by: string | null;
    reconciled_by_name: string | null;
    first_seen_at: string;
    last_synced_at: string;
  }>;

  if (search) {
    loads = loads.filter(row =>
      row.account_name.toLowerCase().includes(search) ||
      row.account_id.toLowerCase().includes(search) ||
      (row.reconciliation_reference || '').toLowerCase().includes(search) ||
      (row.reconciliation_note || '').toLowerCase().includes(search) ||
      (row.reconciled_by_name || '').toLowerCase().includes(search) ||
      String(row.amount).includes(search)
    );
  }

  const totalsByCurrency: Record<
    MetaLoadCurrency,
    {
      count: number;
      amount: number;
      verifiedAmount: number;
      pendingAmount: number;
      discrepancyAmount: number;
    }
  > = {
    USD: { count: 0, amount: 0, verifiedAmount: 0, pendingAmount: 0, discrepancyAmount: 0 },
    ARS: { count: 0, amount: 0, verifiedAmount: 0, pendingAmount: 0, discrepancyAmount: 0 },
  };

  const accountSummaryMap = new Map<
    string,
    {
      accountId: string;
      accountName: string;
      currency: MetaLoadCurrency;
      count: number;
      amount: number;
      verifiedCount: number;
      pendingCount: number;
      discrepancyCount: number;
      lastEventTime: string | null;
      lastSyncedAt: string | null;
    }
  >();

  for (const cfg of getConfiguredMetaAccounts()) {
    accountSummaryMap.set(cfg.id, {
      accountId: cfg.id,
      accountName: cfg.name,
      currency: cfg.expectedCurrency,
      count: 0,
      amount: 0,
      verifiedCount: 0,
      pendingCount: 0,
      discrepancyCount: 0,
      lastEventTime: null,
      lastSyncedAt: null,
    });
  }

  for (const row of metaRows || []) {
    const existing = accountSummaryMap.get(row.account_id);
    if (!existing) {
      accountSummaryMap.set(row.account_id, {
        accountId: row.account_id,
        accountName: row.account_name,
        currency: row.currency as MetaLoadCurrency,
        count: 0,
        amount: 0,
        verifiedCount: 0,
        pendingCount: 0,
        discrepancyCount: 0,
        lastEventTime: row.event_time || null,
        lastSyncedAt: row.last_synced_at || null,
      });
    } else {
      if (row.last_synced_at && (!existing.lastSyncedAt || row.last_synced_at > existing.lastSyncedAt)) {
        existing.lastSyncedAt = row.last_synced_at;
      }
      if (row.event_time && (!existing.lastEventTime || row.event_time > existing.lastEventTime)) {
        existing.lastEventTime = row.event_time;
      }
    }
  }

  let pendingCount = 0;
  let verifiedCount = 0;
  let discrepancyCount = 0;

  for (const load of loads) {
    const amountNum = Number(load.amount) || 0;
    const cur = totalsByCurrency[load.currency];
    if (cur) {
      cur.count += 1;
      cur.amount = Number((cur.amount + amountNum).toFixed(2));
      if (load.reconciliation_status === 'verified') {
        cur.verifiedAmount = Number((cur.verifiedAmount + amountNum).toFixed(2));
      } else if (load.reconciliation_status === 'discrepancy') {
        cur.discrepancyAmount = Number((cur.discrepancyAmount + amountNum).toFixed(2));
      } else {
        cur.pendingAmount = Number((cur.pendingAmount + amountNum).toFixed(2));
      }
    }

    if (load.reconciliation_status === 'verified') verifiedCount += 1;
    else if (load.reconciliation_status === 'discrepancy') discrepancyCount += 1;
    else pendingCount += 1;

    let acc = accountSummaryMap.get(load.account_id);
    if (!acc) {
      acc = {
        accountId: load.account_id,
        accountName: load.account_name,
        currency: load.currency,
        count: 0,
        amount: 0,
        verifiedCount: 0,
        pendingCount: 0,
        discrepancyCount: 0,
        lastEventTime: load.event_time,
        lastSyncedAt: load.last_synced_at,
      };
      accountSummaryMap.set(load.account_id, acc);
    }
    acc.count += 1;
    acc.amount = Number((acc.amount + amountNum).toFixed(2));
    if (load.reconciliation_status === 'verified') acc.verifiedCount += 1;
    else if (load.reconciliation_status === 'discrepancy') acc.discrepancyCount += 1;
    else acc.pendingCount += 1;
  }

  const accounts = Array.from(accountSummaryMap.values());
  const lastSyncedAt = accounts.reduce<string | null>((latest, acc) => {
    if (!acc.lastSyncedAt) return latest;
    return !latest || acc.lastSyncedAt > latest ? acc.lastSyncedAt : latest;
  }, null);

  return NextResponse.json(
    {
      success: true,
      loads: loads.map(row => ({
        ...row,
        amount: Number(row.amount),
      })),
      accounts,
      summary: {
        totalCount: loads.length,
        pendingCount,
        verifiedCount,
        discrepancyCount,
        totalsByCurrency,
        lastSyncedAt,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const ctx = await authorizeAdmin(request);
  if (!ctx) return jsonError('No tenés permisos para sincronizar cargas de Meta.', 403);

  let body: { accountFilter?: string; maxPages?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await syncMetaAccountLoads({
      accountFilter: body.accountFilter || null,
      maxPages: body.maxPages ?? 15,
      source: 'meta_api',
      db: ctx.db,
    });
    const anyOk = result.accounts.some(acc => acc.ok);
    if (!anyOk) {
      const errors = result.accounts
        .map(acc => `${acc.accountName}: ${acc.error || 'Error desconocido'}`)
        .join(' | ');
      return jsonError(`No se pudo sincronizar ninguna cuenta de Meta. ${errors}`, 503);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al sincronizar cargas de Meta.';
    return jsonError(message, 503);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await authorizeAdmin(request);
  if (!ctx) return jsonError('No tenés permisos para cotejar cargas de Meta.', 403);

  let body: {
    id?: string;
    reconciliation_status?: string;
    reconciliation_reference?: string;
    reconciliation_note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError('Cuerpo de solicitud inválido.');
  }

  const id = String(body.id || '').trim();
  const status = String(body.reconciliation_status || '').trim().toLowerCase() as MetaLoadReconciliationStatus;
  if (!id) return jsonError('Falta el ID de la carga a actualizar.');
  if (!VALID_STATUSES.has(status)) {
    return jsonError('Estado de cotejo inválido. Usá pending, verified o discrepancy.');
  }

  const reference = typeof body.reconciliation_reference === 'string'
    ? body.reconciliation_reference.trim().slice(0, 200)
    : undefined;
  const note = typeof body.reconciliation_note === 'string'
    ? body.reconciliation_note.trim().slice(0, 1000)
    : undefined;

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    reconciliation_status: status,
    reconciled_at: status === 'pending' ? null : nowIso,
    reconciled_by: status === 'pending' ? null : ctx.user.id,
    reconciled_by_name: status === 'pending' ? null : ctx.actorName,
    updated_at: nowIso,
  };
  if (reference !== undefined) updatePayload.reconciliation_reference = reference;
  if (note !== undefined) updatePayload.reconciliation_note = note;

  const { data, error } = await ctx.db
    .from('meta_ad_account_loads')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return jsonError(`No se pudo actualizar el cotejo: ${error.message}`, 500);
  }
  if (!data) {
    return jsonError('No se encontró la carga especificada.', 404);
  }

  return NextResponse.json({
    success: true,
    load: {
      ...data,
      amount: Number(data.amount),
    },
  });
}
