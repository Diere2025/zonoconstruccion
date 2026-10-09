'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { receiptGroups, distributeReceiptQuantity } from '@/lib/supplierReceiptGroups';
export default function SupplierReceiptItems({ items, onChange, formatPrice }: { items: any[]; onChange: (items: any[]) => void; formatPrice: (value: number) => string }) {
 const [expanded, setExpanded] = useState<string[]>([]);
 const change = (indexes: number[], field: string, value: string) => onChange(items.map((item, i) => indexes.includes(i) ? {...item, [field]: Math.max(0, Number(value) || 0)} : item));
 const inputClass = 'w-24 rounded-lg border px-2 py-1 text-right text-xs';
 const remove = (indexes: number[]) => onChange(items.filter((_, i) => !indexes.includes(i)));
 return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
 <table className="w-full min-w-[620px] text-left text-xs">
 <thead className="border-b bg-slate-50 text-slate-400 uppercase"><tr>{['SKU / distribución por OC','Pedido','Recibido','Recibir','Costo unit.','Subtotal',''].map((label,i)=><th key={i} className={'px-3 py-2 '+(i?'text-right':'')}>{label}</th>)}</tr></thead>
 <tbody className="divide-y divide-slate-100">
 {!items.length && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Vinculá una OC o agregá un artículo.</td></tr>}
 {receiptGroups(items).map(group=>{
 const indexes=group.lines.map((line:any)=>line.index),open=expanded.includes(group.key);
 const toggle=()=>setExpanded(current=>open?current.filter(key=>key!==group.key):[...current,group.key]);
 return <React.Fragment key={group.key}><tr className="font-bold text-slate-700">
 <td className="px-3 py-2" title={group.name}><button type="button" className="flex items-center gap-2 text-left" aria-expanded={open} onClick={toggle}>{open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{group.sku}<span className="block text-[10px] font-normal text-slate-400">{group.lines.map((line:any)=>(line.ocCode||'Sin OC')+': '+line.quantityReceivedNew).join(' · ')}</span></span></button></td>
 <td className="px-3 py-2 text-right">{group.ordered}</td><td className="px-3 py-2 text-right">{group.prior}</td>
 <td className="px-3 py-2 text-right"><input aria-label={'Recibir '+group.sku} type="number" min={0} max={group.lines.every((line:any)=>line.poItemId)?group.ordered-group.prior:undefined} step="any" required className={inputClass+' font-bold text-green-600'} value={group.quantity} onChange={e=>onChange(distributeReceiptQuantity(items,indexes,Number(e.target.value)||0))}/></td>
 <td className="px-3 py-2 text-right">{group.cost===null?<button type="button" onClick={()=>setExpanded(current=>[...new Set([...current,group.key])])} className="text-brand-600">Ver por OC</button>:<input aria-label={'Costo '+group.sku} type="number" min={0} step="any" required className={inputClass} value={group.cost} onChange={e=>change(indexes,'unitCost',e.target.value)}/>}</td>
 <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(group.subtotal)}</td><td className="px-3 py-2"><button type="button" aria-label={'Quitar '+group.sku} className="text-red-500" onClick={()=>remove(indexes)}><Trash2 size={15}/></button></td></tr>
 {open&&group.lines.map((line:any)=><tr key={line.index} className="bg-slate-50 text-slate-500"><td className="py-2 pl-9 pr-3 text-brand-600">{line.ocCode||'Sin OC'}</td><td className="px-3 text-right">{line.quantityOrdered}</td><td className="px-3 text-right">{line.quantityReceivedPrior}</td><td className="px-3 text-right"><input aria-label={'Recibir '+group.sku+' '+(line.ocCode||'Sin OC')} type="number" min={0} max={line.poItemId?line.quantityOrdered-line.quantityReceivedPrior:undefined} step="any" required className={inputClass} value={line.quantityReceivedNew} onChange={e=>change([line.index],'quantityReceivedNew',e.target.value)}/></td><td className="px-3 text-right"><input aria-label={'Costo '+group.sku+' '+(line.ocCode||'Sin OC')} type="number" min={0} step="any" required className={inputClass} value={line.unitCost} onChange={e=>change([line.index],'unitCost',e.target.value)}/></td><td className="px-3 text-right whitespace-nowrap">{formatPrice(line.quantityReceivedNew*line.unitCost)}</td><td className="px-3"><button type="button" aria-label={'Quitar línea '+line.ocCode} className="text-red-500" onClick={()=>remove([line.index])}><Trash2 size={13}/></button></td></tr>)}
 </React.Fragment>;
 })}
 </tbody></table>
 {!!items.length&&<p className="border-t px-3 py-2 text-[10px] text-slate-400">El total se distribuye en el orden de las OC hasta completar sus pendientes. Expandí el SKU para ajustar cantidades y costos por OC.</p>}
 </div>;
}

