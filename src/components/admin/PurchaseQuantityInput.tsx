'use client';
import {type PurchaseUnit} from '@/lib/purchaseUnits';
export default function PurchaseQuantityInput({name,unit,quantity,onChange}:{name:string;unit:PurchaseUnit;quantity:number;onChange:(value:number)=>void}){
 return <div className="inline-flex items-center gap-1.5"><input aria-label={`${unit==='kg'?'Kilos':'Unidades'} de ${name}`} type="number" min={unit==='kg'?0.001:1} step={unit==='kg'?'any':1} required value={quantity||''} onChange={e=>onChange(Number(e.target.value))} className="w-20 rounded-lg border px-2 py-1 text-right text-xs text-slate-900"/>{unit==='kg'&&<span className="text-xs font-normal text-slate-500">kg</span>}</div>;
}
