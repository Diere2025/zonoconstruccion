'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Link2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { cents, type Fund, type Item } from '@/lib/paymentPlanning/model';
import type { ReconciliationData, ReconciliationMovement } from '@/lib/paymentPlanning/reconciliationTypes';
import PlanningDateInput from './PlanningDateInput';
import RealizePlanningModal from './RealizePlanningModal';

const api = createAuthenticatedRequester(supabase);
const movementDate = (date: string) => new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date));
const money = (amount: number, currency: string) => new Intl.NumberFormat('es-AR',{style:'currency',currency}).format(amount);
type Props = {item: Item; sourceFund: Fund; funds: Fund[]; today: string; initialDate: string; working: boolean; error: string; onClose: () => void;
  onSave: (action: string,payload: Record<string,unknown>,key?: string) => Promise<boolean>};

export default function ReconcilePlanningModal({item,sourceFund,funds,today,initialDate,working,error,onClose,onSave}: Props) {
  const [from,setFrom] = useState(initialDate);
  const [to,setTo] = useState(initialDate);
  const [accountIds,setAccountIds] = useState<string[]>([]);
  const [search,setSearch] = useState('');
  const [filters,setFilters] = useState<{from:string;to:string;accountIds:string[]|null;search:string;page:number}>(() => ({from,to,accountIds:null,search,page:0}));
  const [data,setData] = useState<ReconciliationData | null>(null);
  const [candidates,setCandidates] = useState<ReconciliationMovement[]>([]);
  const [selected,setSelected] = useState<Map<string,ReconciliationMovement>>(() => new Map());
  const [loading,setLoading] = useState(true);
  const [localError,setLocalError] = useState('');
  const [create,setCreate] = useState(false);
  const [notice,setNotice] = useState('');
  const [adjustAmount,setAdjustAmount] = useState(false);
  const [finalizeLower,setFinalizeLower] = useState(false);
  const sequence = useRef(0);
  const operation = useRef<{key: string; signature: string} | null>(null);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setLocalError('');
    try {
      const params = new URLSearchParams({action:'reconciliation',itemId:item.id,from:filters.from,to:filters.to,search:filters.search,page:String(filters.page)});
      if(filters.accountIds===null)params.set('initializeFundId',sourceFund.id);
      else filters.accountIds.forEach(id=>params.append('accounts',id));
      const next = await api(`/api/admin/payment-planning?${params}`) as ReconciliationData;
      if (sequence.current !== current) return;
      setData(next);
      if(filters.accountIds===null)setAccountIds(next.accountIds);
      setCandidates(previous => filters.page ? [...previous,...next.movements.filter(row=>!previous.some(old=>old.id===row.id))] : next.movements);
    } catch (cause) { if (sequence.current === current) setLocalError(cause instanceof Error ? cause.message : 'No se pudieron cargar los Movimientos.'); }
    finally { if (sequence.current === current) setLoading(false); }
  },[item.id,filters,sourceFund.id]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); },0);
    const invalidate = () => { sequence.current++; };
    return () => { clearTimeout(timer); invalidate(); };
  },[load]);
  useEffect(() => {
    if(search===filters.search)return;
    const timer=setTimeout(()=>{
      setSelected(new Map());setAdjustAmount(false);
      setFilters(previous=>({...previous,search,page:0}));
    },300);
    return()=>clearTimeout(timer);
  },[search,filters.search]);
  const totalSelected = [...selected.values()].reduce((sum,row)=>sum+cents(row.amount),0)/100;
  const capacity = data?.capacity || 0;
  const exceeds = cents(totalSelected)>cents(capacity);
  const accounts = new Map(data?.accounts.map(row=>[row.id,row.name]) || []);
  const changeAccounts = (next:string[]) => {
    setAccountIds(next);setSelected(new Map());setAdjustAmount(false);setFilters(previous=>({...previous,accountIds:next,page:0}));
  };
  const save = async (payload: Record<string,unknown>) => {
    const complete = {item_id:item.id,...payload};
    const signature = JSON.stringify(complete);
    if (operation.current?.signature !== signature) operation.current = {key:crypto.randomUUID(),signature};
    const ok = await onSave('reconcile',complete,operation.current.key);
    if (ok) {
      operation.current=null; setSelected(new Map());setAdjustAmount(false);setFinalizeLower(false);
      // Return to page one after a mutation; linked candidates disappear immediately.
      setFilters(previous=>({...previous,page:0})); setNotice('Conciliación actualizada.');
    }
    return ok;
  };
  if (create && data) return <RealizePlanningModal item={data.item} sourceFund={sourceFund} funds={funds}
    initialAmount={String(data.unlinked || data.capacity)} initialDate={data.realizations.at(-1)?.effective_date || item.scheduled_date || today}
    heading="Crear Movimiento y conciliar" movementOnly working={working} error={error || localError}
    onClose={()=>setCreate(false)} onBack={()=>setCreate(false)}
    onSave={(_action,payload)=>save({...payload,mode:'create'})}/>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" onMouseDown={event=>{if(event.target===event.currentTarget && !working) onClose();}}>
    <div role="dialog" aria-modal="true" aria-label="Conciliar pago con Movimientos" className="max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Conciliar con Movimientos</h2><p className="text-sm text-slate-500">{item.title} · {sourceFund.name}</p></div><button type="button" aria-label="Cerrar conciliación" disabled={working} onClick={onClose}><X size={20}/></button></div>
      {(error || localError) && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{error || localError}</p>}
      {notice && <p role="status" className="rounded-lg bg-teal-50 p-2 text-sm text-teal-900">{notice}</p>}
      {data && <>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
          <div><p className="text-slate-500">Total de la tarjeta</p><strong>{data.item.amount===null?'A confirmar':money(Number(data.item.amount),sourceFund.currency)}</strong></div>
          <div><p className="text-slate-500">Realizado</p><strong>{money(data.realized,sourceFund.currency)}</strong></div>
          <div><p className="text-slate-500">Conciliado</p><strong className="text-emerald-700">{money(data.reconciled,sourceFund.currency)}</strong></div>
          <div><p className="text-slate-500">Realizado sin conciliar</p><strong className={data.unlinked>0?'text-amber-800':'text-emerald-700'}>{money(data.unlinked,sourceFund.currency)}</strong></div>
        </div>
        {data.realizations.some(row=>row.cash_transaction_id) && <section className="space-y-2"><h3 className="text-sm font-semibold">Movimientos vinculados</h3>
          {data.realizations.filter(row=>row.cash_transaction_id).map(row=>{
            const movement=data.linkedMovements.find(entry=>entry.id===row.cash_transaction_id);
            return <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs">
              <div><strong>{money(Number(row.amount),sourceFund.currency)}</strong> · {movementDate(`${row.effective_date}T12:00:00-03:00`)} · {movement?.financial_account_id ? accounts.get(movement.financial_account_id) : ''}<p className="text-emerald-800">{movement?.concept || 'Movimiento vinculado'}</p></div>
              <button type="button" disabled={working || loading} onClick={()=>void save({mode:'unlink',realization_id:row.id})} className="font-medium text-slate-600 underline disabled:opacity-50">Deshacer vínculo</button>
            </div>;
          })}</section>}
        <p className="text-xs text-slate-600">Podés vincular varios Movimientos a la misma tarjeta. Se usarán sus fechas y cajas; los importes ya realizados se concilian sin volver a descontarlos.</p>
        {data.item.status==='active' && data.reconciled>0 && data.item.amount!==null && cents(data.reconciled)<cents(data.item.amount) && <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <h3 className="font-semibold">¿El pago terminó por un importe menor?</h3>
          <p>Podés ajustar la tarjeta de {money(Number(data.item.amount),sourceFund.currency)} a {money(data.reconciled,sourceFund.currency)}. Se eliminará el remanente previsto de {money(Number(data.item.amount)-data.reconciled,sourceFund.currency)}{data.unlinked>0?` y se revertirán ${money(data.unlinked,sourceFund.currency)} registrados manualmente sin Movimiento`:''}. Los Movimientos vinculados conservarán sus importes, fechas y cajas.</p>
          <label className="flex items-start gap-2"><input type="checkbox" disabled={working || loading} checked={finalizeLower} onChange={event=>setFinalizeLower(event.target.checked)}/><span>Confirmo que el pago está completo y que no falta registrar otro Movimiento.</span></label>
          <button type="button" disabled={!finalizeLower || working || loading} onClick={()=>void save({mode:'finalize_lower',version:data.item.version})} className="rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold disabled:opacity-40">Ajustar al total conciliado y finalizar</button>
        </section>}
        {capacity>0 && <>
          <form onSubmit={event=>{event.preventDefault();setSelected(new Map());setAdjustAmount(false);setFilters({from,to,accountIds,search,page:0});}} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
            <label className="text-xs font-medium">Desde<PlanningDateInput key={from} required value={from} onChange={setFrom} label="Buscar Movimientos desde"/></label>
            <label className="text-xs font-medium">Hasta<PlanningDateInput key={to} required value={to} onChange={setTo} label="Buscar Movimientos hasta"/></label>
            <fieldset disabled={working || loading} className="col-span-2 min-w-0 text-xs"><legend className="font-medium">Cajas ({accountIds.length})</legend><div className="mt-1 flex gap-3"><button type="button" onClick={()=>changeAccounts(data.accounts.filter(row=>row.currency===sourceFund.currency).map(row=>row.id))} className="font-medium text-teal-700">Seleccionar todas</button><button type="button" onClick={()=>changeAccounts([])} className="font-medium text-slate-500">Quitar todas</button></div><div className="mt-2 grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{data.accounts.filter(row=>row.currency===sourceFund.currency).map(row=><label key={row.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-slate-50"><input type="checkbox" checked={accountIds.includes(row.id)} onChange={event=>changeAccounts(event.target.checked?[...accountIds,row.id]:accountIds.filter(id=>id!==row.id))}/><span>{row.name}</span></label>)}</div>{!accountIds.length && <p className="mt-1 text-amber-700">Seleccioná al menos una caja para buscar Movimientos.</p>}</fieldset>
            <label className="col-span-2 text-xs font-medium sm:col-span-3">Detalle<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por detalle del Movimiento" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2"/></label>
            <button disabled={loading || working} className="flex items-center justify-center gap-1 self-end rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-50"><Search size={13}/> Buscar</button>
          </form>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {candidates.map(row=><label key={row.id} className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 text-xs ${selected.has(row.id)?'bg-teal-50 ring-1 ring-teal-300':'hover:bg-slate-50'}`}>
              <input type="checkbox" disabled={working || loading || (selected.size>=50 && !selected.has(row.id))} checked={selected.has(row.id)} onChange={event=>{const checked=event.target.checked;setAdjustAmount(false);setSelected(previous=>{const next=new Map(previous);if(checked)next.set(row.id,row);else next.delete(row.id);return next;});}}/>
              <span className="min-w-0 flex-1"><strong className="block">{row.concept || 'Sin detalle'}</strong><span className="text-slate-500">{movementDate(row.created_at)} · {row.financial_account_id ? accounts.get(row.financial_account_id) : ''}{row.category ? ` · ${row.category}` : ''}</span></span>
              <span className="shrink-0 text-right tabular-nums"><strong>{money(Number(row.amount),row.currency)}</strong>{Number(row.amount)>capacity && <span className="block text-[10px] text-amber-800">Diferencia +{money(Number(row.amount)-capacity,row.currency)}</span>}</span>
            </label>)}
            {loading && <p className="p-3 text-center text-xs text-slate-500">Cargando Movimientos…</p>}
            {!loading && !candidates.length && <p className="p-3 text-center text-xs text-slate-500">No hay Movimientos disponibles con estos filtros. Podés ampliar las fechas o crear el Movimiento faltante.</p>}
            {data.hasMore && <button disabled={loading} onClick={()=>setFilters(previous=>({...previous,page:previous.page+1}))} className="w-full p-2 text-xs font-semibold text-teal-700">Ver más Movimientos</button>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><p>Seleccionado: <strong>{money(totalSelected,sourceFund.currency)}</strong> · Por vincular: {money(capacity,sourceFund.currency)}</p>
            {exceeds && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><p className="flex items-center gap-1"><AlertTriangle size={13}/> Diferencia: +{money(totalSelected-capacity,sourceFund.currency)} respecto del importe de la tarjeta.</p><label className="mt-2 flex items-start gap-2"><input type="checkbox" disabled={working} checked={adjustAmount} onChange={event=>setAdjustAmount(event.target.checked)}/><span>Actualizar el importe de la tarjeta de {money(Number(data.item.amount),sourceFund.currency)} a {money(Number(data.item.amount)+totalSelected-capacity,sourceFund.currency)} y conciliar lo efectivamente pagado.</span></label></div>}
            {totalSelected>data.unlinked && !exceeds && <p className="mt-1 text-xs text-slate-500">Se registrarán {money(totalSelected-data.unlinked,sourceFund.currency)} que todavía figuraban pendientes de pago.</p>}
          </div>
        </>}
      </>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" disabled={working} onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button>
        {capacity>0 && <><button type="button" disabled={working || loading} onClick={()=>{setNotice('');setCreate(true);}} className="rounded-lg border border-teal-300 px-3 py-2 text-sm font-medium text-teal-800">Crear Movimiento faltante</button>
          <button type="button" disabled={working || loading || !selected.size || (exceeds && !adjustAmount)} onClick={()=>void save({mode:'existing',transaction_ids:[...selected.keys()],adjust_amount:exceeds && adjustAmount,expected_amount:data?.item.amount})} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Link2 size={15}/>{working?'Guardando…':`Vincular ${selected.size || ''} Movimiento${selected.size===1?'':'s'}`}</button></>}
      </div>
    </div>
  </div>;
}
