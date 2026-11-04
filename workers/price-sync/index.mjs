export const SPREADSHEET_ID='1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg';
export const SHEET_ID=919606071;
const GOOGLE=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const encoder=new TextEncoder();
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
const encode=value=>base64url(encoder.encode(JSON.stringify(value)));
export async function googleToken(credentials,fetcher=fetch){
 const c=typeof credentials==='string'?JSON.parse(credentials):credentials;
 const now=Math.floor(Date.now()/1000);
 const data=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const der=Uint8Array.from(atob(c.private_key.replace(/-----[^-]+-----|\s/g,'')),x=>x.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(data))));
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:data+'.'+signature}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!result.access_token)throw Error('Google no autorizó la conexión.');return result.access_token;
}
export function sheetBatch(job){
 const [y,m,d]=job.effective_date.split('-').map(Number);
 const serial=Math.round(Date.UTC(y,m-1,d)/86400000)+25569;
 return {requests:[
  {appendCells:{sheetId:SHEET_ID,rows:[{values:[
   {userEnteredValue:{numberValue:serial},userEnteredFormat:{numberFormat:{type:'DATE',pattern:'dd/mm/yyyy'}}},
   {userEnteredValue:{stringValue:job.sheet_product}},
   {userEnteredValue:{numberValue:Number(job.new_price)},userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'#,##0.00'}}},
  ]}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}},
  {createDeveloperMetadata:{developerMetadata:{metadataKey:'erp_price_change',metadataValue:job.id,visibility:'DOCUMENT',location:{spreadsheet:true}}}},
 ]};
}
export async function syncSheet(job,token,fetcher=fetch){
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 // The row and its durable idempotency marker commit together in one Sheets batch.
 const search=await fetcher(GOOGLE+'/developerMetadata:search',{method:'POST',headers,body:JSON.stringify({dataFilters:[{developerMetadataLookup:{metadataKey:'erp_price_change',metadataValue:job.id,visibility:'DOCUMENT'}}]}),signal:AbortSignal.timeout(15000)});
 if(!search.ok)throw Error(`No se pudo comprobar la vigencia en Sheets (${search.status}).`);
 const found=await search.json();if(found.matchedDeveloperMetadata?.length)return {existing:true};
 const response=await fetcher(GOOGLE+':batchUpdate',{method:'POST',headers,body:JSON.stringify(sheetBatch(job)),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`Sheets rechazó la nueva vigencia (${response.status}).`);
 await response.json();return {existing:false};
}
export function priceMessage(job){
 const money=value=>'$'+Number(value).toLocaleString('es-AR',{maximumFractionDigits:2});
 const date=job.effective_date.split('-').reverse().join('/');
 return {chat_id:job.chat_id,text:[`💲 Cambio de precio · ${date}`,job.product_name,`Anterior: ${job.old_price==null?'Sin precio':money(job.old_price)}`,`Nuevo: ${money(job.new_price)}`,'✅ Actualizado en ERP y BD PRECIOS · PVP por Fecha'].join('\n'),link_preview_options:{is_disabled:true}};
}
export async function processJob(job,{patch,sheet,send}){
 try{
  if(job.sheet_state!=='sent'){
   await sheet(job);
   await patch({sheet_state:'sent',last_error:''});
  }
 }catch{
  await patch({last_error:'No se confirmó la actualización de BD PRECIOS. Se comprobará la vigencia antes de reintentar.',retry_seconds:60},true);
  return {sheet:false,telegram:false};
 }
 if(job.telegram_state!=='pending'){
  await patch({},true);return {sheet:true,telegram:job.telegram_state==='sent'};
 }
 // Persist intent before making a non-idempotent Telegram request.
 await patch({telegram_state:'sending',last_error:''});
 let result;
 try{result=await send(priceMessage(job));}
 catch{await patch({telegram_state:'unknown',last_error:'Telegram no confirmó el envío; revisar el grupo antes de reenviar.'},true);return {sheet:true,telegram:false,unknown:true};}
 if(result.ok===true&&Number.isInteger(result.result?.message_id)){
  await patch({telegram_state:'sent',telegram_message_id:result.result.message_id,last_error:''},true);
  return {sheet:true,telegram:true};
 }
 if(result.ok===false){
  await patch({telegram_state:'pending',last_error:`Telegram rechazó el aviso (${Number(result.error_code)||'sin código'}).`,retry_seconds:Math.max(60,Number(result.parameters?.retry_after)||300)},true);
 }else await patch({telegram_state:'unknown',last_error:'Respuesta de Telegram sin confirmación; revisar antes de reenviar.'},true);
 return {sheet:true,telegram:false};
}
export function createRpc(env,fetcher=fetch){
 return async(name,body={})=>{
  const response=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${env.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({...body,p_token:env.CONTROL_TOKEN}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Registro de precios: ${name} (${response.status}).`);
  return response.status===204?null:response.json();
 };
}
export async function execute(env,fetcher=fetch){
 const rpc=createRpc(env,fetcher);
 let token;const results=[];const start=Date.now();
 for(let i=0;i<5&&Date.now()-start<45000;i++){
  const [job]=await rpc('claim_price_change',{});if(!job)break;
  results.push(await processJob(job,{
   patch:(p_patch,p_release=false)=>rpc('update_price_change',{p_id:job.id,p_claim:job.claim_token,p_patch,p_release}),
   sheet:async j=>{token||=await googleToken(env.GOOGLE_SERVICE_ACCOUNT_KEY,fetcher);return syncSheet(j,token,fetcher);},
   send:async body=>{const r=await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return r.json();},
  }));
 }
 return {processed:results.length,results};
}
export default {
 async queue(batch,env){
  for(const message of batch.messages){
   try{
    const result=await execute(env);
    const delay=await createRpc(env)('next_price_change_wake');
    // A delayed retry exists only while a registered change is unfinished.
    if(delay===null)message.ack();
    else if(result.processed>0&&result.results.every(r=>r.sheet&&r.telegram)){
     await env.PRICE_CHANGES.send({kind:'price-change'},{delaySeconds:Math.min(43200,Math.max(1,delay))});
     message.ack();
    }else message.retry({delaySeconds:Math.min(43200,Math.max(1,delay))});
    console.log(JSON.stringify({event:'price-change',...result,retrySeconds:delay}));
   }catch{message.retry({delaySeconds:60});console.error('No se pudo completar el cambio de precio. La cola conservará el aviso.');}
  }
 },
 async fetch(request,env){
  if(!env.CONTROL_TOKEN||request.headers.get('authorization')!==`Bearer ${env.CONTROL_TOKEN}`)return new Response('Unauthorized',{status:401});
  if(request.method==='POST'&&new URL(request.url).pathname==='/wake'){
   await env.PRICE_CHANGES.send({kind:'price-change'});
   return Response.json({accepted:true},{status:202});
  }
  if(request.method==='POST'&&new URL(request.url).pathname==='/run')return Response.json(await execute(env));
  return new Response('Not found',{status:404});
 },
};
