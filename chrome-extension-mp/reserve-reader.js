(function(){
 const reserveId='000101a7-1f12-4102-9d9e-871da7f7b326';let busy=false,enabled=false,lastSignature='',settings={},box,status;
 const supported=()=>location.pathname.replace(/\/$/,'')==='/savings/movements/'+reserveId;
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function say(text){if(status)status.textContent=text;}
 function send(rows){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('El ERP no respondió a tiempo')),20000);chrome.runtime.sendMessage({action:'REPORT_PAYMENT',url:new URL('/api/mp-reserve-web',settings.reserveReaderLocal?'http://localhost:3000':settings.webhookUrl||'https://zono-erp.pages.dev').toString(),token:settings.secretToken,payload:{type:'RESERVE_WEB_CAPTURE',account:settings.accountName,url:location.href,rows}},r=>{clearTimeout(timer);if(chrome.runtime.lastError||!r?.ok||!r.data?.success)reject(Error(r?.data?.error||'No se confirmó la lectura de reserva'));else resolve(r.data);});});}
 async function capture(force=false){const rows=ZonoMpReserve.scan(document);if(!rows.length)throw Error('No se reconocieron movimientos en esta página; no se guardaron filas');
  const signature=JSON.stringify(rows);if(!force&&signature===lastSignature)return rows;
  for(let i=0;i<rows.length;i+=100)await send(rows.slice(i,i+100));lastSignature=signature;say(rows.length+' filas leídas · evidencia guardada, sin duplicar movimientos');return rows;
 }
 async function run(history){if(busy||!supported())return;busy=true;enabled=true;for(const b of box.querySelectorAll('button'))b.disabled=true;
  try{say('Leyendo reserva…');let seen=new Set(),stalled=0;for(let page=0;page<(history?120:1)&&supported();page++){
   const rows=await capture(true);if(!history)break;const oldest=rows.map(r=>r.occurredAt.slice(0,10)).sort()[0];if(oldest&&oldest<='2026-09-28'){say('Lectura hasta el 28/09/2026 guardada · sin modificar saldos');break;}
   const signature=JSON.stringify(rows);if(seen.has(signature)){if(++stalled>=3){say('Lectura parcial: '+rows.length+' filas confirmadas en esta página. Faltan fechas anteriores al '+oldest.split('-').reverse().join('/')+'.');break;}}else{seen.add(signature);stalled=0;}
   const next=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>!el.closest("[id^='zono-']")&&el.getClientRects().length&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&/^(siguiente|ver m[aá]s|cargar m[aá]s|mostrar m[aá]s|m[aá]s movimientos)$/i.test((el.getAttribute('aria-label')||el.innerText||'').trim()));
   if(next)next.click();else window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});say('Leyendo páginas anteriores · '+seen.size+' páginas vistas');await wait(1800);
  }}catch(e){say(e.message+' · reintentá Leer visibles');}finally{busy=false;for(const b of box.querySelectorAll('button'))b.disabled=false;}
 }
 function mount(){if(!supported()){if(box)box.hidden=true;return;}if(box){box.hidden=false;return;}
  const hide=document.createElement('style');hide.textContent='body:has(#zono-reserve-reader:not([hidden])) #zono-mp-widget{display:none!important}';document.head.appendChild(hide);
  box=document.createElement('section');box.id='zono-reserve-reader';box.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:14px;box-shadow:0 4px 20px #0002;font:13px system-ui;color:#0f172a;max-width:460px';
  const title=document.createElement('strong');title.textContent='Reserva Diego · MP3';box.append(title);status=document.createElement('p');status.textContent='Referencia: $0 antes del ingreso de $500.000 del 06/10/2026.';box.append(status);
  for(const [text,history]of [['Leer visibles',false],['Leer hasta el 28/09',true]]){const button=document.createElement('button');button.textContent=text;button.style.cssText='margin-right:8px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:#eff6ff;cursor:pointer';button.onclick=()=>run(history);box.append(button);}const localLabel=document.createElement('label');localLabel.style.cssText='display:block;margin-top:10px;color:#64748b;font-size:12px';const local=document.createElement('input');local.type='checkbox';local.checked=!!settings.reserveReaderLocal;local.onchange=()=>{settings.reserveReaderLocal=local.checked;lastSignature='';chrome.storage.local.set({reserveReaderLocal:local.checked});};localLabel.append(local,document.createTextNode(' Usar ERP local (localhost:3000)'));box.append(localLabel);document.body.append(box);
 }
 chrome.storage.local.get(['webhookUrl','secretToken','accountName','reserveReaderLocal'],values=>{settings=values;mount();});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local')for(const name of ['webhookUrl','secretToken','accountName'])if(changes[name]){settings[name]=changes[name].newValue;lastSignature='';enabled=false;}});
 setInterval(()=>{mount();if(enabled&&supported()&&!busy){busy=true;capture().catch(e=>say(e.message)).finally(()=>{busy=false;});}},10000);
})();
