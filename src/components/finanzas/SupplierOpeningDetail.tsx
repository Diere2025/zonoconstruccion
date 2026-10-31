'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {validateOpeningDetail,type OpeningLine} from '@/lib/supplierAccounts/opening';
import type {AccountStart} from '@/lib/supplierAccount';
import ErpDateInput from '@/components/ui/ErpDateInput';

type StoredLine={reference:string;currency:'ARS'|'USD';amount:string|number;document_condition:OpeningLine['condition'];document_date:string|null;due_date:string|null;evidence:string};
type Data={start:AccountStart;signature:string;items:StoredLine[];events:{id:string;reason:string;created_at:string}[]};
const input='w-full rounded border px-2 py-1 text-sm';
const money=(n:number)=>n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const blank=():OpeningLine=>({reference:'',currency:'ARS',amount:'',condition:'sin_detalle',documentDate:'',dueDate:'',evidence:''});
export default function SupplierOpeningDetail({supplierId,revision=0}:{supplierId:string;revision?:number}){
 const api=useMemo(()=>createAuthenticatedRequester(supabase),[]),[data,setData]=useState<Data|null>(null),[items,setItems]=useState<OpeningLine[]>([]),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[clearing,setClearing]=useState(false);
 const retry=useRef<{payload:string;id:string}|null>(null);
 const install=useCallback((d:Data)=>{setData(d);setItems(d.items.map(i=>({reference:i.reference,currency:i.currency,amount:String(i.amount),condition:i.document_condition,documentDate:i.document_date||'',dueDate:i.due_date||'',evidence:i.evidence})));setReason('');setClearing(false);},[]);
 useEffect(()=>{let active=true;setLoading(true);setData(null);setError('');setNotice('');api(`/api/admin/supplier-opening?supplierId=${supplierId}`).then(d=>{if(active)install(d);}).catch(e=>{if(active) setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[api,supplierId,revision,install]);
 function change(index:number,patch:Partial<OpeningLine>){setItems(rows=>rows.map((r,n)=>n===index?{...r,...patch}:r));setNotice('');}
 async function save(){if(!data)return;setError('');setNotice('');
  try{
   const payload=validateOpeningDetail({supplierId,requestId:crypto.randomUUID(),signature:data.signature,reason,items});
   if(items.length){for(const c of ['ARS','USD'] as const){const total=payload.items.filter(i=>i.currency===c).reduce((n,i)=>n+Math.round(Number(i.amount)*100),0),expected=Math.round(Number(c==='ARS'?data.start.opening_ars:data.start.opening_usd)*100);if(total!==expected)throw new Error(`El desglose ${c} debe sumar exactamente ${money(expected/100)}.`);}if(items.some(i=>i.documentDate>data.start.start_date))throw new Error('La fecha del documento no puede ser posterior a la apertura.');}
   if(!items.length&&data.items.length&&!clearing)throw new Error('Usá Quitar desglose para volver a la apertura sin detalle.');
   const serialized=JSON.stringify(payload);if(retry.current?.payload!==serialized)retry.current={payload:serialized,id:crypto.randomUUID()};
   setBusy(true);await api('/api/admin/supplier-opening',{method:'POST',body:JSON.stringify({...payload,requestId:retry.current.id})});
   install(await api(`/api/admin/supplier-opening?supplierId=${supplierId}`));retry.current=null;setNotice('Desglose guardado. El saldo de la cuenta conserva el mismo importe.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section aria-label="Desglose del saldo inicial" className="rounded-xl border p-3 space-y-3">
  <h5 className="font-semibold">Composición del saldo inicial</h5>
  <p className="text-xs text-slate-600">Importes a la fecha de apertura. Positivo: deuda; negativo: saldo a favor. Estas partidas explican el saldo inicial ya registrado. Consultá el pendiente después de pagos en Aplicar pagos y créditos a apertura. Para cambiar esta composición, liberá primero sus aplicaciones.</p>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
  {loading?<p>Cargando apertura…</p>:data&&<>
   <p className="text-sm">Apertura al {data.start.start_date.split('-').reverse().join('/')} · ARS {money(Number(data.start.opening_ars))} · USD {money(Number(data.start.opening_usd))}</p>
   {!items.length&&<p className="text-sm text-amber-800">{clearing?'Se quitará el desglose al guardar.':'Saldo inicial sin detalle.'} Se conserva el importe de apertura.</p>}
   <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="space-y-3">
    {items.map((item,index)=><div key={index} className="border rounded-lg p-3 space-y-2">
     <div className="flex justify-between"><strong className="text-xs">Partida {index+1}</strong><button type="button" className="text-xs underline" onClick={()=>setItems(rows=>rows.filter((_,n)=>n!==index))}>Quitar partida {index+1}</button></div>
     <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-xs">Referencia<input aria-label={`Referencia ${index+1}`} className={input} value={item.reference} maxLength={200} onChange={e=>change(index,{reference:e.target.value})}/></label>
      <label className="text-xs">Moneda<select aria-label={`Moneda ${index+1}`} className={input} value={item.currency} onChange={e=>change(index,{currency:e.target.value as OpeningLine['currency']})}><option>ARS</option><option>USD</option></select></label>
      <label className="text-xs">Importe con signo<input aria-label={`Importe ${index+1}`} className={input} type="number" step="0.01" value={item.amount} onChange={e=>change(index,{amount:e.target.value})}/></label>
      <label className="text-xs">Condición<select aria-label={`Condición ${index+1}`} className={input} value={item.condition} onChange={e=>change(index,{condition:e.target.value as OpeningLine['condition']})}><option value="sin_detalle">Sin detalle</option><option value="facturado">Facturado (Cuenta 1)</option><option value="por_remito">Por remito (Cuenta 2)</option></select></label>
      <label className="text-xs">Fecha del documento<ErpDateInput aria-label={`Fecha documento ${index+1}`} className={input} value={item.documentDate} max={data.start.start_date} onChange={e=>change(index,{documentDate:e.target.value})}/></label>
      <label className="text-xs">Vencimiento<ErpDateInput aria-label={`Vencimiento ${index+1}`} className={input} value={item.dueDate} onChange={e=>change(index,{dueDate:e.target.value})}/></label>
     </div>
     <label className="block text-xs">Respaldo / ubicación en planilla<textarea aria-label={`Respaldo ${index+1}`} className={input} maxLength={2000} value={item.evidence} onChange={e=>change(index,{evidence:e.target.value})}/></label>
    </div>)}
    <div className="flex flex-wrap gap-3 text-sm"><button type="button" disabled={items.length>=500} className="underline" onClick={()=>{setItems(rows=>[...rows,blank()]);setClearing(false);}}>Agregar partida de apertura</button>
     {!!data.items.length&&<button type="button" className="underline" onClick={()=>{setItems([]);setClearing(true);setNotice('');}}>Quitar desglose</button>}</div>
    <p className="text-xs">Suma del detalle: {(['ARS','USD'] as const).map(c=>`${c} ${money(items.filter(i=>i.currency===c).reduce((n,i)=>n+(Number(i.amount)||0),0))}`).join(' · ')}</p>
    <label className="block text-xs">Motivo del cambio<textarea aria-label="Motivo del desglose" className={input} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button type="submit" className="rounded bg-slate-900 text-white px-3 py-2 text-sm">{busy?'Guardando…':'Guardar desglose de apertura'}</button>
   </fieldset></form>
   {!!data.events.length&&<details><summary className="text-sm cursor-pointer">Historial del desglose</summary>{data.events.map(e=><p key={e.id} className="text-xs py-1">{new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(e.created_at))} · {e.reason}</p>)}</details>}
  </>}
 </section>;
}
