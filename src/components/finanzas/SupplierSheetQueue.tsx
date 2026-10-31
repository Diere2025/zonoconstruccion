'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
type Data={counts:Record<string,number>|null;jobs:{reception_id:string;delivery_slip_number:string;reception_date:string;status:string;attempts:number;last_error:string|null;updated_at:string}[]};
const labels:Record<string,string>={pending:'Pendiente',running:'En proceso',failed:'Reintento pendiente',done:'Sincronizada'};
const when=(v:string)=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
export default function SupplierSheetQueue({supplierId}:{supplierId:string}){
 const api=useMemo(()=>createAuthenticatedRequester(supabase),[]),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;api('/api/admin/supplier-sheet-queue?supplierId='+supplierId).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,supplierId]);
 async function retry(id?:string){setBusy(true);setError('');setNotice('');try{const r=await api('/api/admin/supplier-sheet-queue',{method:'POST',body:JSON.stringify({supplierId,...(id?{receptionId:id}:{})})});setNotice(r.synced?'Recepción sincronizada.':r.error||'La tarea quedó pendiente de su siguiente intento.');setData(await api('/api/admin/supplier-sheet-queue?supplierId='+supplierId));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="border rounded-xl p-3 space-y-3"><h5 className="font-semibold">Sincronización de recepciones con planilla</h5><p className="text-xs text-slate-600">La recepción y su deuda quedan guardadas en el ERP aunque la planilla no responda. Los reintentos copian esa misma recepción; conservan caja, stock e importes.</p>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
  <button type="button" disabled={busy} className="text-xs underline" onClick={()=>void retry()}>Procesar siguiente tarea pendiente</button>
  {data&&<><p className="text-xs">Pendientes: {data.counts?.pending||0} · Reintentos: {data.counts?.failed||0} · En proceso: {data.counts?.running||0} · Sincronizadas: {data.counts?.done||0}</p><div className="max-h-80 overflow-auto">{data.jobs.map(j=><div key={j.reception_id} className="border-b py-2 text-xs flex justify-between gap-2"><span>{j.delivery_slip_number||'Recepción sin número'} · {labels[j.status]} · Intentos: {j.attempts}<span className="block">Última actualización: {when(j.updated_at)}</span>{j.last_error&&<span className="block text-amber-800">{j.last_error}</span>}</span>{j.status!=='running'&&<button type="button" disabled={busy} className="underline" onClick={()=>void retry(j.reception_id)}>{j.status==='done'?'Verificar copia':'Reintentar copia'}</button>}</div>)}{!data.jobs.length&&<p className="text-xs">No hay tareas de este proveedor. Las recepciones anteriores a la activación no se reenvían automáticamente.</p>}</div></>}
 </section>;
}
