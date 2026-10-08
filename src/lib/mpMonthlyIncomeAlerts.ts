import {createClient} from '@supabase/supabase-js';
import {crossedIncomeThresholds,type AccountIncome} from './mpAccountIncome';
import {loadMonthlyAccountIncome} from './mpAccountIncomeServer';
const money=(n:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
export function monthlyIncomeAlertText(account:AccountIncome,threshold:number){
 const projection=(date:string|null,target:number)=>account.monthAmount>=target?'Alcanzado':!date?'Sin ingresos':date>account.monthEnd?'No se alcanza este mes al ritmo actual':date.split('-').reverse().join('/');
 return `${threshold>=40000000?'🚨 ATENCIÓN: META PREVENTIVA DE $40M ALCANZADA':'📊 Ingresos mensuales por cuenta'}\n\nCuenta: ${account.name}\nMes: ${account.asOf.slice(0,7)}\nUmbral alcanzado: ${money(threshold)}\nAcumulado: ${money(account.monthAmount)}\nPromedio por día calendario: ${money(account.dailyAverage)}\nProyección $40M: ${projection(account.date40,40000000)}\nProyección $50M: ${projection(account.date50,50000000)}${threshold>=40000000?'\n\n⚠️ Evitar nuevos ingresos en esta cuenta. Límite mensual de referencia: $50M.':''}\n\nEl acumulado se reinicia al comenzar el próximo mes.`;
}
export async function checkMonthlyIncomeAlerts(){
 const token=process.env.LOGISTICS_TELEGRAM_BOT_TOKEN,chat=process.env.META_BALANCE_TELEGRAM_CHAT_ID;
 if(!token||!chat)return {configured:false,sent:0};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Falta configurar la conexión para avisos de ingresos.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const asOf=new Date(Date.now()-3*3600000).toISOString().slice(0,10);
 const accounts=await loadMonthlyAccountIncome(db,asOf);let sent=0;
 for(const account of accounts)for(const threshold of crossedIncomeThresholds(account.monthAmount)){
   const identity={month:asOf.slice(0,7)+'-01',account_id:account.id,threshold};
   const now=new Date().toISOString(),lease=new Date(Date.now()+120000).toISOString();
   const inserted=await db.from('mp_monthly_income_alerts').insert({...identity,lease_until:lease});
   if(inserted.error){
     if(inserted.error.code!=='23505')throw inserted.error;
     const claim=await db.from('mp_monthly_income_alerts').update({lease_until:lease}).match(identity).eq('status','pending').lt('lease_until',now).select('account_id');
     if(claim.error)throw claim.error;if(!claim.data?.length)continue;
   }
   try{
     const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:monthlyIncomeAlertText(account,threshold),disable_notification:false}),signal:AbortSignal.timeout(15000)});
     const result=await response.json();if(!response.ok||!result.ok)throw new Error(`Telegram rechazó el aviso: ${result.description||response.status}`);
     const saved=await db.from('mp_monthly_income_alerts').update({status:'sent',sent_at:new Date().toISOString()}).match(identity).eq('lease_until',lease);
     if(saved.error)throw saved.error;sent++;
   }catch(error){
     // Release on known delivery failures; uncertain network failures retain the lease before retry.
     if(error instanceof Error&&error.message.startsWith('Telegram rechazó'))await db.from('mp_monthly_income_alerts').update({lease_until:now}).match(identity).eq('lease_until',lease);
     throw error;
   }
 }
 return {configured:true,sent};
}
