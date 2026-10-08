'use client';
import { useCallback, useEffect, useState } from 'react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { visitsRequest } from '@/lib/visits/client';
import { expandVisitOrderLines, type KitComponents } from '@/lib/visits/order';
import { money, visitCode, type VisitCase, type VisitQuote } from '@/lib/visits/model';
import { buttonStyle, primaryStyle } from './VisitForm';
type Product={id:string;name:string;sku:string|null;price:number};
interface Draft {visit:VisitCase;quote:VisitQuote;products:Product[];kit_components:KitComponents;whaticket_link:string;prepared_for:string;}
export default function VisitOrderDraft({id,hasOrder,autoOpen=false}:{id:string;hasOrder:boolean;autoOpen?:boolean}) {
  const [draft,setDraft]=useState<Draft|null>(null),[mapping,setMapping]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setBusy(true);setError('');try{const d:Draft=await visitsRequest(`/api/visits/order-draft/${id}`);setDraft(d);setMapping(d.quote.lines.map(line=>d.products.find(p=>p.name.toLowerCase().trim()===line.description.toLowerCase().trim())?.id || (!d.quote.kit.custom && /kit|instalaci/i.test(line.description) && d.products.some(p=>p.id===d.quote.kit.id) ? d.quote.kit.id : '')));}catch(e){setError(e instanceof Error?e.message:'No se pudo preparar el pedido.');}finally{setBusy(false);}},[id]);
  useEffect(()=>{if(autoOpen && !hasOrder)void load();},[autoOpen,hasOrder,load]);
  function proceed(){if(!draft||mapping.some(id=>!id))return;const v=draft.visit,q=draft.quote;
    let items;try{items=expandVisitOrderLines(q.lines,mapping,draft.products,draft.kit_components || {});}catch(e){setError(e instanceof Error?e.message:'No se pudo preparar el kit.');return;}
    const notes=[`${visitCode(v.number)} · Presupuesto aceptado versión ${q.number}`,v.request_reason,v.notes,q.conditions,v.deposit_amount ? 'Seña informada: '+money(v.deposit_amount)+'. Pendiente de validación contable.' : '',q.exclusions?`Exclusiones: ${q.exclusions}`:'',v.extras?`Extras informados: ${v.extras}`:'',...(v.extras_products || []).map(e=>`${e.name}: ${e.quantity} ${e.unit==='metro'?'m (una unidad por metro)':'unidad(es)'}`),`Valor de visita acordado: ${money(v.visit_fee||0)}. ${v.discount_visit_fee?'Se descuenta si acepta el trabajo.':'No se descuenta.'}`].filter(Boolean).join('\n');
    const data={sourceVisitId:v.id,sourceVisitQuoteId:q.id,preparedFor:draft.prepared_for,customerName:v.customer_name,customerPhone:v.phone,address:v.address,locality:v.locality,localityId:v.locality_id||'',mapsUrl:v.maps_url,whaticketLink:draft.whaticket_link,sellerId:v.seller_id,notes,items,installationDate:v.installation_date || '',quotedTotal:q.total};
    sessionStorage.setItem('visit_order_draft',JSON.stringify(data));window.location.assign('/vendedores/pedidos?from_visit='+v.id);
  }
  if(hasOrder)return <p className="text-xs text-slate-500">Ya tiene un pedido asociado. No se creará otro desde esta visita.</p>;
  return <div className="space-y-3"><button className={primaryStyle} disabled={busy} onClick={()=>void load()}>{autoOpen ? 'Preparar pedido' : 'Convertir visita en pedido'}</button>{error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{draft&&<div className="space-y-3 rounded-lg border bg-slate-50 p-4"><p className="text-sm font-semibold">Datos del cliente y presupuesto aceptado precargados</p><p className="text-xs text-slate-500">Revisá qué producto corresponde a cada concepto. En Pedidos se completan únicamente los datos de entrega, procedencia y pago que falten.</p>{draft.quote.lines.map((line,index)=><div key={index} className="space-y-1"><p className="text-sm">{line.description} · {line.quantity} × {money(line.unit_price)}</p><SearchableSelect label={`Producto del concepto ${index+1}`} required options={draft.products.map(p=>({value:p.id,label:p.name}))} value={mapping[index]||''} onChange={id=>setMapping(prev=>prev.map((value,i)=>i===index?id:value))}/></div>)}<p className="font-semibold">Total cotizado: {money(draft.quote.total)}</p><div className="flex flex-wrap gap-2"><button className={primaryStyle} disabled={mapping.some(id=>!id)} onClick={proceed}>Continuar en Pedidos</button><button className={buttonStyle} onClick={()=>setDraft(null)}>Cancelar</button></div></div>}</div>;
}
