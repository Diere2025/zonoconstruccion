'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {validateSupplierService} from '@/lib/supplierAccounts/service';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
import ErpDateInput from '@/components/ui/ErpDateInput';
type Document={bill_id:string;document_type:string;description:string;evidence:string;bill:{id:string;number:string;bill_date:string;currency:string;declared_total:number;status:string;version:number}};
const input='w-full border rounded p-2 text-sm',money=(n:number,c:string)=>c+' '+Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function SupplierServices({supplierId,documents,onChanged}:{supplierId:string;documents:{id:string;reference:string;currency:string}[];onChanged:()=>Promise<void>}){
 const api=useMemo(()=>createAuthenticatedRequester(supabase),[]),[rows,setRows]=useState<Document[]>([]),[type,setType]=useState('Factura'),[number,setNumber]=useState(''),[date,setDate]=useState(treasuryToday()),[dueDate,setDueDate]=useState(''),[currency,setCurrency]=useState('ARS'),[description,setDescription]=useState(''),[evidence,setEvidence]=useState(''),[reason,setReason]=useState(''),[linkedPurchaseId,setLinked]=useState(''),[total,setTotal]=useState(''),[lines,setLines]=useState([{description:'',quantity:'1',unitPrice:'',vat:'21'}]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[voiding,setVoiding]=useState<Document|null>(null),[notice,setNotice]=useState('');
 const retry=useRef<{fingerprint:string;requestId:string;id:string}|null>(null),sending=useRef(false);
 const load=useCallback(async()=>{const d=await api('/api/admin/supplier-services?supplierId='+supplierId);setRows(d.documents);},[api,supplierId]);
 useEffect(()=>{let active=true;api('/api/admin/supplier-services?supplierId='+supplierId).then(d=>{if(active)setRows(d.documents);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,supplierId]);
 const calculated=lines.reduce((sum,l)=>{const net=Math.round(Number(l.quantity)*Number(l.unitPrice)*100);return sum+net+Math.round(net*Number(l.vat)/100);},0)/100;
 async function save(){if(sending.current)return;setError('');setNotice('');try{
  const body=voiding?{id:voiding.bill_id,supplierId,void:true,version:voiding.bill.version,reason}:{supplierId,type,number,date,dueDate,currency,description,evidence,reason,linkedPurchaseId,total,lines};
  const fingerprint=JSON.stringify(body);if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,requestId:crypto.randomUUID(),id:crypto.randomUUID()};const payload=validateSupplierService({...body,id:voiding?.bill_id||retry.current.id,requestId:retry.current.requestId});sending.current=true;setBusy(true);
  await api('/api/admin/supplier-services',{method:'POST',body:JSON.stringify(payload)});retry.current=null;setVoiding(null);setNumber('');setReason('');setDescription('');setEvidence('');setTotal('');setLines([{description:'',quantity:'1',unitPrice:'',vat:'21'}]);await load();await onChanged();setNotice('Comprobante guardado. Consultalo en el extracto y en partidas y vencimientos.');
 }catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}}
 return <section className="border rounded-xl p-4 space-y-3"><h5 className="font-semibold">Servicios y ajustes sin recepción</h5><p className="text-xs text-slate-600">Para servicios sin mercadería y notas de débito/crédito. La factura de mercadería recibida se concilia desde Compras con su remito. Este registro no mueve stock ni caja.</p>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
  <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="space-y-3">
   {voiding?<p className="text-sm">Anular {voiding.document_type} · {voiding.bill.number} · {money(voiding.bill.declared_total,voiding.bill.currency)}. Debés liberar antes sus aplicaciones de pagos y créditos.</p>:<>
    <div className="grid sm:grid-cols-3 gap-2">
     <label className="text-xs">Tipo<select aria-label="Tipo de servicio o ajuste" className={input} value={type} onChange={e=>setType(e.target.value)}><option>Factura</option><option>Nota de Débito</option><option>Nota de Crédito</option></select></label>
     <label className="text-xs">Número<input aria-label="Número de servicio" required maxLength={100} className={input} value={number} onChange={e=>setNumber(e.target.value)}/></label>
     <label className="text-xs">Moneda<select className={input} value={currency} onChange={e=>{setCurrency(e.target.value);setLinked('');}}><option>ARS</option><option>USD</option></select></label>
     <label className="text-xs">Fecha<ErpDateInput aria-label="Fecha de servicio" required className={input} value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label className="text-xs">Vencimiento<ErpDateInput aria-label="Vencimiento de servicio" className={input} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
     <label className="text-xs">Documento relacionado (opcional)<select aria-label="Documento relacionado" className={input} value={linkedPurchaseId} onChange={e=>setLinked(e.target.value)}><option value="">Sin relación</option>{documents.filter(d=>d.currency===currency).map(d=><option key={d.id} value={d.id}>{d.reference||'Documento sin número'}</option>)}</select></label>
    </div>
    <label className="block text-xs">Descripción del servicio o ajuste<input aria-label="Descripción del servicio" required minLength={3} maxLength={2000} className={input} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    {lines.map((l,index)=><div className="grid sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2" key={index}>{(['description','quantity','unitPrice','vat'] as const).map(key=><label key={key} className="text-xs">{{description:'Detalle',quantity:'Cantidad',unitPrice:'Precio sin IVA',vat:'IVA %'}[key]}<input aria-label={`${key} servicio ${index+1}`} className={input} type={key==='description'?'text':'number'} step={key==='quantity'?'0.001':'0.01'} min={key==='quantity'?'0.001':'0'} max={key==='vat'?'100':undefined} required value={l[key]} onChange={e=>setLines(ls=>ls.map((r,n)=>n===index?{...r,[key]:e.target.value}:r))}/></label>)}<button type="button" disabled={lines.length===1} className="text-xs underline" onClick={()=>setLines(ls=>ls.filter((_,n)=>n!==index))}>Quitar línea</button></div>)}
    <button type="button" disabled={lines.length>=100} className="text-xs underline" onClick={()=>setLines(ls=>[...ls,{description:'',quantity:'1',unitPrice:'',vat:'21'}])}>Agregar línea de servicio</button>
    <p className="text-xs">Total calculado con IVA: {money(calculated,currency)}</p><label className="block text-xs">Total del comprobante<input aria-label="Total del servicio" className={input} required type="number" min="0.01" step="0.01" value={total} onChange={e=>setTotal(e.target.value)}/></label>
    <label className="block text-xs">Respaldo del comprobante<textarea aria-label="Respaldo del servicio" required minLength={3} maxLength={2000} className={input} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
   </>}
   <label className="block text-xs">Motivo del registro o anulación<textarea aria-label="Motivo del servicio" required minLength={3} maxLength={2000} className={input} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button className="bg-slate-900 text-white rounded p-2 text-sm">{voiding?'Confirmar anulación del servicio':'Registrar servicio o ajuste'}</button>{voiding&&<button type="button" className="underline text-sm ml-3" onClick={()=>{setVoiding(null);setReason('');}}>Cancelar anulación</button>}
  </fieldset></form>
  <div className="max-h-80 overflow-auto">{rows.map(d=><div className="text-xs border-b p-2 flex justify-between gap-2" key={d.bill_id}><span>{d.bill.bill_date.split('-').reverse().join('/')} · {d.document_type} · {d.bill.number} · {money(d.bill.declared_total,d.bill.currency)} · {d.bill.status}<span className="block">{d.description} · {d.evidence}</span></span>{d.bill.status!=='Anulado'&&<button type="button" disabled={busy} className="underline" onClick={()=>{setVoiding(d);setReason('');}}>Anular servicio</button>}</div>)}</div>
 </section>;
}
