import type { SupabaseClient } from '@supabase/supabase-js';
import { allRows } from '@/lib/paymentPlanning/server';
import type { StatementMpAccount, StatementMpMapping, StatementOrderLink } from './orderLinks';
export type StatementOrderContext={available:boolean;accounts:StatementMpAccount[];mappings:StatementMpMapping[]};
export async function statementOrderContext(db:SupabaseClient):Promise<StatementOrderContext> {
 const probe=await db.from('bank_statement_order_links').select('entry_id').limit(0);
 if(probe.error){if(['42P01','PGRST205'].includes(probe.error.code)&&probe.error.message.includes('bank_statement_order_links'))return{available:false,accounts:[],mappings:[]};throw probe.error;}
 const [accounts,mappings]=await Promise.all([
  allRows<StatementMpAccount>(db.from('mp_accounts').select('id,name,alias').eq('is_active',true).order('id')),
  allRows<StatementMpMapping>(db.from('bank_statement_mp_accounts').select('financial_account_id,mp_account_id,version').order('financial_account_id')),
 ]);return{available:true,accounts,mappings};
}
type RawLink={entry_id:string;order_id:string|null;payment_id:string|null;kind:'automatic'|'manual';method:string;version:number;orders:{legacy_code:string|null}|{legacy_code:string|null}[]|null;mp_payments:{order_id:string|null;order_code:string|null}|{order_id:string|null;order_code:string|null}[]|null};
export async function statementOrderLinks(db:SupabaseClient,ids:string[]) {
 const result=new Map<string,{link:StatementOrderLink|null;version:number}>();
 for(let i=0;i<ids.length;i+=100){
  const rows=await allRows<RawLink>(db.from('bank_statement_order_links').select('entry_id,order_id,payment_id,kind,method,version,orders(legacy_code),mp_payments(order_id,order_code)').in('entry_id',ids.slice(i,i+100)).order('entry_id'));
  for(const row of rows){const order=Array.isArray(row.orders)?row.orders[0]:row.orders;const code=order?.legacy_code||row.order_id||'';const source=Array.isArray(row.mp_payments)?row.mp_payments[0]:row.mp_payments;const stale=(row.kind==='automatic'||!!row.payment_id)&&(!source||(!!source.order_id&&source.order_id!==row.order_id)||(!!source.order_code&&source.order_code.trim().toLowerCase()!==code.trim().toLowerCase()));result.set(row.entry_id,{version:row.version,link:row.order_id?{order_id:row.order_id,code,kind:row.kind,method:row.method,version:row.version,payment_id:row.payment_id,stale}:null});}
 }return result;
}
