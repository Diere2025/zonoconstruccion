'use client';
import {useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
import ErpDateInput from '@/components/ui/ErpDateInput';
import type {LedgerEntry} from '@/lib/supplierAccount';
type Data={coverageFrom:string;recordedThrough:string;coverage?:'configured'|'missing_opening';balance_ars:number;balance_usd:number;rows:LedgerEntry[]};
const money=(n:number,c:string)=>c+' '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function SupplierRecordedHistory({supplierId}:{supplierId:string}){
 const api=useMemo(()=>createAuthenticatedRequester(supabase),[]),[day,setDay]=useState(treasuryToday()),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section className="border rounded-xl p-3 space-y-3"><h5 className="font-semibold">Estado registrado a una fecha</h5><p className="text-xs text-slate-600">Consulta lo que estaba registrado al cierre del día elegido. Conserva los cambios posteriores de importes, anulaciones y conciliación. Disponible desde la activación del historial; los días anteriores requieren evidencia histórica.</p>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setData(null);try{setData(await api(`/api/admin/supplier-recorded?supplierId=${supplierId}&day=${day}`));}catch(err){setError((err as Error).message);}finally{setBusy(false);}}} className="flex gap-2"><ErpDateInput aria-label="Fecha del estado registrado" required disabled={busy} value={day} max={treasuryToday()} onChange={e=>{setDay(e.target.value);setData(null);}} className="border rounded p-2 text-sm"/><button disabled={busy} className="underline text-sm">Consultar estado registrado</button></form>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
  {data&&<><p className="text-sm">Cobertura desde {data.coverageFrom.split('-').reverse().join('/')} · Al {data.recordedThrough.split('-').reverse().join('/')} · {data.coverage==='missing_opening'?'Sin punto de partida registrado: saldo pendiente de validar.':`${money(data.balance_ars,'ARS')} · ${money(data.balance_usd,'USD')}`}</p><div className="max-h-96 overflow-auto"><table className="text-xs w-full text-left"><thead><tr><th>Fecha</th><th>Documento</th><th>Importe</th><th>Saldo</th></tr></thead><tbody>{data.rows.filter(r=>r.included).map(r=><tr key={r.source+':'+r.source_id}><td className="p-1">{r.entry_date.split('-').reverse().join('/')}</td><td>{r.kind} · {r.reference}</td><td>{money(r.amount,r.currency)}</td><td>{money(r.balance||0,r.currency)}</td></tr>)}</tbody></table></div></>}
 </section>;
}
