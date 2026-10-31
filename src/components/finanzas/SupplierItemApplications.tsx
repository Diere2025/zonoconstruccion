'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
type Item={item_key:string;purchase_id:string;reference:string|null;document_type:string;installment_number:number;due_date:string|null;included:boolean;available_for_source:number|string};
type Data={source:{id:string;kind:'payment'|'credit';reference:string|null;amount:string|number;currency:string;included:boolean};signature:string;budgets:Array<{purchase_id:string;reference:string|null;amount:string|number}>;items:Item[];details:Array<{item_key:string;amount:number|string;valid:boolean}>;events:Array<{id:string;created_at:string;payload:{reason:string}}>};
const cents=(value:string|number)=>Math.round(Number(value||0)*100);
const money=(value:number,currency:string)=>currency+' '+value.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(value:string|null)=>value?value.split('-').reverse().join('/'):'Sin vencimiento';
export default function SupplierItemApplications({sourceId,credit,onClose,onSaved}:{sourceId:string;credit:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){
 const api=useMemo(()=>createAuthenticatedRequester(supabase),[]),sending=useRef(false),retry=useRef<{fingerprint:string;key:string}|null>(null);
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Record<string,string>>({}),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[clear,setClear]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 useEffect(()=>{let active=true;api(`/api/admin/supplier-item-applications?${credit?'creditId':'paymentId'}=${sourceId}`).then((value:Data)=>{if(!active)return;setData(value);const initial:Record<string,string>={};for(const d of value.details)if(d.valid)initial[d.item_key]=Number(d.amount).toFixed(2);for(const budget of value.budgets){const options=value.items.filter(i=>i.purchase_id===budget.purchase_id);if(options.length===1&&!initial[options[0].item_key])initial[options[0].item_key]=Number(budget.amount).toFixed(2);}setDraft(initial);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,sourceId,credit]);
 const assigned=(purchaseId:string)=>data?.items.filter(i=>i.purchase_id===purchaseId).reduce((n,i)=>n+(Number.isFinite(Number(draft[i.item_key]))?cents(draft[i.item_key]):0),0)||0;
 const filtered=data?.items.filter(i=>`${i.reference||''} ${i.document_type}`.toLowerCase().includes(query.toLowerCase()))||[],visible=filtered.slice(page*50,page*50+50);
 const blockedBudget=data?.budgets.some(b=>!data.items.some(i=>i.purchase_id===b.purchase_id&&i.included))||false;
 function toggle(item:Item){if(!data)return;setClear(false);setDraft(previous=>{const next={...previous};if(item.item_key in next)delete next[item.item_key];else{const budget=data.budgets.find(b=>b.purchase_id===item.purchase_id)!;const available=Math.min(cents(item.available_for_source),Math.max(0,cents(budget.amount)-assigned(item.purchase_id)));next[item.item_key]=(available/100).toFixed(2);}return next;});}
 async function save(){if(!data||sending.current)return;sending.current=true;setBusy(true);setError('');try{
  const items=clear?[]:Object.entries(draft).map(([itemKey,amount])=>({itemKey,amount}));
  if(!clear&&data.budgets.some(b=>assigned(b.purchase_id)!==cents(b.amount)))throw new Error('Distribuí exactamente el importe aplicado a cada documento.');
  if(items.some(i=>!Number.isFinite(Number(i.amount))||cents(i.amount)<=0))throw new Error('Cada partida seleccionada requiere un importe positivo.');
  const payload={paymentId:credit?null:sourceId,creditId:credit?sourceId:null,signature:data.signature,reason,items},fingerprint=JSON.stringify(payload);
  if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};
  await api('/api/admin/supplier-item-applications',{method:'POST',body:JSON.stringify({...payload,requestId:retry.current.key})});await onSaved();
 }catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}}
 return <section className="space-y-3 rounded-xl border border-blue-200 bg-white p-4">
  <h6 className="font-semibold">Distribuir aplicación por facturas y cuotas</h6><p className="text-xs text-slate-600">El importe ya está aplicado a los documentos. Esta operación indica qué partidas cubre, conservando el pago, el crédito y la deuda total.</p>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {!data&&!error&&<p className="text-xs">Cargando partidas…</p>}
  {data&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void save();}}>
   <p className="text-sm font-semibold">{credit?'Nota de crédito':'Pago'} · {data.source.reference||'Sin número'} · {money(Number(data.source.amount),data.source.currency)}</p>
   {!data.source.included&&<p className="text-xs text-amber-800">El origen está fuera del saldo vigente. Solo podés quitar el detalle anterior.</p>}
   {blockedBudget&&<p className="text-xs text-amber-800">Hay documentos sin partidas vigentes. Revisá primero las aplicaciones al documento y su alcance.</p>}
   {data.details.some(d=>!d.valid)&&<p className="text-xs text-amber-800">La distribución anterior necesita revisión porque cambiaron aplicaciones, partidas o su alcance. Se conserva en el historial.</p>}
   {data.budgets.map(b=><p key={b.purchase_id} className={'text-xs '+(!clear&&assigned(b.purchase_id)!==cents(b.amount)?'text-amber-800':'text-slate-600')}>{b.reference||'Documento sin número'}: {money(assigned(b.purchase_id)/100,data.source.currency)} distribuidos de {money(Number(b.amount),data.source.currency)} aplicados.</p>)}
   {!data.budgets.length&&<p className="text-xs text-slate-600">Primero aplicá el pago o crédito a un documento desde Revisar aplicación.</p>}
   <input aria-label="Buscar factura o cuota" className="w-full rounded border p-2 text-sm" placeholder="Buscar comprobante" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
   <div className="space-y-2">{visible.map(item=><div key={item.item_key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"><label className="flex items-center gap-2"><input disabled={busy||!data.source.included||!item.included} type="checkbox" checked={item.item_key in draft} onChange={()=>toggle(item)}/><span>{item.document_type} · {item.reference||'Sin número'} · Cuota {item.installment_number}<span className="block text-slate-500">{day(item.due_date)} · Disponible para este origen: {money(Number(item.available_for_source),data.source.currency)}</span></span></label>{item.item_key in draft&&<label>Importe<input aria-label={`Importe ${item.reference||'partida'} cuota ${item.installment_number}`} disabled={busy||!data.source.included} type="number" required min="0.01" max={Number(item.available_for_source)} step="0.01" className="ml-2 w-32 rounded border p-2" value={draft[item.item_key]} onChange={e=>{setClear(false);setDraft({...draft,[item.item_key]:e.target.value});}}/></label>}</div>)}</div>
   <div className="flex justify-between text-xs"><span>{filtered.length} partidas · página {page+1}</span><div className="flex gap-3"><button type="button" disabled={!page||busy} onClick={()=>setPage(page-1)}>Anterior</button><button type="button" disabled={(page+1)*50>=filtered.length||busy} onClick={()=>setPage(page+1)}>Siguiente</button></div></div>
   {!!data.details.length&&<button disabled={busy} type="button" className="text-xs underline" onClick={()=>{setDraft({});setClear(true);}}>Quitar distribución por cuotas</button>}
   {clear&&<p className="text-xs text-amber-800">Se quitará solo el detalle por cuotas. El importe continuará aplicado a los mismos documentos.</p>}
   <label className="block text-xs">Motivo de la distribución<textarea aria-label="Motivo de la distribución" required minLength={3} maxLength={2000} disabled={busy} className="mt-1 w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <div className="flex gap-3"><button disabled={busy||!clear&&(!data.source.included||!data.budgets.length||blockedBudget)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Guardar distribución</button><button disabled={busy} type="button" className="text-sm underline" onClick={onClose}>Cerrar</button></div>
   {!!data.events.length&&<details><summary className="text-xs">Historial de distribución</summary>{data.events.map(e=><p className="mt-2 text-xs" key={e.id}>{new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(e.created_at))} · {e.payload.reason}</p>)}</details>}
  </form>}
 </section>;
}
