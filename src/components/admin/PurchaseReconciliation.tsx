'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { billLineTotals, billTotals, moneyRound, type BillLineInput, type SupplierBillInput } from '@/lib/purchaseReconciliation';
import ErpDateInput from '@/components/ui/ErpDateInput';
import { displayDateField, displayErpInstant } from '@/lib/dates/dateFields';
import { treasuryToday } from '@/lib/treasuryTransactionTime';
import { X, Loader2 } from 'lucide-react';

interface ReceiptItem {id:string;product_name:string|null;quantity_received:number;unit_cost:number;product:{name:string;sku:string}|null;order:{unit_cost:number;purchase_orders:{oc_code:string}}|null}
interface Receipt {id:string;supplier_id:string;delivery_slip_number:string|null;reception_date:string;currency:'ARS'|'USD';supplier:{name:string};items:ReceiptItem[]}
interface Bill {id:string;supplier_id:string;number:string;document_type:'Factura'|'Boleta';bill_date:string;due_date:string|null;currency:'ARS'|'USD';declared_total:number;calculated_total:number;perceptions_ba:number;perceptions_caba:number;perceptions_other:number;notes:string;resolution:string;status:string;version:number;supplier:{name:string}}
interface SavedLine {bill_id:string;receipt_item_id:string;quantity:number;unit_price:number;discount:number;vat:number;net_amount:number;tax_amount:number;expected_unit_cost:number}
interface Data {receipts:Receipt[];bills:Bill[];lines:SavedLine[]}
const field='w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100';
const action='rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50';
const formatPrice=(value:number)=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const formatDateDDMMYYYY=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?displayDateField(value):(displayErpInstant(value).slice(0,10)||'—');
function draftFromReceipt(receipt:Receipt,source:Data):SupplierBillInput {
  const approved=new Set(source.bills.filter(b=>b.status==='Conciliado').map(b=>b.id));
  const quantities=new Map<string,number>();
  for(const line of source.lines)if(approved.has(line.bill_id))quantities.set(line.receipt_item_id,(quantities.get(line.receipt_item_id)||0)+Number(line.quantity));
  const lines=receipt.items.map(item=>({receiptItemId:item.id,quantity:Math.round(Math.max(0,Number(item.quantity_received)-(quantities.get(item.id)||0))*1000)/1000,unitPrice:Number(item.order?.unit_cost??item.unit_cost),discount:0,vat:0})).filter(l=>l.quantity>0);
  return {id:crypto.randomUUID(),requestId:crypto.randomUUID(),version:0,supplierId:receipt.supplier_id,number:'',date:treasuryToday(),dueDate:null,type:'Boleta',currency:receipt.currency,perceptionsBa:0,perceptionsCaba:0,perceptionsOther:0,declaredTotal:billTotals(lines,0,0).total,notes:'',resolution:'',confirm:false,lines};
}
function draftFromBill(bill:Bill,source:Data):SupplierBillInput {
  return {id:bill.id,requestId:crypto.randomUUID(),version:bill.version,supplierId:bill.supplier_id,number:bill.number,date:bill.bill_date,dueDate:bill.due_date,type:bill.document_type,currency:bill.currency,perceptionsBa:Number(bill.perceptions_ba),perceptionsCaba:Number(bill.perceptions_caba),perceptionsOther:Number(bill.perceptions_other),declaredTotal:Number(bill.declared_total),notes:bill.notes,resolution:bill.resolution,confirm:false,lines:source.lines.filter(l=>l.bill_id===bill.id).map(l=>({receiptItemId:l.receipt_item_id,quantity:Number(l.quantity),unitPrice:Number(l.unit_price),discount:Number(l.discount),vat:Number(l.vat)}))};
}
function pendingBills(receipt:Receipt,source:Data) {
  const items=new Set(receipt.items.map(i=>i.id));
  const bills=new Set(source.lines.filter(l=>items.has(l.receipt_item_id)).map(l=>l.bill_id));
  return source.bills.filter(b=>bills.has(b.id)&&!['Conciliado','Anulado'].includes(b.status));
}
export default function PurchaseReconciliation({supplierId,receiptId,onChanged,onClose}:{supplierId?:string;receiptId?:string;onChanged:()=>void;onClose:()=>void}) {
  const api=useRef(createAuthenticatedRequester(supabase));
  const [data,setData]=useState<Data>({receipts:[],bills:[],lines:[]});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [editor,setEditor]=useState<SupplierBillInput|null>(null),[selectedBill,setSelectedBill]=useState<Bill|null>(null);
  const [filter,setFilter]=useState('pendientes'),[search,setSearch]=useState(''),[voidReason,setVoidReason]=useState('');
  const sending=useRef(false),initial=useRef(false),retry=useRef<{key:string;id:string}|null>(null);
  const editorForm=useRef<HTMLFormElement>(null);
  const load=useCallback(async()=>{
    const result=await api.current('/api/admin/purchase-reconciliation'+(supplierId?'?supplierId='+supplierId:''));
    setData(result);return result as Data;
  },[supplierId]);
  useEffect(()=>{let active=true;load().then(result=>{
    if(active&&receiptId&&!initial.current){initial.current=true;const receipt=result.receipts.find(r=>r.id===receiptId);if(receipt){const pending=pendingBills(receipt,result);if(pending.length===1){setSelectedBill(pending[0]);setEditor(draftFromBill(pending[0],result));}else if(!pending.length){const draft=draftFromReceipt(receipt,result);if(draft.lines.length)setEditor(draft);}else setError('Hay varios comprobantes pendientes para este remito. Revisalos en la bandeja.');}}
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[load,receiptId]);
  const used=(itemId:string,except?:string,source=data)=>source.lines.filter(l=>l.receipt_item_id===itemId&&l.bill_id!==except&&source.bills.some(b=>b.id===l.bill_id&&b.status==='Conciliado')).reduce((sum,l)=>sum+Number(l.quantity),0);
  function openNew(receipt:Receipt,source=data) {
    const pending=pendingBills(receipt,source);
    if(pending.length===1){openBill(pending[0]);return;}
    if(pending.length>1){setError('Hay varios comprobantes pendientes para este remito. Revisalos en la bandeja.');return;}
    const draft=draftFromReceipt(receipt,source);
    if(!draft.lines.length){setError('Esta recepción ya está facturada por completo. Podés consultar sus comprobantes.');return;}
    setSelectedBill(null);setVoidReason('');setError('');
    setEditor(draft);
  }
  function openBill(bill:Bill){
    setSelectedBill(bill);setError('');setVoidReason('');
    setEditor(draftFromBill(bill,data));
  }
  const readonly=!!selectedBill&&['Conciliado','Anulado'].includes(selectedBill.status);
  const lookup=new Map(data.receipts.flatMap(receipt=>receipt.items.map(item=>[item.id,{item,receipt}] as const)));
  const totals=editor?billTotals(editor.lines,editor.perceptionsBa+editor.perceptionsCaba+editor.perceptionsOther,editor.declaredTotal):null;
  const expected=(line:BillLineInput)=>selectedBill?Number(data.lines.find(l=>l.bill_id===selectedBill.id&&l.receipt_item_id===line.receiptItemId)?.expected_unit_cost??lookup.get(line.receiptItemId)?.item.order?.unit_cost??lookup.get(line.receiptItemId)?.item.unit_cost??0):Number(lookup.get(line.receiptItemId)?.item.order?.unit_cost??lookup.get(line.receiptItemId)?.item.unit_cost??0);
  const priceDifference=editor?.lines.some(l=>Math.abs(billLineTotals(l).net-moneyRound(l.quantity*expected(l)))>0.01);
  const differences=!!totals&&(Math.abs(totals.difference)>0.01||priceDifference);
  function change<K extends keyof SupplierBillInput>(key:K,value:SupplierBillInput[K]){setEditor(e=>e?{...e,[key]:value}:e);}
  function changeLine(index:number,key:keyof Omit<BillLineInput,'receiptItemId'>,value:number){setEditor(e=>e?{...e,lines:e.lines.map((l,i)=>i===index?{...l,[key]:value}:l)}:e);}
  function addReceipt(id:string){
    if(!editor)return;const receipt=data.receipts.find(r=>r.id===id);if(!receipt)return;
    const additions=receipt.items.filter(i=>!editor.lines.some(l=>l.receiptItemId===i.id)).map(i=>({receiptItemId:i.id,quantity:Math.max(0,Number(i.quantity_received)-used(i.id,editor.id)),unitPrice:Number(i.order?.unit_cost??i.unit_cost),discount:0,vat:editor.type==='Factura'?21:0})).filter(l=>l.quantity>0);
    change('lines',[...editor.lines,...additions]);
  }
  async function save(confirm:boolean,voiding=false){
    if(!editor||sending.current)return;
    if(!voiding&&editorForm.current&&!editorForm.current.reportValidity())return;
    sending.current=true;setBusy(true);setError('');
    const body=voiding?{id:editor.id,supplierId:editor.supplierId,version:editor.version,void:true,resolution:voidReason}:{...editor,confirm};
    const key=JSON.stringify({...body,requestId:undefined});
    if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()};
    try{
      await api.current('/api/admin/purchase-reconciliation',{method:'POST',body:JSON.stringify({...body,requestId:retry.current.id})});
      setEditor(null);setSelectedBill(null);retry.current=null;onChanged();
      try{await load();}catch(e){setError('El comprobante se guardó. No se pudo actualizar la bandeja: '+(e as Error).message);}
    }catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);}
  }
  const normalized=search.toLowerCase();
  const receipts=data.receipts.filter(r=>(!receiptId||r.id===receiptId)&&`${r.delivery_slip_number||''} ${r.supplier?.name}`.toLowerCase().includes(normalized));
  const bills=data.bills.filter(b=>(filter==='todos'||!['Conciliado','Anulado'].includes(b.status))&&`${b.number} ${b.supplier?.name}`.toLowerCase().includes(normalized));
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-label="Conciliación de compras">
    <section className="flex max-h-[95dvh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="text-lg font-bold">{editor?'Completar comprobante y conciliar':'Conciliación de compras'}</h2><p className="text-sm text-slate-600">{editor?'Artículos y cantidades desde lo recibido. La confirmación regulariza la misma deuda.':'Recepciones pendientes de facturar y comprobantes por revisar.'}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar conciliación" className={action}><X size={18}/></button></header>
      <div className="space-y-4 overflow-auto p-4">
        {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {loading?<Loader2 className="animate-spin"/>:editor?<form ref={editorForm} onSubmit={event=>event.preventDefault()} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><button type="button" className={action} disabled={busy} onClick={()=>{setEditor(null);setSelectedBill(null);setError('');}}>Volver a pendientes</button><strong>{data.receipts.find(r=>r.supplier_id===editor.supplierId)?.supplier?.name} · {editor.currency}</strong>{selectedBill&&<span>{selectedBill.status}</span>}</div>
          <fieldset disabled={busy||readonly} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <label className="text-sm">Tipo<select aria-label="Tipo" className={field} value={editor.type} onChange={e=>{const type=e.target.value as 'Factura'|'Boleta';setEditor(old=>old?{...old,type,lines:old.lines.map(l=>({...l,vat:type==='Factura'?21:0}))}:old);}}><option>Boleta</option><option>Factura</option></select></label>
              <label className="text-sm">Número<input required className={field} maxLength={100} value={editor.number} onChange={e=>change('number',e.target.value)}/></label>
              <label className="text-sm">Fecha<ErpDateInput required className={field} aria-label="Fecha del comprobante" value={editor.date} onChange={e=>change('date',e.target.value)}/></label>
              <label className="text-sm">Vencimiento<ErpDateInput className={field} aria-label="Vencimiento del comprobante" value={editor.dueDate||''} onChange={e=>change('dueDate',e.target.value||null)}/></label>
              <label className="text-sm">Agregar otro remito<select aria-label="Agregar otro remito" className={field} value="" onChange={e=>addReceipt(e.target.value)}><option value="">Seleccionar…</option>{data.receipts.filter(r=>r.supplier_id===editor.supplierId&&r.currency===editor.currency&&r.items.some(i=>!editor.lines.some(l=>l.receiptItemId===i.id)&&Number(i.quantity_received)>used(i.id,editor.id))).map(r=><option key={r.id} value={r.id}>{r.delivery_slip_number||r.id.slice(0,8)} · {formatDateDDMMYYYY(r.reception_date)}</option>)}</select></label>
            </div>
            <p className="text-xs text-slate-600">Precios antes de IVA. La OC aporta el precio neto acordado; aplicá descuento solo si el precio del comprobante todavía no lo incluye. IVA inicial: 21% para factura, editable por artículo.</p>
            <div className="overflow-auto"><table className="w-full min-w-[1040px] text-sm"><thead><tr className="border-b text-left">{['Remito / OC / Artículo','Recibido','Pendiente','A facturar','Acordado neto','Precio','Dto. %','IVA %','Neto','Diferencia neta',''].map((h,i)=><th className="p-2" key={i}>{h}</th>)}</tr></thead><tbody>{editor.lines.map((line,index)=>{
              const found=lookup.get(line.receiptItemId),amounts=billLineTotals(line),delta=moneyRound(amounts.net-line.quantity*expected(line));
              return <tr className="border-b" key={line.receiptItemId}><td className="p-2"><div className="text-xs text-slate-500">{found?.receipt.delivery_slip_number||'Sin número'} · {found?.item.order?.purchase_orders?.oc_code||'Sin OC'}</div>{found?.item.product?.name||found?.item.product_name||'Artículo'}</td><td className="p-2">{found?.item.quantity_received}</td><td className="p-2">{found?Math.max(0,Number(found.item.quantity_received)-used(line.receiptItemId,editor.id)):0}</td>
                {(['quantity'] as const).map(k=><td className="p-1" key={k}><input aria-label={`Cantidad a facturar ${index+1}`} className={field} type="number" min="0.001" step="0.001" value={line[k]} onChange={e=>changeLine(index,k,Number(e.target.value))}/></td>)}
                <td className="p-2">{formatPrice(expected(line))}</td>{(['unitPrice','discount','vat'] as const).map(k=><td className="p-1" key={k}><input aria-label={`${k==='unitPrice'?'Precio':k==='discount'?'Descuento':'IVA'} ${index+1}`} className={field} type="number" min="0" max={k==='unitPrice'?undefined:100} step="0.01" value={line[k]} onChange={e=>changeLine(index,k,Number(e.target.value))}/></td>)}
                <td className="p-2">{formatPrice(amounts.net)}</td><td className={'p-2 '+(Math.abs(delta)>0.01?'text-amber-800':'')}>{formatPrice(delta)}</td><td><button type="button" className={action} aria-label={`Quitar artículo ${index+1}`} onClick={()=>change('lines',editor.lines.filter((_,i)=>i!==index))}>Quitar</button></td></tr>;
            })}</tbody></table></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(['perceptionsBa','perceptionsCaba','perceptionsOther','declaredTotal'] as const).map((key,i)=><label className="text-sm" key={key}>{['Percepción Buenos Aires','Percepción CABA','Otras percepciones','Total del comprobante'][i]}<input className={field} type="number" min="0" step="0.01" value={editor[key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}</div>
            <div className="flex flex-wrap gap-5 rounded-lg bg-slate-50 p-3 text-sm"><span>Neto: <strong>{formatPrice(totals!.net)}</strong></span><span>IVA: <strong>{formatPrice(totals!.tax)}</strong></span><span>Total calculado: <strong>{formatPrice(totals!.total)}</strong></span><span>Diferencia con comprobante: <strong>{formatPrice(totals!.difference)}</strong></span></div>
            <label className="block text-sm">Observaciones<textarea className={field} maxLength={4000} value={editor.notes} onChange={e=>change('notes',e.target.value)}/></label>
            <label className="block text-sm">{differences?'Resolución de diferencias (obligatoria para conciliar)':'Resolución / aprobación'}<textarea className={field} maxLength={4000} value={editor.resolution} onChange={e=>change('resolution',e.target.value)}/></label>
          </fieldset>
          {differences&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Hay diferencias de precio o total. Guardá para revisar, o explicá la resolución antes de confirmar. El costo por artículo usa el neto sin IVA; una diferencia global aceptada se distribuye en la deuda por remito.</p>}
          {!readonly&&<div className="flex flex-wrap gap-3"><button type="button" className={action} disabled={busy||!editor.lines.length} onClick={()=>void save(false)}>Guardar para revisar</button><button type="button" className={action+' bg-blue-700 text-white'} disabled={busy||!editor.lines.length||!!(differences&&!editor.resolution.trim())} onClick={()=>void save(true)}>{busy?'Guardando…':'Confirmar conciliación'}</button></div>}
          {selectedBill&&selectedBill.status!=='Anulado'&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm">{selectedBill.status==='Conciliado'?'Para corregir, anulá esta conciliación con motivo. Se restituye la deuda previa y se liberan las cantidades facturadas.':'Podés anular este borrador con motivo para descartarlo.'}</p><label className="block text-sm">Motivo de anulación<input className={field} disabled={busy} maxLength={4000} value={voidReason} onChange={e=>setVoidReason(e.target.value)}/></label><button type="button" className={action} disabled={busy||!voidReason.trim()} onClick={()=>void save(false,true)}>Anular comprobante</button></div>}
        </form>:<>
          <div className="flex flex-wrap gap-3"><input aria-label="Buscar proveedor o comprobante" placeholder="Buscar proveedor o comprobante" className={field+' max-w-sm'} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Estado de conciliación" className={field+' max-w-xs'} value={filter} onChange={e=>setFilter(e.target.value)}><option value="pendientes">Pendientes de conciliar</option><option value="todos">Todos los comprobantes</option></select></div>
          <h3 className="font-bold">Recepciones pendientes de facturar</h3><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Proveedor / Remito</th><th className="p-2">Fecha</th><th className="p-2">Estado</th><th/></tr></thead><tbody>{receipts.filter(r=>r.items.some(i=>Number(i.quantity_received)>used(i.id)+0.00001)).map(r=>{const partial=r.items.some(i=>used(i.id)>0);return <tr className="border-b" key={r.id}><td className="p-2">{r.supplier?.name} · {r.delivery_slip_number||r.id.slice(0,8)}</td><td className="p-2">{formatDateDDMMYYYY(r.reception_date)}</td><td className="p-2">{partial?'Facturación parcial':'Pendiente de comprobante'}</td><td className="p-2"><button className={action} onClick={()=>openNew(r)}>Completar comprobante y conciliar</button></td></tr>;})}</tbody></table></div>
          <h3 className="font-bold">Comprobantes ({bills.length})</h3><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{['Proveedor / Número','Fecha','Vencimiento','Estado','Total',''].map((h,i)=><th className="p-2" key={i}>{h}</th>)}</tr></thead><tbody>{bills.map(b=><tr className="border-b" key={b.id}><td className="p-2">{b.supplier?.name} · {b.document_type} {b.number}</td><td className="p-2">{formatDateDDMMYYYY(b.bill_date)}</td><td className="p-2">{b.due_date?formatDateDDMMYYYY(b.due_date):'—'}</td><td className="p-2">{b.status}</td><td className="p-2">{b.currency} {formatPrice(b.declared_total)}</td><td className="p-2"><button className={action} onClick={()=>openBill(b)}>Ver / completar</button></td></tr>)}</tbody></table>{!bills.length&&<p className="p-3 text-slate-500">No hay comprobantes con estos filtros.</p>}</div>
        </>}
      </div>
    </section>
  </div>;
}
