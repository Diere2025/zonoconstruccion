'use client';
import {useEffect,useRef,useState} from 'react';
import ErpDateInput from '@/components/ui/ErpDateInput';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {displayReportDate} from '@/components/ui/ReportDateRangePicker';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
import type {CorrectionPreview} from '@/lib/logisticsDispatch/identityCorrection';
type Header={code:string;carrier_name:string};
export type DispatchCorrectionRow={dispatch_id:string;version:number;planned:{deliveryDate:string;carrierId:string;driverName?:string};logistics_dispatches:Header|Header[]};
type Row=DispatchCorrectionRow;
type History={id:string;created_at:string;delivery_date:string;carrier_name:string;actor_name:string;reason:string};
const input='w-full rounded-lg border p-2 text-sm';
export default function DispatchCorrectionDialog({row,carriers,onRequest,onClose,onSaved}:{row:Row;carriers:Array<{id:string;name:string}>;onRequest:(query:string,body?:Record<string,unknown>)=>Promise<unknown>;onClose:()=>void;onSaved:(date:string)=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null),key=useRef(crypto.randomUUID());
 const [date,setDate]=useState(row.planned.deliveryDate),[carrier,setCarrier]=useState(row.planned.carrierId),[driver,setDriver]=useState(row.planned.driverName||''),[reason,setReason]=useState(''),[ack,setAck]=useState(false),[preview,setPreview]=useState<CorrectionPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before;};},[]);
 const [history,setHistory]=useState<History[]>([]),[historyError,setHistoryError]=useState('');
 useEffect(()=>{let active=true;void onRequest('?action=correction-history&dispatchId='+row.dispatch_id).then(result=>{if(active)setHistory((result as {rows:History[]}).rows||[]);}).catch(()=>{if(active)setHistoryError('No se pudo cargar el historial de correcciones.');});return()=>{active=false;};},[onRequest,row.dispatch_id]);
 const header=Array.isArray(row.logistics_dispatches)?row.logistics_dispatches[0]:row.logistics_dispatches;
 function change(action:()=>void){action();setPreview(null);setError('');key.current=crypto.randomUUID();}
 async function submit(apply:boolean){setBusy(true);setError('');try{const result=await onRequest('',{action:apply?'correct-dispatch':'preview-correction',dispatchId:row.dispatch_id,version:row.version,deliveryDate:date,carrierId:carrier,driverName:driver,reason,acknowledgePayments:ack,key:key.current,token:preview?.token,sourceToken:preview?.sourceToken});if(apply){await onSaved(date);}else setPreview(result as CorrectionPreview);}catch(e){if(!apply||/cambi|consult|clave/i.test((e as Error).message))setPreview(null);setError((e as Error).message);}finally{setBusy(false);}}
 return <dialog ref={ref} aria-label={'Corregir recorrido · '+header?.code} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl backdrop:bg-slate-950/50">
 <h2 className="text-xl font-bold">Corregir recorrido · {header?.code}</h2><p className="mt-2 text-sm text-slate-600">Actual: {displayReportDate(row.planned.deliveryDate)} · {header?.carrier_name}. Se conservarán el código LOG, los pedidos y los pagos existentes.</p>
 <form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();void submit(false);}}><fieldset disabled={busy} className="space-y-4">
 <label className="block text-sm">Fecha correcta<ErpDateInput required aria-label="Fecha correcta" className={input} value={date} onChange={e=>change(()=>setDate(e.target.value))}/></label><button type="button" className="rounded border px-3 py-1 text-sm" onClick={()=>change(()=>setDate(treasuryToday()))}>Hoy</button>
 <SearchableSelect required label="Fletero correcto" value={carrier} options={carriers.map(c=>({value:c.id,label:c.name}))} onChange={id=>change(()=>{setCarrier(id);setDriver('');})}/>
 <label className="block text-sm">Chofer (si corresponde)<input aria-label="Chofer correcto" className={input} maxLength={160} value={driver} onChange={e=>change(()=>setDriver(e.target.value))}/></label>
 <label className="block text-sm">Motivo de la corrección<textarea required minLength={10} maxLength={2000} aria-label="Motivo de la corrección" className={input} value={reason} onChange={e=>change(()=>setReason(e.target.value))}/></label>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>change(()=>setAck(e.target.checked))}/>Revisé los pagos vinculados y confirmo que corresponden al recorrido corregido. Sus fechas e importes se conservan.</label>
 <button type="submit" className="rounded-lg border px-4 py-2 font-medium">Revisar impacto</button>
 </fieldset></form>
 {preview&&<section aria-label="Impacto de la corrección" className="mt-5 space-y-3 rounded-xl border bg-slate-50 p-4"><h3 className="font-semibold">{displayReportDate(preview.beforeDate)} → {displayReportDate(preview.deliveryDate)} · {preview.beforeCarrier} → {preview.carrierName}</h3>
 <dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries({Entregas:preview.counts.deliveries,Recorridos:preview.counts.routes,Rendiciones:preview.counts.settlements,Pagos:preview.counts.payments,'Filas de Entregados':preview.sourceRows}).map(([label,value])=><div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl>
 {preview.related.orders.length>0&&<p className="break-words text-xs">Pedidos: {preview.related.orders.join(', ')}</p>}
 {preview.related.settlements.map(s=><p key={s.id} className="text-sm">Rendición <a className="text-blue-700 underline" href={'/admin/rendiciones?rendicion='+s.id} target="_blank" rel="noreferrer">{s.code}</a> · {s.status==='draft'?'Borrador':s.status==='confirmed'?'Confirmada':'Archivada'}</p>)}
 {preview.related.payments.map(p=><p key={p.id} className="text-sm">Pago <a className="text-blue-700 underline" href={'/admin/finanzas?tab=flow&transaction='+p.id} target="_blank" rel="noreferrer">{p.code||'Ver movimiento'}</a> · {new Intl.NumberFormat('es-AR',{style:'currency',currency:p.currency||'ARS'}).format(Number(p.amount))}</p>)}
 <p className="text-xs text-slate-600">El ERP aplicará la corrección también al leer las filas revisadas de Entregados. La planilla original queda conservada como antecedente.</p>
 {preview.warnings.map((warning:string)=><p key={warning} className="text-sm text-amber-800">{warning}</p>)}{preview.blockers.map((blocker:string)=><p role="alert" key={blocker} className="text-sm font-medium text-red-700">{blocker}</p>)}
 <button type="button" disabled={busy||preview.blockers.length>0||preview.counts.payments>0&&!ack} onClick={()=>void submit(true)} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Confirmar corrección</button>
 </section>}
 {history.length>0&&<details className="mt-5 text-sm"><summary>Historial de correcciones ({history.length})</summary>{history.map(item=><p key={item.id} className="mt-2 border-t pt-2">{new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.created_at))} · {item.actor_name} · {displayReportDate(item.delivery_date)} · {item.carrier_name}: {item.reason}</p>)}</details>}{historyError&&<p className="mt-3 text-sm text-amber-800">{historyError}</p>}
 {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end"><button type="button" disabled={busy} className="rounded-lg border px-4 py-2" onClick={onClose}>Cerrar</button></div>
 </dialog>;
}
