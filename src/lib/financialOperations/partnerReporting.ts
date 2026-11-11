import {readBatches} from './readBatches';
import type {SupabaseClient} from '@supabase/supabase-js';
export type PartnerAssignment={operation_id:string;amount:number;partner:string;reference:string};
export async function partnerAssignments(db:SupabaseClient,ids:string[]) {
 const result=new Map<string,PartnerAssignment[]>();
 await readBatches(ids,async chunk=>{
  for(let offset=0;;offset+=500){
   const page=await db.from('financial_partner_allocations').select('id,operation_id,cash_transaction_id,amount,financial_operations(detail,status)').in('cash_transaction_id',chunk).is('reversed_at',null).order('id').range(offset,offset+499);
   if(page.error){if(['42P01','PGRST205'].includes(page.error.code)&&page.error.message.includes('financial_partner_allocations'))return;throw page.error;}
   for(const row of page.data||[]){const op=Array.isArray(row.financial_operations)?row.financial_operations[0]:row.financial_operations;if(op?.status!=='posted')continue;
    const assignments=result.get(row.cash_transaction_id)||[];assignments.push({operation_id:row.operation_id,amount:Number(row.amount),partner:op.detail?.input?.counterparty||'Socio',reference:op.detail?.input?.reference||''});result.set(row.cash_transaction_id,assignments);
   }
   if(!page.data||page.data.length<500)break;
  }
 });
 return result;
}
export function businessPortion(amount:number|string|null,assignments:PartnerAssignment[]) {
 const cents=Math.round(Number(amount)*100),personal=assignments.reduce((sum,row)=>sum+Math.round(row.amount*100),0);
 if(!Number.isSafeInteger(cents)||personal<0||personal>cents)throw new Error('La asignación personal no coincide con el movimiento.');
 return {partner_amount:personal/100,business_amount:(cents-personal)/100};
}
