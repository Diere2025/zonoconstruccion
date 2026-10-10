import type {SupabaseClient} from '@supabase/supabase-js';
import {isUuid,OperationError} from '@/lib/financialOperations/validation';
export async function initializeStatementInboxes(db:SupabaseClient,actor:string,accounts:unknown){
 if(!Array.isArray(accounts)||accounts.length<1||accounts.length>20||accounts.some(id=>!isUuid(id))||new Set(accounts).size!==accounts.length)throw new OperationError('Seleccioná cuentas válidas, sin repetir');
 const mapping=await db.from('bank_statement_mp_accounts').select('financial_account_id,mp_account_id').in('financial_account_id',accounts);if(mapping.error)throw mapping.error;
 if(mapping.data?.length!==accounts.length)throw new OperationError('Hay cuentas sin alias de Mercado Pago');
 const results=[];
 for(const account of accounts){const row=mapping.data.find(m=>m.financial_account_id===account)!;const r=await db.rpc('sync_mp_bank_inbox',{p_mp:row.mp_account_id,p_actor:actor});results.push({account,ready:!r.error&&!r.data?.pendingConfiguration,error:r.error?.message||(r.data?.pendingConfiguration?'Cuenta pendiente de configuración':null),prepared:r.data?.prepared||0});}
 return {results};
}
