import {dispatchCostTerms,allocationLinks} from './settlementAccountingServer';
import {applyStoredDispatchAssignments} from './settlementSource';
import {projectCorrectedDeliveredRows} from './identityCorrectionServer';
import {sameSettlementCarrier} from './settlementIdentity';
import {calculateRealDispatchCosts} from './costs';
import {normalizeSettlementCarriers} from '@/lib/carrierIdentity';
import {resolveDispatchDigitalTickets} from './digitalTickets';
import {createClient} from '@supabase/supabase-js';
import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {SOURCE_IDS,buildDispatchSource,matchMovements,sheetDate} from './model';
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
 const storedDispatches=await dispatchRows(db.from('logistics_dispatches').select('id,code,delivery_date,carrier_name,data').gte('delivery_date',from).lte('delivery_date',to).order('id'));
 const nativePlans=storedDispatches.length?await dispatchRows(db.from('logistics_dispatch_plans').select('*').in('dispatch_id',storedDispatches.map(d=>d.id)).order('dispatch_id')):[];
 const storedAttempts=storedDispatches.length?await dispatchRows(db.from('logistics_dispatch_attempts').select('dispatch_id,order_code').in('dispatch_id',storedDispatches.map(d=>d.id)).order('id')):[];
 const assignmentLinks=storedAttempts.flatMap(a=>{const d=storedDispatches.find(d=>d.id===a.dispatch_id);return d?[{code:d.code,date:d.delivery_date,carrierName:d.carrier_name,orderCode:a.order_code}]:[];});
 const assigned=applyStoredDispatchAssignments(await projectCorrectedDeliveredRows(db,logistics),assignmentLinks,sheetDate,sameSettlementCarrier);
 const source=buildDispatchSource({logistics:assigned.values,summary,follow,settlements,cash},from,to);
 for(const plan of nativePlans){const stored=storedDispatches.find(d=>d.id===plan.dispatch_id);if(!stored)continue;let dispatch=source.dispatches.find(d=>d.code===stored.code);if(dispatch&&(dispatch.date!==stored.delivery_date||!sameSettlementCarrier(dispatch.carrierName,stored.carrier_name)))source.issues.push({key:'erp_plan_identity|'+stored.code,kind:'erp_plan_identity',code:stored.code,reference:'',message:'La planilla difiere de la fecha o fletero del LOG planificado en el ERP.'});if(!dispatch){dispatch={code:stored.code,date:stored.delivery_date,carrierName:stored.carrier_name,data:stored.data||{}};source.dispatches.push(dispatch);}dispatch.date=stored.delivery_date;dispatch.carrierName=stored.carrier_name;dispatch.data={...dispatch.data,vehicle:plan.planned.vehicle,companion:plan.planned.companion,zone:plan.planned.loads.map((l:any)=>l.zone).join(' · '),planning:plan.planned,actual:plan.actual,planStatus:plan.status,tariffEstimate:plan.estimate,...(plan.status==='cancelled'?{notDeparted:true,departureNote:plan.planned.notes||'Salida cancelada en planificación.'}:{})};}
 const assignedRows=new Set(assigned.assignedRows);for(const d of source.dispatches){const history=d.data.attemptHistory as Record<string,Array<{row:number;method:string;sourceCode:string}>>|undefined;if(history)for(const events of Object.values(history))for(const event of events)if(assignedRows.has(event.row)){event.method='erp_assignment';event.sourceCode='';}}
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
async function dispatchReversals(db:ReturnType<typeof dispatchDatabase>,movements:any[]){
 const ids=[...new Set<string>(movements.flatMap(m=>{const t=Array.isArray(m.cash_transactions)?m.cash_transactions[0]:m.cash_transactions;return t?.id?[t.id]:[];}))];const reversed=new Set<string>();
 for(let offset=0;offset<ids.length;offset+=200){const rows=await dispatchRows(db.from('cash_transactions').select('id,reversal_of_transaction_id').in('reversal_of_transaction_id',ids.slice(offset,offset+200)).order('id'));rows.forEach(r=>reversed.add(r.reversal_of_transaction_id));}return reversed;
}
export async function readDispatches(db:ReturnType<typeof dispatchDatabase>,from:string,to:string){
 dispatchPeriod(from,to);
 const rawDispatches=await dispatchRows(db.from('logistics_dispatches').select('*').gte('delivery_date',from).lte('delivery_date',to).order('delivery_date',{ascending:false}).order('code'));
 const catalog=await dispatchRows(db.from('carriers').select('id,name,is_active').order('id'));
 const dispatches=normalizeSettlementCarriers(rawDispatches,catalog);
 if(!dispatches.length)return {dispatches:[],issues:[]};
 const ids=dispatches.map(d=>d.id),[attempts,settlements,movements,issues]=await Promise.all([
 dispatchRows(db.from('logistics_dispatch_attempts').select('dispatch_id,order_id,order_code,outcome,executed').in('dispatch_id',ids).order('id')),
 dispatchRows(db.from('logistics_dispatch_settlements').select('dispatch_id,settlement_id,treasury_settlements(status)').in('dispatch_id',ids).order('settlement_id')),
 dispatchRows(db.from('logistics_dispatch_movements').select('*,cash_transactions(id,type,amount,currency,category,sub_category,created_at,movement_code,reversal_of_transaction_id)').in('dispatch_id',ids).order('transaction_id')),
 dispatchRows(db.from('logistics_link_issues').select('*').gte('source_to',from).lte('source_from',to).order('key'))
 ]);
 const effectiveMovements=await allocationLinks(db,movements,ids,'id,type,amount,currency,category,sub_category,created_at,movement_code,reversal_of_transaction_id');
 const reversed=await dispatchReversals(db,effectiveMovements),costTerms=await dispatchCostTerms(db,ids);
 return {dispatches:dispatches.map(d=>{const {payments,...realCosts}=calculateRealDispatchCosts(attempts.filter(a=>a.dispatch_id===d.id),effectiveMovements.filter(m=>m.dispatch_id===d.id),reversed,costTerms.find(t=>t.dispatch_id===d.id));return {...d,realCosts,attemptCount:attempts.filter(a=>a.dispatch_id===d.id&&a.executed).length,missingOrders:attempts.filter(a=>a.dispatch_id===d.id&&a.executed&&!a.order_id).length,excludedAttempts:attempts.filter(a=>a.dispatch_id===d.id&&!a.executed).length,settlementCount:settlements.filter(s=>s.dispatch_id===d.id&&(Array.isArray(s.treasury_settlements)?s.treasury_settlements[0]:s.treasury_settlements)?.status!=='archived').length,movementCount:effectiveMovements.filter(m=>m.dispatch_id===d.id).length};}),issues};
}
export async function dispatchDetail(db:ReturnType<typeof dispatchDatabase>,code:string){
 if(!/^LOG_REC_\d+[A-Z]?$/.test(code))throw Object.assign(new Error('Código de salida inválido.'),{status:400});
 const lookup=await db.from('logistics_dispatches').select('*').eq('code',code).single();if(lookup.error)throw lookup.error;
 const catalog=await dispatchRows(db.from('carriers').select('id,name,is_active').order('id'));
 const dispatch=normalizeSettlementCarriers([lookup.data],catalog)[0],[attempts,settlements,movements,routes]=await Promise.all([
 dispatchRows(db.from('logistics_dispatch_attempts').select('*,orders(id,legacy_code,customer_name,total_amount,status,payment_status),deliveries(id,status,delivery_date,route_sheet_id)').eq('dispatch_id',dispatch.id).order('order_code')),
 dispatchRows(db.from('logistics_dispatch_settlements').select('*,treasury_settlements(*,treasury_settlement_expenses(*),treasury_settlement_electronic_tickets(*))').eq('dispatch_id',dispatch.id).order('settlement_id')),
 dispatchRows(db.from('logistics_dispatch_movements').select('*,cash_transactions(id,movement_code,type,amount,currency,concept,created_at,category,sub_category,reversal_of_transaction_id,financial_accounts(name))').eq('dispatch_id',dispatch.id).order('transaction_id')),
 dispatchRows(db.from('logistics_dispatch_routes').select('*,route_sheets(code,delivery_date,run_number)').eq('dispatch_id',dispatch.id).order('route_sheet_id'))
 ]);
 const tickets=settlements.flatMap(link=>(Array.isArray(link.treasury_settlements)?link.treasury_settlements[0]:link.treasury_settlements)?.treasury_settlement_electronic_tickets||[]);
 const orderIds=[...new Set([...attempts.filter(a=>a.executed&&a.order_id).map(a=>a.order_id),...tickets.filter(t=>t.order_id).map(t=>t.order_id)])];
 const paymentIds=[...new Set(tickets.filter(t=>t.mp_payment_id).map(t=>t.mp_payment_id))];
 const columns='id,order_id,order_code,amount,account_name,payment_type,received_at,is_verified,is_hidden,is_internal';
 const [orderPayments,ticketPayments]=await Promise.all([
  orderIds.length?dispatchRows(db.from('mp_payments').select(columns).in('order_id',orderIds).eq('is_verified',true).eq('is_hidden',false).eq('is_internal',false).order('id')):Promise.resolve([]),
  paymentIds.length?dispatchRows(db.from('mp_payments').select(columns).in('id',paymentIds).order('id')):Promise.resolve([])
 ]);
 const mpPayments=[...new Map([...orderPayments,...ticketPayments].map(p=>[p.id,p])).values()];
 // Imported approval history can contain repeated snapshots without ledger evidence; dispatch collections use linked movements and rendition tickets.
 const effectiveMovements=await allocationLinks(db,movements,[dispatch.id],'id,type,amount,currency,category,sub_category,concept,created_at,movement_code,reversal_of_transaction_id,financial_accounts(name)');
 const costTerms=await dispatchCostTerms(db,[dispatch.id]);
 const realCosts=calculateRealDispatchCosts(attempts,effectiveMovements,await dispatchReversals(db,effectiveMovements),costTerms[0]);
 return {dispatch,realCosts,attempts,settlements:resolveDispatchDigitalTickets(settlements,mpPayments,attempts,dispatch.delivery_date),movements:effectiveMovements,routes,verifiedDigitalPayments:mpPayments.filter(p=>p.is_verified&&!p.is_hidden&&!p.is_internal)};
}
