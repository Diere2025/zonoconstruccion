import type {SupabaseClient} from '@supabase/supabase-js';
import {syncErpReceptionToSheet} from '../erp/purchaseSheetSync';
function sheetSyncError(error:unknown){
 const message=typeof error==='string'?error:(error as {message?:unknown})?.message;
 if(typeof message!=='string'||!message.trim())return 'No se pudo completar la sincronización.';
 if(/<\s*(?:!doctype|html|head|body|script|title|div|span)\b/i.test(message)||/fetch failed|failed to fetch|networkerror|timeout|ECONN/i.test(message))return 'La planilla no responde temporalmente. La recepción queda pendiente de reintento.';
 return message.slice(0,1000);
}
export async function withPurchaseSheetLease<T>(db:SupabaseClient,work:()=>Promise<T>){
 const token=crypto.randomUUID(),lock=await db.rpc('claim_purchase_sheet_lease',{p_token:token});if(lock.error)throw lock.error;if(!lock.data)throw new Error('Hay otra sincronización en curso. Volvé a intentar en unos momentos.');
 try{return await work();}finally{await db.rpc('release_purchase_sheet_lease',{p_token:token});}
}
export async function processSupplierSheetJob(db:SupabaseClient,receptionId?:string,retry=false,supplierId?:string){
 if(receptionId){const q=await db.rpc('enqueue_supplier_sheet_job',{p_reception:receptionId,p_retry:retry});if(q.error)throw q.error;}
 const token=crypto.randomUUID(),claim=await db.rpc('claim_supplier_sheet_job',{p_reception:receptionId||null,p_token:token,p_supplier:supplierId||null});if(claim.error)throw claim.error;
 if(!claim.data){if(receptionId){const state=await db.from('supplier_sheet_sync_jobs').select('status').eq('reception_id',receptionId).maybeSingle();if(state.error)throw state.error;if(state.data?.status==='done')return {synced:true,queued:false};}return {synced:false,queued:true};}
 const id=claim.data.reception_id as string;
 try{
  await syncErpReceptionToSheet(id);const done=await db.rpc('finish_supplier_sheet_job',{p_reception:id,p_token:token,p_success:true,p_error:null});if(done.error)throw done.error;
  return {synced:true,queued:false,receptionId:id};
 }catch(error){
  const message=sheetSyncError(error);const failed=await db.rpc('finish_supplier_sheet_job',{p_reception:id,p_token:token,p_success:false,p_error:message});
  if(failed.error)throw failed.error;return {synced:false,queued:true,receptionId:id,error:message};
 }
}
