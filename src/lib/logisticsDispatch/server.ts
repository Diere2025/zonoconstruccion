import {createClient} from '@supabase/supabase-js';
import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {SOURCE_IDS,buildDispatchSource,matchMovements} from './model';
import {authenticateSystemAdministrator} from '@/lib/systemAdminAccess';
import {validDate,nextDate} from '@/lib/paymentPlanning/model';
export const dispatchDatabase=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
export async function dispatchAccess(request:Request){
 const db=dispatchDatabase(),auth=await authenticateSystemAdministrator(request,db);
 if(!auth.user)throw Object.assign(new Error(auth.error),{status:auth.status});
 return {db,actor:auth.user.id};
}
export async function dispatchRows(query:any){const rows:any[]=[];for(let offset=0;;offset+=500){const r=await query.range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
export function dispatchPeriod(from:string,to:string){if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>93*864e5)throw Object.assign(new Error('Elegí un período de hasta 93 días.'),{status:400});}
export async function prepareDispatchSync(db:ReturnType<typeof dispatchDatabase>,from:string,to:string){
 dispatchPeriod(from,to);
 const [logistics,summary,follow,settlements,cash]=await Promise.all([
  fetchSpreadsheetValues(SOURCE_IDS.logistics,"'🔴 Entregados'!A3:CO12000"),
  fetchSpreadsheetValues(SOURCE_IDS.logistics,"'ResumenCostoPorEntregas'!A2:J10000"),
  fetchSpreadsheetValues(SOURCE_IDS.follow,"'Seguimiento'!A2:AA10000"),
  fetchSpreadsheetValues(SOURCE_IDS.settlements,"'Entregas'!A2:AU10000"),
  fetchSpreadsheetValues(SOURCE_IDS.cash,"'Caja'!A2:Q12000")
 ]);
 const source=buildDispatchSource({logistics,summary,follow,settlements,cash},from,to);
 const [transactions,existingSettlements]=await Promise.all([
  dispatchRows(db.from('cash_transactions').select('id,type,amount,currency,concept,financial_account_id,is_imported,reversal_of_transaction_id,created_at,financial_accounts(name)').gte('created_at',from+'T00:00:00-03:00').lt('created_at',nextDate(to)+'T00:00:00-03:00').order('id')),
  dispatchRows(db.from('treasury_settlements').select('id,code,status,settlement_date,route_sheet_id').gte('settlement_date',from).lte('settlement_date',to).order('id'))
 ]);
 const argentinaDate=(input:string)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(input));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
 const ledger=transactions.filter(t=>t.currency==='ARS').map(t=>({...t,date:argentinaDate(t.created_at),account:(Array.isArray(t.financial_accounts)?t.financial_accounts[0]:t.financial_accounts)?.name||''}));
 const matched=matchMovements(source.movements,ledger,new Map(source.settlements.map(s=>[s.code,s.dispatchCode])));
 const payload={...source,movementLinks:matched.links,issues:[...new Map([...source.issues,...matched.issues].map(i=>[i.key,i])).values()]};
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([payload,existingSettlements])))),n=>n.toString(16).padStart(2,'0')).join('');
 return {payload,hash,summary:{dispatches:source.dispatches.length,attempts:source.attempts.filter(a=>a.executed).length,excludedAttempts:source.attempts.filter(a=>!a.executed).length,settlements:source.settlements.length,movements:matched.links.length,issues:payload.issues.length}};
}
export async function readDispatches(db:ReturnType<typeof dispatchDatabase>,from:string,to:string){
 dispatchPeriod(from,to);
 const dispatches=await dispatchRows(db.from('logistics_dispatches').select('*').gte('delivery_date',from).lte('delivery_date',to).order('delivery_date',{ascending:false}).order('code'));
 if(!dispatches.length)return {dispatches:[],issues:[]};
 const ids=dispatches.map(d=>d.id),[attempts,settlements,movements,issues]=await Promise.all([
 dispatchRows(db.from('logistics_dispatch_attempts').select('dispatch_id,order_id,executed').in('dispatch_id',ids).order('id')),
 dispatchRows(db.from('logistics_dispatch_settlements').select('dispatch_id,settlement_id,treasury_settlements(status)').in('dispatch_id',ids).order('settlement_id')),
 dispatchRows(db.from('logistics_dispatch_movements').select('dispatch_id,transaction_id').in('dispatch_id',ids).order('transaction_id')),
 dispatchRows(db.from('logistics_link_issues').select('*').gte('source_to',from).lte('source_from',to).order('key'))
 ]);
 return {dispatches:dispatches.map(d=>({...d,attemptCount:attempts.filter(a=>a.dispatch_id===d.id&&a.executed).length,missingOrders:attempts.filter(a=>a.dispatch_id===d.id&&a.executed&&!a.order_id).length,excludedAttempts:attempts.filter(a=>a.dispatch_id===d.id&&!a.executed).length,settlementCount:settlements.filter(s=>s.dispatch_id===d.id&&(Array.isArray(s.treasury_settlements)?s.treasury_settlements[0]:s.treasury_settlements)?.status!=='archived').length,movementCount:movements.filter(m=>m.dispatch_id===d.id).length})),issues};
}
export async function dispatchDetail(db:ReturnType<typeof dispatchDatabase>,code:string){
 if(!/^LOG_REC_\d+$/.test(code))throw Object.assign(new Error('Código de salida inválido.'),{status:400});
 const lookup=await db.from('logistics_dispatches').select('*').eq('code',code).single();if(lookup.error)throw lookup.error;
 const dispatch=lookup.data,[attempts,settlements,movements,routes]=await Promise.all([
 dispatchRows(db.from('logistics_dispatch_attempts').select('*,orders(id,legacy_code,customer_name,total_amount,status,payment_status),deliveries(id,status,delivery_date,route_sheet_id)').eq('dispatch_id',dispatch.id).order('order_code')),
 dispatchRows(db.from('logistics_dispatch_settlements').select('*,treasury_settlements(*,treasury_settlement_expenses(*),treasury_settlement_electronic_tickets(*))').eq('dispatch_id',dispatch.id).order('settlement_id')),
 dispatchRows(db.from('logistics_dispatch_movements').select('*,cash_transactions(id,movement_code,type,amount,currency,concept,created_at,sub_category,financial_accounts(name))').eq('dispatch_id',dispatch.id).order('transaction_id')),
 dispatchRows(db.from('logistics_dispatch_routes').select('*,route_sheets(code,delivery_date,run_number)').eq('dispatch_id',dispatch.id).order('route_sheet_id'))
 ]);
 const orderIds=[...new Set(attempts.filter(a=>a.executed&&a.order_id).map(a=>a.order_id))];
 const payments=orderIds.length?await dispatchRows(db.from('client_payments').select('id,order_id,amount,currency,status,created_at,route_sheet_id,cash_transaction_id,payment_methods(name)').in('order_id',orderIds).eq('status','Aprobado').is('reversed_at',null).order('id')):[];
 const mpPayments=orderIds.length?await dispatchRows(db.from('mp_payments').select('id,order_id,order_code,amount,account_name,payment_type,received_at,is_verified').in('order_id',orderIds).eq('is_verified',true).eq('is_hidden',false).eq('is_internal',false).order('id')):[];
 // Order receipts are shown separately: an advance does not prove collection on this dispatch.
 return {dispatch,attempts,settlements,movements,routes,orderPayments:payments,verifiedDigitalPayments:mpPayments};
}
