// A reserve monitor uses its own tab ownership and alarm; it never claims
// the Activity or Banking monitor slots in this Chrome profile.
(function(){
 const reservePaths=['/savings/movements/000101a7-1f12-4102-9d9e-871da7f7b326','/savings/movements/7b241292-a4d8-46ca-9fa2-9ea6b61427fa'],alarm='RESERVE_MONITOR_PULSE';
 const valid=tab=>{try{const url=new URL(tab?.url||'');return ['mercadopago.com.ar','www.mercadopago.com.ar'].includes(url.hostname)&&url.protocol==='https:'&&reservePaths.includes(url.pathname.replace(/\/$/,''));}catch{return false;}};
 const interval=value=>Math.max(60,Math.min(86400,Number(value)||60))*1000;
 function pulse(){chrome.storage.local.get(['reserveMonitorEnabled','reserveMonitorTabId'],state=>{if(state.reserveMonitorEnabled&&state.reserveMonitorTabId)chrome.tabs.sendMessage(state.reserveMonitorTabId,{action:'RESERVE_MONITOR_TICK'}).catch(()=>{});});}
 function claim(tabId,prior,ms,reply){const nextReloadAt=Date.now()+ms;chrome.storage.local.set({reserveMonitorEnabled:true,reserveMonitorTabId:tabId,reserveMonitorNextReloadAt:nextReloadAt},()=>{chrome.alarms.create(alarm,{periodInMinutes:0.5});if(prior&&prior!==tabId)chrome.tabs.sendMessage(prior,{action:'RESERVE_MONITOR_CHANGED',active:false}).catch(()=>{});reply({ok:true,active:true,enabled:true,nextReloadAt});});}
 chrome.runtime.onMessage.addListener((request,sender,reply)=>{
  if(!['RESERVE_MONITOR_STATE','RESERVE_MONITOR_START','RESERVE_MONITOR_STOP','RESERVE_MONITOR_RELOAD'].includes(request.action))return;
  if(!sender.tab?.id||!valid(sender.tab)){reply({ok:false,error:'Pestaña de reserva inválida'});return;}
  chrome.storage.local.get(['reserveMonitorEnabled','reserveMonitorTabId','reserveMonitorNextReloadAt'],state=>{
   const id=sender.tab.id;
   if(request.action==='RESERVE_MONITOR_START'){claim(id,state.reserveMonitorTabId,interval(request.intervalSeconds),reply);return;}
   if(request.action==='RESERVE_MONITOR_STOP'){
    if(state.reserveMonitorTabId&&state.reserveMonitorTabId!==id){reply({ok:false,error:'Esta pestaña no es el monitor activo'});return;}
    chrome.storage.local.set({reserveMonitorEnabled:false,reserveMonitorTabId:null,reserveMonitorNextReloadAt:0},()=>{chrome.alarms.clear(alarm);reply({ok:true,active:false,enabled:false});});return;
   }
   if(request.action==='RESERVE_MONITOR_RELOAD'){
    if(!state.reserveMonitorEnabled||state.reserveMonitorTabId!==id){reply({ok:false,error:'Monitor de reserva inactivo'});return;}
    if(Date.now()<Number(state.reserveMonitorNextReloadAt)){reply({ok:true,skipped:true,nextReloadAt:state.reserveMonitorNextReloadAt});return;}
    const nextReloadAt=Date.now()+interval(request.intervalSeconds);chrome.storage.local.set({reserveMonitorNextReloadAt:nextReloadAt},()=>{reply({ok:true,nextReloadAt});setTimeout(()=>{const url=new URL(sender.tab.url);if(url.search||url.hash)chrome.tabs.update(id,{url:url.origin+url.pathname.replace(/\/$/,'')});else chrome.tabs.reload(id);},100);});return;
   }
   // New profiles start automatically; an explicit manual pause remains paused.
   if(state.reserveMonitorEnabled===false){reply({ok:true,active:false,enabled:false});return;}
   chrome.alarms.create(alarm,{periodInMinutes:0.5});
   if(state.reserveMonitorTabId===id){reply({ok:true,active:true,enabled:true,nextReloadAt:state.reserveMonitorNextReloadAt||Date.now()+interval(request.intervalSeconds)});return;}
   if(!state.reserveMonitorTabId){claim(id,null,interval(request.intervalSeconds),reply);return;}
   chrome.tabs.get(state.reserveMonitorTabId,tab=>{if(chrome.runtime.lastError||!valid(tab))claim(id,state.reserveMonitorTabId,interval(request.intervalSeconds),reply);else reply({ok:true,active:false,enabled:true,otherTab:true});});
  });return true;
 });
 chrome.alarms.onAlarm.addListener(event=>{if(event.name===alarm)pulse();});
 chrome.tabs.onRemoved.addListener(id=>{chrome.storage.local.get(['reserveMonitorTabId'],state=>{if(state.reserveMonitorTabId===id)chrome.storage.local.set({reserveMonitorTabId:null});});});
 chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.status!=='complete'&&!change.url)return;chrome.storage.local.get(['reserveMonitorTabId'],state=>{if(state.reserveMonitorTabId===id&&!valid(tab)&&tab.status!=='loading'){chrome.storage.local.set({reserveMonitorTabId:null});chrome.tabs.sendMessage(id,{action:'RESERVE_MONITOR_CHANGED',active:false}).catch(()=>{});}});});
 chrome.runtime.onStartup.addListener(()=>{chrome.storage.local.get(['reserveMonitorEnabled'],state=>{if(state.reserveMonitorEnabled)chrome.alarms.create(alarm,{periodInMinutes:0.5});});});
})();
