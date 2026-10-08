'use client';
import {useEffect,useState} from 'react';
import {X,AlertTriangle} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
import type {BankPreview,BankAccount} from '@/lib/bankSheetImport';
import PlanningDateInput from './planning/PlanningDateInput';
const api=createAuthenticatedRequester(supabase);
const dateLabel=(date:string)=>`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`;
const money=(amount:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(amount);
export default function BankSheetImportModal({onClose,onImported}:{onClose:()=>void;onImported:()=>Promise<void>}){
  const [from,setFrom]=useState(()=>`${treasuryToday().slice(0,7)}-01`),[to,setTo]=useState(treasuryToday);
  const [account,setAccount]=useState(''),[accounts,setAccounts]=useState<BankAccount[]>([]);
  const [data,setData]=useState<BankPreview|null>(null),[selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [display,setDisplay]=useState<'new'|'review'|'all'>('new');
  useEffect(()=>{
    let active=true;
    void api('/api/admin/bank-sheet-import?action=accounts').then(result=>{if(active)setAccounts((result as {accounts:BankAccount[]}).accounts);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'No se pudieron cargar las cuentas.');});
    return()=>{active=false;};
  },[]);
  const inspect=async()=>{
    setBusy(true);setError('');setNotice('');setData(null);setSelected(new Set());
    try{
      const result=await api(`/api/admin/bank-sheet-import?${new URLSearchParams({from,to,account})}`) as BankPreview;
      setData(result);setAccounts(result.accounts);setSelected(new Set(result.rows.filter(row=>row.status==='new').slice(0,1000).map(row=>row.key)));
    }catch(cause){setError(cause instanceof Error?cause.message:'No se pudo leer la planilla.');}finally{setBusy(false);}
  };
  const apply=async()=>{
    if(!data)return;
    setBusy(true);setError('');
    try{
      const result=await api('/api/admin/bank-sheet-import',{method:'POST',body:JSON.stringify({from:data.from,to:data.to,account,hash:data.hash,keys:[...selected]})}) as {inserted:number;skipped:number};
      setData(null);setSelected(new Set());setNotice(`${result.inserted} movimientos agregados · ${result.skipped} omitidos por coincidencia. Los movimientos y saldos iniciales existentes se conservaron.`);
      await onImported();
    }catch(cause){setError(cause instanceof Error?cause.message:'No se pudo importar.');}finally{setBusy(false);}
  };
  const reset=()=>{setData(null);setSelected(new Set());setNotice('');};
  const fresh=data?.rows.filter(row=>row.status==='new')||[];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3">
    <section role="dialog" aria-modal="true" aria-label="Importar bancos: sólo faltantes" className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl">
      <div className="flex items-start justify-between border-b p-5"><div><h2 className="text-lg font-semibold">Importar bancos · sólo faltantes</h2><p className="mt-1 text-xs text-slate-600">Bancos y Mercado Pago desde Finanzas - Finanzas. Conserva los Movimientos existentes y sus vínculos de conciliación.</p></div><button disabled={busy} type="button" aria-label="Cerrar" onClick={onClose}><X size={20}/></button></div>
      <form onSubmit={event=>{event.preventDefault();void inspect();}} className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4"><fieldset disabled={busy} className="contents">
        <label className="text-xs font-medium">Desde<PlanningDateInput value={from} onChange={value=>{setFrom(value);reset();}} required label="Importar bancos desde"/></label>
        <label className="text-xs font-medium">Hasta<PlanningDateInput value={to} onChange={value=>{setTo(value);reset();}} required label="Importar bancos hasta"/></label>
        <label className="text-xs font-medium">Cuenta<select disabled={busy} value={account} onChange={event=>{setAccount(event.target.value);reset();}} className="mt-1 w-full rounded-lg border p-2"><option value="">Todos los bancos y MP</option>{accounts.filter(row=>row.is_active).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <button disabled={busy} className="self-end rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy?'Procesando…':'Ver faltantes'}</button>
      </fieldset></form>
      <div className="space-y-2 p-4 text-xs">
        <p>Se excluyen efectivo y saldos iniciales. Las coincidencias con movimientos manuales o importados quedan para revisar.</p>
        {error&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-rose-800">{error}</p>}
        {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-2 text-emerald-800">{notice}</p>}
        {data&&<p><strong>{fresh.length} nuevos</strong> · {data.rows.filter(row=>row.status==='imported').length} ya registrados · {data.rows.filter(row=>row.status==='review').length} coincidencias para revisar · {data.issues.length} filas excluidas por datos o saldos iniciales.</p>}
        {data&&<label className="flex items-center gap-2">Mostrar<select aria-label="Estado de las filas bancarias" value={display} onChange={event=>setDisplay(event.target.value as typeof display)} className="rounded-lg border px-2 py-1"><option value="new">Sólo nuevos</option><option value="review">Coincidencias para revisar</option><option value="all">Todos</option></select></label>}
      </div>
      <div className="min-h-24 flex-1 overflow-auto px-4"><table className="w-full min-w-[750px] text-xs"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="p-2"><input type="checkbox" aria-label="Seleccionar nuevos, hasta 1000" disabled={busy||!fresh.length} checked={!!fresh.length&&selected.size===Math.min(fresh.length,1000)} onChange={event=>setSelected(new Set(event.target.checked?fresh.slice(0,1000).map(row=>row.key):[]))}/></th><th className="p-2">Fecha</th><th className="p-2">Cuenta</th><th className="p-2">Detalle</th><th className="p-2 text-right">Importe</th><th className="p-2">Estado</th></tr></thead>
        <tbody>{data?.rows.filter(row=>display==='all'||row.status===display).map(row=><tr key={row.key} className={`border-b ${row.status==='review'?'bg-amber-50':''}`}>
          <td className="p-2"><input type="checkbox" aria-label={`Importar fila ${row.sheetRow}`} disabled={busy||row.status!=='new'||(selected.size>=1000&&!selected.has(row.key))} checked={selected.has(row.key)} onChange={event=>{const checked=event.target.checked;setSelected(previous=>{const next=new Set(previous);if(checked)next.add(row.key);else next.delete(row.key);return next;});}}/></td>
          <td className="whitespace-nowrap p-2">{dateLabel(row.date)}</td><td className="p-2">{row.accountName}</td><td className="p-2">{row.concept}<span className="block text-slate-500">{row.category} · fila {row.sheetRow}</span></td><td className={`whitespace-nowrap p-2 text-right tabular-nums ${row.type==='ingreso'?'text-emerald-700':'text-rose-700'}`}>{row.type==='ingreso'?'+':'−'} {money(row.amount)}</td>
          <td className="p-2" title={row.reason}>{row.status==='new'?'Nuevo':row.status==='imported'?'Ya registrado':<span className="flex items-center gap-1 text-amber-800"><AlertTriangle size={12}/> Revisar coincidencia</span>}</td>
        </tr>)}</tbody></table>
        {data?.issues.length? <details className="py-3 text-xs text-amber-800"><summary>Ver filas excluidas ({data.issues.length})</summary>{data.issues.map(row=><p key={row.sheetRow}>Fila {row.sheetRow}: {row.reason}</p>)}</details>:null}
        {!data&&<p className="py-6 text-center text-sm text-slate-500">Elegí el período y pulsá Ver faltantes.</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-4"><span className="text-xs text-slate-500">Hasta 1000 nuevos por importación.</span><div className="flex gap-2"><button disabled={busy} onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Cerrar</button><button disabled={busy||!selected.size||!data} onClick={()=>void apply()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy?'Procesando…':`Importar ${selected.size} nuevos`}</button></div></div>
    </section>
  </div>;
}
