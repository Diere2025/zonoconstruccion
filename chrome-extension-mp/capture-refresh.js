/* Capture-only refreshes never send historical rows to the collections webhook. */
(function(){
 const pending=new Map(),lastAttempt=new Map();let polling=false;
 const path=()=>location.pathname.replace(/\/$/,'');
 const channel=()=>path()==='/activities'?'activity':path()==='/banking/movements'?'banking':null;
 function send(route,payload){return new Promise(resolve=>{let done=false;const timer=setTimeout(()=>finish(null),20000);function finish(result){if(done)return;done=true;clearTimeout(timer);resolve(result);}chrome.runtime.sendMessage({action:'REPORT_PAYMENT',url:new URL(route,config.webhookUrl).toString(),token:config.secretToken,payload:{...payload,account:config.accountName,url:location.href}},result=>finish(chrome.runtime.lastError?null:result));});}
 async function captureLoaded(lane,manual=false,period){
  if(!isMonitorTab||channel()!==lane)return {captured:0,failed:true};
  const key=[lane,config.accountName,config.webhookUrl].join('|');if(pending.has(key))return pending.get(key);
  if(!manual&&Date.now()-(lastAttempt.get(key)||0)<getBankingInterval()*1000)return {captured:0,skipped:true};
  const work=(async()=>{let rows=lane==='activity'?ZonoMpBanking.scanActivities(document,getRowDate):ZonoMpBanking.scan(document);if(period)rows=rows.filter(r=>r.occurredAt.slice(0,10)>=period.date_from&&r.occurredAt.slice(0,10)<=period.date_to);
   if(!rows.length)return {captured:0,failed:false,empty:true};lastAttempt.set(key,Date.now());let captured=0;for(let offset=0;offset<rows.length;offset+=100){const r=await send('/api/mp-bank-web',{type:lane==='activity'?'BANK_ACTIVITY_CAPTURE':'BANK_WEB_CAPTURE',rows:rows.slice(offset,offset+100)});if(!r?.ok||!r.data?.success){const message=r?.status===404?'Captura de extractos todavía no publicada':r?.data?.error||r?.error||'La captura no fue confirmada';if(lane==='activity')lastActivityCaptureError=r?.status===404?'':message;else lastBankCaptureError=message;updateReadingStatus();return {captured,failed:true,message};}captured+=r.data.captured??Math.min(100,rows.length-offset);}
   if(lane==='activity')lastActivityCaptureError='';else {lastBankCaptureError='';lastReadingCount=rows.length;}updateReadingStatus();return {captured,failed:false};
  })().finally(()=>pending.delete(key));pending.set(key,work);return work;
 }
 function earliest(lane){
  if(lane==='banking'){return [...document.querySelectorAll('tr,[role="row"],li,article,div')].filter(el=>!el.closest("[id^='zono-'],nav,header,aside")&&el.getClientRects().length).flatMap(el=>[...(el.innerText||'').matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map(m=>`${m[3]}-${m[2]}-${m[1]}`)).sort()[0]||null;}
  return [...document.querySelectorAll('a,li,tr,[role="listitem"],article')].filter(el=>el.getClientRects().length&&/\$/.test(el.innerText||'')).map(el=>getRowDate(el)?.dateStr).filter(Boolean).sort()[0]||null;
 }
 function nextButton(){return [...document.querySelectorAll('button,a,[role="button"]')].find(el=>!el.closest('#zono-mp-widget')&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length&&/^(siguiente|ver m[aá]s|cargar m[aá]s|mostrar m[aá]s|m[aá]s movimientos|m[aá]s actividades)$/i.test((el.getAttribute('aria-label')||el.innerText||el.textContent||'').trim()));}
 async function readHistory(lane,job){
  const seen=new Set();let partial=true,stalled=0;const deadline=Date.now()+720000;
  for(let page=0;page<150&&Date.now()<deadline;page++){
   if(!isMonitorTab||channel()!==lane||detectMercadoPagoError().hasError)throw Error('La pestaña dejó de estar disponible');
   const result=await captureLoaded(lane,true,job);if(result.failed)throw Error(result.message||'La captura no fue confirmada');
   const rows=lane==='activity'?ZonoMpBanking.scanActivities(document,getRowDate):ZonoMpBanking.scan(document);for(const r of rows)if(r.occurredAt.slice(0,10)>=job.date_from&&r.occurredAt.slice(0,10)<=job.date_to)seen.add(JSON.stringify(r));
   const oldest=earliest(lane);if(oldest&&oldest<job.date_from){partial=false;break;}
   const signature=JSON.stringify(rows),button=nextButton();if(button)button.click();else {window.scrollTo(0,document.documentElement.scrollHeight);for(const el of document.querySelectorAll('main,[role="main"]'))el.scrollTop=el.scrollHeight;}
   await new Promise(resolve=>setTimeout(resolve,1500));
   const after=JSON.stringify(lane==='activity'?ZonoMpBanking.scanActivities(document,getRowDate):ZonoMpBanking.scan(document));
   if(signature===after)stalled++;else stalled=0;if(stalled>=3)break;
  }
  return {count:seen.size,message:seen.size+' referencias leídas. '+(partial?'Cobertura parcial: no se pudo confirmar el inicio del período. Completá con el Excel o cargá más páginas.':'Se alcanzó el inicio del período solicitado.')};
 }
 async function waitForListing(lane){
  const deadline=Date.now()+30000;await new Promise(resolve=>setTimeout(resolve,2500));
  while(Date.now()<deadline){const button=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>!el.closest('#zono-mp-widget')&&/^(actualizar listado|actualizar)$/i.test((el.innerText||el.textContent||'').trim()));const busy=button&&(button.disabled||button.getAttribute('aria-busy')==='true'||button.getAttribute('aria-disabled')==='true');const rows=lane==='activity'?ZonoMpBanking.scanActivities(document,getRowDate):ZonoMpBanking.scan(document);if(!busy&&rows.length)return;await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error('El listado todavía no está disponible. Volvé a solicitar la actualización.');
 }
 async function finishJob(lane,job){let ok=false,message='La lectura no pudo completarse';try{await waitForListing(lane);if(job.history){const result=await readHistory(lane,job);message=result.message;}else {const result=await captureLoaded(lane,true,job);if(result.failed)throw Error(result.message||'Captura no confirmada');message=result.captured+' referencias capturadas de las filas cargadas.';}ok=true;}catch(error){message=error.message||message;}await send('/api/mp-bank-refresh',{action:'complete',channel:lane,id:job.id,ok,message});if(job.history)location.assign(location.origin+(lane==='activity'?'/activities':'/banking/movements'));}
 async function poll(){const lane=channel();if(polling||!lane||!isMonitorTab||detectMercadoPagoError().hasError)return;polling=true;try{
  const saved=sessionStorage.getItem('zono-capture-refresh-job');if(saved){sessionStorage.removeItem('zono-capture-refresh-job');const previous=JSON.parse(saved);if(previous.account===config.accountName&&previous.channel===lane)await finishJob(lane,previous.job);}
  const response=await send('/api/mp-bank-refresh',{action:'poll',channel:lane});if(!response?.ok||!response.data?.success)return;const job=response.data.data;if(!job)return;
  const button=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>!el.closest('#zono-mp-widget')&&/^(actualizar listado|actualizar)$/i.test((el.innerText||el.textContent||'').trim()));
  if(button&&!button.disabled){button.click();await finishJob(lane,job);}
  else {sessionStorage.setItem('zono-capture-refresh-job',JSON.stringify({job,account:config.accountName,channel:lane}));location.reload();}
 }catch(error){console.warn('[Zono] Refresco de referencias:',error.message);}finally{polling=false;}}
 globalThis.ZonoCaptureRefresh={captureLoaded,readHistory,poll,waitForListing};
 // Preserve independent frequencies and the existing collections monitor.
 async function reportCapture(lane,manual){
  const label=lane==='banking'?'movimientos bancarios':'referencias de Actividad';
  if(manual)showToast('Leyendo '+label+'…','success');
  let result;try{result=await captureLoaded(lane,manual);}catch(error){result={captured:0,failed:true,message:error.message||'No se pudo completar la captura'};}
  if(manual){
   if(result.failed)showToast(result.message||'No se pudo capturar. Verificá que esta sea la pestaña monitor y que corresponda a '+label+'.','error');
   else if(result.empty)showToast('No se detectaron filas compatibles para capturar. Cargá el listado desde el 30/09/2026 y volvé a sincronizar.','error');
   else showToast(result.captured+' '+label+' confirmados en el ERP · sólo filas cargadas · sin generar movimientos financieros','success');
  }
  return result;
 }
 reportBankingRows=manual=>reportCapture('banking',manual);
 reportActivityBankRows=manual=>reportCapture('activity',manual);
 setTimeout(poll,4000);setInterval(poll,10000);
})();
