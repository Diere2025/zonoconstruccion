'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
const financialRequest=createAuthenticatedRequester(supabase);
import SelectionModal from './SelectionModal';
import type {ApplicationReference} from '@/lib/financialOperations/references';
export default function OrderApplications({id,onClose}:{id:string;onClose:()=>void}){
 const [data,setData]=useState<{order:{legacy_code:string;customer_name:string};applications:ApplicationReference[]}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;financialRequest(`/api/admin/financial-operations?order_id=${id}`).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
 return <SelectionModal title={`Pedido ${data?.order.legacy_code||''} · Aplicaciones`} onClose={onClose}><div>{error?<p role="alert">{error}</p>:data?<><p className="mt-3 text-sm">{data.order.customer_name}</p><h3 className="mt-4 text-sm font-semibold">Aplicaciones</h3>{data.applications.length?data.applications.map(a=><div key={a.id} className="mt-2 text-sm">{a.href?<a href={a.href} className="text-brand-700 underline">{a.kind} · {a.code}</a>:<span>{a.kind} · {a.code}</span>} · {a.amount?.toLocaleString('es-AR')}</div>):<p className="text-sm">Sin cobros vinculados.</p>}</>:<p className="mt-4 text-sm">Cargando…</p>}</div></SelectionModal>;
}
