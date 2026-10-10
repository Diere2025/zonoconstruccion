export type MPRefreshRow = { id:string;status:string;message:string;account_name?:string };
type Requester=(url:string,options?:RequestInit)=>Promise<any>;
export type RefreshOptions={endpoint?:string;channel?:'activity'|'banking';history?:boolean;from?:string;to?:string;signal?:AbortSignal;timeoutMs?:number;callTimeoutMs?:number;pauseMs?:number};
export async function readMPRefresh(request:Requester,accountId:string,onProgress:(message:string)=>void,options:RefreshOptions={}){
 const deadline=Date.now()+(options.timeoutMs??(options.history?900000:95000));
 const endpoint=options.endpoint||'/api/mp-refresh';
 async function bounded(url:string,init:RequestInit={}){
  const controller=new AbortController();const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([request(url,{...init,signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Error('El servidor no respondió a tiempo. Volvé a consultar.'));controller.abort();},Math.max(1,Math.min(options.callTimeoutMs??15000,deadline-Date.now())));controller.signal.addEventListener('abort',()=>reject(Error('La consulta fue cancelada')),{once:true});})]);}
  finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 }
 onProgress('Solicitando lectura…');
 const initial=await bounded(endpoint,{method:'POST',body:JSON.stringify({action:'request',accountId,channel:options.channel,history:options.history===true,from:options.from,to:options.to})});
 if(!Array.isArray(initial.data)||!initial.data.length)throw Error('No se recibieron solicitudes de actualización');
 let rows:MPRefreshRow[]=initial.data;const names=new Map(rows.map(r=>[r.id,r.account_name]));const ids=rows.map(r=>r.id);
 while(rows.some(r=>['queued','reading'].includes(r.status))&&Date.now()<deadline&&!options.signal?.aborted){
  onProgress(rows.map(r=>(names.get(r.id)||'Cuenta')+': '+(r.status==='reading'?'leyendo':r.status==='queued'?'esperando al monitor':r.message)).join(' · '));
  await new Promise(resolve=>setTimeout(resolve,options.pauseMs??2000));
  if(options.signal?.aborted)throw Error('La consulta fue cancelada');
  const result=await bounded(endpoint+'?ids='+ids.join(','));
  if(!Array.isArray(result.data)||result.data.length!==ids.length)throw Error('No se pudo consultar el estado de todas las cuentas');
  rows=result.data;
 }
 if(options.signal?.aborted)throw Error('La consulta fue cancelada');
 rows=rows.map(r=>['queued','reading'].includes(r.status)?{...r,status:'expired',message:'El monitor no respondió a tiempo. Revisá que la pestaña correcta esté abierta y activa.'}:r);
 onProgress(rows.map(r=>(names.get(r.id)?names.get(r.id)+': ':'')+r.message).join(' · '));
 return rows;
}
