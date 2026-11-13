export type OrderProduct = {id:string;name:string;sku?:string|null;is_active?:boolean;is_discontinued?:boolean};
export type OrderHistoryItem = {product_id:string|null;raw_product_name:string|null;purchase_order_id:string;status?:string;purchase_orders:{supplier_id:string;order_date:string;status:string}};
export type OrderSuggestion = {key:string;productId:string|null;name:string;sku:string;frequency:number;latest:string;linked:boolean};
export const orderItemNameKey=(name:string)=>name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
export function supplierOrderSuggestions(supplierId:string,products:OrderProduct[],relations:{supplier_id:string;product_id:string}[],history:OrderHistoryItem[]):OrderSuggestion[]{
 const active=products.filter(p=>p.is_active!==false&&!p.is_discontinued&&!p.name.includes('_OLD')&&!p.sku?.includes('_OLD')&&!p.name.startsWith('[Interno]'));
 const byId=new Map(active.map(p=>[p.id,p]));
 const byName=new Map<string,OrderProduct[]>();for(const p of active){const k=orderItemNameKey(p.name);byName.set(k,[...(byName.get(k)||[]),p]);}
 const result=new Map<string,OrderSuggestion>(),seen=new Map<string,Set<string>>();
 const ensure=(p:OrderProduct|null,name:string)=>{const key=p?'product:'+p.id:'name:'+orderItemNameKey(name);let s=result.get(key);if(!s){s={key,productId:p?.id||null,name:p?.name||name.trim(),sku:p?.sku||'',frequency:0,latest:'',linked:false};result.set(key,s);}return s;};
 for(const p of active)ensure(p,p.name);
 for(const r of relations.filter(r=>r.supplier_id===supplierId)){const p=byId.get(r.product_id);if(p)ensure(p,p.name).linked=true;}
 for(const h of history){if(h.purchase_orders.supplier_id!==supplierId||h.status==='Cancelado'||h.purchase_orders.status==='Cancelado')continue;
  if(h.product_id&&!byId.has(h.product_id))continue;
  const name=h.raw_product_name?.trim()||'';if(!h.product_id&&!name)continue;
  const names=byName.get(orderItemNameKey(name));const p=h.product_id?byId.get(h.product_id)!:names?.length===1?names[0]:null;
  const s=ensure(p,name),orders=seen.get(s.key)||new Set<string>();orders.add(h.purchase_order_id);seen.set(s.key,orders);s.frequency=orders.size;s.latest=[s.latest,h.purchase_orders.order_date].sort().at(-1)!;
 }
 return [...result.values()].sort((a,b)=>b.frequency-a.frequency||b.latest.localeCompare(a.latest)||Number(b.linked)-Number(a.linked)||a.name.localeCompare(b.name,'es'));
}
