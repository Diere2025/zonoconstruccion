(function(root){
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function parseText(text){
  if((String(text).match(/\b\d{2}\/\d{2}\/\d{4}\b/g)||[]).length!==1||(String(text).match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g)||[]).length!==1||(String(text).match(/#\s*\d{6,80}\b/g)||[]).length!==1||(String(text).match(/\$\s*[\d.]+(?:\s*,\s*\d{1,2})?/g)||[]).length!==1)return null;
  const date=String(text).match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/),time=String(text).match(/\b([01]\d|2[0-3]):([0-5]\d)\b/),op=String(text).match(/#\s*(\d{6,80})\b/),amount=String(text).match(/([-−–]?\s*)\$\s*([\d.]+(?:\s*,\s*\d{1,2})?)/);
  if(!date||!time||!op||!amount)return null;
  const day=`${date[3]}-${date[2]}-${date[1]}`,clock=`${day}T${time[1]}:${time[2]}:00-03:00`;
  if(!Number.isFinite(Date.parse(clock))||day<'2026-09-30')return null;
  const value=amount[2].replace(/\s/g,'').replace(/\./g,'').replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(value)||!Number(value))return null;
  const description=String(text).replace(date[0],'').replace(time[0],'').replace(op[0],'').replace(amount[0],'').replace(/\s+/g,' ').trim();
  return {operationId:op[1],occurredAt:clock,amount:(/[-−–]/.test(amount[1])?'-':'')+Number(value).toFixed(2),description:description.slice(0,1000),occurrence:1};
 }
 function scan(doc){
  const candidates=[...doc.querySelectorAll('tr,[role="row"],li,article,div')].filter(el=>!el.closest("[id^='zono-'],nav,header,aside,[hidden],[aria-hidden='true']")&&el.getClientRects().length);
  const parsed=candidates.map(el=>({el,row:parseText(el.innerText||el.textContent)})).filter(x=>x.row);
  const leaves=parsed.filter(x=>!parsed.some(y=>x.el!==y.el&&x.el.contains(y.el)));
  const counts=new Map();return leaves.map(({row})=>{const key=JSON.stringify([row.operationId,row.occurredAt,row.amount,row.description]);row.occurrence=(counts.get(key)||0)+1;counts.set(key,row.occurrence);return row;});
 }
 function scanActivities(doc,dateResolver){
 const candidates=[...doc.querySelectorAll('a,li,tr,[role="row"],[role="listitem"],div,article')].filter(el=>!el.closest("[id^='zono-'],nav,header,aside,[hidden],[aria-hidden='true']")&&el.getClientRects().length);
 const rows=candidates.map(el=>{
  const text=el.innerText||'',times=text.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g)||[],amounts=text.match(/(?:[-−–+]\s*)?\$\s*[\d.]+(?:\s*,\s*\d{1,2})?/g)||[];
  if(times.length!==1||amounts.length!==1)return null;
  const date=dateResolver(el)?.dateStr;if(!date||date<'2026-09-30')return null;
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  if(lines.some(x=>/^(pendiente|en proceso|rechazado|cancelado|cancelada|fallido|fallida)$/i.test(x)))return null;
  const details=lines.filter(x=>! /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x)&&!/^[-−–+]?\s*\$/.test(x)&&!/^(aprobado|aprobada|completado|completada|dinero disponible|saldo disponible)$/i.test(x)&&!/^\d{2}\/\d{2}\/\d{4}$/.test(x)&&!/^#?\d{6,80}$/.test(x));
  if(details.length<2)return null;
  const payer=details[0],description=details[1];
  const raw=amounts[0],value=Number(raw.replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',','.'));if(!value)return null;
  const explicit=text.match(/(?:n[.°ºo\s]*de\s+operaci[oó]n|operaci[oó]n)\s*[:#]?\s*(\d{6,80})\b/i);
  return {el,row:{occurredAt:date+'T'+times[0]+':00-03:00',amount:(/[-−–]/.test(raw)?'-':'')+value.toFixed(2),name:payer.slice(0,120),description:description.slice(0,200),...(explicit?{operationId:explicit[1]}:{}),isReserve:/reserva/i.test(payer)&&/dinero (retirado|ingresado)/i.test(description),occurrence:1}};
 }).filter(Boolean);
 const counts=new Map();return rows.filter(x=>!rows.some(y=>x.el!==y.el&&x.el.contains(y.el))).map(({row})=>{const key=JSON.stringify([row.occurredAt,row.amount,row.name,row.description]);row.occurrence=(counts.get(key)||0)+1;counts.set(key,row.occurrence);return row;});
 }
 root.ZonoMpBanking={parseText,scan,scanActivities,normalize};
})(typeof globalThis!=='undefined'?globalThis:this);

