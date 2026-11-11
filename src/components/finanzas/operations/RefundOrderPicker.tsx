'use client';
import {useEffect,useState} from 'react';
import SelectionModal from './SelectionModal';
import {fieldClass} from './OperationFields';

export type RefundOrder={id:string;legacy_code:string|null;customer_name:string};
export default function RefundOrderPicker({order,disabled,search,onChange}:{order:RefundOrder|null;disabled:boolean;search:(q:string)=>Promise<RefundOrder[]>;onChange:(order:RefundOrder|null)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[orders,setOrders]=useState<RefundOrder[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  setOrders([]);setError('');setLoading(false);
  if(!open||query.trim().length<3)return;
  let active=true;setLoading(true);
  const timer=setTimeout(()=>{search(query).then(rows=>{if(active)setOrders(rows);})
   .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});},300);
  return()=>{active=false;clearTimeout(timer);};
 },[open,query,search]);
 const label=(o:RefundOrder)=>`${o.legacy_code||o.id.slice(0,8)} · ${o.customer_name}`;
 return <div className="space-y-1 lg:col-span-2">
  <p className="text-xs font-semibold">Pedido de la devolución</p>
  <div className="flex gap-2">
   <button type="button" disabled={disabled} className={fieldClass+' text-left'} onClick={()=>{setQuery('');setOpen(true);}}>{order?label(order):'Seleccionar pedido'}</button>
   {order&&<button type="button" disabled={disabled} className="rounded border px-3 text-xs" onClick={()=>onChange(null)}>Quitar</button>}
  </div>
  {!order&&<p className="text-xs text-amber-800">Si guardás sin pedido, la devolución quedará pendiente de asociar.</p>}
  {open&&<SelectionModal title="Seleccionar pedido de la devolución" onClose={()=>setOpen(false)}>
   <input autoFocus aria-label="Buscar pedido de la devolución" className={fieldClass} placeholder="Código de pedido o nombre (al menos 3 caracteres)" value={query} onChange={e=>{setOrders([]);setQuery(e.target.value);}}/>
   {error?<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>:loading?<p className="mt-3 text-sm">Buscando…</p>:query.trim().length>=3&&!orders.length?<p className="mt-3 text-sm">Sin coincidencias.</p>:null}
   <div className="mt-3 space-y-2">{orders.map(o=><button key={o.id} type="button" className="block w-full rounded-lg border p-3 text-left text-sm" onClick={()=>{onChange(o);setOpen(false);}}>{label(o)}</button>)}</div>
  </SelectionModal>}
 </div>;
}
