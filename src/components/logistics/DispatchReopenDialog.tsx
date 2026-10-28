'use client';
import {useEffect,useRef,useState} from 'react';
import {reopeningReason} from '@/lib/logisticsDispatch/reopening';
type Row=Record<string,any>;
type State={code:string;status:string;version:number;canReopen:boolean;resetsLiquidation?:boolean;approvedAmount?:number;blockers:string[];history:Array<{id:string;created_at:string;actor_name:string;reason:string;kmBefore?:number|null;kmAfter?:number|null;rectifiedAt?:string|null;rectifiedBy?:string|null;previousLiquidation?:number|null}>};
export const reopeningWhen=(value:string)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return parts.day+'/'+parts.month+'/'+parts.year+' '+parts.hour+':'+parts.minute;};
const money=(value:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(value);
const km=(value:number)=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(value);
export default function DispatchReopenDialog({row,onRequest,onClose,onSaved}:{row:Row;onRequest:(query:string,body?:Row)=>Promise<any>;onClose:()=>void;onSaved:()=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null),key=useRef(crypto.randomUUID());
 const [state,setState]=useState<State|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const header=Array.isArray(row.logistics_dispatches)?row.logistics_dispatches[0]:row.logistics_dispatches;
 useEffect(()=>{ref.current?.showModal();let active=true;onRequest('?action=reopening-state&dispatchId='+row.dispatch_id).then(result=>{if(active)setState(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[row.dispatch_id,onRequest]);
 const close=()=>{if(!busy&&(!reason||window.confirm('¿Descartar la justificación?')))onClose();};
 return <dialog ref={ref} aria-label={'Reapertura e historial · '+header?.code} onCancel={e=>{e.preventDefault();close();}} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl backdrop:bg-slate-950/50">
  <h2 className="text-xl font-semibold">{row.status==='completed'?'Reabrir salida':'Historial de reaperturas'} · {header?.code}</h2>
  {!state&&!error&&<p className="mt-4 text-sm">Consultando el estado y los vínculos del LOG…</p>}
  {state?.canReopen&&<form className="mt-4 space-y-4" onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');try{const value=reopeningReason(reason);setBusy(true);await onRequest('',{action:'reopen-dispatch',dispatchId:row.dispatch_id,version:state.version,key:key.current,reason:value});await onSaved();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>
   <p className="text-sm">La salida pasará de Cerrada a En recorrido para corregirla y volver a cerrarla. Se conservarán sus pedidos, datos realizados y adicionales.</p>
   {state.resetsLiquidation&&<p className="rounded-lg bg-amber-50 p-3 text-sm">La liquidación sin pago de {money(Number(state.approvedAmount))} quedará sin confirmar y guardada en el historial. Al volver a cerrar, se recalculará con los kilómetros corregidos y se conservará la misma tarea de revisión.</p>}
   <p className="rounded-lg bg-blue-50 p-3 text-sm">La reapertura quedará registrada con tu usuario, fecha, justificación y una copia del estado anterior.</p>
   <label className="block text-sm font-medium">Justificación de la reapertura<textarea aria-label="Justificación de la reapertura" autoFocus required minLength={20} maxLength={2000} disabled={busy} className="mt-1 w-full rounded-lg border p-3 text-sm" rows={4} placeholder="Qué se cerró mal, qué vas a corregir y por qué corresponde reabrir." value={reason} onChange={e=>{setReason(e.target.value);key.current=crypto.randomUUID();}}/></label>
   <p className="text-xs text-slate-500">Escribí una explicación concreta, de al menos 20 caracteres y cuatro palabras.</p>
   <button disabled={busy} className="rounded-lg bg-amber-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy?'Reabriendo…':'Justificar y reabrir'}</button>
  </form>}
  {state&&!state.canReopen&&state.blockers.map((blocker,i)=><p key={i} className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blocker}</p>)}
  {state&&<section className="mt-5 border-t pt-4"><h3 className="font-semibold">Historial de reaperturas</h3>{!state.history.length?<p className="mt-2 text-sm text-slate-500">Esta salida no tiene reaperturas registradas.</p>:state.history.map(h=><article key={h.id} className="mt-3 border-b pb-3 text-sm"><p className="font-medium">{reopeningWhen(h.created_at)} · {h.actor_name}</p><p className="mt-1 text-xs text-slate-500">Cerrada → En recorrido</p><p className="mt-1 whitespace-pre-wrap">{h.reason}</p>{h.previousLiquidation!==null&&h.previousLiquidation!==undefined&&<p className="mt-1">Liquidación anterior sin confirmar: {money(Number(h.previousLiquidation))}</p>}{h.rectifiedAt?<><p className="mt-1 font-medium">Km reales: {h.kmBefore===null||h.kmBefore===undefined?'Sin dato':km(h.kmBefore)} → {h.kmAfter===null||h.kmAfter===undefined?'Sin dato':km(h.kmAfter)}</p><p className="mt-1 text-xs text-slate-500">Rectificación al cerrar: {reopeningWhen(h.rectifiedAt)} · {h.rectifiedBy}</p></>:<p className="mt-1 text-xs text-slate-500">Kilómetros al reabrir: {h.kmBefore===null||h.kmBefore===undefined?'Sin dato':km(h.kmBefore)} · Pendiente de nuevo cierre</p>}</article>)}</section>}
  {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  <div className="mt-5 flex justify-end"><button type="button" disabled={busy} className="rounded-lg border px-4 py-2" onClick={close}>Cerrar</button></div>
 </dialog>;
}
