'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { supabase } from '@/lib/supabase';
import SelectionModal from './operations/SelectionModal';

type Amount = number | string;
type Payment = {
  code:string; amount:Amount; currency:string; date:string; account?:string; concept?:string; notes?:string;
  included:boolean; signature:string; openingSignature:string|null; reserved:number;
  documents:Array<{ purchase_id:string; reference:string; amount:Amount }>;
  opening:Array<{ target_key:string; reference:string; amount:Amount }>;
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

  const money=(amount:Amount)=>Number(amount).toLocaleString('es-AR',{style:'currency',currency:payment?.currency||'ARS'});
  const available=payment?cents(payment.amount)-cents(payment.reserved)-[...payment.documents,...payment.opening]
    .reduce((sum,item)=>sum+cents(item.amount),0):0;
  function removalButton(item:Omit<Removal,'requestId'>){
    return <button type="button" className="text-brand-700 underline disabled:opacity-50" disabled={!!pending||saving}
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
      </div>
      <div>
        <h4 className="font-semibold">Aplicaciones registradas</h4>
        {!payment.documents.length&&!payment.opening.length&&<p className="mt-1">Pago a cuenta del proveedor.</p>}
        <ul className="divide-y">
          {payment.documents.map(doc=><li key={doc.purchase_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{doc.reference} · {money(doc.amount)}</span>
            {payment.included&&removalButton({kind:'document',id:doc.purchase_id,reference:doc.reference,amount:doc.amount})}
          </li>)}
          {payment.opening.map(part=><li key={part.target_key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>Saldo inicial · {part.reference} · {money(part.amount)}</span>
            {payment.openingSignature&&(payment.included||payment.opening.length===1)&&removalButton({
              kind:'opening',id:part.target_key,reference:part.reference,amount:part.amount,
            })}
          </li>)}
        </ul>
        {payment.reserved>0&&<p className="mt-1">Reservado para órdenes de compra: {money(payment.reserved)}</p>}
        {payment.included
          ? <p className="mt-1">Disponible para aplicar: <strong>{money(Math.max(0,available)/100)}</strong></p>
          : <p className="mt-1 text-slate-600">Pago fuera del saldo vigente. Las aplicaciones históricas a documentos se muestran para consulta.</p>}
      </div>
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
