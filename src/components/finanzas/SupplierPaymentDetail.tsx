'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { movementHref } from '@/lib/financialOperations/references';
import { supabase } from '@/lib/supabase';
import SelectionModal from './operations/SelectionModal';

type Amount = number | string;
type PayableDocument = { id:string; reference:string; date:string|null; availableCents:number };
type Payment = {
  code:string; amount:Amount; currency:string; date:string; account?:string; concept?:string; notes?:string; movementId?:string;
  included:boolean; signature:string; openingSignature:string|null; reserved:number;
  documents:Array<{ purchase_id:string; reference:string; amount:Amount }>;
  opening:Array<{ target_key:string; reference:string; amount:Amount }>;
  payableDocuments?:PayableDocument[];
};
type Removal = { kind:'document'|'opening'; id:string; reference:string; amount:Amount; requestId:string };
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric',
});
const cents = (amount:Amount) => Math.round(Number(amount)*100);

export default function SupplierPaymentDetail({supplierId,paymentId,code,onClose,onChanged}:{
  supplierId:string; paymentId:string; code:string; onClose:()=>void; onChanged:()=>Promise<void>;
}) {
  const api=useMemo(()=>createAuthenticatedRequester(supabase),[]);
  const [payment,setPayment]=useState<Payment|null>(null);
  const [pending,setPending]=useState<Removal|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [loadingReview,setLoadingReview]=useState(false);
  const [review,setReview]=useState<{documents:PayableDocument[]; draft:Record<string,string>; reason:string}|null>(null);
  const reviewRequest=useRef<{payload:string;id:string}|null>(null);
  const sending=useRef(false);
  const detailUrl='/api/admin/supplier-applications?'+new URLSearchParams({supplierId,paymentId});
  const read=useCallback(async(signal?:AbortSignal):Promise<Payment>=>api(detailUrl,{signal}),[api,detailUrl]);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    read(controller.signal).then(data=>{if(!controller.signal.aborted)setPayment(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[read]);

  async function removeApplication(){
    if(!payment||!pending||sending.current)return;
    const {kind,id,reference,requestId}=pending;
    const reason='Desaplicación desde CC Proveedores: '+reference.slice(0,300);
    sending.current=true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const opening=kind==='opening';
      const payload=opening
        ? {sourceKey:'payment:'+paymentId,signature:payment.openingSignature,reason,requestId,
            allocations:payment.opening.filter(part=>part.target_key!==id).map(part=>({targetKey:part.target_key,amount:part.amount}))}
        : {paymentId,signature:payment.signature,reason,requestId,
            allocations:payment.documents.filter(doc=>doc.purchase_id!==id).map(doc=>({purchase_id:doc.purchase_id,amount:doc.amount}))};
      await api(opening?'/api/admin/supplier-opening-applications':'/api/admin/supplier-applications',{
        method:'POST',body:JSON.stringify(payload),
      });
      setPending(null);
      setNotice('Aplicación quitada. El importe volvió a quedar a cuenta.');
      setPayment(null);
      await Promise.all([read().then(setPayment),onChanged()]);
    }catch(e){
      setError((e as Error).message);
    }finally{
      sending.current=false;
      setSaving(false);
    }
  }

  async function reviewApplication(){
    setLoadingReview(true);
    setError('');
    setNotice('');
    try{
      const current:Payment=await api(detailUrl+'&review=1');
      setPayment(current);
      if(!current.included)return;
      const draft=Object.fromEntries(current.documents.map(doc=>[doc.purchase_id,Number(doc.amount).toFixed(2)]));
      setReview({documents:current.payableDocuments||[],draft,reason:''});
      reviewRequest.current=null;
    }catch(e){setError((e as Error).message);}
    finally{setLoadingReview(false);}
  }

  const documentBudget=payment?cents(payment.amount)-cents(payment.reserved)-payment.opening
    .reduce((sum,part)=>sum+cents(part.amount),0):0;
  const reviewTotal=Object.values(review?.draft||{}).reduce((sum,amount)=>sum+cents(amount),0);
  const unavailable=review&&payment?.documents.filter(doc=>doc.purchase_id in review.draft
    && !review.documents.some(candidate=>candidate.id===doc.purchase_id));

  function toggleDocument(doc:PayableDocument){
    if(!review)return;
    const draft={...review.draft};
    if(doc.id in draft)delete draft[doc.id];
    else draft[doc.id]=(Math.min(doc.availableCents,Math.max(0,documentBudget-reviewTotal))/100).toFixed(2);
    setReview({...review,draft});
  }

  async function saveReview(){
    if(!payment||!review||sending.current)return;
    const reason=review.reason.trim();
    const allocations=Object.entries(review.draft).map(([purchase_id,amount])=>({purchase_id,amount}));
    setError('');
    if(reason.length<3||!Number.isFinite(reviewTotal)||reviewTotal>documentBudget||unavailable?.length||
      allocations.some(({purchase_id,amount})=>!/^\d+(?:\.\d{1,2})?$/.test(amount)||cents(amount)<=0||
        cents(amount)>(review.documents.find(doc=>doc.id===purchase_id)?.availableCents||0))){
      setError('Revisá los importes, el saldo disponible y el motivo de la aplicación.');
      return;
    }
    const body={paymentId,signature:payment.signature,reason,allocations};
    const fingerprint=JSON.stringify(body);
    if(reviewRequest.current?.payload!==fingerprint)reviewRequest.current={payload:fingerprint,id:crypto.randomUUID()};
    sending.current=true;
    setSaving(true);
    try{
      await api('/api/admin/supplier-applications',{method:'POST',body:JSON.stringify({...body,requestId:reviewRequest.current.id})});
      setReview(null);
      setNotice('Aplicaciones guardadas.');
      setPayment(null);
      await Promise.all([read().then(setPayment),onChanged()]);
    }catch(e){setError((e as Error).message);}
    finally{sending.current=false;setSaving(false);}
  }

  const money=(amount:Amount)=>Number(amount).toLocaleString('es-AR',{style:'currency',currency:payment?.currency||'ARS'});
  const available=payment?cents(payment.amount)-cents(payment.reserved)-[...payment.documents,...payment.opening]
    .reduce((sum,item)=>sum+cents(item.amount),0):0;
  function removalButton(item:Omit<Removal,'requestId'>){
    return <button type="button" className="text-brand-700 underline disabled:opacity-50" disabled={!!pending||saving||loadingReview}
      aria-label={'Desaplicar '+item.reference} onClick={()=>{setError('');setNotice('');setPending({...item,requestId:crypto.randomUUID()});}}>
      Desaplicar
    </button>;
  }

  return <SelectionModal title={'Pago · '+(payment?.code||code)} onClose={onClose} disabled={saving}>
    {loading&&<p role="status" className="text-sm">Cargando detalle del pago…</p>}
    {error&&<p role="alert" className="mb-3 rounded bg-rose-50 p-2 text-sm text-rose-800">{error}</p>}
    {notice&&<p role="status" className="mb-3 rounded bg-emerald-50 p-2 text-sm text-emerald-800">{notice}</p>}
    {payment&&<div className="space-y-4 text-sm">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="font-semibold">{money(payment.amount)}</p>
        <p>{payment.date?dateFormat.format(new Date(payment.date)):'Sin fecha'}{payment.account&&' · '+payment.account}</p>
        {payment.concept&&<p>{payment.concept}</p>}
        {payment.notes&&<p className="mt-1 text-xs text-slate-600">{payment.notes}</p>}
        {payment.movementId&&<a href={movementHref(payment.movementId)} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-brand-700 underline">Ver en Movimientos ↗</a>}
      </div>
      <div>
        <h4 className="font-semibold">Aplicaciones registradas</h4>
        {!payment.documents.length&&!payment.opening.length&&<p className="mt-1">Pago a cuenta del proveedor.</p>}
        <ul className="divide-y">
          {payment.documents.map(doc=><li key={doc.purchase_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{doc.reference} · {money(doc.amount)}</span>
            {!review&&payment.included&&removalButton({kind:'document',id:doc.purchase_id,reference:doc.reference,amount:doc.amount})}
          </li>)}
          {payment.opening.map(part=><li key={part.target_key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>Saldo inicial · {part.reference} · {money(part.amount)}</span>
            {!review&&payment.openingSignature&&(payment.included||payment.opening.length===1)&&removalButton({
              kind:'opening',id:part.target_key,reference:part.reference,amount:part.amount,
            })}
          </li>)}
        </ul>
        {payment.reserved>0&&<p className="mt-1">Reservado para órdenes de compra: {money(payment.reserved)}</p>}
        {payment.included
          ? <p className="mt-1">Disponible para aplicar: <strong>{money(Math.max(0,available)/100)}</strong></p>
          : <p className="mt-1 text-slate-600">Pago fuera del saldo vigente. Las aplicaciones históricas a documentos se muestran para consulta.</p>}
      </div>
      {payment.included&&!review&&!pending&&<button type="button" disabled={loadingReview||saving}
        className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white disabled:opacity-50" onClick={()=>void reviewApplication()}>
        {loadingReview?'Cargando documentos…':'Revisar aplicación'}
      </button>}
      {review&&<form className="space-y-3 rounded-lg border p-3" onSubmit={event=>{event.preventDefault();void saveReview();}}>
        <h4 className="font-semibold">Documentos a pagar</h4>
        <p className="text-xs text-slate-600">Marcá los documentos y elegí cuánto aplicar a cada uno. Guardar reemplaza la distribución anterior.</p>
        {!review.documents.length&&<p>No hay documentos pendientes en esta moneda.</p>}
        {unavailable?.map(doc=><div key={doc.purchase_id} className="flex flex-wrap justify-between gap-2 rounded bg-amber-50 p-2">
          <span>{doc.reference} · Fuera del saldo vigente</span>
          <button type="button" disabled={saving} className="underline" onClick={()=>{
            const draft={...review.draft};delete draft[doc.purchase_id];setReview({...review,draft});
          }}>Quitar de la distribución</button>
        </div>)}
        <div className="max-h-64 space-y-2 overflow-auto">
          {review.documents.map(doc=><div key={doc.id} className="flex flex-wrap justify-between gap-2 border-b py-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={doc.id in review.draft} disabled={saving} onChange={()=>toggleDocument(doc)}/>
              <span>{doc.reference}{doc.date&&' · '+dateFormat.format(new Date(doc.date.length===10?doc.date+'T12:00:00Z':doc.date))}
                <span className="block text-xs text-slate-500">Disponible para este pago · {money(doc.availableCents/100)}</span>
              </span>
            </label>
            {doc.id in review.draft&&<label className="text-xs">Importe a aplicar
              <input aria-label={'Importe a aplicar '+doc.reference} type="number" min="0.01" step="0.01" max={doc.availableCents/100}
                required disabled={saving} value={review.draft[doc.id]} className="ml-2 w-32 rounded border p-1"
                onChange={event=>setReview({...review,draft:{...review.draft,[doc.id]:event.target.value}})}/>
            </label>}
          </div>)}
        </div>
        <p>Aplicado a documentos · <strong>{money(reviewTotal/100)}</strong> · A cuenta · {money((documentBudget-reviewTotal)/100)}</p>
        <label className="block text-xs">Motivo de la aplicación
          <input required minLength={3} maxLength={2000} disabled={saving} value={review.reason} className="mt-1 w-full rounded border p-2"
            onChange={event=>setReview({...review,reason:event.target.value})}/>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving||reviewTotal>documentBudget||!!unavailable?.length}
            className="rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50">{saving?'Guardando…':'Guardar aplicaciones'}</button>
          <button type="button" disabled={saving} className="underline" onClick={()=>setReview(null)}>Cancelar revisión</button>
        </div>
      </form>}
      {pending&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p>Al desaplicar {money(pending.amount)} de {pending.reference}, ese importe vuelve a quedar a cuenta.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={saving} className="rounded bg-brand-600 px-3 py-2 text-white" onClick={()=>void removeApplication()}>
            {saving?'Guardando…':'Confirmar desaplicación'}
          </button>
          <button type="button" disabled={saving} className="underline" onClick={()=>setPending(null)}>Cancelar</button>
        </div>
      </div>}
    </div>}
  </SelectionModal>;
}
