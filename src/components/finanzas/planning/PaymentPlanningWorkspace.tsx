'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Download, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { validDate, type Balance, type Fund, type Item, type ProjectionRow, type Realization, type Reservation, type ScenarioRate, type Transfer } from '@/lib/paymentPlanning/model';
import PlanningImportPreview from './PlanningImportPreview';
import PlanningDateInput from './PlanningDateInput';
import RealizePlanningModal from './RealizePlanningModal';
import PlanningWeekBoard from './PlanningWeekBoard';

const api = createAuthenticatedRequester(supabase);
type Snapshot = { funds: Fund[]; balances: Balance[]; items: Item[]; realizations: Realization[]; reservations: Reservation[]; transfers: Transfer[]; rates: ScenarioRate[]; recurrences: { id: string; fund_id: string; title: string; cadence: string; active: boolean }[]; projection: ProjectionRow[]; today: string; from: string; to: string; canImport: boolean; importedSource: { source_hash: string; source_name: string; created_at: string } | null; projectionReliableFrom: string | null; historicalOpenings: { fund_id: string; date: string; opening: number }[]; incomeEntries: { fund_id: string; date: string; title: string; amount: number; origin: 'sheet' | 'scenario' }[]; reserveEntries: { fund_id: string; date: string; title: string; amount: number; kind: 'reserve' | 'release'; origin: 'sheet' | 'planned' }[]; unanchoredFunds: string[] };
type View = 'semana' | 'tabla' | 'proyeccion';
type ItemForm = { id?: string; version?: number; kind: 'expense' | 'income'; fund_id: string; title: string; amount: string; scheduled_date: string; due_date: string; priority: 'normal' | 'high'; status: 'active' | 'draft'; notes: string };

const dateAt = (date: string, offset: number) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateNumber = (value: string) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '';
const parseDateNumber = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return validDate(iso) ? iso : null;
};
const money = (amount: number, currency: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
const dateLabel = dateNumber;
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Argentina/Buenos_Aires' }).format(new Date(value));
const rowStatus = (item: Item, realized: number, today: string) => item.status === 'cancelled' ? 'Cancelado' : item.status === 'draft' ? 'Borrador'
  : item.amount === null ? 'A confirmar' : realized >= Number(item.amount) ? 'Realizado' : realized + Number(item.closed_amount || 0) >= Number(item.amount) ? 'Cerrado' : realized > 0 ? 'Parcial'
    : item.scheduled_date && item.scheduled_date < today ? 'Atrasado' : item.scheduled_date ? 'Programado' : 'Sin programar';
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

function Segmented({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  return <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-sm">
    {([['semana','Semana'],['tabla','Tabla'],['proyeccion','Proyección']] as const).map(([id,label]) =>
      <button key={id} onClick={() => onChange(id)} className={`rounded-lg px-3 py-1.5 font-medium transition ${value === id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
  </div>;
}

function PeriodStart({ value, onChange, ariaLabel = 'Inicio del período, día mes año', className = '' }: { value: string; onChange: (date: string) => void; ariaLabel?: string; className?: string }) {
  const [draft, setDraft] = useState(() => dateNumber(value));
  return <div className={`flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm ${className}`}>
    <input type="text" aria-label={ariaLabel} inputMode="numeric" placeholder="dd/mm/aaaa"
      value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={() => { const parsed = parseDateNumber(draft); if (parsed) onChange(parsed); else setDraft(dateNumber(value)); }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      className="w-[82px] bg-transparent tabular-nums outline-none" />
    <span className="relative flex h-5 w-5 items-center justify-center text-slate-500">
      <CalendarDays size={15} aria-hidden="true" />
      <input type="date" aria-label={`Elegir ${ariaLabel}`} value={value} onChange={event => { if (event.target.value) onChange(event.target.value); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
  </div>;
}

export default function PaymentPlanningWorkspace() {
  const [from, setFrom] = useState(() => dateAt(todayAR(), -1));
  const [days, setDays] = useState(7);
  const to = dateAt(from, days - 1);
  const [view, setView] = useState<View>('semana');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [fundFilter, setFundFilter] = useState('all');
  const [showZono, setShowZono] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<'ARS' | 'USD'>('ARS');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showImport, setShowImport] = useState(false);
  const [showRecurrences, setShowRecurrences] = useState(false);
  const [recurrence, setRecurrence] = useState({ title:'', kind:'expense', amount:'', fund_id:'', cadence:'weekly', weekdays:[1,2,3,4,5], month_day:1, start_date:todayAR(), end_date:'' });
  const [form, setForm] = useState<ItemForm | null>(null);
  const [move, setMove] = useState<{ item: Item; date: string; fundId: string } | null>(null);
  const [details, setDetails] = useState<{ events: { id: number; action: string; reason: string | null; created_at: string }[]; realizations: (Realization & { notes?: string; reversal_reason?: string })[]; sourceRows: { sheet_row: number; source_date: string; match_status: string; candidate_count: number; notes: string }[] } | null>(null);
  const [action, setAction] = useState<{ kind: 'realize' | 'reverse' | 'close_remaining' | 'reopen_remaining' | 'balance' | 'reserve' | 'rate' | 'transfer' | 'installments'; item?: Item; realizationId?: string } | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionDate, setActionDate] = useState(() => todayAR());
  const [actionNote, setActionNote] = useState('');
  const [actionFund, setActionFund] = useState('');
  const [actionDestFund, setActionDestFund] = useState('');
  const [actionTargetItem, setActionTargetItem] = useState('');
  const [actionReserved, setActionReserved] = useState('');
  const [reserveKind, setReserveKind] = useState<'reserve' | 'release'>('reserve');
  const [rateValues, setRateValues] = useState({ title: '', optimistic: '', intermediate: '', pessimistic: '' });
  const [installments, setInstallments] = useState({title:'',kind:'expense',count:3});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api(`/api/admin/payment-planning?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Snapshot;
      setSnapshot(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la planificación.'); }
    finally { setLoading(false); }
  }, [from,to]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !form && !action) void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load,form,action]);

  const mutate = async (name: string, payload: Record<string, unknown>) => {
    setWorking(true); setError('');
    try {
      await api('/api/admin/payment-planning', { method: 'POST', body: JSON.stringify({ action: name, key: crypto.randomUUID(), payload }) });
      await load();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); return false; }
    finally { setWorking(false); }
  };

  const fundMap = useMemo(() => new Map(snapshot?.funds.map(fund => [fund.id,fund]) || []), [snapshot]);
  const realizedMap = useMemo(() => {
    const result = new Map<string,number>();
    for (const row of snapshot?.realizations || []) if (!row.reversed_at) result.set(row.item_id,(result.get(row.item_id) || 0)+Number(row.amount));
    return result;
  }, [snapshot]);
  const realizationDates = useMemo(() => {
    const result = new Map<string,string>();
    for (const row of snapshot?.realizations || []) if (!row.reversed_at && row.effective_date > (result.get(row.item_id) || '')) result.set(row.item_id,row.effective_date);
    return result;
  }, [snapshot]);
  const availableFunds = snapshot?.funds.filter(fund => showZono || fund.kind !== 'company') || [];
  const selectableFunds = availableFunds.filter(fund => fund.currency === currencyFilter);
  const visibleFunds = selectableFunds.filter(fund => fundFilter === 'all' || fund.id === fundFilter);
  const visibleFundIds = new Set(visibleFunds.map(fund => fund.id));
  const reviewCount = snapshot?.items.filter(item => visibleFundIds.has(item.fund_id) && item.status === 'draft').length || 0;
  const shown = (snapshot?.items || []).filter(item => {
    if (!visibleFundIds.has(item.fund_id)) return false;
    if (statusFilter === 'active' && item.status !== 'active') return false;
    if (statusFilter === 'review' && item.status !== 'draft') return false;
    if (statusFilter === 'unplanned' && item.scheduled_date) return false;
    if (statusFilter === 'done' && rowStatus(item,realizedMap.get(item.id) || 0,snapshot?.today || todayAR()) !== 'Realizado') return false;
    if (search && !`${item.title} ${item.notes || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))) return false;
    return item.scheduled_date === null || (item.scheduled_date >= from && item.scheduled_date <= to)
      || (item.status === 'active' && item.scheduled_date < from && (item.amount === null || Number(item.amount) > (realizedMap.get(item.id) || 0)+Number(item.closed_amount||0)
        || ((realizationDates.get(item.id) || '') >= from && (realizationDates.get(item.id) || '') <= to)));
  }).sort((a,b) => (a.scheduled_date || '9999').localeCompare(b.scheduled_date || '9999') || a.title.localeCompare(b.title,'es') || a.id.localeCompare(b.id));
  const reliable = (date: string) => !snapshot?.projectionReliableFrom || date >= snapshot.projectionReliableFrom;
  const rows = (snapshot?.projection || []).filter(row => visibleFundIds.has(row.fund_id));
  const historicalIncome = (date: string, fundId: string) => (snapshot?.incomeEntries || [])
    .filter(entry => entry.origin === 'sheet' && entry.date === date && entry.fund_id === fundId)
    .reduce((total, entry) => total + entry.amount, 0);
  const historicalProjection = !!snapshot?.projectionReliableFrom && from < snapshot.projectionReliableFrom;

  const openNew = (kind: 'expense' | 'income') => setForm({ kind, fund_id: visibleFunds[0]?.id || '', title: '', amount: '', scheduled_date: snapshot?.today || todayAR(), due_date: '', priority: 'normal', status: 'active', notes: '' });
  const moveItem = async (item: Item, date: string, fundId: string) => {
    if (item.scheduled_date === date && item.fund_id === fundId) return true;
    const ok = await mutate('move_item', { id: item.id, version: item.version, scheduled_date: date,
      fund_id: fundId, reason: 'Reprogramado desde la agenda' });
    if (ok) {
      setMove(null);
      setNotice(`${item.title}: ${dateLabel(date)} · ${fundMap.get(fundId)?.name || 'caja actualizada'}`);
    }
    return ok;
  };
  const openRealize = (item: Item) => {
    setError('');
    setAction({ kind: 'realize', item });
    setActionAmount(item.amount === null ? '' : String(Math.max(0, Number(item.amount) - (realizedMap.get(item.id) || 0) - Number(item.closed_amount || 0))));
    setActionFund(item.fund_id);
    setActionDate(snapshot?.today || todayAR());
    setActionNote('');
  };
  const openEdit = (item: Item) => {
    setDetails(null);
    setForm({ id: item.id, version: item.version, kind: item.kind, fund_id: item.fund_id,
      title: item.title, amount: item.amount === null ? '' : String(item.amount), scheduled_date: item.scheduled_date || '',
      due_date: item.due_date || '', priority: item.priority, status: item.status === 'draft' ? 'draft' : 'active', notes: item.notes || '' });
    void api(`/api/admin/payment-planning?itemId=${encodeURIComponent(item.id)}`).then(result=>setDetails(result)).catch(()=>setDetails(null));
  };
  const saveForm = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form) return;
    const ok = await mutate(form.id ? 'update_item' : 'create_item', { ...form, amount: form.amount || null, scheduled_date: form.scheduled_date || null, due_date: form.due_date || null });
    if (ok) setForm(null);
  };
  const runAction = async (event: React.FormEvent) => {
    event.preventDefault(); if (!action) return;
    let ok = false;
    if (action.kind === 'realize' && action.item) ok = await mutate('realize', { item_id: action.item.id, amount: actionAmount, effective_date: actionDate, fund_id: actionFund || action.item.fund_id, notes: actionNote });
    if (action.kind === 'reverse' && action.realizationId) ok = await mutate('reverse_realization', { id: action.realizationId, reason: actionNote });
    if (action.kind === 'close_remaining' && action.item) ok = await mutate('close_remaining', { id: action.item.id, reason: actionNote });
    if (action.kind === 'reopen_remaining' && action.item) ok = await mutate('reopen_remaining', { id: action.item.id, reason: actionNote });
    if (action.kind === 'installments') ok = await mutate('create_installments', {fund_id:actionFund,kind:installments.kind,title:installments.title,total_amount:actionAmount,count:installments.count,first_date:actionDate,notes:actionNote});
    if (action.kind === 'balance') ok = await mutate('observe_balance', { fund_id: actionFund, amount: actionAmount, reserved_amount: actionReserved || '0', effective_date: actionDate, notes: actionNote });
    if (action.kind === 'reserve') ok = await mutate('reservation', { fund_id: actionFund, kind: reserveKind, amount: actionAmount, effective_date: actionDate, notes: actionNote, target_item_id: actionTargetItem || null });
    if (action.kind === 'transfer') ok = await mutate('transfer', { source_fund_id: actionFund, destination_fund_id: actionDestFund, amount: actionAmount, effective_date: actionDate, notes: actionNote });
    if (action.kind === 'rate') ok = await mutate('create_rate', { fund_id: actionFund, title: rateValues.title, valid_from: actionDate, weekdays: [1,2,3,4,5,6], optimistic: rateValues.optimistic, intermediate: rateValues.intermediate, pessimistic: rateValues.pessimistic });
    if (ok) { setAction(null); setActionAmount(''); setActionNote(''); setActionTargetItem(''); }
  };
  const changeScenario = async (fund: Fund, scenario: string) => { await mutate('scenario', { fund_id: fund.id, scenario }); };
  const importRows = async (payload: { source_hash: string; source_name: string; rows: unknown[] }) => {
    await api('/api/admin/payment-planning', { method:'POST', body:JSON.stringify({action:'import_rows',key:crypto.randomUUID(),payload}) });
    await load();
  };
  const saveRecurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await mutate('create_recurrence', recurrence)) setRecurrence({...recurrence,title:'',amount:''});
  };
  const exportCsv = () => {
    const lines = [['Fecha programada','Vencimiento','Tipo','Detalle','Fondo','Moneda','Importe','Realizado','Pendiente','Estado','Notas'].map(csvCell).join(',')];
    for (const item of shown) {
      const realized = realizedMap.get(item.id) || 0;
      lines.push([item.scheduled_date,item.due_date,item.kind === 'income' ? 'Ingreso' : 'Pago',item.title,fundMap.get(item.fund_id)?.name,fundMap.get(item.fund_id)?.currency,
        item.amount,realized,item.amount === null ? '' : Math.max(0,Number(item.amount)-realized-Number(item.closed_amount||0)),rowStatus(item,realized,snapshot?.today || todayAR()),item.notes].map(csvCell).join(','));
    }
    const blob = new Blob(['\uFEFF'+lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=`planificacion-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="mx-auto max-w-[1600px] space-y-6 p-4 text-slate-900 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Tesorería y Finanzas</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Planificación de pagos</h1><p className="mt-1 text-sm text-slate-500">Pagos, ingresos y disponibilidad prevista por fondo.</p></div>
      <div className="flex flex-wrap gap-2"><button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => openNew('income')}>Nuevo ingreso</button><button className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" onClick={() => openNew('expense')}><Plus size={16}/> Nuevo pago</button></div>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0"/>{error}</div>}
    {notice && <div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"><span>Movimiento reprogramado: {notice}</span><button onClick={() => setNotice('')} aria-label="Cerrar aviso" className="p-1"><X size={16}/></button></div>}
    {reviewCount > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>{reviewCount} registros históricos de las cajas visibles requieren conciliación con Movimientos.</span><button className="font-semibold underline" onClick={()=>{setFrom('2026-09-01');setDays(30);setView('tabla');setStatusFilter('review');setCurrencyFilter('ARS');setFundFilter('all')}}>Revisar borradores</button></div>}
    {historicalProjection && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La conciliación histórica anterior al {dateNumber(snapshot?.projectionReliableFrom || '')} es parcial. Las aperturas, ingresos y movimientos de reserva marcados «Hoja» son valores de la planilla original; el disponible histórico sigue oculto. La proyección desde esa fecha parte del cierre observado de la planilla.</div>}
    {snapshot?.unanchoredFunds.some(id => visibleFundIds.has(id)) ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Falta cargar un saldo de apertura para {snapshot.unanchoredFunds.filter(id => visibleFundIds.has(id)).map(id => fundMap.get(id)?.name).join(', ')}. Cargá un saldo observado antes del inicio del período para ver una proyección confiable.</div> : null}

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2"><button aria-label="Período anterior" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setFrom(dateAt(from,-days))}><ArrowLeft size={18}/></button><PeriodStart key={from} value={from} onChange={setFrom}/><span className="text-sm tabular-nums text-slate-500">a {dateNumber(to)}</span><button aria-label="Período siguiente" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setFrom(dateAt(from,days))}><ArrowRight size={18}/></button><select aria-label="Duración" value={days} onChange={event => {const next=Number(event.target.value);setDays(next);if(next>7)setView('tabla');}} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Moneda" value={currencyFilter} onChange={event => { setCurrencyFilter(event.target.value as 'ARS' | 'USD'); setFundFilter('all'); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option value="ARS">ARS</option><option value="USD">USD</option></select>
        <select aria-label="Fondo" value={fundFilter} onChange={event => setFundFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option value="all">Todas las cajas visibles</option>{selectableFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select>
        {snapshot?.funds.some(fund => fund.kind === 'company') && <button type="button" aria-pressed={showZono} onClick={() => { if (showZono && fundMap.get(fundFilter)?.kind === 'company') setFundFilter('all'); setShowZono(!showZono); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{showZono ? 'Ocultar Cuentas ZONO' : 'Mostrar Cuentas ZONO'}</button>}
        <Segmented value={view} onChange={next => { setView(next); if (next === 'semana') setStatusFilter('active'); }}/>
        <button title="Actualizar" aria-label="Actualizar" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => void load()}><RefreshCw size={17}/></button>
      </div>
    </div>

    {loading && !snapshot ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={20}/> Cargando planificación…</div> : snapshot && <>
      <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-slate-600">Configurar escenarios y saldos de apertura</summary>
        <div className="mt-3 flex flex-wrap gap-3">{visibleFunds.map(fund => <div key={fund.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <span className="font-medium">{fund.name}</span>
          <select aria-label={`Escenario de ${fund.name}`} value={fund.scenario} onChange={event => void changeScenario(fund,event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs"><option value="optimista">Optimista</option><option value="intermedio">Intermedio</option><option value="pesimista">Pesimista</option></select>
          <button className="text-xs font-medium text-teal-700 hover:underline" onClick={() => { setAction({kind:'balance'}); setActionFund(fund.id); setActionDate(snapshot.today); setActionReserved(String(rows.find(row=>row.fund_id===fund.id&&row.date===snapshot.today)?.reserved ?? 0)); }}>Cargar saldo</button>
        </div>)}</div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2 text-sm"><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={() => { setAction({kind:'reserve'}); setActionFund(visibleFunds[0]?.id || ''); setActionDate(snapshot.today); }}>Reserva</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={() => { setAction({kind:'transfer'}); setActionFund(visibleFunds[0]?.id || ''); setActionDestFund(visibleFunds[1]?.id || ''); setActionDate(snapshot.today); }}>Transferencia</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={() => { setAction({kind:'rate'}); setActionFund(visibleFunds[0]?.id || ''); setActionDate(snapshot.today); }}>Ingreso por escenario</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={() => {setShowRecurrences(!showRecurrences);setRecurrence({...recurrence,fund_id:visibleFunds[0]?.id||''});}}>Rutinas</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={()=>{setAction({kind:'installments'});setActionFund(visibleFunds[0]?.id||'');setActionDate(snapshot.today)}}>Cuotas</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" disabled={!snapshot.canImport} title={snapshot.canImport?'Importar planilla':'La captura ya fue importada; una nueva requiere conciliación'} onClick={()=>setShowImport(true)}>{snapshot.canImport?'Importar':'Captura cargada'}</button><button className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50" onClick={exportCsv}><Download size={15}/> Exportar</button></div>{rows.some(row => row.free<0 && (!snapshot.projectionReliableFrom || row.date >= snapshot.projectionReliableFrom)) && <p className="flex items-center gap-1 text-sm font-medium text-rose-700"><AlertCircle size={16}/> Hay días con disponible negativo</p>}</div>

      {showRecurrences && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold">Rutinas de pagos e ingresos</h2><p className="mb-3 text-sm text-slate-500">Generá las ocurrencias hasta el fin del período visible. Repetir la acción no las duplica.</p><div className="grid gap-4 lg:grid-cols-2"><form onSubmit={saveRecurrence} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium sm:col-span-2">Detalle<input required minLength={2} value={recurrence.title} onChange={event=>setRecurrence({...recurrence,title:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"/></label><label className="text-xs font-medium">Tipo<select value={recurrence.kind} onChange={event=>setRecurrence({...recurrence,kind:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"><option value="expense">Pago</option><option value="income">Ingreso</option></select></label><label className="text-xs font-medium">Importe<input required type="number" min="0" step="0.01" value={recurrence.amount} onChange={event=>setRecurrence({...recurrence,amount:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"/></label><label className="text-xs font-medium">Fondo<select value={recurrence.fund_id} onChange={event=>setRecurrence({...recurrence,fund_id:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">{availableFunds.map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label><label className="text-xs font-medium">Frecuencia<select value={recurrence.cadence} onChange={event=>setRecurrence({...recurrence,cadence:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option></select></label>{recurrence.cadence==='monthly'?<label className="text-xs font-medium">Día del mes<input type="number" min="1" max="31" value={recurrence.month_day} onChange={event=>setRecurrence({...recurrence,month_day:Number(event.target.value)})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"/></label>:<label className="text-xs font-medium sm:col-span-2">Días (lun a dom)<span className="mt-1 flex flex-wrap gap-1">{['L','M','X','J','V','S','D'].map((label,index)=><button type="button" key={index} onClick={()=>setRecurrence({...recurrence,weekdays:recurrence.weekdays.includes(index+1)?recurrence.weekdays.filter(day=>day!==index+1):[...recurrence.weekdays,index+1]})} className={`h-8 w-8 rounded-lg text-xs ${recurrence.weekdays.includes(index+1)?'bg-teal-700 text-white':'border border-slate-200 bg-white'}`}>{label}</button>)}</span></label>}<label className="text-xs font-medium">Desde<PlanningDateInput key={recurrence.start_date} required value={recurrence.start_date} onChange={value=>setRecurrence({...recurrence,start_date:value})} label="Desde"/></label><label className="text-xs font-medium">Hasta (opcional)<PlanningDateInput key={recurrence.end_date} value={recurrence.end_date} onChange={value=>setRecurrence({...recurrence,end_date:value})} label="Hasta"/></label><button disabled={working} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white sm:col-span-2">Crear rutina</button></form><div className="space-y-2">{snapshot.recurrences.filter(rule=>visibleFundIds.has(rule.fund_id)).map(rule=><div key={rule.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-medium">{rule.title}</p><p className="text-xs text-slate-500">{fundMap.get(rule.fund_id)?.name} · {rule.cadence}</p></div><button disabled={working} onClick={()=>void mutate('generate_recurrence',{id:rule.id,through_date:to})} className="rounded-lg border border-teal-200 px-3 py-2 text-xs font-medium text-teal-800 disabled:opacity-50">Generar hasta {dateNumber(to)}</button></div>)}{!snapshot.recurrences.some(rule=>visibleFundIds.has(rule.fund_id))&&<p className="text-sm text-slate-500">Todavía no hay rutinas.</p>}</div></div></section>}

      {rows.some(row=>row.missing>0 || row.overdue>0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay importes a confirmar o compromisos atrasados. Revisalos en la tabla antes de tomar los saldos proyectados como cobertura completa.</div>}
      {view === 'semana' && <PlanningWeekBoard
        dates={Array.from({ length: days }, (_, offset) => dateAt(from, offset))}
        funds={visibleFunds} items={shown} rows={rows} realized={realizedMap} realizationDates={realizationDates}
        today={snapshot.today} reliableFrom={snapshot.projectionReliableFrom} historicalOpenings={snapshot.historicalOpenings || []} incomeEntries={snapshot.incomeEntries || []} reserveEntries={snapshot.reserveEntries || []}
        unanchoredFunds={snapshot.unanchoredFunds} working={working} error={error}
        onOpen={openEdit} onMoveDialog={item => setMove({ item, date: item.scheduled_date || snapshot.today, fundId: item.fund_id })} onRealize={openRealize}
        onMove={moveItem}
      />}

      {view === 'tabla' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"><div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-2"><Search size={16} className="text-slate-400"/><input aria-label="Buscar" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar detalle o nota" className="w-full py-2 text-sm outline-none"/></div><select aria-label="Estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm"><option value="active">Activos</option><option value="review">Borradores por conciliar</option><option value="all">Todos</option><option value="unplanned">Sin programar</option><option value="done">Realizados</option></select><span className="text-xs text-slate-500">{shown.length} ítems</span></div><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Detalle</th><th className="px-4 py-3">Fondo</th><th className="px-4 py-3 text-right">Previsto</th><th className="px-4 py-3 text-right">Pendiente</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{shown.map(item=>{const realized=realizedMap.get(item.id)||0; const status=rowStatus(item,realized,snapshot.today); const unit=fundMap.get(item.fund_id)?.currency||'ARS'; return <tr key={item.id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.scheduled_date?dateLabel(item.scheduled_date):'Sin fecha'}</td><td className="max-w-80 px-4 py-3"><button onClick={()=>openEdit(item)} className="block truncate text-left font-medium hover:text-teal-700">{item.title}</button><span className="text-xs text-slate-500">{item.kind==='income'?'Ingreso':'Pago'}{item.due_date?` · vence ${dateNumber(item.due_date)}`:''}</span></td><td className="px-4 py-3 text-slate-600">{fundMap.get(item.fund_id)?.name}</td><td className="px-4 py-3 text-right tabular-nums">{item.amount===null?'A confirmar':money(Number(item.amount),unit)}</td><td className="px-4 py-3 text-right tabular-nums">{item.amount===null?'—':money(Math.max(0,Number(item.amount)-realized-Number(item.closed_amount||0)),unit)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${status==='Atrasado'?'bg-rose-100 text-rose-800':status==='Realizado'?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-700'}`}>{status}</span></td><td className="px-4 py-3 text-right"><button disabled={item.status!=='active'||item.amount===null||realized+Number(item.closed_amount||0)>=Number(item.amount)} onClick={()=>openRealize(item)} className="text-xs font-medium text-teal-700 disabled:opacity-30">Realizar</button></td></tr>;})}{!shown.length&&<tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No hay registros para este período y filtro.</td></tr>}</tbody></table></div></div>}

      {view === 'proyeccion' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h2 className="font-semibold">Proyección diaria</h2><p className="text-sm text-slate-500">Cada fondo conserva su propio escenario y saldo observado.</p></div><div className="overflow-x-auto"><table className="min-w-[750px] w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 text-left">Día</th><th className="px-4 py-3 text-left">Fondo</th><th className="px-4 py-3 text-right">Apertura</th><th className="px-4 py-3 text-right">Ingresos</th><th className="px-4 py-3 text-right">Pagos</th><th className="px-4 py-3 text-right">Reservado</th><th className="px-4 py-3 text-right">Disponible</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row=>{const unit=fundMap.get(row.fund_id)?.currency||'ARS';return <tr key={`${row.fund_id}:${row.date}`} className={row.free<0 && reliable(row.date)?'bg-rose-50':''}><td className="px-4 py-2.5">{dateLabel(row.date)}</td><td className="px-4 py-2.5">{fundMap.get(row.fund_id)?.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{snapshot.unanchoredFunds.includes(row.fund_id)||!reliable(row.date)?'—':money(row.opening,unit)}</td><td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{money(row.income + (!reliable(row.date) ? historicalIncome(row.date, row.fund_id) : 0),unit)}</td><td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{money(row.expense,unit)}</td><td className="px-4 py-2.5 text-right tabular-nums">{money(row.reserved,unit)}</td><td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.free<0 && reliable(row.date)?'text-rose-700':''}`}>{snapshot.unanchoredFunds.includes(row.fund_id)||!reliable(row.date)?'—':money(row.free,unit)}</td></tr>})}</tbody></table></div></div>}
    </>}

    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event=>{if(event.target===event.currentTarget)setForm(null)}}><form onSubmit={saveForm} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex justify-between"><div><h2 className="text-xl font-semibold">{form.id?'Editar':'Nuevo'} {form.kind==='income'?'ingreso':'pago'}</h2><p className="text-sm text-slate-500">La realización se registra por separado.</p></div><button type="button" aria-label="Cerrar" onClick={()=>setForm(null)}><X size={19}/></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-medium">Detalle<input autoFocus required minLength={2} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label><label className="text-sm font-medium">Fondo<select disabled={!!form.id} required value={form.fund_id} onChange={event=>setForm({...form,fund_id:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">{availableFunds.map(fund=><option key={fund.id} value={fund.id}>{fund.name} ({fund.currency})</option>)}</select></label><label className="text-sm font-medium">Importe previsto<input type="number" min="0" step="0.01" value={form.amount} onChange={event=>setForm({...form,amount:event.target.value})} placeholder="A confirmar" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label><label className="text-sm font-medium">Fecha programada<PlanningDateInput key={form.scheduled_date} value={form.scheduled_date} onChange={value=>setForm({...form,scheduled_date:value})} label="Fecha programada"/></label><label className="text-sm font-medium">Vencimiento<PlanningDateInput key={form.due_date} value={form.due_date} onChange={value=>setForm({...form,due_date:value})} label="Vencimiento"/></label><label className="text-sm font-medium">Prioridad<select value={form.priority} onChange={event=>setForm({...form,priority:event.target.value as 'normal'|'high'})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="normal">Normal</option><option value="high">Alta</option></select></label><label className="text-sm font-medium">Estado<select value={form.status} onChange={event=>setForm({...form,status:event.target.value as 'active'|'draft'})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="active">Activo para planificar</option><option value="draft">Borrador por conciliar</option></select></label><label className="sm:col-span-2 text-sm font-medium">Notas<textarea value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label></div>{form.id && details && <div className="mt-5 space-y-3 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Origen y conciliación</h3>{details.sourceRows?.map(row=><p key={row.sheet_row} className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Actual fila {row.sheet_row} · {row.match_status==='confirmed'?'Conciliado con Movimiento':row.match_status==='forecast'?'Previsión activa':'Pendiente de revisión'}{row.match_status==='review'?` · ${row.candidate_count} candidatos por fecha e importe`:''}</p>)}<h3 className="pt-2 text-sm font-semibold">Realizaciones e historial</h3>{details.realizations.length ? details.realizations.map(row=><div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span>{dateNumber(row.effective_date)} · {money(Number(row.amount),fundMap.get(row.fund_id)?.currency||'ARS')}{row.reversed_at?' · Revertido':row.cash_transaction_id?' · Vinculado a Movimiento':''}</span>{!row.reversed_at && <button type="button" className="font-medium text-rose-700" onClick={()=>{setForm(null);setAction({kind:'reverse',realizationId:row.id});setActionNote('')}}>Revertir</button>}</div>) : <p className="text-xs text-slate-500">Todavía no hay realizaciones.</p>}{details.events.slice(0,8).map(event=><p key={event.id} className="text-xs text-slate-500">{dateTimeLabel(event.created_at)} · {event.action}{event.reason?` · ${event.reason}`:''}</p>)}{(() => {const item=snapshot?.items.find(row=>row.id===form.id);const realized=realizedMap.get(form.id)||0;return item && item.status==='active' && item.amount!==null && Number(item.amount)>realized+Number(item.closed_amount||0) ? <button type="button" className="text-xs font-medium text-amber-800" onClick={()=>{setForm(null);setAction({kind:'close_remaining',item});setActionNote('')}}>Cerrar importe pendiente</button> : null})()}{(() => {const item=snapshot?.items.find(row=>row.id===form.id);return item && Number(item.closed_amount||0)>0 ? <button type="button" className="ml-3 text-xs font-medium text-teal-800" onClick={()=>{setForm(null);setAction({kind:'reopen_remaining',item});setActionNote('')}}>Reabrir remanente</button> : null})()}</div>}<div className="mt-5 flex items-center justify-between gap-2">{form.id?<button type="button" disabled={working} onClick={async()=>{if(await mutate('cancel_item',{id:form.id,version:form.version,reason:'Cancelado desde planificación'}))setForm(null)}} className="text-sm font-medium text-rose-700">Cancelar ítem</button>:<span/>}<div className="flex gap-2"><button type="button" onClick={()=>setForm(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button><button disabled={working} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working?'Guardando…':'Guardar'}</button></div></div></form></div>}
    {move && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event => { if (event.target === event.currentTarget) setMove(null); }}>
      <form onSubmit={async event => { event.preventDefault(); await moveItem(move.item, move.date, move.fundId); }} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Mover movimiento</h2><p className="text-sm text-slate-500">{move.item.title}</p></div><button type="button" aria-label="Cerrar" onClick={() => setMove(null)}><X size={19}/></button></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">Nuevo día<PlanningDateInput key={move.date} required min={snapshot?.today} value={move.date} onChange={value => setMove({ ...move, date: value })} label="Nuevo día"/></label>
        <label className="block text-sm font-medium">Caja<select required value={move.fundId} onChange={event => setMove({ ...move, fundId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">{availableFunds.filter(fund => fund.active && fund.currency === fundMap.get(move.item.fund_id)?.currency).map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>
        <p className="text-xs text-slate-500">Se mueve el importe pendiente. Las realizaciones y el vencimiento original se conservan.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setMove(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button><button disabled={working} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working ? 'Guardando…' : 'Mover'}</button></div>
      </form>
    </div>}

    {action?.kind === 'realize' && action.item && <RealizePlanningModal
      key={action.item.id} item={action.item} sourceFund={fundMap.get(action.item.fund_id)!}
      funds={availableFunds} initialAmount={actionAmount} initialDate={actionDate}
      working={working} error={error} onClose={() => setAction(null)} onSave={mutate}
    />}
    {action && !['realize','reverse','close_remaining','reopen_remaining','installments'].includes(action.kind) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event=>{if(event.target===event.currentTarget)setAction(null)}}><form onSubmit={runAction} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex justify-between"><h2 className="text-lg font-semibold">{action.kind==='realize'?'Registrar realización':action.kind==='balance'?'Saldo observado':action.kind==='reserve'?'Reserva interna':action.kind==='transfer'?'Transferencia prevista':'Ingreso por escenario'}</h2><button type="button" aria-label="Cerrar" onClick={()=>setAction(null)}><X size={19}/></button></div>{action.kind==='realize' && <p className="mb-3 text-xs text-slate-500">Confirmá importe, fecha y caja. La conciliación con Movimientos se revisa por separado.</p>}{error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}<div className="space-y-3">{action.kind==='reserve'&&<label className="block text-sm font-medium">Operación<select value={reserveKind} onChange={event=>setReserveKind(event.target.value as 'reserve'|'release')} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="reserve">Reservar</option><option value="release">Liberar</option></select></label>}{action.kind==='rate'&&<label className="block text-sm font-medium">Concepto<input required minLength={2} value={rateValues.title} onChange={event=>setRateValues({...rateValues,title:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>}<label className="block text-sm font-medium">{action.kind==='transfer'?'Desde':'Fondo'}<select value={actionFund} onChange={event=>setActionFund(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">{availableFunds.filter(fund=>action.kind!=='realize'||fund.currency===fundMap.get(action.item?.fund_id||'')?.currency).map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>{action.kind==='transfer'&&<label className="block text-sm font-medium">Hacia<select required value={actionDestFund} onChange={event=>setActionDestFund(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Seleccioná un fondo</option>{availableFunds.filter(fund=>fund.id!==actionFund&&fund.currency===fundMap.get(actionFund)?.currency).map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>}{action.kind==='reserve'&&reserveKind==='reserve'&&<label className="block text-sm font-medium">Pago que cubrirá (opcional)<select value={actionTargetItem} onChange={event=>setActionTargetItem(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Reserva general</option>{snapshot?.items.filter(item=>item.fund_id===actionFund&&item.kind==='expense'&&item.status==='active').map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}{action.kind==='rate'?<div className="grid grid-cols-3 gap-2">{(['optimistic','intermediate','pessimistic'] as const).map((key,index)=><label key={key} className="text-xs font-medium">{['Optimista','Intermedio','Pesimista'][index]}<input required type="number" min="0" step="0.01" value={rateValues[key]} onChange={event=>setRateValues({...rateValues,[key]:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"/></label>)}</div>:<label className="block text-sm font-medium">{action.kind==='balance'?'Saldo total':'Importe'}<input required type="number" min={action.kind==='balance'?undefined:'0.01'} step="0.01" value={actionAmount} onChange={event=>setActionAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>}{action.kind==='balance'&&<label className="block text-sm font-medium">Reservado al inicio del día<input required type="number" min="0" step="0.01" value={actionReserved} onChange={event=>setActionReserved(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>}<label className="block text-sm font-medium">{action.kind==='rate'?'Vigente desde':'Fecha'}<PlanningDateInput key={actionDate} required value={actionDate} onChange={setActionDate} label="Fecha"/></label>{action.kind!=='rate'&&<label className="block text-sm font-medium">Nota<input value={actionNote} onChange={event=>setActionNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setAction(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button><button disabled={working} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working?'Guardando…':'Guardar'}</button></div></form></div>}
    {action && ['reverse','close_remaining','reopen_remaining','installments'].includes(action.kind) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event=>{if(event.target===event.currentTarget)setAction(null)}}>
      <form onSubmit={runAction} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex justify-between gap-3"><h2 className="text-lg font-semibold">{action.kind==='reverse'?'Revertir realización':action.kind==='close_remaining'?'Cerrar saldo pendiente':action.kind==='reopen_remaining'?'Reabrir saldo pendiente':'Crear cuotas'}</h2><button type="button" aria-label="Cerrar" onClick={()=>setAction(null)}><X size={19}/></button></div>
        {error&&<p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {action.kind==='installments' ? <>
          <label className="block text-sm font-medium">Detalle<input required minLength={2} value={installments.title} onChange={event=>setInstallments({...installments,title:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
          <label className="block text-sm font-medium">Tipo<select value={installments.kind} onChange={event=>setInstallments({...installments,kind:event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="expense">Pago</option><option value="income">Ingreso</option></select></label>
          <label className="block text-sm font-medium">Fondo<select required value={actionFund} onChange={event=>setActionFund(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">{availableFunds.map(fund=><option key={fund.id} value={fund.id}>{fund.name} ({fund.currency})</option>)}</select></label>
          <label className="block text-sm font-medium">Importe total<input required type="number" min="0.01" step="0.01" value={actionAmount} onChange={event=>setActionAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
          <label className="block text-sm font-medium">Cantidad de cuotas<input required type="number" min="2" max="60" value={installments.count} onChange={event=>setInstallments({...installments,count:Number(event.target.value)})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
          <label className="block text-sm font-medium">Primera fecha<PlanningDateInput key={actionDate} required value={actionDate} onChange={setActionDate} label="Fecha"/></label>
          <label className="block text-sm font-medium">Nota<input value={actionNote} onChange={event=>setActionNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
        </> : <><p className="text-sm text-slate-600">{action.kind==='reverse'?'Se volverá a incluir este importe entre los pendientes. Si tiene un Movimiento vinculado, ese asiento permanece y debe corregirse en Movimientos.':action.kind==='reopen_remaining'?'El remanente volverá a proyectarse.':'El importe aún pendiente dejará de proyectarse.'}</p><label className="block text-sm font-medium">Motivo<input required minLength={3} value={actionNote} onChange={event=>setActionNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"/></label></>}
        <div className="flex justify-end gap-2"><button type="button" onClick={()=>setAction(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Volver</button><button disabled={working} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working?'Guardando…':'Confirmar'}</button></div>
      </form>
    </div>}
    {showImport && snapshot && <PlanningImportPreview funds={snapshot.funds} from={from} to={to} onClose={()=>setShowImport(false)} onApply={importRows}/>}
  </main>;
}
