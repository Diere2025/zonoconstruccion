import type {SupabaseClient} from '@supabase/supabase-js';
import {monthWindow,summarizeAccountIncome,type IncomeRow} from './mpAccountIncome';
export async function loadMonthlyAccountIncome(db:SupabaseClient,asOf:string){
 const window=monthWindow(asOf);
 const accounts=await db.from('mp_accounts').select('id,name,alias').order('id');if(accounts.error)throw accounts.error;
 const rows:IncomeRow[]=[];
 for(let offset=0;;offset+=1000){
   // Account limits concern all incoming funds, including archived and own transfers.
   const result=await db.from('mp_payments').select('account_id,account_name,amount,received_at').gte('received_at',window.startIso).lt('received_at',window.endExclusiveIso).order('received_at').order('id').range(offset,offset+999);
   if(result.error)throw result.error;rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)break;
 }
 return summarizeAccountIncome([],rows,accounts.data||[],asOf);
}
