import {createClient} from '@supabase/supabase-js';

type TelegramJob={id:string;ticket_id:string;ticket_number:number|string;title:string;creator_name:string;priority:string;chat_id:string;attempts:number;claim_token:string};
const priorities:Record<string,string>={low:'🟢 Baja',medium:'🟡 Media',high:'🟠 Alta',critical:'🔴 Crítica'};
function telegramDb(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})}});}

/** Only call after verifying Telegram's existing webhook secret. This does not enable alerts. */
export async function captureSupportTelegramGroup(update:{message?:{text?:string;chat?:{id?:number|string;title?:string;type?:string}}},db?:any){
 const message=update.message,chat=message?.chat;
 if(!/^\/incidencias(?:@[a-z0-9_]+)?\s*$/i.test(message?.text||'')||!chat||!['group','supergroup'].includes(chat.type||'')||chat.title?.trim().toLowerCase()!=='incidencias'||!/^-[0-9]+$/.test(String(chat.id)))return false;
 const result=await (db||telegramDb()).from('support_telegram_candidates').upsert({chat_id:String(chat.id),title:chat.title,observed_at:new Date().toISOString()},{onConflict:'chat_id'});
 if(result.error)throw new Error('No se pudo registrar el grupo de incidencias.');
 return true;
}
export function supportTelegramMessage(job:TelegramJob){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(job.ticket_id))throw new Error('Incidencia inválida para el aviso.');
 const link=`https://erp.zono.com.ar/incidencias/${job.ticket_id}`;
 const text=[`🆕 Nueva incidencia · INC-${String(job.ticket_number).padStart(6,'0')}`,job.title,`👤 Creada por: ${job.creator_name}`,`Prioridad: ${priorities[job.priority]||'Sin definir'}`,`🔗 ${link}`].join('\n');
 return {chat_id:job.chat_id,text,link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'Abrir incidencia',url:link}]]}};
}

/** Called after ticket creation and by keep-alive for SQL-created tickets and retries. */
export async function dispatchSupportTelegram(ticketId?:string,dependencies:{db?:any;fetcher?:typeof fetch;token?:string}={}){
 const token=dependencies.token||process.env.SUPPORT_TELEGRAM_BOT_TOKEN?.trim()||process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();
 if(process.env.SUPPORT_ENABLED==='false'||!token)return {configured:false,sent:0,failed:0};
 const db=dependencies.db||telegramDb();
 const fetcher=dependencies.fetcher||fetch;
 const claimed=await db.rpc('support_claim_telegram_jobs',{p_ticket:ticketId||null,p_limit:ticketId?1:3});
 if(claimed.error)throw new Error('No se pudo consultar la cola de avisos de incidencias.');
 let sent=0,failed=0;
 for(const job of (claimed.data||[]) as TelegramJob[]){
  let patch:Record<string,unknown>;
  try{
   const response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(supportTelegramMessage(job)),signal:AbortSignal.timeout(8000)});
   const result=await response.json();
   if(response.ok&&result.ok&&Number.isInteger(result.result?.message_id)){
    patch={state:'sent',sent_at:new Date().toISOString(),telegram_message_id:result.result.message_id,last_error:''};sent++;
   }else if(result.ok===false){
    const retryAfter=Math.min(86400,Math.max(30,Number(result.parameters?.retry_after)||60*Math.min(job.attempts,5)));
    patch={state:'error',next_attempt_at:new Date(Date.now()+retryAfter*1000).toISOString(),last_error:`Telegram rechazó el aviso (${Number(result.error_code)||response.status}). Revisar el destino y los permisos del bot.`};failed++;
   }else{
    patch={state:'unknown',last_error:'Telegram no confirmó el envío. Revisar el chat antes de reenviar.'};failed++;
   }
  }catch{
   patch={state:'unknown',last_error:'El envío quedó sin confirmación. Revisar Telegram antes de reenviar.'};failed++;
  }
  const saved=await db.from('support_telegram_jobs').update(patch).eq('id',job.id).eq('claim_token',job.claim_token);
  if(saved.error)throw new Error('No se pudo registrar el resultado del aviso de incidencia.');
 }
 return {configured:true,sent,failed};
}
