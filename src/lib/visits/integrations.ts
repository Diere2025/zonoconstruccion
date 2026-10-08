import { createClient } from '@supabase/supabase-js';
import { visitCode } from './model';
export function integrationDb() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}); }
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let token: { value:string; expires:number } | null = null;
export async function calendarToken() {
  if(token && token.expires>Date.now()+60000)return token.value;
  const c=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CREDENTIALS_JSON || '{}');
  if(!c.private_key || !c.client_email)throw new Error('Falta configurar la cuenta de Google Calendar.');
  const encode=(s:string)=>btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const now=Math.floor(Date.now()/1000),body=`${encode(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${encode(JSON.stringify({iss:c.client_email,scope:'https://www.googleapis.com/auth/calendar',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}))}`;
  const pem=c.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(body)));
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${body}.${encode(String.fromCharCode(...signature))}`}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!response.ok || !data.access_token)throw new Error('Google no autorizó el calendario. Revisá permisos de la cuenta de servicio.');
  token={value:data.access_token,expires:Date.now()+Number(data.expires_in||3600)*1000};return token.value;
}
type CalendarItem={id:string;date:string;start_time:string;end_time:string;status?:string;cancelled?:boolean;kind?:string;title?:string;case_id?:string|null};
async function syncItem(item:CalendarItem,calendar:string,summary:string,link:string) {
  const bearer=await calendarToken(),id=item.id.replace(/-/g,''),base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`,headers={Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'};
  const get=await fetch(`${base}/${id}`,{headers,signal:AbortSignal.timeout(10000)});
  const cancelled=item.cancelled || item.status==='cancelled';
  if(cancelled){if(get.status===404 || get.status===410)return;if(!get.ok)throw new Error('No se pudo consultar Google Calendar.');const r=await fetch(`${base}/${id}?sendUpdates=none`,{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});if(!r.ok && r.status!==410)throw new Error('No se pudo cancelar la cita en Google.');return;}
  if(!get.ok && get.status!==404)throw new Error('El calendario no está compartido o no permite consultar eventos.');
  // Check other Google appointments before adding/updating a busy time.
  const start=`${item.date}T${item.start_time.slice(0,5)+':00'}-03:00`,end=`${item.date}T${item.end_time.slice(0,5)+':00'}-03:00`;
  if(item.kind!=='available'){
    const query=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',maxResults:'250'});
    const r=await fetch(`${base}?${query}`,{headers,signal:AbortSignal.timeout(10000)}),d=await r.json();
    if(!r.ok || d.nextPageToken)throw new Error('No se pudo verificar la disponibilidad de Google Calendar.');
    if((d.items||[]).some((e:{id:string;status:string;transparency?:string})=>e.id!==id && e.status!=='cancelled' && e.transparency!=='transparent'))throw new Error('Existe otra cita en Google Calendar en esa franja. La cita local quedó guardada para revisar.');
  }
  const body={summary,description:link?`Ver detalles en el ERP: ${link}`:'Espacio del calendario del instalador',start:{dateTime:start,timeZone:'America/Argentina/Buenos_Aires'},end:{dateTime:end,timeZone:'America/Argentina/Buenos_Aires'},transparency:item.kind==='available'?'transparent':'opaque',extendedProperties:{private:{zonoVisit:item.case_id||'',zonoSlot:id}}};
  const r=await fetch(get.ok?`${base}/${id}?sendUpdates=none`:`${base}?sendUpdates=none`,{method:get.ok?'PATCH':'POST',headers,body:JSON.stringify(get.ok?body:{...body,id}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Google Calendar rechazó la cita. Revisá permisos y calendario.');
}
export async function processVisitJobs(caseId?:string,slotId?:string) {
  const db=integrationDb(),settings=await db.from('visit_integration_settings').select('*').eq('id',true).single();
  if(settings.error)throw new Error('No se pudo consultar la configuración de avisos.');
  const config=settings.data;let query=db.from('visit_delivery_jobs').select('*').in('state',['pending','error']).order('created_at').limit(20);if(caseId)query=query.eq('case_id',caseId);if(slotId)query=query.eq('slot_id',slotId);
  const jobs=await query;if(jobs.error)throw new Error('No se pudieron consultar los avisos.');let done=0,pending=0,failed=0;
  for(const job of jobs.data||[]){
    const c=job.case_id?(await db.from('visit_cases').select('*').eq('id',job.case_id).single()).data:null;
    const slot=job.slot_id?(await db.from('visit_slots').select('*').eq('id',job.slot_id).single()).data:null;
    const calendar=slot?config.installations_calendar_id:config.visits_calendar_id;
    const url=String(config.public_url||'').replace(/\/$/,'');
    if((job.channel==='telegram' && (!config.telegram_chat_id || !url || !process.env.LOGISTICS_TELEGRAM_BOT_TOKEN)) || (job.channel==='google' && !calendar)){pending++;continue;}
    const claim=await db.from('visit_delivery_jobs').update({state:'processing'}).eq('id',job.id).eq('state',job.state).select('id').maybeSingle();if(!claim.data)continue;
    try{
      const link=c?`${url}/visitas?case=${c.id}`:`${url}/visitas?mode=agenda&month=${slot?.date.slice(0,7)}`;
      if(job.channel==='telegram'){
        const event=job.event_id?(await db.from('visit_events').select('kind,data').eq('id',job.event_id).single()).data:null;
        const labels:Record<string,string>={create:'Nueva visita',appointment:'Visita coordinada / actualizada',visit_result:'Resultado de visita disponible',outcome:'Resultado comercial actualizado'};
        const title=slot?(slot.kind==='installation'?'Instalación':slot.kind==='available'?'Disponibilidad para instalar':'No disponible'):(labels[event?.kind||'']||'Aviso de visita');
        const after=event?.data?.after||c;
        const text=[`${escape(title)}${slot?.cancelled?' · Cancelada':''}`,c?`${visitCode(c.number)} · ${escape(after.customer_name)} · ${escape(after.locality)}`:escape(slot?.title||''),slot?`${slot.date.split('-').reverse().join('/')} · ${slot.start_time.slice(0,5)}–${slot.end_time.slice(0,5)}`:event?.data?.input?.date?`${event.data.input.date.split('-').reverse().join('/')} · ${escape(event.data.input.start_time||'')}`:event?.data?.input?.scheduled_date?`${event.data.input.scheduled_date.split('-').reverse().join('/')} · ${escape(event.data.input.scheduled_time||'')}`:'Fecha: consultar en el ERP',`<a href="${escape(link)}">Abrir detalles en el ERP</a>`].join('\n');
        const r=await fetch(`https://api.telegram.org/bot${process.env.LOGISTICS_TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.telegram_chat_id,text,parse_mode:'HTML',link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok || !result.ok)throw new Error('Telegram rechazó el aviso. Revisá el grupo y los permisos del bot.');
      }else{
        const aps=slot?[slot]:(await db.from('visit_appointments').select('*').eq('case_id',job.case_id).order('date')).data||[];
        if(!aps.length){await db.from('visit_delivery_jobs').update({state:'pending',message:'Falta definir día y hora de la visita.'}).eq('id',job.id);pending++;continue;}
        for(const a of aps)await syncItem(a,calendar,slot?`${slot.kind==='installation'?'Instalación':slot.kind==='available'?'Disponible':'No disponible'} · ${slot.title}`:`Visita · ${c.customer_name} · ${c.locality}${a.status==='proposed'?' (aproximada)':''}`,link);
      }
      await db.from('visit_delivery_jobs').update({state:'done',message:''}).eq('id',job.id);done++;
    }catch(e){const ambiguous=job.channel==='telegram' && (!(e instanceof Error)||/timeout|fetch|network/i.test(e.message));await db.from('visit_delivery_jobs').update({state:ambiguous?'unknown':'error',message:e instanceof Error?e.message:'Error de entrega'}).eq('id',job.id);failed++;}
  }
  return {done,pending,failed,message:`${done} avisos/citas procesados · ${pending} pendientes de configuración o fecha · ${failed} requieren revisión.`};
}
