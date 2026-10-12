(function(root){
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
 const isoDate=date=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');};
 function headerDate(text,now=new Date()){
  text=String(text||'').replace(/\s+/g,' ').trim().toLowerCase();const today=isoDate(now);
  if(text==='hoy')return today;if(text==='ayer')return isoDate(new Date(now.getTime()-86400000));
  const explicit=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),spanish=text.match(/^(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/);
  let year,month,day;if(explicit){year=+explicit[3];month=+explicit[2];day=+explicit[1];}else if(spanish&&months.includes(spanish[2])){year=+(spanish[3]||today.slice(0,4));month=months.indexOf(spanish[2])+1;day=+spanish[1];if(!spanish[3]&&`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`>today)year--;}else return null;
  const value=new Date(Date.UTC(year,month-1,day));return value.getUTCFullYear()===year&&value.getUTCMonth()===month-1&&value.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
 }
 function parseText(text,day){
  if(!day||day<'2026-09-28')return null;text=String(text||'').replace(/\s+/g,' ').trim();const times=text.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g)||[],amounts=text.match(/(?:[-−–+]\s*)?\$\s*[\d.]+(?:\s*,\s*\d{1,2})?/g)||[],labels=text.match(/\b(?:Dinero (?:retirado|ingresado|agregado|depositado)|Rendimientos)\b/gi)||[];
  if(times.length!==1||amounts.length!==1||labels.length!==1)return null;
  const description=labels[0],kind=/retirado/i.test(description)?'withdrawal':/rendimientos/i.test(description)?'yield':'deposit',raw=amounts[0],number=Number(raw.replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',','.'));
  const negative=/[-−–]/.test(raw);if(!number||(kind==='withdrawal')!==negative)return null;
  return {occurredAt:day+'T'+times[0]+':00-03:00',amount:(negative?'-':'')+number.toFixed(2),description,kind,occurrence:1};
 }
 function scan(doc,now=new Date()){
  const visible=el=>!el.closest("[id^='zono-'],nav,aside,[hidden],[aria-hidden='true']")&&el.getClientRects().length;
  const headers=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6,header,span,p,div,time,[role="heading"]')].filter(visible).map(el=>({el,day:headerDate(el.innerText||el.textContent,now)})).filter(x=>x.day);
  const items=[...doc.querySelectorAll('li,article,a,button,section,tr,[role="row"],[role="listitem"],div')].filter(visible).map(el=>{let day=null;for(const h of headers)if(!h.el.contains(el)&&!el.contains(h.el)&&(h.el.compareDocumentPosition(el)&4))day=h.day;return {el,row:parseText(el.innerText||el.textContent,day)};}).filter(x=>x.row);
  const counts=new Map();return items.filter(x=>!items.some(y=>x.el!==y.el&&x.el.contains(y.el))).map(({row})=>{const key=JSON.stringify([row.occurredAt,row.amount,row.kind,row.description]);row.occurrence=(counts.get(key)||0)+1;counts.set(key,row.occurrence);return row;});
 }
 root.ZonoMpReserve={headerDate,parseText,scan};
})(typeof globalThis!=='undefined'?globalThis:this);
