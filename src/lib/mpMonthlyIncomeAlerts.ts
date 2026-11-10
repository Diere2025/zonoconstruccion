import {createClient} from '@supabase/supabase-js';
import {crossedIncomeThresholds,projectIncomeThresholdDate,type AccountIncome} from './mpAccountIncome';
import {loadMonthlyAccountIncome} from './mpAccountIncomeServer';
import {MP_ALIAS_LIMITS} from './mpDailyAliases';
const money=(n:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
export function monthlyIncomeAlertText(account:AccountIncome,threshold:number){
 const policy=MP_ALIAS_LIMITS.find(item=>item.id===account.id);
 const normal=policy?.limit??40_000_000;
 const upper=policy ? policy.overflowLimit : 50_000_000;
 const urgent=threshold>=normal;
 const formatDate=(date:string)=>date.split('-').reverse().join('/');
 const project=(target:number)=>{
   const date=projectIncomeThresholdDate(account,target);
   const value=account.monthAmount>=target?'Alcanzado':!date?'Sin ingresos':date>account.monthEnd?'No se alcanza este mes al ritmo actual':formatDate(date);
   return `Proyección $${target/1_000_000}M: ${value}`;
 };
 const lines=[
   urgent ? `🚨 ATENCIÓN: ${policy?'TOPE':'META PREVENTIVA'} DE $${threshold/1_000_000}M ALCANZAD${policy?'O':'A'}` : '📊 Ingresos mensuales por cuenta',
   '', `Cuenta: ${account.name}`, `Corte: ${formatDate(account.asOf)}`, `Umbral alcanzado: ${money(threshold)}`,
   `Acumulado: ${money(account.monthAmount)}`, `Promedio por día calendario: ${money(account.dailyAverage)}`, project(normal),
 ];
 if(upper)lines.push(project(upper));
 if(urgent)lines.push('', policy?.overflowLimit && threshold<policy.overflowLimit
   ? '⚠️ Usar cobroszono hasta $30M sólo si hace falta margen adicional para el par diario.'
   : '⚠️ Evitar nuevos ingresos en esta cuenta.');
 return [...lines,'','El acumulado se reinicia al comenzar el próximo mes.'].join('\n');
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
   const policy=MP_ALIAS_LIMITS.find(item=>item.id===account.id);
   if(policy && threshold>(policy.overflowLimit??policy.limit))continue;
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
