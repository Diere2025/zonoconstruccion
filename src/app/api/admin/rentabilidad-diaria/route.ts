import { NextResponse } from 'next/server';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { costDatabase, readCosts } from '@/lib/costs/server';
import { date, today } from '@/lib/costs/model';
import { dailyTotals, deliveryDates, isEncomiendaCode, orderMargin, Delivered, MarginOrder, InstallationCost } from '@/lib/costs/dailyMargin';
export const runtime='edge';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const denied=await requireFinanceAdmin(request);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try{
    const url=new URL(request.url),from=url.searchParams.get('from')||today().slice(0,7)+'-01',to=url.searchParams.get('to')||today();
    if(date(from)!==from||date(to)!==to||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return NextResponse.json({error:'Elegí un período válido de hasta un año.'},{status:400});
    const mode=url.searchParams.get('mode')==='replacement'?'replacement':'historical';
    const db=costDatabase(),state=await readCosts(db);const deliveries:Delivered[]=[];
    for(let offset=0;;offset+=1000){const r=await db.from('deliveries').select('order_id,real_delivery_date,status').eq('status','entregado').gte('real_delivery_date',from).lte('real_delivery_date',to).order('id').range(offset,offset+999);if(r.error)throw new Error(r.error.message);deliveries.push(...r.data);if(r.data.length<1000)break;}
    const missingIds=new Set<string>();
    for(let offset=0;;offset+=1000){const r=await db.from('deliveries').select('order_id').eq('status','entregado').is('real_delivery_date',null).order('id').range(offset,offset+999);if(r.error)throw new Error(r.error.message);for(const d of r.data)missingIds.add(d.order_id);if(r.data.length<1000)break;}
    const exclusions:{id:string;code:string;reason:string;scope:string}[]=[];
    const ids=[...new Set(deliveries.map(d=>d.order_id))];
    // Fetch every successful attempt for selected orders: conflicting dates outside the filter also count.
    const all:Delivered[]=[],orders:MarginOrder[]=[];
    for(let i=0;i<ids.length;i+=150){const batch=ids.slice(i,i+150);const [o,d]=await Promise.all([db.from('orders').select('id,legacy_code,total_amount,totals,status,order_items(product_id,product_name,quantity,unit_price,subtotal,historical_unit_cost)').in('id',batch),db.from('deliveries').select('order_id,real_delivery_date,status').eq('status','entregado').in('order_id',batch)]);if(o.error||d.error)throw new Error(o.error?.message||d.error?.message);orders.push(...o.data);all.push(...d.data);}
    const undated=[...missingIds];
    for(let i=0;i<undated.length;i+=150){
      const batch=undated.slice(i,i+150);
      // Read flat delivery rows: the embedded orders.deliveries relation can be a single object.
      const [r,d]=await Promise.all([db.from('orders').select('id,legacy_code').in('id',batch),db.from('deliveries').select('order_id,real_delivery_date').eq('status','entregado').not('real_delivery_date','is',null).in('order_id',batch)]);
      if(r.error||d.error)throw new Error(r.error?.message||d.error?.message);
      const dated=new Set(d.data.map(delivery=>delivery.order_id));
      for(const o of r.data){if(dated.has(o.id))continue;exclusions.push({id:o.id,code:o.legacy_code||o.id.slice(0,8),reason:'Entrega marcada como realizada sin fecha real; no se puede asignar la ganancia a un día.',scope:'Toda la base: sin fecha para ubicar en el período'});}
    }
    const dates=deliveryDates(all),conflicts=orders.filter(o=>(dates.get(o.id)?.size||0)>1);
    const installationCosts:InstallationCost[]=[];
    const productIds=[...new Set(orders.flatMap(o=>o.order_items.map(i=>i.product_id).filter((id):id is string=>!!id)))];
    for(let i=0;i<productIds.length;i+=150){const r=await db.from('products').select('id,name,cost_price').eq('is_service',true).ilike('name','%Instalaci%').in('id',productIds.slice(i,i+150));if(r.error)throw new Error(r.error.message);installationCosts.push(...r.data.filter(p=>Number(p.cost_price)>0).map(p=>({id:p.id,name:p.name,unitCost:Number(p.cost_price)})));}
    for(const o of orders){if(isEncomiendaCode(o.legacy_code))exclusions.push({id:o.id,code:o.legacy_code!,reason:'Código ENC: encomienda; excluida del cálculo por indicación del usuario.',scope:'Período seleccionado'});else if(['cancelado','cancelada'].includes(o.status||''))exclusions.push({id:o.id,code:o.legacy_code||o.id.slice(0,8),reason:'Pedido cancelado aunque conserve un registro de entrega.',scope:'Período seleccionado'});else if((dates.get(o.id)?.size||0)>1)exclusions.push({id:o.id,code:o.legacy_code||o.id.slice(0,8),reason:`Varias fechas reales de entrega: ${[...dates.get(o.id)!].join(', ')}. Revisar antes de asignar un día.`,scope:'Período seleccionado'});}
    const rows=orders.filter(o=>!isEncomiendaCode(o.legacy_code)&&!['cancelado','cancelada'].includes(o.status||'')&&dates.get(o.id)?.size===1).map(o=>orderMargin(o,[...dates.get(o.id)!][0],state.current,mode,installationCosts)).sort((a,b)=>b.day.localeCompare(a.day)||a.code.localeCompare(b.code));
    return NextResponse.json({from,to,mode,updatedAt:state.updatedAt,orders:rows,days:dailyTotals(rows),missingDate:exclusions.filter(e=>e.scope.startsWith('Toda')).length,exclusions,conflicts:conflicts.map(o=>({code:o.legacy_code||o.id,dates:[...dates.get(o.id)!]})),notice:'Ganancia del pedido = ventas de productos después de descuentos + flete cobrado + recargos registrados − materiales / compra y servicios de instalación registrados. Los gastos de fabricación se muestran solo como referencia y no se descuentan. Los recargos se muestran por separado y se suman íntegramente; los costos de financiación todavía no se descuentan. El flete cobrado se suma íntegramente; el costo del reparto no se descuenta en esta vista.'});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo calcular el resultado diario.'},{status:500});}
}
