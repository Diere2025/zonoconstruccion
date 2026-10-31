"use client";
import ErpDateInput from '@/components/ui/ErpDateInput';
import SupplierImportReview from './SupplierImportReview';
import SupplierPaymentApplications from './SupplierPaymentApplications';
import SupplierPayables from './SupplierPayables';
import SupplierOpeningDetail from './SupplierOpeningDetail';
import SupplierOpeningApplications from './SupplierOpeningApplications';
import SupplierServices from './SupplierServices';
import SupplierRecordedHistory from './SupplierRecordedHistory';
import OperationEditor from './operations/OperationEditor';
import SupplierCutover from './SupplierCutover';
import SupplierSheetQueue from './SupplierSheetQueue';


import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { treasuryToday } from '@/lib/treasuryTransactionTime';
import { type AccountStart, type LedgerEntry } from '@/lib/supplierAccount';

type Summary = { id: string; name: string; start_date: string | null; balance_ars: number; balance_usd: number };
type Detail = { start: AccountStart | null; rows: LedgerEntry[]; balance_ars: number; balance_usd: number };
const money = (amount: number, currency: string) => `${currency === 'USD' ? 'US$' : '$'} ${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white';
const extensionsEnabled=process.env.NEXT_PUBLIC_SUPPLIER_CC_EXTENSIONS!=='0';
const pilotSuppliers=(process.env.NEXT_PUBLIC_SUPPLIER_CC_PILOT_IDS||'').split(',').map(id=>id.trim()).filter(Boolean);

export default function SupplierAccounts() {
  const api = useMemo(() => createAuthenticatedRequester(supabase), []);
  const [suppliers, setSuppliers] = useState<Summary[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editStart, setEditStart] = useState(false);
  const [startDate, setStartDate] = useState(treasuryToday());
  const [openingArs, setOpeningArs] = useState('0');
  const [openingUsd, setOpeningUsd] = useState('0');
  const [startNotes, setStartNotes] = useState('');
  const [mode, setMode] = useState<'current' | 'history'>('current');
  const [currency, setCurrency] = useState('ARS');
  const [entryQuery, setEntryQuery] = useState('');
  const [choice, setChoice] = useState<LedgerEntry | null>(null);
  const [choiceNotes, setChoiceNotes] = useState('');
  const [page, setPage] = useState(0);
  const [reviewSources, setReviewSources] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showPayables, setShowPayables] = useState(false);
  const [showOpening,setShowOpening]=useState(false);
  const [showOpeningApplications,setShowOpeningApplications]=useState(false);
  const [showServices,setShowServices]=useState(false);
  const [showRecorded,setShowRecorded]=useState(false);
  const [paying,setPaying]=useState<{supplierId:string;purchaseId?:string;amount?:string;currency?:string}|null>(null);
  const [showCutover,setShowCutover]=useState(false);
  const [showSheetQueue,setShowSheetQueue]=useState(false);
  const [revision,setRevision]=useState(0);
  const activeSupplier=useRef(supplierId);activeSupplier.current=supplierId;

  const loadSummary = useCallback(async () => {
    const data = await api('/api/admin/supplier-accounts');
    setSuppliers(data.suppliers);
  }, [api]);
  useEffect(() => { let active = true;
    api('/api/admin/supplier-accounts').then(data => { if (active) setSuppliers(data.suppliers); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    let active = true;
    setDetail(null); setChoice(null); setEditStart(false); setError(''); setPage(0); setEntryQuery('');
    if (!supplierId) return;
    setLoading(true);
    api(`/api/admin/supplier-accounts?supplierId=${supplierId}`).then(data => {
      if (!active) return;
      setDetail(data); setEditStart(!data.start);
      setStartDate(data.start?.start_date || treasuryToday());
      setOpeningArs(String(data.start?.opening_ars || 0)); setOpeningUsd(String(data.start?.opening_usd || 0));
      setStartNotes(data.start?.notes || '');
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, supplierId]);

  async function mutate(body: object) {
    setBusy(true); setError('');
    try {
      await api('/api/admin/supplier-accounts', { method: 'POST', body: JSON.stringify(body) });
      const data = await api(`/api/admin/supplier-accounts?supplierId=${supplierId}`);
      setDetail(data); setChoice(null); setChoiceNotes(''); setEditStart(false);
      setRevision(v=>v+1);
      await loadSummary();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const selected = suppliers.find(s => s.id === supplierId);
  const supplierExtensionsEnabled=extensionsEnabled&&(!pilotSuppliers.length||pilotSuppliers.includes(supplierId));
  const filtered = detail?.rows.filter(row => row.currency === currency &&
    (mode === 'current' ? row.included : !row.included || row.historical || row.reconciled)
    && `${row.reference} ${row.kind} ${row.notes || ''} ${(row.applications||[]).map(a=>a.code).join(' ')}`.toLowerCase().includes(entryQuery.toLowerCase())) || [];
  const visible = filtered.slice(page * 50, (page + 1) * 50);

  return <section className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 lg:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold text-slate-800">Cuentas corrientes de proveedores</h3>
        <p className="text-xs text-slate-500">Deuda al recibir · punto de partida por proveedor · conciliación del historial</p></div>
      <Link href="/admin/compras?tab=receptions" className="text-sm text-brand-600 underline">Registrar recepción</Link>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 text-rose-700 p-3 text-sm">{error}</p>}
    {extensionsEnabled&&<button type="button" aria-expanded={reviewSources} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setReviewSources(!reviewSources)}>{reviewSources?'Cerrar revisión de planillas':'Revisar planillas y equivalencias'}</button>}
    {extensionsEnabled&&reviewSources&&<SupplierImportReview suppliers={suppliers}/>}
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        <input aria-label="Buscar proveedor" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar proveedor…" className={input} />
        <div className="max-h-[480px] overflow-auto divide-y divide-slate-100">
          {suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => <button key={s.id} disabled={busy}
            onClick={() => setSupplierId(s.id)} className={`w-full p-3 text-left rounded-lg ${supplierId === s.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
            <span className="block text-sm font-semibold">{s.name}</span>
            {s.start_date ? <span className="block text-xs text-slate-500">Desde {s.start_date.split('-').reverse().join('/')} · {money(s.balance_ars, 'ARS')} · {money(s.balance_usd, 'USD')}</span>
              : <span className="text-xs text-amber-700">Definir punto de partida</span>}
          </button>)}
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        {loading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : !supplierId ? <p className="p-6 text-sm text-slate-500">Elegí un proveedor para iniciar o conciliar su cuenta. El historial se conserva.</p> : detail && <>
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{selected?.name}</h4>
            {detail.start && <button disabled={busy} className="text-sm underline text-brand-600" onClick={() => setEditStart(!editStart)}>Editar punto de partida</button>}
          </div>
          {supplierExtensionsEnabled&&<>
          <button type="button" aria-expanded={showPayments} onClick={()=>setShowPayments(!showPayments)} className="rounded-lg border px-3 py-2 text-sm">{showPayments?'Cerrar pagos y créditos':'Ver pagos, anticipos y créditos'}</button>
          <button type="button" aria-expanded={showServices} onClick={()=>setShowServices(!showServices)} className="rounded-lg border px-3 py-2 text-sm">{showServices?'Cerrar servicios y ajustes':'Registrar servicio o ajuste'}</button>
          <button type="button" aria-expanded={showRecorded} onClick={()=>setShowRecorded(!showRecorded)} className="rounded-lg border px-3 py-2 text-sm">{showRecorded?'Cerrar estado registrado':'Consultar estado registrado a fecha'}</button>
          <button type="button" aria-expanded={showCutover} onClick={()=>setShowCutover(!showCutover)} className="rounded-lg border px-3 py-2 text-sm">{showCutover?'Cerrar puesta al día':'Preparar puesta al día desde planilla'}</button>
          <button type="button" aria-expanded={showSheetQueue} onClick={()=>setShowSheetQueue(!showSheetQueue)} className="rounded-lg border px-3 py-2 text-sm">{showSheetQueue?'Cerrar sincronización':'Ver sincronización de recepciones'}</button>
          {showSheetQueue&&<SupplierSheetQueue key={supplierId} supplierId={supplierId}/>}
          {showCutover&&<SupplierCutover key={supplierId} supplierId={supplierId} onChanged={async()=>{const result=await api(`/api/admin/supplier-accounts?supplierId=${supplierId}`);if(activeSupplier.current===supplierId){setDetail(result);setRevision(v=>v+1);}await loadSummary();}}/>}
          {showRecorded&&<SupplierRecordedHistory key={supplierId} supplierId={supplierId}/>}
          {showServices&&<SupplierServices key={supplierId} supplierId={supplierId} documents={detail.rows.filter(r=>r.source==='purchase'&&!r.voided&&r.kind!=='Nota de Crédito').map(r=>({id:r.source_id,reference:r.reference,currency:r.currency}))} onChanged={async()=>{const result=await api(`/api/admin/supplier-accounts?supplierId=${supplierId}`);if(activeSupplier.current===supplierId){setDetail(result);setRevision(v=>v+1);}await loadSummary();}}/>}
          <button type="button" aria-expanded={showPayables} onClick={()=>setShowPayables(!showPayables)} className="ml-2 rounded-lg border px-3 py-2 text-sm">{showPayables?'Cerrar partidas y vencimientos':'Ver partidas y vencimientos'}</button>
          <button type="button" disabled={!detail.start} onClick={()=>setPaying({supplierId})} className="rounded-lg border px-3 py-2 text-sm">Registrar pago al proveedor</button>
          {paying&&<OperationEditor key={paying.supplierId+':'+(paying.purchaseId||'advance')} kind="supplier_payment" initialSupplierId={paying.supplierId} initialPurchaseId={paying.purchaseId} initialAmount={paying.amount} initialCurrency={paying.currency} onClose={()=>setPaying(null)} onSaved={()=>{setPaying(null);void loadSummary();if(activeSupplier.current===paying.supplierId){void api(`/api/admin/supplier-accounts?supplierId=${paying.supplierId}`).then(result=>{if(activeSupplier.current===paying.supplierId){setDetail(result);setRevision(v=>v+1);}});}}}/> }
          {showPayables&&<SupplierPayables key={supplierId} supplierId={supplierId} configured={!!detail.start} revision={revision} onPay={(purchaseId,amount,currency)=>setPaying({supplierId,purchaseId,amount,currency})}/>}
          {showPayments&&<SupplierPaymentApplications key={supplierId} supplierId={supplierId} revision={revision} onChanged={async()=>{const result=await api(`/api/admin/supplier-accounts?supplierId=${supplierId}`);if(activeSupplier.current===supplierId){setDetail(result);setRevision(v=>v+1);}await loadSummary();}}/>}
          </>}
          {editStart && <form className="p-4 rounded-xl bg-slate-50 space-y-3" onSubmit={e => {
            e.preventDefault();
            if (detail.start && !confirm('Cambiar el punto de partida recalculará el saldo. Las incorporaciones y exclusiones ya conciliadas se conservan. ¿Guardar?')) return;
            void mutate({ action: 'start', supplierId, startDate, openingArs, openingUsd, notes: startNotes });
          }}>
            <p className="text-sm">Computar desde esta fecha, inclusive. Lo anterior queda fuera hasta que lo incorpores.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs">Fecha de inicio<ErpDateInput type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className={input} /></label>
              <label className="text-xs">Saldo inicial ARS<input type="number" step="0.01" required value={openingArs} onChange={e => setOpeningArs(e.target.value)} className={input} /></label>
              <label className="text-xs">Saldo inicial USD<input type="number" step="0.01" required value={openingUsd} onChange={e => setOpeningUsd(e.target.value)} className={input} /></label>
            </div>
            <p className="text-xs text-slate-500">Positivo: debemos. Negativo: saldo a favor. Cero: empezar de cero. Si el saldo inicial incluye documentos anteriores, no los sumes otra vez; incorporá únicamente importes que quedaron fuera.</p>
            <label className="block text-xs">Criterio de apertura<textarea required value={startNotes} onChange={e => setStartNotes(e.target.value)} placeholder="Qué incluye el saldo inicial y qué resta conciliar" className={input} /></label>
            <button disabled={busy} className="rounded-lg px-4 py-2 bg-brand-600 text-white text-sm">{busy ? 'Guardando…' : 'Guardar punto de partida'}</button>
          </form>}
          {detail.start && <>
            {supplierExtensionsEnabled&&<>
            <button type="button" aria-expanded={showOpening} onClick={()=>setShowOpening(!showOpening)} className="rounded-lg border px-3 py-2 text-sm">{showOpening?'Cerrar composición de apertura':'Ver composición del saldo inicial'}</button>
            {showOpening&&<SupplierOpeningDetail key={supplierId} supplierId={supplierId} revision={revision}/>}
            <button type="button" aria-expanded={showOpeningApplications} onClick={()=>setShowOpeningApplications(!showOpeningApplications)} className="rounded-lg border px-3 py-2 text-sm">{showOpeningApplications?'Cerrar aplicaciones a apertura':'Aplicar pagos y créditos a apertura'}</button>
            {showOpeningApplications&&<SupplierOpeningApplications key={supplierId} supplierId={supplierId} revision={revision} onChanged={async()=>{if(activeSupplier.current===supplierId)setRevision(v=>v+1);}}/>}
            </>}
            <div className="grid gap-3 sm:grid-cols-2">{(['ARS','USD'] as const).map(c => {
              const balance = c === 'ARS' ? detail.balance_ars : detail.balance_usd;
              return <div key={c} className="border rounded-xl p-3"><p className="text-xs text-slate-500">{c} · {balance > 0 ? 'Debemos' : balance < 0 ? 'A favor' : 'Al día'}</p>
                <p className={`text-xl font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(Math.abs(balance), c)}</p></div>;
            })}</div>
            <p className="text-xs text-slate-500">Inicio: {detail.start.start_date.split('-').reverse().join('/')} · Saldo inicial: {money(detail.start.opening_ars, 'ARS')} / {money(detail.start.opening_usd, 'USD')} · {detail.start.notes}</p>
          </>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setMode('current'); setPage(0); }} className={`px-3 py-2 rounded-lg text-sm ${mode === 'current' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Extracto vigente</button>
            <button onClick={() => { setMode('history'); setPage(0); }} className={`px-3 py-2 rounded-lg text-sm ${mode === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Historial para conciliar</button>
            <select aria-label="Moneda del extracto" value={currency} onChange={e => { setCurrency(e.target.value); setPage(0); }} className="border rounded-lg px-3 text-sm"><option>ARS</option><option>USD</option></select>
            <input aria-label="Buscar documento" value={entryQuery} onChange={e => { setEntryQuery(e.target.value); setPage(0); }} placeholder="Buscar documento o pago…" className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          {mode === 'history' && <p className="text-xs text-slate-500">Los documentos se incorporan por su importe completo. Conciliá también sus pagos para reflejar la deuda restante y evitar sumar importes ya contemplados en el saldo inicial.</p>}
          {choice && <form className="border rounded-lg p-3 space-y-2 bg-amber-50" onSubmit={e => { e.preventDefault(); void mutate({ action: 'history', supplierId, source: choice.source, sourceId: choice.source_id, included: !choice.included, notes: choiceNotes }); }}>
            <p className="text-sm">{choice.included ? 'Excluir' : 'Incorporar'} {choice.kind}: {choice.reference} · {money(choice.amount, choice.currency)}</p>
            <p className="text-xs">Esta selección modifica el saldo de la cuenta; conserva el documento y sus efectos originales en stock y caja.</p>
            <input required value={choiceNotes} onChange={e => setChoiceNotes(e.target.value)} className={input} placeholder="Motivo de la conciliación" aria-label="Motivo de conciliación" />
            <div className="flex gap-3"><button disabled={busy} className="text-sm font-semibold">{busy ? 'Guardando…' : 'Confirmar conciliación'}</button><button type="button" disabled={busy} onClick={() => setChoice(null)} className="text-sm underline">Cancelar</button></div>
          </form>}
          <div className="overflow-auto border rounded-xl"><table className="w-full text-xs text-left">
            <thead className="bg-slate-50"><tr>{['Fecha','Documento / movimiento','Cargo','Crédito','Saldo','Aplicaciones','Conciliación'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {mode === 'current' && detail.start && page === 0 && !entryQuery && <tr className="bg-slate-50"><td className="p-3">{detail.start.start_date.split('-').reverse().join('/')}</td><td className="p-3">Saldo inicial</td><td className="p-3" colSpan={3}>{money(currency === 'ARS' ? detail.start.opening_ars : detail.start.opening_usd, currency)}</td><td /><td /></tr>}
              {visible.map(row => <tr key={`${row.source}:${row.source_id}`} className={row.included ? '' : 'text-slate-400'}>
                <td className="p-3 whitespace-nowrap">{row.entry_date.split('-').reverse().join('/')}{row.historical && <span className="block text-amber-700">Anterior al inicio</span>}</td>
                <td className="p-3"><span className="block font-semibold">{row.kind} · {row.reference}</span>
                  <span className="block">{row.notes}</span>{row.reconciliation_note && <span className="block italic">{row.reconciliation_note}</span>}
                  {row.purchase_reception_id && <Link className="underline text-brand-600" href={`/admin/compras?tab=receptions&reception=${row.purchase_reception_id}`}>Ver recepción</Link>}
                  {row.cash_transaction_id && <Link className="underline text-brand-600" href={`/admin/finanzas?tab=flow&transaction=${row.cash_transaction_id}`}>Ver movimientos</Link>}
                </td><td className="p-3 whitespace-nowrap">{row.amount > 0 ? money(row.amount, currency) : '—'}</td>
                <td className="p-3 whitespace-nowrap">{row.amount < 0 ? money(-row.amount, currency) : '—'}</td>
                <td className="p-3 whitespace-nowrap">{row.balance === null ? 'Fuera del saldo' : money(row.balance, currency)}</td>
                <td className="p-3">{row.applications?.length?row.applications.map((a,i)=><span key={a.id+'-'+i} className="block whitespace-nowrap">{a.href?<Link href={a.href} className="text-brand-700 underline">{a.kind} · {a.code}</Link>:<span>{a.kind} · {a.code}</span>}{a.amount!==undefined&&<span className="block text-slate-500">{money(a.amount,row.currency)}</span>}</span>):'—'}</td>
                <td className="p-3">{row.voided ? 'Anulado' : <button disabled={busy || !detail.start} onClick={() => { setChoice(row); setChoiceNotes(''); }} className="underline whitespace-nowrap">{row.included ? 'Excluir del saldo' : 'Incorporar al saldo'}</button>}</td>
              </tr>)}
              {!visible.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No hay movimientos para esta selección.</td></tr>}
            </tbody>
          </table></div>
          <div className="flex items-center justify-between text-xs"><span>{filtered.length} registros</span><div className="flex gap-3">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div></div>
        </>}
      </div>
    </div>
  </section>;
}
