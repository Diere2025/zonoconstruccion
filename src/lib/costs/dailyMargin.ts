import { isDiscountProduct } from '@/lib/erp/discounts';
import { sellerCommissionBase } from '@/lib/sellerCommissionBase';
import { Result, catalogIdentity } from './model';

export interface MarginItem {product_id:string|null;product_name:string;quantity:number;unit_price:number;subtotal:number|null;historical_unit_cost:number|null}
export interface MarginOrder {id:string;legacy_code:string|null;status?:string;total_amount:number;totals:{items_subtotal?:number;subtotal?:number;freight?:number;payment_surcharges?:number}|null;order_items:MarginItem[]}
export interface Delivered {order_id:string;real_delivery_date:string|null;status:string}
export interface InstallationCost {id:string;name:string;unitCost:number}
export function isEncomiendaCode(code:unknown):boolean {return /^ENC(?:\d|\b)/i.test(String(code||'').trim());}
export function isExchangeCode(code:unknown):boolean {return /^CAMB(?:\d|\b)/i.test(String(code||'').trim());}
export function deliveryDates(deliveries:Delivered[]) {
  const dates=new Map<string,Set<string>>();
  for(const d of deliveries)if(d.status==='entregado'&&d.real_delivery_date){const set=dates.get(d.order_id)||new Set<string>();set.add(d.real_delivery_date);dates.set(d.order_id,set);}
  return dates;
}
export function orderMargin(order:MarginOrder,day:string,current:Result[],mode:'historical'|'replacement',installationCosts:InstallationCost[]=[]) {
  const exchange=isExchangeCode(order.legacy_code);
  const recordedSales=sellerCommissionBase(order).netSales;
  const sales=exchange?0:recordedSales;
  const lines=order.order_items.map(item=>{
    const byId=item.product_id?current.filter(p=>p.id===item.product_id||p.equivalentIds?.includes(item.product_id!)):[];
    const matches=byId.length?byId:current.filter(p=>catalogIdentity(p.name)===catalogIdentity(item.product_name));
    const product=matches.length===1?matches[0]:undefined;
    const service=installationCosts.find(s=>item.product_id?s.id===item.product_id:catalogIdentity(s.name)===catalogIdentity(item.product_name));
    const discount=isDiscountProduct({name:item.product_name});
    const saved=Number(item.historical_unit_cost)>0?Number(item.historical_unit_cost):null;
    // Saved totals have no material/operations split: subtracting operations would invent a historical value.
    const unitCost=discount?0:service&&service.unitCost>0?service.unitCost:product?.material??null;
    const source=discount?'Descuento sin costo':service?'Servicio de instalación: costo registrado':unitCost!=null?'Materiales / compra actuales (estimación)':'Falta costo de materiales / compra';
    const warnings=discount?[]:(product?.warnings||[]).filter(w=>!w.includes('Falta definir gastos de operación'));
    if(!discount&&mode==='historical')warnings.push(saved!=null?'Se usan materiales actuales: el costo histórico guardado no separa los gastos de fabricación. Se muestra solo como referencia.':'Se usan materiales actuales: no hay un costo histórico desglosado.');
    if(service)warnings.push('Servicio de instalación descontado aparte de los materiales; costo registrado en catálogo sin fecha de vigencia.');
    if(!discount&&!product&&!service)warnings.push(matches.length>1?'Coincidencia ambigua con el catálogo; no se elige un costo automáticamente.':'Producto sin vinculación inequívoca con el catálogo de costos.');
    const complete=discount||(unitCost!=null&&warnings.length===0);
    const quantity=Number(item.quantity);
    return {name:item.product_name,quantity,unitCost,cost:unitCost==null?null:unitCost*quantity,source,complete,warnings,operationsReference:discount||service?0:product?.operations??null,operationsPending:!discount&&!service&&!!product&&Object.values(product.operationDetail||{}).some(v=>v==null),historicalCostReference:discount?0:saved};
  });
  const known=lines.reduce((sum,l)=>sum+(l.cost??0),0),missing=lines.length===0||lines.some(l=>l.cost==null||!Number.isFinite(l.quantity)||l.quantity<=0);
  const cost=missing?null:known;
  const recordedFreight=Number(order.totals?.freight)||0;
  const freightCharged=exchange?0:recordedFreight;
  const rawSurcharge=Number(order.totals?.payment_surcharges)||0;
  const recordedSurcharges=Number.isFinite(rawSurcharge)?Math.max(0,rawSurcharge):0;
  const surchargesCharged=exchange?0:recordedSurcharges;
  const reasons=lines.length===0?['Pedido sin productos registrados.']:lines.flatMap(l=>l.cost==null?[`${l.name}: falta un costo de materiales / compra identificable.`]:!Number.isFinite(l.quantity)||l.quantity<=0?[`${l.name}: cantidad inválida.`]:[]);
  const operationsReference=lines.some(l=>l.operationsReference==null)?null:lines.reduce((sum,l)=>sum+l.operationsReference!*l.quantity,0);
  if(exchange)reasons.push('Código CAMB: los importes registrados pueden corresponder al pedido anterior, por lo que no se reconocen como venta, flete ni recargos nuevos. Para calcular el resultado del cambio hay que identificar un eventual cobro adicional y el costo o recuperación del producto devuelto. El costo de reposición se muestra solo como referencia.');
  return {id:order.id,code:order.legacy_code||order.id.slice(0,8),day,sales,recordedSales,recordedFreight,recordedSurcharges,surchargesCharged,exchange,total:Number(order.total_amount)||0,freightCharged,cost,knownCost:known,operationsReference,operationsPending:lines.some(l=>l.operationsPending),reasons,margin:exchange||cost==null?null:sales+freightCharged+surchargesCharged-cost,status:exchange?'Cambio: pendiente de conciliación':missing?'Falta costo':lines.every(l=>l.complete)?'Estimación con costos completos':'Estimación parcial',lines};
}
export function dailyTotals(orders:ReturnType<typeof orderMargin>[]) {
  const grouped=new Map<string,{day:string;orders:number;sales:number;freightCharged:number;surchargesCharged:number;operationsReference:number;cost:number;calculableSales:number;margin:number;missing:number;partial:number}>();
  for(const o of orders){const day=grouped.get(o.day)||{day:o.day,orders:0,sales:0,freightCharged:0,surchargesCharged:0,operationsReference:0,cost:0,calculableSales:0,margin:0,missing:0,partial:0};day.orders++;day.sales+=o.sales;day.freightCharged+=o.freightCharged;day.surchargesCharged+=o.surchargesCharged;day.operationsReference+=o.operationsReference??0;if(o.margin!=null){day.cost+=o.cost!;day.margin+=o.margin;day.calculableSales+=o.sales;}else day.missing++;if(o.status==='Estimación parcial')day.partial++;grouped.set(o.day,day);}
  return [...grouped.values()].sort((a,b)=>b.day.localeCompare(a.day));
}
