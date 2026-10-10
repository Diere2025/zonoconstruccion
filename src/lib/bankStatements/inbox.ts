import type {SupabaseClient} from '@supabase/supabase-js';
import {allRows} from '@/lib/paymentPlanning/server';
import {statementOrderLinks} from './orderServer';
export type InboxCapture={id:string;operation_id:string;occurred_at:string;amount:string;description:string;counterparty_name:string|null;activity_type:string|null;operation_kind:string|null;statement_entry_id:string|null;prepared_entry_id:string|null;prepared_batch_id:string|null;mp_payments:{payer_name:string;order_code:string|null}|null;cash_transaction_id?:string|null;movement_code?:string|null;financial_concept_id?:string|null;concept_label?:string|null;review_version?:number;proposed_concept_id?:string|null;order_code?:string|null};
type RawInboxCapture=Omit<InboxCapture,'mp_payments'>&{mp_payments:InboxCapture['mp_payments']|NonNullable<InboxCapture['mp_payments']>[]};
export type InboxActivity={id:string;operation_id:string|null;occurred_at:string;amount:string;name:string;description:string;is_reserve:boolean;capture_key:string;linked_capture_id?:string|null;cash_transaction_id?:string|null;link_version?:number;proposed_concept_id?:string|null;review_version?:number};
const same=(a:InboxActivity,w:InboxCapture)=>Number(a.amount)===Number(w.amount)&&new Date(a.occurred_at).toISOString().slice(0,16)===new Date(w.occurred_at).toISOString().slice(0,16)&&(!a.operation_id||a.operation_id===w.operation_id);
export function matchInboxActivity(activities:InboxActivity[],captures:InboxCapture[]){
 return activities.map(a=>{const matches=captures.filter(w=>same(a,w));const match=matches.length===1&&activities.filter(x=>same(x,matches[0])).length===1?matches[0]:null;return {...a,linked_capture_id:match?.id||null,cash_transaction_id:a.cash_transaction_id||match?.cash_transaction_id||null};});
}
export async function statementInbox(db:SupabaseClient,account:string,from:string,to:string){
 const mapping=await db.from('bank_statement_mp_accounts').select('mp_account_id').eq('financial_account_id',account).maybeSingle();if(mapping.error)throw mapping.error;if(!mapping.data)return {rows:[],activities:[],scan:null,mp:null};const mp=mapping.data.mp_account_id;
 const [rows,activities,scan]=await Promise.all([
  allRows<RawInboxCapture>(db.from('mp_bank_web_rows').select('id,operation_id,occurred_at,amount,description,counterparty_name,activity_type,operation_kind,statement_entry_id,prepared_entry_id,prepared_batch_id,proposed_concept_id,review_version,mp_payments(payer_name,order_code)').eq('mp_account_id',mp).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('occurred_at',{ascending:false}).order('id')),
  allRows<InboxActivity>(db.from('mp_bank_activity_rows').select('id,operation_id,occurred_at,amount,name,description,is_reserve,capture_key,proposed_concept_id,review_version').eq('mp_account_id',mp).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('occurred_at',{ascending:false}).order('id')),
  db.from('mp_bank_web_scans').select('scanned_at,row_count').eq('mp_account_id',mp).order('id',{ascending:false}).limit(1).maybeSingle(),
 ]);if(scan.error)throw scan.error;
 const entries=[...new Set(rows.flatMap(r=>[r.statement_entry_id,r.prepared_entry_id]).filter((id):id is string=>!!id))];
 const ledger=new Map<string,{cash_transaction_id:string;movement_code:string|null;financial_concept_id:string|null;concept_label:string|null}>();
 for(let i=0;i<entries.length;i+=100){const result=await db.from('bank_entry_ledger_links').select('entry_id,cash_transaction_id,cash_transactions(movement_code,financial_concept_id,concept)').in('entry_id',entries.slice(i,i+100));if(result.error)throw result.error;for(const r of result.data||[]){const tx=Array.isArray(r.cash_transactions)?r.cash_transactions[0]:r.cash_transactions;ledger.set(r.entry_id,{cash_transaction_id:r.cash_transaction_id,movement_code:tx?.movement_code||null,financial_concept_id:tx?.financial_concept_id||null,concept_label:tx?.concept||null});}}
 const refs=new Map<string,{cash_transaction_id:string;version:number}>();
 for(let i=0;i<activities.length;i+=100){const result=await db.from('mp_bank_activity_links').select('activity_id,cash_transaction_id,version').in('activity_id',activities.slice(i,i+100).map(a=>a.id));if(result.error)throw result.error;for(const r of result.data||[])refs.set(r.activity_id,r);}
 const entryConcepts=new Map<string,string|null>();for(let i=0;i<entries.length;i+=100){const r=await db.from('bank_statement_entries').select('id,financial_concept_id').in('id',entries.slice(i,i+100));if(r.error)throw r.error;for(const e of r.data||[])entryConcepts.set(e.id,e.financial_concept_id);}
 const orderLinks=await statementOrderLinks(db,entries);
 const enriched=rows.map(r=>({...r,mp_payments:Array.isArray(r.mp_payments)?r.mp_payments[0]||null:r.mp_payments,order_code:orderLinks.get(r.statement_entry_id||r.prepared_entry_id||'')?.link?.code||null,financial_concept_id:entryConcepts.get(r.statement_entry_id||r.prepared_entry_id||'')||r.proposed_concept_id||null,...(ledger.get(r.statement_entry_id||r.prepared_entry_id||'')||{})}));
 return {mp,rows:enriched,activities:matchInboxActivity(activities.map(a=>({...a,cash_transaction_id:refs.get(a.id)?.cash_transaction_id,link_version:refs.get(a.id)?.version||0})),enriched),scan:scan.data};
}
