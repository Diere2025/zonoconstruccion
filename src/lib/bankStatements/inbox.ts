import type {FinancialConcept} from '@/lib/financialConcepts';
import {distinctActivities,activityConcept,matchInboxActivity} from './activityInbox';
import type {StatementEntry,StatementRule} from './model';
import type {SupabaseClient} from '@supabase/supabase-js';
import {allRows} from '@/lib/paymentPlanning/server';
import {statementOrderLinks} from './orderServer';
import {operationOrders} from './inboxGroups';
export type InboxCapture={bank_review_status?:'pending'|'reviewed'|null;suggested_concept_ids?:string[];review?:Pick<StatementEntry,'resolution'|'target_transaction_id'|'resolution_reason'|'candidates'|'netCandidates'>;id:string;operation_id:string;occurred_at:string;amount:string;description:string;counterparty_name:string|null;activity_type:string|null;operation_kind:string|null;statement_entry_id:string|null;prepared_entry_id:string|null;prepared_batch_id:string|null;mp_payments:{payer_name:string;order_code:string|null}|null;cash_transaction_id?:string|null;movement_code?:string|null;financial_concept_id?:string|null;concept_label?:string|null;review_version?:number;proposed_concept_id?:string|null;order_code?:string|null;order_from_operation?:boolean;order_ambiguous?:boolean};
type RawInboxCapture=Omit<InboxCapture,'mp_payments'>&{mp_payments:InboxCapture['mp_payments']|NonNullable<InboxCapture['mp_payments']>[]};
export type InboxActivity={link_reason?:string|null;bank_amount?:string|null;mp_account_id?:string;id:string;operation_id:string|null;occurred_at:string;amount:string;name:string;description:string;is_reserve:boolean;capture_key:string;linked_capture_id?:string|null;cash_transaction_id?:string|null;link_version?:number;proposed_concept_id?:string|null;review_version?:number};
export {matchInboxActivity} from './activityInbox';
async function olderPendingRows(db:SupabaseClient,mp:string,from:string){
 const rows=await allRows<{id:string;occurred_at:string;statement_entry_id:string|null;prepared_entry_id:string|null}>(db.from('mp_bank_web_rows').select('id,occurred_at,statement_entry_id,prepared_entry_id').eq('mp_account_id',mp).gte('occurred_at','2026-09-30T00:00:00-03:00').lt('occurred_at',from+'T00:00:00-03:00').order('id'));
 const ids=[...new Set(rows.map(r=>r.statement_entry_id||r.prepared_entry_id).filter((id):id is string=>!!id))],linked=new Set<string>();
 for(let i=0;i<ids.length;i+=100){const r=await db.from('bank_entry_ledger_links').select('entry_id,cash_transactions(bank_review_status)').in('entry_id',ids.slice(i,i+100));if(r.error)throw r.error;for(const l of r.data||[]){const tx=Array.isArray(l.cash_transactions)?l.cash_transactions[0]:l.cash_transactions;if(tx?.bank_review_status!=='pending')linked.add(l.entry_id);}}
 const dates=rows.filter(r=>!linked.has(r.statement_entry_id||r.prepared_entry_id||'')).map(r=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.occurred_at))).sort();
 return {count:dates.length,from:dates[0]||null,to:dates.at(-1)||null};
}
export async function statementInbox(db:SupabaseClient,account:string,from:string,to:string,actor:string){
 const mapping=await db.from('bank_statement_mp_accounts').select('mp_account_id').eq('financial_account_id',account).maybeSingle();if(mapping.error)throw mapping.error;if(!mapping.data)return {rows:[],activities:[],scan:null,mp:null};const mp=mapping.data.mp_account_id;
 const [rows,activities,scan,concepts,rules,older]=await Promise.all([
  allRows<RawInboxCapture>(db.from('mp_bank_web_rows').select('id,operation_id,occurred_at,amount,description,counterparty_name,activity_type,operation_kind,statement_entry_id,prepared_entry_id,prepared_batch_id,proposed_concept_id,review_version,mp_payments(payer_name,order_code)').eq('mp_account_id',mp).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('occurred_at',{ascending:false}).order('id')),
  allRows<InboxActivity>(db.from('mp_bank_activity_rows').select('id,mp_account_id,operation_id,occurred_at,amount,name,description,is_reserve,capture_key,proposed_concept_id,review_version').eq('mp_account_id',mp).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('occurred_at',{ascending:false}).order('id')),
  db.from('mp_bank_web_scans').select('scanned_at,row_count').eq('mp_account_id',mp).order('id',{ascending:false}).limit(1).maybeSingle(),
  allRows<FinancialConcept>(db.from('financial_concepts').select('id,concept,category,sub_category,movement_type,efe_category,is_active,source_row').eq('is_active',true).order('id')),
  allRows<StatementRule>(db.from('bank_classification_rules').select('id,description,direction,financial_concept_id,financial_account_id,version,alternative_concept_ids').eq('is_active',true).order('id')),
  db.rpc('bank_inbox_pending_before',{p_account:account,p_from:from}),
 ]);if(scan.error)throw scan.error;if(older.error&&!['PGRST202','42883'].includes(older.error.code))throw older.error;
 const olderSummary=older.error?await olderPendingRows(db,mp,from):older.data;
 const entries=[...new Set(rows.flatMap(r=>[r.statement_entry_id,r.prepared_entry_id]).filter((id):id is string=>!!id))];
 const ledger=new Map<string,{cash_transaction_id:string;movement_code:string|null;financial_concept_id:string|null;concept_label:string|null;bank_review_status:'pending'|'reviewed'|null}>();
 for(let i=0;i<entries.length;i+=100){const result=await db.from('bank_entry_ledger_links').select('entry_id,cash_transaction_id,cash_transactions(movement_code,financial_concept_id,concept,bank_review_status)').in('entry_id',entries.slice(i,i+100));if(result.error)throw result.error;for(const r of result.data||[]){const tx=Array.isArray(r.cash_transactions)?r.cash_transactions[0]:r.cash_transactions;ledger.set(r.entry_id,{cash_transaction_id:r.cash_transaction_id,movement_code:tx?.movement_code||null,financial_concept_id:tx?.financial_concept_id||null,concept_label:tx?.concept||null,bank_review_status:tx?.bank_review_status||null});}}
 const refs=new Map<string,{cash_transaction_id:string;version:number}>();
 for(let i=0;i<activities.length;i+=100){const result=await db.from('mp_bank_activity_links').select('activity_id,cash_transaction_id,version').in('activity_id',activities.slice(i,i+100).map(a=>a.id));if(result.error)throw result.error;for(const r of result.data||[])refs.set(r.activity_id,r);}
 const entryConcepts=new Map<string,string|null>();for(let i=0;i<entries.length;i+=100){const r=await db.from('bank_statement_entries').select('id,financial_concept_id').in('id',entries.slice(i,i+100));if(r.error)throw r.error;for(const e of r.data||[])entryConcepts.set(e.id,e.financial_concept_id);}
 const reviewEntries=new Map<string,StatementEntry>();
 const pendingRows=rows.filter(r=>!ledger.has(r.statement_entry_id||r.prepared_entry_id||''));
 const batchIds=[...new Set(pendingRows.map(r=>r.prepared_batch_id).filter((id):id is string=>!!id))];
 // Reuse the existing review RPC without repeating the catalog or source queries.
 for(let i=0;i<batchIds.length;i+=3){const results=await Promise.all(batchIds.slice(i,i+3).map(batch=>db.rpc('review_bank_statement',{p_actor:actor,p_batch:batch})));for(const result of results){if(result.error)throw result.error;const value=result.data as {batch:{financial_account_id:string};entries:StatementEntry[]};if(value.batch.financial_account_id!==account)throw Error('La revisión no corresponde a la cuenta seleccionada');for(const e of value.entries)reviewEntries.set(e.id,e);}}
 const orderLinks=await statementOrderLinks(db,entries);
 const enriched=rows.map(r=>({...r,review:(()=>{const e=reviewEntries.get(r.statement_entry_id||r.prepared_entry_id||'');return e?{resolution:e.resolution,target_transaction_id:e.target_transaction_id,resolution_reason:e.resolution_reason,candidates:e.candidates,netCandidates:e.netCandidates}:undefined;})(),mp_payments:Array.isArray(r.mp_payments)?r.mp_payments[0]||null:r.mp_payments,order_code:(orderLinks.get(r.statement_entry_id||r.prepared_entry_id||'')?.link?.stale?null:orderLinks.get(r.statement_entry_id||r.prepared_entry_id||'')?.link?.code)||null,financial_concept_id:entryConcepts.get(r.statement_entry_id||r.prepared_entry_id||'')||r.proposed_concept_id||null,...(ledger.get(r.statement_entry_id||r.prepared_entry_id||'')||{})}));
 const withOperationOrders=operationOrders(enriched).map(row=>{
  const direction=Number(row.amount)>0?'ingreso':'egreso',texts=[row.counterparty_name,row.activity_type,row.description].filter((x):x is string=>!!x).map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' '));
  const matchedRules=rules.filter(r=>r.direction===direction&&texts.includes(r.description)&&(r.financial_account_id===account||!r.financial_account_id));
  const scoped=matchedRules.some(r=>r.financial_account_id===account)?matchedRules.filter(r=>r.financial_account_id===account):matchedRules;
  return {...row,suggested_concept_ids:[...new Set(scoped.flatMap(r=>[r.financial_concept_id,...(r.alternative_concept_ids||[])])).values()].filter(id=>concepts.some(c=>c.id===id&&c.is_active))};
 });
 const distinct=distinctActivities(activities.map(a=>({...a,cash_transaction_id:refs.get(a.id)?.cash_transaction_id,link_version:refs.get(a.id)?.version||0})));
 const matched=matchInboxActivity(distinct,enriched);
 return {mp,olderPending:olderSummary,rows:withOperationOrders,activities:matched.map(a=>({...a,proposed_concept_id:activityConcept(a,enriched,concepts,rules,account)})),scan:scan.data};
}
// Counts for account tabs. Read-only: no preparation, classification or ledger writes.
export async function statementInboxSummary(db:SupabaseClient,from:string,to:string){
 const mapping=await db.from('bank_statement_mp_accounts').select('mp_account_id,financial_account_id');if(mapping.error)throw mapping.error;
 const accounts=mapping.data||[];if(!accounts.length)return {accounts:{}};
 const rows=await allRows<{mp_account_id:string;amount:string;statement_entry_id:string|null;prepared_entry_id:string|null}>(db.from('mp_bank_web_rows').select('mp_account_id,amount,statement_entry_id,prepared_entry_id,id').in('mp_account_id',accounts.map(a=>a.mp_account_id)).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('id'));
 const ids=[...new Set(rows.map(r=>r.statement_entry_id||r.prepared_entry_id).filter((id):id is string=>!!id))],linked=new Set<string>();
 for(let i=0;i<ids.length;i+=100){const r=await db.from('bank_entry_ledger_links').select('entry_id,cash_transactions(bank_review_status)').in('entry_id',ids.slice(i,i+100));if(r.error)throw r.error;for(const l of r.data||[]){const tx=Array.isArray(l.cash_transactions)?l.cash_transactions[0]:l.cash_transactions;if(tx?.bank_review_status!=='pending')linked.add(l.entry_id);}}
 const result:Record<string,{count:number;net:number;older:number}>={};
 const older=await Promise.all(accounts.map(a=>db.rpc('bank_inbox_pending_before',{p_account:a.financial_account_id,p_from:from})));
 for(let i=0;i<accounts.length;i++){if(older[i].error)throw older[i].error;const a=accounts[i],pending=rows.filter(r=>r.mp_account_id===a.mp_account_id&&!linked.has(r.statement_entry_id||r.prepared_entry_id||''));result[a.financial_account_id]={count:pending.length,net:pending.reduce((n,r)=>n+Math.round(Number(r.amount)*100),0),older:older[i].data?.count||0};}
 return {accounts:result};
}
