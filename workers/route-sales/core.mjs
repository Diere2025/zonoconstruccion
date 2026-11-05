export const TIME_ZONE='America/Argentina/Buenos_Aires';
export const HOURS=['11:00','12:30','14:00','15:00','16:00','17:00','17:30','17:50','20:30'];
export const CRONS=['0 14 * * 1-6','30 15 * * 1-6','0 17 * * 1-6','0 18 * * 1-6','0 19 * * 1-6','0 20 * * 1-6','30 20 * * 1-6','50 20 * * 1-6','30 23 * * 1-5','0 22 * * 6'];
export function dayAt(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=k=>parts.find(p=>p.type===k).value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
export function tomorrow(now=new Date()){const d=new Date(dayAt(now)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function nextDeliveryDay(now=new Date()){
 const d=new Date(tomorrow(now)+'T12:00:00Z');
 if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
export function displayDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return 'A coordinar';return value.slice(8,10)+'/'+value.slice(5,7);}
export function ticketId(link){try{const u=new URL(link);return u.origin==='https://app.whaticket.com'?u.pathname.match(/^\/tickets\/([a-f0-9-]{36})$/i)?.[1]||null:null;}catch{return null;}}
export function escape(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]+/g,' ');}
export function compactSummary(value){
 if(/kit|biodigestor|biofort/i.test(value)&&/500|700/.test(value)){
  const size=/autolimpiable/i.test(value)?'autolimpiable 700':'500';
  return `Kit bio ${size} L${/desengras/i.test(value)?' + desengrasadora':''}${/caños?|codos?|ramal|termofusi/i.test(value)?' + caños y accesorios':''}`;
 }
 return value.replace(/AquaFort\s*[-–]?\s*|Cooper\s*[-–]?\s*/gi,'').replace(/,?\s*(?:1 unidad|x1)\b/gi,'').replace(/\s+/g,' ').trim();
}
export function formatLabel(value){return value.replace(/\b(\d{1,2})\/(\d{1,2})(\/\d{4})?\b/g,(_,d,m,y='')=>d.padStart(2,'0')+'/'+m.padStart(2,'0')+y).replace(/\b(\d{1,2})\s*(?:hs|hrs|horas)\b/gi,(_,h)=>h.padStart(2,'0')+':00');}
export function deliveryLabel(sale,now=new Date()){
 let label=formatLabel(sale.date_label).replace(/\b\d{2}\/\d{2}(?:\/\d{4})?\s*\((?:compra|pedido|venta)\)\s*(?:[/|·,;–—-]\s*)?/gi,'').trim();
 const generic=label.replace(/^\d{2}\/\d{2}(?:\/\d{4})?\s+/,'').replace(/lo antes posible|coordinar entrega|a coordinar|[\s;/,.]/gi,'')==='';
 if(generic&&!sale.availability_uncertain){
  if(sale.available_from&&sale.available_from<=nextDeliveryDay(now))return 'Desde el próximo reparto ('+displayDate(nextDeliveryDay(now))+')';
  if(sale.available_from)return 'Desde '+displayDate(sale.available_from)+' (a coordinar)';
 }
 return label||'A coordinar';
}
export function hasNewMessages(messages,existing){
 if(!existing.length)return true;
 const threshold=Math.min(...existing.map(s=>Date.parse(s.updated_at)));
 return messages.some(m=>Date.parse(m.createdAt)>threshold&&!/(?:resuelto la conversaci|asignado autom[aá]ticamente|transferido a)/i.test(m.body||'')&&!/^(?:muchas gracias|gracias|a vos|ok|dale|👍|🤝)[ !.]*$/i.test(m.body||''));
}
export function renderNotice(sale,now=new Date()){
 const icon=sale.available_from && sale.available_from>nextDeliveryDay(now)?'🔴':'✅';
 const status=sale.status==='loaded'?`📦 <b>CARGADO · ${escape(sale.order_code)}</b>`:sale.status==='cancelled'?'❌ <b>CANCELADO</b>':'⏳ <b>PENDIENTE DE CARGA</b>';
 const links=[];if(ticketId(sale.whaticket_link))links.push(`<a href="${escape(sale.whaticket_link)}">Abrir Whaticket</a>`);
 const number=Number.isSafeInteger(sale.notice_number)&&sale.notice_number>0?`${sale.notice_number}. `:'';
 return `${sale.status==='cancelled'?'❌':icon} <b>${number}${escape(sale.locality)} · ${escape(compactSummary(sale.summary))}</b>\n${status} · 🚚 ${escape(deliveryLabel(sale,now))}${sale.availability_uncertain?' · Confirmar fecha':''}\n👤 ${escape(sale.seller_name)}${links.length?' · '+links.join(' · '):''}`;
}
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function validateSale(sale,messages,existing=[]){
 const ids=new Set(messages.map(m=>m.id));
 if(!sale.summary?.trim()||!sale.locality?.trim()||!sale.date_label?.trim())throw Error('Venta incompleta');
 if(/no explicit|sin localidad|desconocid|unknown|no especificad|no consta/i.test(sale.locality))sale.status='review';
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const evidenceText=normalize(messages.map(m=>m.body).join(' ')+' '+existing.map(s=>s.locality).join(' '));
 if(!evidenceText.includes(normalize(sale.locality)))sale.status='review';
 if(!['pending','review','cancelled'].includes(sale.status))throw Error('Estado inválido');
 if(!sale.evidence_ids?.length||sale.evidence_ids.some(id=>!ids.has(id)))throw Error('Evidencia inexistente');
 if(!ids.has(sale.sale_key)&&!existing.some(s=>s.source_key===sale.sale_key))throw Error('Identidad de venta sin respaldo');
 if(sale.available_from!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(sale.available_from)||Number.isNaN(Date.parse(sale.available_from+'T12:00:00Z'))))throw Error('Fecha inválida');
 const dates=[...formatLabel(sale.date_label).matchAll(/\b(\d{2})\/(\d{2})\b/g)].map(m=>m[1]+'/'+m[2]);
 if(sale.available_from&&dates.length&&!dates.includes(displayDate(sale.available_from)))sale.status='review';
 const weekday={domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6};
 for(const m of normalize(formatLabel(sale.date_label)).matchAll(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado) (\d{2}) (\d{2})\b/g)){
  const year=sale.available_from?.slice(0,4)||dayAt().slice(0,4);if(new Date(`${year}-${m[3]}-${m[2]}T12:00:00Z`).getUTCDay()!==weekday[m[1]])sale.status='review';
 }
 if(sale.summary.length>180||sale.locality.length>100||sale.date_label.length>200)throw Error('Resumen demasiado largo');
 return sale;
}
export function createDb(env,fetcher=fetch){
 return async(path,{method='GET',body}={})=>{
  const r=await fetcher(env.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'+(path.includes('on_conflict=')?',resolution=merge-duplicates':'')},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Base de avisos: HTTP '+r.status);return r.status===204?null:r.json();
 };
}
export async function deliverNotice(db,env,id,fetcher=fetch){
 const rows=await db('rpc/claim_route_sale_notice',{method:'POST',body:{p_id:id}});const sale=rows?.[0];
 if(!sale)return {attempted:false,sent:false,message:'Aviso en curso o requiere revisión'};
 const text=renderNotice(sale),fingerprint=await hash(text);
 if(fingerprint===sale.telegram_hash){await db('route_sales?id=eq.'+id,{method:'PATCH',body:{delivery_state:'idle'}});return {attempted:false,sent:true,messageId:sale.telegram_message_id,chatId:sale.telegram_chat_id};}
 const editing=!!sale.telegram_message_id;
 try{
  const r=await fetcher('https://api.telegram.org/bot'+env.LOGISTICS_TELEGRAM_BOT_TOKEN+'/'+(editing?'editMessageText':'sendMessage'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:sale.telegram_chat_id,message_id:editing?sale.telegram_message_id:undefined,text,parse_mode:'HTML',link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(20000)});
  const d=await r.json();
  if(!d.ok&&!/message is not modified/i.test(d.description||'')){
   await db('route_sales?id=eq.'+id,{method:'PATCH',body:{delivery_state:'idle',last_error:'Telegram '+r.status}});
   return {attempted:true,sent:false,message:'Telegram rechazó el aviso'};
  }
  const messageId=d.result?.message_id||sale.telegram_message_id;
  await db('route_sales?id=eq.'+id,{method:'PATCH',body:{telegram_message_id:messageId,telegram_hash:fingerprint,delivery_state:'idle',last_error:null}});
  return {attempted:true,sent:true,messageId,chatId:sale.telegram_chat_id};
 }catch{
  await db('route_sales?id=eq.'+id,{method:'PATCH',body:{delivery_state:editing?'idle':'uncertain',last_error:'Resultado desconocido; verificar antes de reenviar'}});
  return {attempted:true,sent:false,message:'Resultado de Telegram pendiente de conciliación'};
 }
}
