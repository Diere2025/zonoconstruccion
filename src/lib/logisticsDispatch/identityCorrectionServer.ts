import type {SupabaseClient} from '@supabase/supabase-js';
import {validDate} from '@/lib/paymentPlanning/model';
import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {SOURCE_IDS,sheetDate} from './model';
import {correctedDeliveredRows,type SourceCorrection,type CorrectionPreview} from './identityCorrection';
type CorrectionBody={dispatchId:string;version:number;deliveryDate:string;carrierId:string;driverName:string;reason:string;acknowledgePayments?:boolean;key?:string;token?:string;sourceToken?:string};
type State={deliveries:Array<{order_id:string}>;attempts:Array<{order_code:string}>;settlements:Array<{id:string;code:string;status:string}>;payments:Array<{id:string;movement_code:string;amount:string|number;currency:string}>};
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
export async function projectCorrectedDeliveredRows(db:SupabaseClient,values:string[][]){
 const codes=[...new Set(values.map(row=>String(row[92]||'').trim().toUpperCase()).filter(code=>/^LOG_REC_\d+[A-Z]?$/.test(code)))];
 if(!codes.length)return values;
 const corrections:SourceCorrection[]=[];
 for(let offset=0;offset<codes.length;offset+=100){for(let page=0;;page+=500){
  const r=await db.from('logistics_dispatch_corrections').select('id,code,delivery_date,carrier_name,source_rows,created_at').in('code',codes.slice(offset,offset+100)).order('created_at').order('id').range(page,page+499);
  if(r.error)throw r.error;corrections.push(...r.data);if(r.data.length<500)break;
 }}
 return correctedDeliveredRows(values,corrections.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)));
}
export async function dispatchCorrection(db:SupabaseClient,actor:string,body:CorrectionBody,apply=false){
 if(!/^[a-f0-9-]{36}$/i.test(body.dispatchId||'')||!Number.isInteger(body.version)||body.version<1||!validDate(body.deliveryDate)||!/^[a-f0-9-]{36}$/i.test(body.carrierId||'')||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>2000||typeof body.driverName!=='string'||body.driverName.length>160)throw fail('Completá fecha, fletero y motivo de la corrección.');
 const data={deliveryDate:body.deliveryDate,carrierId:body.carrierId,driverName:body.driverName.trim(),reason:body.reason.trim(),acknowledgePayments:body.acknowledgePayments===true};
 if(apply){
  if(!/^[a-f0-9-]{36}$/i.test(body.key||'')||typeof body.token!=='string'||typeof body.sourceToken!=='string')throw fail('Consultá el impacto antes de confirmar.');
  const replay=await db.from('logistics_dispatch_corrections').select('actor_id,request,result').eq('request_key',body.key).maybeSingle();if(replay.error)throw replay.error;
  const existing=replay.data;
  if(existing){
   if(existing.actor_id!==actor||Object.entries(data).some(([k,value])=>value!==existing.request.data[k])||existing.request.dispatch!==body.dispatchId||existing.request.version!==body.version||existing.request.token!==body.token)throw fail('La clave de corrección ya fue utilizada.',409);
   return {...existing.result,replayed:true};
  }
 }
 const r=await db.rpc('preview_dispatch_correction',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.version,p_data:data});if(r.error)throw fail(r.error.message,r.error.code==='42501'?403:r.error.code==='40001'?409:400);
 const {state,...preview}=r.data as Omit<CorrectionPreview,'sourceToken'|'sourceRows'|'related'>&{state:State};
 const values=await projectCorrectedDeliveredRows(db,await fetchSpreadsheetValues(SOURCE_IDS.logistics,"'🔴 Entregados'!A2:CO"));
 const sources=values.filter(row=>String(row[92]||'').trim().toUpperCase()===preview.code&&sheetDate(row[1])).map(row=>({orderCode:String(row[0]||'').trim(),date:sheetDate(row[1]),carrier:String(row[79]||'').trim()}));
 const dates=[...new Set(sources.map(s=>s.date))];
 if(dates.length>1)preview.blockers.push('Entregados contiene este LOG en varias fechas. Separá o corregí esas filas antes de cambiar el recorrido.');
 const sourceToken=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sources)))),n=>n.toString(16).padStart(2,'0')).join('');
 if(apply){
  if(preview.token!==body.token||sourceToken!==body.sourceToken)throw fail('El recorrido o Entregados cambió. Volvé a consultar el impacto.',409);
  if(preview.blockers.length)throw fail(preview.blockers[0],409);
  const saved=await db.rpc('correct_dispatch_identity',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.version,p_key:body.key,p_data:data,p_token:body.token,p_sources:sources});
  if(saved.error)throw fail(saved.error.message,saved.error.code==='40001'?409:400);return saved.data;
 }
 const orderIds=[...new Set(state.deliveries.map(d=>d.order_id).filter(Boolean))];
 const orders=orderIds.length?await db.from('orders').select('id,legacy_code').in('id',orderIds):{data:[],error:null};if(orders.error)throw orders.error;
 return {...preview,sourceToken,sourceRows:sources.length,related:{orders:[...new Set([...orders.data.map((o:{id:string;legacy_code:string})=>o.legacy_code||o.id),...state.attempts.map(a=>a.order_code),...sources.map(s=>s.orderCode)].filter(Boolean))],settlements:state.settlements.map(s=>({id:s.id,code:s.code,status:s.status})),payments:state.payments.map(p=>({id:p.id,code:p.movement_code,amount:p.amount,currency:p.currency}))}};
}
