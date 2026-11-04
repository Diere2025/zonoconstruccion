import {CRONS,HOURS,TIME_ZONE,createDb,deliverNotice,hash,dayAt} from './core.mjs';
import {interpret,transcribe} from './interpret.mjs';

async function whaticket(env,path,params={}){
 const u=new URL('https://api.whaticket.com/api/v1'+path);
 for(const [k,v] of Object.entries(params))if(v!==undefined)u.searchParams.set(k,String(v));
 const r=await fetch(u,{headers:{Authorization:'Bearer '+env.WHATICKET_AUDIT_TOKEN},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Whaticket HTTP '+r.status);return r.json();
}
async function messagesFor(env,id){
 const messages=[];let cursor;
 for(let page=0;page<12;page++){
  const d=await whaticket(env,`/tickets/${id}/messages`,{cursor:cursor?.createdAt,cursorId:cursor?.id,direction:cursor?'before':undefined});
  const batch=d.messages||[];messages.unshift(...batch);
  if(!d.hasMoreBefore)return {messages,complete:true};
  if(!batch.length||cursor?.id===batch[0].id)throw Error('Paginación incompleta');cursor=batch[0];
 }
 return {messages,complete:false};
}
export async function execute(env,{key,preview=false}){
 const db=createDb(env),config=(await db('route_sales_config?id=eq.true'))?.[0];
 if(!config)throw Error('Configuración ausente');
 if(!preview&&!config.enabled)return {skipped:true,reason:'Automatización desactivada'};
 if(!config.whaticket_user_id)throw Error('Falta identificar la cuenta de Jazmín en Whaticket');
 const runId=await db('rpc/claim_route_sales_run',{method:'POST',body:{p_key:key}});
 if(!runId)return {skipped:true};
 const summary={scanned:0,tagged:0,interpreted:0,review:0,sent:0,errors:0,preview,proposals:[],failures:[]};
 const started=Date.now();
 try{
  const tickets=new Map();let cursor;
  // The API lacks a documented tag filter: page only Jazmín's active ticket
  // metadata and fetch histories exclusively after checking Nuevo cliente.
  for(let page=0;page<100;page++){
   const d=await whaticket(env,'/tickets',{status:'open,pending',userIds:config.whaticket_user_id,cursorUpdatedAt:cursor?.updatedAt,cursorId:cursor?.id});
   const batch=d.tickets||[];summary.scanned+=batch.length;
   for(const t of batch)if((t.contact?.tags||[]).some(tag=>tag.name?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='nuevo cliente'))tickets.set(t.id,t);
   if(!d.hasMore||!batch.length)break;
   if(page===99)throw Error('Índice incompleto; no se publicaron resultados');
   if(cursor?.id===batch.at(-1).id)throw Error('Cursor repetido');cursor=batch.at(-1);
  }
  const active=await db('route_sales?source=eq.whaticket&status=in.(pending,review,loaded)&select=*');
  // Include remembered sales even when the tag is removed; removal is NOT a cancellation.
  for(const s of active)if(s.status!=='loaded'&&s.ticket_id&&!tickets.has(s.ticket_id))tickets.set(s.ticket_id,null);
  summary.tagged=tickets.size;
  for(const [id] of tickets){
   if(Date.now()-started>11*60000)throw Error('Tiempo máximo de ejecución; pendientes se retomarán');
   try{
    const history=await messagesFor(env,id);
    const messages=history.messages.filter(m=>!m.isDeleted&&!m.isNote).map(m=>({id:m.id,createdAt:m.createdAt,fromMe:m.fromMe,body:m.body||'',mediaType:m.mediaType,mediaUrl:m.mediaUrl}));
    const existing=active.filter(s=>s.ticket_id===id);
    const cache=(await db('route_sales_chats?ticket_id=eq.'+id))?.[0];
    const fingerprint=await hash(JSON.stringify(messages.map(m=>[m.id,m.body,m.mediaType])));
    if(fingerprint===cache?.input_hash)continue;
    const transcripts=cache?.audio_transcripts||{};
    let missing=false;
    for(const m of messages){
     if(/audio|ptt/i.test(m.mediaType||'')){
      try{transcripts[m.id] ||= await transcribe(env,m);m.body='[Audio transcrito] '+transcripts[m.id];}catch{m.body='[Audio no disponible]';missing=true;}
     }
     delete m.mediaUrl;
    }
    const sales=await interpret(env,{messages,existing,model:config.model});summary.interpreted++;
    if(preview)summary.proposals.push({ticket_id:id,complete:history.complete,missingAudio:missing,sales});
    for(const s of sales){
     const old=existing.find(x=>x.source_key===s.sale_key);
     if(old?.status==='loaded')continue;
     if(!old&&existing.length){summary.review++;continue;}
     // Never auto-publish a second identity while a chat has an existing sale.
     if(!history.complete)s.status='review';
     if(s.status==='review')summary.review++;
     if(preview)continue;
     const value={source:'whaticket',source_key:s.sale_key,ticket_id:id,seller_id:config.seller_id,seller_name:config.seller_name,
      summary:s.summary,locality:s.locality,date_label:s.date_label,available_from:s.available_from,
      availability_uncertain:s.availability_uncertain,evidence_ids:s.evidence_ids,status:s.status,
      whaticket_link:'https://app.whaticket.com/tickets/'+id,updated_at:new Date().toISOString()};
     if(old)await db('route_sales?id=eq.'+old.id,{method:'PATCH',body:value});
     else await db('route_sales',{method:'POST',body:value});
    }
    if(!preview)await db('route_sales_chats?on_conflict=ticket_id',{method:'POST',body:{ticket_id:id,input_hash:missing?null:fingerprint,analysis:sales,audio_transcripts:transcripts,last_error:missing?'Audio pendiente':null,checked_at:new Date().toISOString()}});
   }catch(error){
    const held=/Interpretación IA incompleta|Evidencia inexistente|Identidad de venta|Fecha inválida|Resumen demasiado largo|Venta incompleta|Venta duplicada/.test(error.message);
    if(held)summary.review++;else summary.errors++;
    summary.failures.push({ticket_id:id,held,error:String(error.message).slice(0,200)});
    if(!preview)await db('route_sales_chats?on_conflict=ticket_id',{method:'POST',body:{ticket_id:id,last_error:String(error.message).slice(0,200),checked_at:new Date().toISOString()}});
   }
   await db('route_sales_runs?id=eq.'+runId,{method:'PATCH',body:{summary}});
  }
  if(!preview){
   const notices=await db('route_sales?status=in.(pending,loaded,cancelled)&order=available_from.asc.nullsfirst,created_at.asc');
   for(const sale of notices){const result=await deliverNotice(db,env,sale.id);if(result.attempted&&result.sent)summary.sent++;if(result.attempted&&!result.sent)summary.errors++;if(result.attempted)await new Promise(r=>setTimeout(r,3200));}
  }
  await db('route_sales_runs?id=eq.'+runId,{method:'PATCH',body:{status:summary.errors?'attention':'completed',finished_at:new Date().toISOString(),summary}});
  return {success:summary.errors===0,id:runId,...summary};
 }catch(error){await db('route_sales_runs?id=eq.'+runId,{method:'PATCH',body:{status:'failed',finished_at:new Date().toISOString(),summary,error:String(error.message).slice(0,500)}});throw error;}
}
export default {
 async scheduled(event,env){
  if(!CRONS.includes(event.cron))throw Error('Horario inválido');
  const weekday=new Date(event.scheduledTime-3*3600000).getUTCDay();
  const config=(await createDb(env)('route_sales_config?id=eq.true'))?.[0];
  if(!config?.weekdays?.includes(weekday))return;
  const r=await execute(env,{key:'cron:'+event.scheduledTime});if(r.success===false)throw Error('Revisión con errores: '+r.id);
 },
 async fetch(request,env){
  if(!env.CONTROL_TOKEN||request.headers.get('authorization')!=='Bearer '+env.CONTROL_TOKEN)return new Response('Unauthorized',{status:401});
  const url=new URL(request.url),db=createDb(env);
  try{
   if(request.method==='GET'&&url.pathname==='/status')return Response.json({timezone:TIME_ZONE,hours:HOURS,saturdayLast:'19:00',weekdays:'lunes a sábado',today:dayAt(),runs:await db('route_sales_runs?order=started_at.desc&limit=10'),review:await db('route_sales?or=(status.eq.review,delivery_state.eq.uncertain)&select=id,ticket_id,last_error'),chatErrors:await db('route_sales_chats?last_error=not.is.null&select=ticket_id,last_error')});
   if(request.method==='POST'&&['/preview','/run'].includes(url.pathname))return Response.json(await execute(env,{key:'manual:'+crypto.randomUUID(),preview:url.pathname==='/preview'}));
   // Brief capture for channels other than Whaticket. Protected server-to-server API.
   if(request.method==='POST'&&url.pathname==='/manual'){
    const v=await request.json();if(!v.key||!v.summary||!v.locality||!v.date_label)return new Response('Faltan datos',{status:400});
    const config=(await db('route_sales_config?id=eq.true'))?.[0];
    const old=await db('route_sales?source_key=eq.'+encodeURIComponent('manual:'+v.key));if(old.length)return Response.json({id:old[0].id,duplicate:true});
    const created=await db('route_sales',{method:'POST',body:{source:'manual',source_key:'manual:'+v.key,seller_id:config.seller_id,seller_name:config.seller_name,summary:String(v.summary).slice(0,180),locality:String(v.locality).slice(0,100),date_label:String(v.date_label).slice(0,200),available_from:v.available_from||null,status:'pending'}});
    return Response.json({id:created[0].id});
   }
   return new Response('Not found',{status:404});
  }catch(error){return Response.json({error:String(error.message)},{status:500});}
 }
};
