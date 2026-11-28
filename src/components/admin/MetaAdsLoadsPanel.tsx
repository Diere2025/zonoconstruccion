'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Download,
  Wallet,
  FileText,
  X,
  Loader2,
  Check,
  Edit3,
  Filter,
  ArrowRight,
  Database,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ReportDateRangePicker from '@/components/ui/ReportDateRangePicker';

type ReconciliationStatus = 'pending' | 'verified' | 'discrepancy';
type MetaCurrency = 'USD' | 'ARS';

interface MetaLoadRecord {
  id: string;
  event_key: string;
  account_id: string;
  account_name: string;
  event_type: 'ad_account_update_spend_limit' | 'funding_event_successful';
  event_time: string;
  event_date_ar: string;
  currency: MetaCurrency;
  amount_cents: number;
  amount: number;
  old_limit_cents: number | null;
  new_limit_cents: number | null;
  source: string;
  reconciliation_status: ReconciliationStatus;
  reconciliation_note: string;
  reconciliation_reference: string;
  reconciled_at: string | null;
  reconciled_by: string | null;
  reconciled_by_name: string | null;
  first_seen_at: string;
  last_synced_at: string;
}

interface AccountSummary {
  accountId: string;
  accountName: string;
  currency: MetaCurrency;
  count: number;
  amount: number;
  verifiedCount: number;
  pendingCount: number;
  discrepancyCount: number;
  lastEventTime: string | null;
  lastSyncedAt: string | null;
}

interface LoadsSummary {
  totalCount: number;
  pendingCount: number;
  verifiedCount: number;
  discrepancyCount: number;
  totalsByCurrency: Record<
    MetaCurrency,
    {
      count: number;
      amount: number;
      verifiedAmount: number;
      pendingAmount: number;
      discrepancyAmount: number;
    }
  >;
  lastSyncedAt: string | null;
}

interface SyncAccountResult {
  accountId: string;
  accountName: string;
  currency: MetaCurrency;
  ok: boolean;
  fetchedLoads: number;
  inserted: number;
  updated: number;
  snapshot?: LiveAccountBalance;
  error?: string;
}

export interface LiveAccountBalance {
  id: string;
  name: string;
  currency: MetaCurrency;
  spendCap?: number | null;
  remaining?: number | null;
  balance?: number | null;
  isPrepay?: boolean | null;
  error?: string;
}

const AR_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatArDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '-', time: '' };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: '-', time: '' };
  const parts = AR_DATE_PARTS.formatToParts(parsed);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return {
    date: `${get('day')}/${get('month')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function formatMoney(amount: number, currency: MetaCurrency): string {
  const formatted = amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `US$ ${formatted}` : `ARS $ ${formatted}`;
}

function eventTypeLabel(eventType: MetaLoadRecord['event_type']): string {
  return eventType === 'ad_account_update_spend_limit'
    ? 'Aumento de límite'
    : 'Pago acreditado';
}

function statusMeta(status: ReconciliationStatus) {
  if (status === 'verified') {
    return {
      label: 'Cotejada',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle2,
    };
  }
  if (status === 'discrepancy') {
    return {
      label: 'Con diferencia',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Pendiente',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: Clock,
  };
}

export default function MetaAdsLoadsPanel({
  refreshTrigger = 0,
  liveAccounts = [],
}: {
  refreshTrigger?: number;
  liveAccounts?: LiveAccountBalance[];
}) {
  const [loads, setLoads] = useState<MetaLoadRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [syncedSnapshots, setSyncedSnapshots] = useState<Record<string, LiveAccountBalance>>({});
  const [summary, setSummary] = useState<LoadsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    details?: SyncAccountResult[];
  } | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | MetaCurrency>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReconciliationStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick reconcile / edit modal state
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingLoad, setEditingLoad] = useState<MetaLoadRecord | null>(null);
  const [editStatus, setEditStatus] = useState<ReconciliationStatus>('verified');
  const [editReference, setEditReference] = useState('');
  const [editNote, setEditNote] = useState('');

  const getAuthHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      throw new Error('Tu sesión expiró. Volvé a iniciar sesión para consultar las cargas de Meta.');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const fetchLoads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (accountFilter !== 'all') params.set('accountId', accountFilter);
      if (currencyFilter !== 'all') params.set('currency', currencyFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/meta-ads-loads?${params.toString()}`, {
        headers: { Authorization: headers.Authorization },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron obtener las cargas de Meta.');
      }
      setLoads(data.loads || []);
      setAccounts(data.accounts || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar las cargas de Meta.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, dateFrom, dateTo, accountFilter, currencyFilter, statusFilter]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads, refreshTrigger]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/meta-ads-loads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountFilter: accountFilter !== 'all' ? accountFilter : undefined,
          maxPages: 15,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo sincronizar con Meta.');
      }
      const accResults: SyncAccountResult[] = data.accounts || [];
      const nextSnapshots: Record<string, LiveAccountBalance> = {};
      for (const item of accResults) {
        if (item.ok && item.snapshot) {
          nextSnapshots[item.accountId] = item.snapshot;
        }
      }
      if (Object.keys(nextSnapshots).length) {
        setSyncedSnapshots(prev => ({ ...prev, ...nextSnapshots }));
      }
      const failed = accResults.filter(a => !a.ok);
      setSyncFeedback({
        type: failed.length ? 'warning' : 'success',
        message: failed.length
          ? `Sincronización parcial: ${data.totalInserted} nuevas cargas guardadas (${data.totalFetched} revisadas). Algunas cuentas no respondieron.`
          : `Sincronización completa: ${data.totalInserted} nuevas cargas guardadas (${data.totalFetched} revisadas en Meta).`,
        details: accResults,
      });
      await fetchLoads();
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al sincronizar con Meta.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickVerify = async (load: MetaLoadRecord) => {
    setSavingId(load.id);
    try {
      const headers = await getAuthHeaders();
      const nextStatus: ReconciliationStatus =
        load.reconciliation_status === 'verified' ? 'pending' : 'verified';
      const res = await fetch('/api/admin/meta-ads-loads', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: load.id,
          reconciliation_status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo actualizar el estado.');
      }
      await fetchLoads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar cotejo.');
    } finally {
      setSavingId(null);
    }
  };

  const openEditModal = (load: MetaLoadRecord) => {
    setEditingLoad(load);
    setEditStatus(load.reconciliation_status === 'pending' ? 'verified' : load.reconciliation_status);
    setEditReference(load.reconciliation_reference || '');
    setEditNote(load.reconciliation_note || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoad) return;
    setSavingId(editingLoad.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/meta-ads-loads', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: editingLoad.id,
          reconciliation_status: editStatus,
          reconciliation_reference: editReference,
          reconciliation_note: editNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo guardar el cotejo.');
      }
      setEditingLoad(null);
      await fetchLoads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el cotejo.');
    } finally {
      setSavingId(null);
    }
  };

  const filteredLoads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return loads;
    return loads.filter(row => {
      const dt = formatArDateTime(row.event_time);
      return (
        row.account_name.toLowerCase().includes(q) ||
        row.account_id.toLowerCase().includes(q) ||
        (row.reconciliation_reference || '').toLowerCase().includes(q) ||
        (row.reconciliation_note || '').toLowerCase().includes(q) ||
        (row.reconciled_by_name || '').toLowerCase().includes(q) ||
        dt.date.includes(q) ||
        String(row.amount).includes(q)
      );
    });
  }, [loads, searchQuery]);

  const handleExportCsv = () => {
    const headers = [
      'Fecha (AR)',
      'Hora (AR)',
      'Cuenta',
      'ID Cuenta',
      'Tipo',
      'Moneda',
      'Importe',
      'Límite Anterior',
      'Límite Nuevo',
      'Estado Cotejo',
      'Referencia / Comprobante',
      'Notas',
      'Cotejado Por',
      'Fecha Cotejo',
    ];
    const escapeCell = (val: string | number | null | undefined) => {
      const str = String(val ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = filteredLoads.map(row => {
      const dt = formatArDateTime(row.event_time);
      const recDt = row.reconciled_at ? formatArDateTime(row.reconciled_at) : null;
      return [
        dt.date,
        dt.time,
        row.account_name,
        row.account_id,
        eventTypeLabel(row.event_type),
        row.currency,
        row.amount.toFixed(2),
        row.old_limit_cents != null ? (row.old_limit_cents / 100).toFixed(2) : '',
        row.new_limit_cents != null ? (row.new_limit_cents / 100).toFixed(2) : '',
        statusMeta(row.reconciliation_status).label,
        row.reconciliation_reference || '',
        row.reconciliation_note || '',
        row.reconciled_by_name || '',
        recDt ? `${recDt.date} ${recDt.time}` : '',
      ]
        .map(escapeCell)
        .join(',');
    });
    const csv = '\uFEFF' + [headers.map(escapeCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cargas-meta-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentBalances = useMemo(() => {
    const map = new Map<string, LiveAccountBalance>();
    for (const acc of liveAccounts) {
      if (acc?.id) map.set(acc.id, acc);
    }
    for (const [id, snap] of Object.entries(syncedSnapshots)) {
      map.set(id, snap);
    }
    return Array.from(map.values());
  }, [liveAccounts, syncedSnapshots]);

  const lastSyncFormatted = summary?.lastSyncedAt ? formatArDateTime(summary.lastSyncedAt) : null;
  const usdTotals = summary?.totalsByCurrency?.USD || {
    count: 0,
    amount: 0,
    verifiedAmount: 0,
    pendingAmount: 0,
    discrepancyAmount: 0,
  };
  const arsTotals = summary?.totalsByCurrency?.ARS || {
    count: 0,
    amount: 0,
    verifiedAmount: 0,
    pendingAmount: 0,
    discrepancyAmount: 0,
  };
  const verifiedPct =
    summary && summary.totalCount > 0
      ? Math.round((summary.verifiedCount / summary.totalCount) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Action Banner */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Historial y Cotejo de Cargas Meta
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Registro persistente en base de datos de todos los pagos acreditados y aumentos de límite por cuenta publicitaria.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastSyncFormatted && (
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              Última sync:{' '}
              <strong className="text-slate-800 font-mono">
                {lastSyncFormatted.date} {lastSyncFormatted.time} hs
              </strong>
            </span>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!filteredLoads.length}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando Meta...' : 'Sincronizar desde Meta'}
          </button>
        </div>
      </div>

      {/* Sync feedback */}
      {syncFeedback && (
        <div
          className={`p-4 rounded-2xl border text-xs space-y-2 ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : syncFeedback.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold">{syncFeedback.message}</p>
            <button
              type="button"
              onClick={() => setSyncFeedback(null)}
              className="opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {syncFeedback.details && syncFeedback.details.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {syncFeedback.details.map(item => (
                <span
                  key={item.accountId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                    item.ok
                      ? 'bg-white/80 border-emerald-200 text-slate-800'
                      : 'bg-white/80 border-rose-200 text-rose-700'
                  }`}
                >
                  <strong>{item.accountName}</strong> ({item.currency}):{' '}
                  {item.ok
                    ? `${item.fetchedLoads} cargas · ${item.inserted} nuevas`
                    : item.error || 'Error'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Current Balance by Account */}
      {currentBalances.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {currentBalances.map(acc => {
            const isSelected = accountFilter === acc.id;
            const remaining = typeof acc.remaining === 'number' && Number.isFinite(acc.remaining) ? acc.remaining : null;
            const spendCap = typeof acc.spendCap === 'number' && Number.isFinite(acc.spendCap) ? acc.spendCap : null;
            const balance = typeof acc.balance === 'number' && Number.isFinite(acc.balance) ? acc.balance : null;
            const lowBalance =
              remaining !== null &&
              ((acc.currency === 'USD' && remaining < 500) ||
                (acc.currency === 'ARS' && remaining < 150000));

            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => setAccountFilter(isSelected ? 'all' : acc.id)}
                className={`text-left p-5 rounded-3xl border shadow-sm transition-all cursor-pointer space-y-2 ${
                  isSelected
                    ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200'
                    : lowBalance
                    ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300'
                    : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-xl text-[11px] font-black border ${
                        acc.currency === 'USD'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}
                    >
                      {acc.name} · {acc.currency}
                    </span>
                    {lowBalance && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                        <AlertTriangle className="w-3 h-3" />
                        Saldo bajo
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                    Saldo actual
                  </span>
                </div>

                {acc.error ? (
                  <p className="text-xs font-semibold text-rose-600">{acc.error}</p>
                ) : (
                  <>
                    <div className={`text-2xl font-black font-mono tracking-tight ${lowBalance ? 'text-rose-700' : 'text-slate-900'}`}>
                      {remaining !== null ? formatMoney(remaining, acc.currency) : 'Sin confirmar'}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-semibold">
                      <span>
                        Disponible hasta límite
                      </span>
                      {spendCap !== null && spendCap > 0 && (
                        <span className="font-mono text-slate-400">
                          Límite: {formatMoney(spendCap, acc.currency)}
                        </span>
                      )}
                    </div>
                    {!acc.isPrepay && balance !== null && balance > 0 && (
                      <div className="text-[11px] text-amber-700 font-semibold font-mono">
                        Pendiente de pago: {formatMoney(balance, acc.currency)}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total USD */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Cargas en USD
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatMoney(usdTotals.amount, 'USD')}
          </div>
          <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between">
            <span>{usdTotals.count} cargas</span>
            <span className="text-emerald-700">
              Cotejadas: {formatMoney(usdTotals.verifiedAmount, 'USD')}
            </span>
          </div>
        </div>

        {/* Total ARS */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Cargas en ARS
            </span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatMoney(arsTotals.amount, 'ARS')}
          </div>
          <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between">
            <span>{arsTotals.count} cargas</span>
            <span className="text-emerald-700">
              Cotejadas: {formatMoney(arsTotals.verifiedAmount, 'ARS')}
            </span>
          </div>
        </div>

        {/* Estado de Cotejo */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Avance de Cotejo
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{verifiedPct}%</span>
            <span className="text-xs font-bold text-slate-400">
              ({summary?.verifiedCount || 0}/{summary?.totalCount || 0})
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${verifiedPct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span className="text-amber-700">Pendientes: {summary?.pendingCount || 0}</span>
            <span className="text-rose-700">Diferencias: {summary?.discrepancyCount || 0}</span>
          </div>
        </div>

        {/* Resumen por Cuenta */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Por Cuenta Publicitaria
            </span>
            <Filter className="w-4 h-4 text-slate-400" />
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-400">Sin cuentas sincronizadas aún.</p>
            ) : (
              accounts.map(acc => {
                const active = accountFilter === acc.accountId;
                return (
                  <button
                    key={acc.accountId}
                    type="button"
                    onClick={() => setAccountFilter(active ? 'all' : acc.accountId)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-50 text-indigo-800 font-black border border-indigo-200'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold'
                    }`}
                  >
                    <span className="truncate">{acc.accountName}</span>
                    <span className="font-mono text-[11px] shrink-0">
                      {formatMoney(acc.amount, acc.currency)} ({acc.count})
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[240px]">
            <ReportDateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
              hideLabel
              emptyLabel="Todas las fechas"
              includeCurrentYear
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-2.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer"
              title="Limpiar rango de fechas"
            >
              Limpiar fechas
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1">
          <select
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas las cuentas</option>
            {accounts.map(acc => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.accountName} ({acc.currency})
              </option>
            ))}
          </select>

          <select
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value as 'all' | MetaCurrency)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas las monedas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | ReconciliationStatus)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="verified">Cotejadas</option>
            <option value="discrepancy">Con diferencia</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar cuenta, referencia, nota o importe..."
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-14 gap-3">
            <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            <p className="text-xs font-bold text-slate-500">Cargando historial de cargas...</p>
          </div>
        ) : filteredLoads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-14 text-center space-y-3">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-2xl">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black text-slate-800">
                No hay cargas registradas para los filtros actuales
              </p>
              <p className="text-xs text-slate-500 max-w-md">
                Hacé clic en <strong>Sincronizar desde Meta</strong> para importar el historial de cargas de las cuentas publicitarias a la base de datos.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar ahora
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Fecha y Hora (AR)</th>
                  <th className="py-3.5 px-4">Cuenta</th>
                  <th className="py-3.5 px-4">Tipo de Carga</th>
                  <th className="py-3.5 px-4 text-right">Importe</th>
                  <th className="py-3.5 px-4">Estado Cotejo</th>
                  <th className="py-3.5 px-4">Referencia / Notas</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLoads.map(row => {
                  const dt = formatArDateTime(row.event_time);
                  const recDt = row.reconciled_at ? formatArDateTime(row.reconciled_at) : null;
                  const meta = statusMeta(row.reconciliation_status);
                  const StatusIcon = meta.Icon;
                  const isBusy = savingId === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-black text-slate-900 font-mono">{dt.date}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{dt.time} hs</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black text-[11px] border ${
                            row.currency === 'USD'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {row.account_name} · {row.currency}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {row.account_id}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">
                          {eventTypeLabel(row.event_type)}
                        </div>
                        {row.old_limit_cents != null && row.new_limit_cents != null && (
                          <div className="text-[10.5px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <span>{formatMoney(row.old_limit_cents / 100, row.currency)}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span>{formatMoney(row.new_limit_cents / 100, row.currency)}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="font-black text-sm font-mono text-slate-900">
                          +{formatMoney(row.amount, row.currency)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold ${meta.badge}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {meta.label}
                        </span>
                        {row.reconciled_by_name && recDt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {row.reconciled_by_name} · {recDt.date} {recDt.time}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-[260px]">
                        {row.reconciliation_reference ? (
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{row.reconciliation_reference}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-[11px]">Sin referencia</span>
                        )}
                        {row.reconciliation_note && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {row.reconciliation_note}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickVerify(row)}
                            disabled={isBusy}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 ${
                              row.reconciliation_status === 'verified'
                                ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title={
                              row.reconciliation_status === 'verified'
                                ? 'Volver a pendiente'
                                : 'Marcar como cotejada'
                            }
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            {row.reconciliation_status === 'verified' ? 'Desmarcar' : 'Cotejar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            disabled={isBusy}
                            className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors cursor-pointer"
                            title="Editar estado, referencia o nota de cotejo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reconciliation Edit Modal */}
      {editingLoad && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingLoad(null)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Cotejar Carga de Meta</h3>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {editingLoad.account_name} · +{formatMoney(editingLoad.amount, editingLoad.currency)} ·{' '}
                  {formatArDateTime(editingLoad.event_time).date}{' '}
                  {formatArDateTime(editingLoad.event_time).time} hs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLoad(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700">Estado de cotejo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['verified', 'Cotejada', 'bg-emerald-50 border-emerald-400 text-emerald-800'],
                      ['pending', 'Pendiente', 'bg-amber-50 border-amber-400 text-amber-800'],
                      ['discrepancy', 'Con diferencia', 'bg-rose-50 border-rose-400 text-rose-800'],
                    ] as const
                  ).map(([value, label, activeClass]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditStatus(value)}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        editStatus === value
                          ? activeClass
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700">
                  Referencia / Comprobante / Código ERP
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={editReference}
                  onChange={e => setEditReference(e.target.value)}
                  placeholder="Ej: Transferencia #4582, RedotPay, MOV-1234..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700">
                  Notas de cotejo
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Observaciones, diferencia detectada, tipo de cambio aplicado..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLoad(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingId === editingLoad.id}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {savingId === editingLoad.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Guardar cotejo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
