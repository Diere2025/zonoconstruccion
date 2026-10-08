// Read-only audit. Token is supplied through the process environment, never saved.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../output/whaticket-assistant-2026-09-30');
const since = '2026-08-31T15:46:46.000Z';
const until = '2026-09-30T15:46:46.000Z';
const token = process.env.WHATICKET_AUDIT_TOKEN;
if (!token) throw new Error('Missing WHATICKET_AUDIT_TOKEN');
const families = {
  escaleras: /escaler/i, latex: /l[aá]tex|zonolatex|combo\s*pintor/i,
  cooper: /cooper/i, tanques: /tanque\s*(de\s*agua|\d|tricapa)|tanques?\s+de\s+agua/i,
  biodigestores_convencionales: /biodigest/i,
  biodigestores_autolimpiantes: /autolimpi/i,
  impermeabilizacion: /membrana|impermeabili|poliuret[aá]n|asf[aá]lt/i,
};
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,16);
function classify(text) {
  const found = Object.entries(families).filter(([,re])=>re.test(text)).map(([name])=>name);
  if (found.includes('biodigestores_convencionales')) {
    const i=found.indexOf('biodigestores_convencionales');
    if (found.includes('biodigestores_autolimpiantes')) found.splice(i,1);
    else if (!/convencional|tradicional/i.test(text)) found.splice(i,1,'biodigestores_sin_tipo');
  }
  return found;
}
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
async function get(endpoint, params={}) {
  const url = new URL(endpoint,'https://api.whaticket.com');
  Object.entries(params).forEach(([k,v])=>v!==undefined&&url.searchParams.set(k,v));
  for(let attempt=0;attempt<4;attempt++) {
    const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
    if(res.status===429||res.status>=500){await sleep(1000*(attempt+1));continue;}
    if(!res.ok) throw new Error(`GET ${endpoint.split('?')[0]} HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Retry limit');
}
function redact(text, ticket) {
  let s=String(text||'');
  for(const name of [ticket.contact?.name,ticket.contact?.number,ticket.contact?.email])
    if(name&&String(name).length>2)s=s.split(String(name)).join('[contacto]');
  return s.replace(/https?:\/\/\S+/g,'[enlace]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]')
    .replace(/(?:\+?\d[\s()-]*){8,}/g,'[dato numérico]')
    .replace(/(?:dni|cuit|cbu|alias|domicilio|direcci[oó]n|calle)\s*[:=]?[^\n]+/gi,'[dato personal]')
    .replace(/(?:me llamo|mi nombre es|a nombre de)\s+[^\n,.]+/gi,'[nombre]');
}
function save(name,data){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2));}
async function main(){
  const [queues,fast]=await Promise.all([get('/queue'),get('/fastresponse')]);
  const quick=fast.fastResponses||[];
  save('respuestas-rapidas.json',quick.map(q=>({id:q.id,shortcut:q.shortcut,name:q.name,message:q.message||q.body||q.response,updatedAt:q.updatedAt,keys:Object.keys(q),media:q.mediaUrl||q.mediaPath||null,queueIds:q.queueIds})));
  console.log(JSON.stringify({phase:'connected',queues:queues.map(q=>q.name),quickResponses:quick.length,quickKeys:Object.keys(quick[0]||{})}));
  let tickets=[],cursor,stop='page_cap',pages=0; const seen=new Set();
  for(;pages<300;pages++){
    const d=await get('/tickets',{showAll:true,cursorUpdatedAt:cursor?.updatedAt,cursorId:cursor?.id});
    const batch=d.tickets||[]; let fresh=0;
    for(const t of batch){if(!seen.has(t.id)){seen.add(t.id);fresh++;if(t.updatedAt>=since)tickets.push(t);}}
    if(!fresh){stop='repeated_cursor';break;}
    if(!d.hasMore||!batch.length){stop='end';break;}
    cursor=batch.at(-1);
    if(cursor.updatedAt<since){stop='cutoff_updatedAt';break;}
    if(pages%10===0)console.log(JSON.stringify({phase:'index',pages:pages+1,recentTickets:tickets.length,lastUpdatedAt:cursor.updatedAt}));
  }
  const priority=t=>classify(t.lastMessage||'').length?0:1;
  tickets.sort((a,b)=>priority(a)-priority(b)||hash(a.id).localeCompare(hash(b.id)));
  const selected=tickets.slice(0,Number(process.env.WHATICKET_AUDIT_LIMIT||700));
  save('universo.json',{since,until,dateRule:'Tickets updated since cutoff; messages filtered to window; not filtered by ticket creation',pages:pages+1,stop,indexedTickets:tickets.length,selectedTickets:selected.length,selection:'Prioritize product mentions in lastMessage, then deterministic hash. Purposive, not representative.'});
  const records=[],errors=[];let position=0;
  async function worker(){while(position<selected.length){const t=selected[position++];try{
    let cursor;const seenMsg=new Set(),messages=[];let complete=false,reason='page_cap',n=0;
    for(;n<100;n++){
      const d=await get(`/messages/${t.id}`,{cursor:cursor?.createdAt,cursorId:cursor?.id,direction:cursor?'before':undefined});
      const batch=d.messages||[];let fresh=0;
      for(const m of batch)if(!seenMsg.has(m.id)){seenMsg.add(m.id);fresh++;if(m.createdAt>=since&&m.createdAt<=until)messages.push(m);}
      if(!fresh&&batch.length){reason='repeated_cursor';break;}
      if(d.hasMoreAfter){reason='unread_after';break;}
      if(!d.hasMoreBefore){complete=true;reason='end';break;}
      cursor=batch[0];
      if(!cursor||cursor.createdAt<since){complete=true;reason='cutoff';break;}
    }
    messages.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const dialogue=messages.filter(m=>!m.isNote&&!['event','notification','timestamp','system'].includes(m.mediaType)&&!m.isDeleted);
    const text=dialogue.map(m=>m.body||'').join('\n');
    const types=classify(text);const out={ref:hash(t.id),queue:queues.find(q=>q.id===t.queueId)?.name||null,status:t.status,families:types,windowComplete:complete,stop:reason,pages:n+1,messageCount:messages.length,metadataKeys:Object.keys(t.metadata||{}),campaignReferences:messages.filter(m=>m.campaignId).map(m=>hash(m.campaignId)),messages:dialogue.map(m=>({ref:hash(m.id),at:m.createdAt,direction:m.fromMe?'outgoing':'incoming',sender:m.sentFrom||'unknown',hasUser:!!m.userId,mediaType:m.mediaType,mediaPending:!!(m.mediaId||m.mediaUrl)&&!['chat','text'].includes(m.mediaType),metadataKeys:Object.keys(m.metadata||{}),text:redact(m.body,t)}))};
    records.push(out);
    if(records.length%25===0){save('muestra-local-redactada.json',records);console.log(JSON.stringify({phase:'messages',read:records.length,selected:selected.length,families:Object.fromEntries(Object.keys(families).map(f=>[f,records.filter(r=>r.families.includes(f)).length]))}));}
  }catch(e){errors.push({ref:hash(t.id),error:e.message});}}}
  await Promise.all(Array.from({length:3},()=>worker()));
  save('muestra-local-redactada.json',records);save('errores.json',errors);
  save('resumen.json',{since,until,indexedTickets:tickets.length,readTickets:records.length,nonempty:records.filter(r=>r.messageCount).length,windowComplete:records.filter(r=>r.windowComplete).length,errors:errors.length,counts:Object.fromEntries([...Object.keys(families),'biodigestores_sin_tipo'].map(f=>[f,records.filter(r=>r.families.includes(f)).length])),mediaPending:records.reduce((n,r)=>n+r.messages.filter(m=>m.mediaPending).length,0),campaignReferencedTickets:records.filter(r=>r.campaignReferences.length).length,metadataKeys:[...new Set(records.flatMap(r=>r.metadataKeys))],messageMetadataKeys:[...new Set(records.flatMap(r=>r.messages.flatMap(m=>m.metadataKeys)))]});
  console.log(JSON.stringify({phase:'done',read:records.length,errors:errors.length,root}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
