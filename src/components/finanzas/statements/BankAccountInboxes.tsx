'use client';
import {useState} from 'react';
import MovementClassification from '@/components/finanzas/MovementClassification';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {supabase} from '@/lib/supabase';
import {readMPRefresh} from '@/lib/mpRefreshClient';
import type {StatementAccount,StatementSnapshot} from '@/lib/bankStatements/model';
const api=createAuthenticatedRequester(supabase);
export default function BankAccountInboxes({accounts,revision,busy,onBusyChange}:{accounts:StatementAccount[];revision:number;busy:boolean;onBusyChange:(value:boolean)=>void;onPrepared:(snapshot:StatementSnapshot)=>Promise<void>}){
 const [updated,setUpdated]=useState(0),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 async function refresh(){
  setRefreshing(true);onBusyChange(true);setError('');
  try{
   const catalog=await api('/api/admin/bank-statements');
   const mappings=(catalog.orderLinking?.mappings||[]) as {financial_account_id:string;mp_account_id:string}[];
   const results=await Promise.allSettled(mappings.filter(m=>accounts.some(a=>a.id===m.financial_account_id)).map(async m=>{
    await Promise.all((['activity','banking'] as const).map(channel=>readMPRefresh(api,m.mp_account_id,()=>{},{endpoint:'/api/mp-bank-refresh',channel,history:false,timeoutMs:125000})));
    await api('/api/admin/bank-statements',{method:'POST',body:JSON.stringify({action:'inbox-sync',account:m.financial_account_id})});
   }));
   const failed=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
   if(failed.length)setError(failed.map(r=>r.reason?.message||'No se pudo actualizar una cuenta').join(' · '));
  }catch(e){setError((e as Error).message);}finally{setUpdated(value=>value+1);setRefreshing(false);onBusyChange(false);}
 }
 return <section aria-label="Sin clasificar de todas las cajas" className="space-y-3">
  <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Todas las fechas · Todas las cajas</p><button type="button" disabled={busy||refreshing} onClick={()=>void refresh()} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50">{refreshing?'Actualizando…':'Actualizar desde Mercado Pago'}</button></div>
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  <MovementClassification embedded accountIds={accounts.map(a=>a.id)} revision={revision+updated}/>
 </section>;
}
