import {planningRows} from './planningServer';
import {deriveLoadOrders,deliveredOrderRecords} from './planningOrders';
import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {SOURCE_IDS} from './model';
type Row=Record<string,any>;
export async function planningOrderLoads(db:any,plans:Row[]){
 if(!plans.length)return [];
 const records:any[]=[];
 for(let i=0;i<plans.length;i+=150){const links=await planningRows(db.from('logistics_dispatch_routes').select('dispatch_id,route_sheets(id,run_number)').in('dispatch_id',plans.slice(i,i+150).map(p=>p.dispatch_id)).order('route_sheet_id'));
  const routes=links.map(l=>({...l,route:Array.isArray(l.route_sheets)?l.route_sheets[0]:l.route_sheets})).filter(l=>l.route);
  if(!routes.length)continue;
  const deliveries=await planningRows(db.from('deliveries').select('route_sheet_id,order_id,predominant_zone,orders(legacy_code)').in('route_sheet_id',routes.map(r=>r.route.id)).order('id'));
  for(const d of deliveries){const order=Array.isArray(d.orders)?d.orders[0]:d.orders;for(const r of routes.filter(r=>r.route.id===d.route_sheet_id)){const p=plans.find(p=>p.dispatch_id===r.dispatch_id)!,h=Array.isArray(p.logistics_dispatches)?p.logistics_dispatches[0]:p.logistics_dispatches;records.push({code:h.code,date:p.planned.deliveryDate,runNumber:r.route.run_number,orderCode:order?.legacy_code||d.order_id,zone:d.predominant_zone||''});}}
 }
 // Historical orders still originate in Entregados; native route orders take precedence.
 let values:any[][]=[];
 try{values=await fetchSpreadsheetValues(SOURCE_IDS.logistics,"'🔴 Entregados'!A3:CO12000");}catch{
  return deriveLoadOrders(plans,records).map(p=>({...p,orderSourceWarning:'No se pudo consultar Entregados. Los datos sin pedidos vinculados todavía no están confirmados.'}));
 }
 const native=new Set(records.map(r=>r.code+'|'+r.runNumber));
 return deriveLoadOrders(plans,[...records,...deliveredOrderRecords(values).filter(r=>!native.has(r.code+'|'+r.runNumber))]);
}
