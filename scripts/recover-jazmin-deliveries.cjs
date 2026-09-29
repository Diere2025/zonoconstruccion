const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
process.loadEnvFile('.env.local');
const cache = new Map();
function loadTs(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module); mod.filename = file; mod.paths = module.paths;
  cache.set(file, mod);
  const baseRequire = mod.require.bind(mod);
  mod.require = name => name.startsWith('./') ? loadTs(path.resolve(path.dirname(file), `${name}.ts`)) : baseRequire(name);
  let source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('googleSheets.ts')) source += '\nexport { appendOrderToOperationalSheet };';
  mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return mod.exports;
}
const sheets = loadTs('src/lib/googleSheets.ts');
const {createClient} = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const sellerId = '13430e05-b61a-4a3f-9fc3-152d377c4b0c';
const journalPath = 'output/central-recovery/jazmin-deliveries-2026-09-28.json';
const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath,'utf8')) : {};
function saveJournal() {fs.mkdirSync(path.dirname(journalPath),{recursive:true});fs.writeFileSync(journalPath,JSON.stringify(journal,null,2));}
async function main() {
  const apply=process.argv.includes('--apply'), verify=process.argv.includes('--verify');
  const token=await sheets.getGoogleAccessToken();
  const delivery=sheets.DELIVERIES_CURRENT_SHEET, central=sheets.CENTRAL_ORDERS_SHEET, seller=sheets.SELLER_SHEET_CONFIG[sellerId];
  async function api(id,suffix,body) {
    const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${suffix}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message || `Sheets HTTP ${response.status}`);return data;
  }
  const codes=Array.from({length:20},(_,i)=>`JS${25730+i}`);
  const jobsResponse=await db.from('order_sync_jobs').select('id,order_id,code,payload,result,status,message').eq('seller_id',sellerId).eq('kind','create').in('code',codes).order('created_at');
  if(jobsResponse.error)throw jobsResponse.error;
  const jobs=jobsResponse.data;if(jobs.length!==20)throw new Error(`Se encontraron ${jobs.length} trabajos; se esperaban 20`);
  const orderResponse=await db.from('orders').select('id,status,legacy_code,totals').in('id',jobs.map(j=>j.order_id));if(orderResponse.error)throw orderResponse.error;
  for(const job of jobs){const o=orderResponse.data.find(o=>o.id===job.order_id);if(!o || ['Cancelado','Anulado'].includes(o.status) || o.legacy_code!==job.code)throw new Error(`Revisar estado de ${job.code}`);}
  const metadata=await api(delivery.spreadsheetId,'?fields=sheets(properties)');
  const props=metadata.sheets.find(s=>s.properties.title==='Vendedores').properties;
  const names=delivery.sheetNames.filter(n=>metadata.sheets.some(s=>s.properties.title===n));
  async function locations() {
    const ranges=names.map(n=>`'${n.replace(/'/g,"''")}'!A2:A`);
    const response=await api(delivery.spreadsheetId,`/values:batchGet?${ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&')}`);
    const map=new Map();response.valueRanges.forEach((v,i)=>(v.values || []).forEach((r,j)=>{const code=String(r[0] || '').trim();if(codes.includes(code)){if(map.has(code))throw new Error(`Pedido duplicado en Entregas: ${code}`);map.set(code,{sheetName:names[i],row:j+2});}}));return map;
  }
  let loc=await locations();
  const centralRows=await sheets.fetchSpreadsheetValues(central.spreadsheetId,`'${central.sheetName}'!B2:Q`);
  const sellerRows=await sheets.fetchSpreadsheetValues(seller.spreadsheetId,`'${seller.sheetName}'!B2:Q`);
  function find(rows,code){const indices=rows.flatMap((r,i)=>String(r[0] || '').trim()===code?[i]:[]);if(indices.length!==1)throw new Error(`${code}: se esperaba una sola fila`);return indices[0]+2;}
  for(const job of jobs){find(centralRows,job.code);find(sellerRows,job.code);}
  const configResponse=await db.from('site_settings').select('value').eq('id','route_formation_telegram_config').maybeSingle();if(configResponse.error)throw configResponse.error;
  const config=typeof configResponse.data?.value==='string'?JSON.parse(configResponse.data.value):configResponse.data?.value;
  const chatId=process.env.ROUTE_FORMATION_TELEGRAM_CHAT_ID?.trim() || String(config?.chat_id || '-1002044363540');
  const bot=process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();if(!bot)throw new Error('Falta token del bot');
  async function telegram(method,body){const res=await fetch(`https://api.telegram.org/bot${bot}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok || !data.ok)throw new Error(data.description || 'Telegram rechazó la solicitud');return data.result;}
  const chat=await telegram('getChat',{chat_id:chatId});
  const pendingAlerts=jobs.filter(j=>!j.result?.formationAlert?.sent && !(orderResponse.data.find(o=>o.id===j.order_id).totals?.telegram_notifications || []).some(n=>n.type==='formationAlert') && !journal[j.code]?.alert);
  console.log(JSON.stringify({apply,verify,deliveryRows:props.gridProperties.rowCount,existing:loc.size,missing:jobs.filter(j=>!loc.has(j.code)).map(j=>j.code),pendingAlerts:pendingAlerts.length,chatTitle:chat.title,chatId}));
  if(verify){
    if(loc.size!==20 || pendingAlerts.length)throw new Error('Quedan pases o avisos pendientes');
    for(const job of jobs){
      const l=loc.get(job.code);const rows=await api(delivery.spreadsheetId,`/values/${encodeURIComponent(`'${l.sheetName}'!A${l.row}:BX${l.row}`)}?valueRenderOption=UNFORMATTED_VALUE`);const row=rows.values?.[0] || [], order=job.payload.order;
      if(row[4]!==order.clientName || Number(row[23] || 0)!==Number(order.depositOrPaidAmount || 0))throw new Error(`Datos incorrectos en ${job.code}`);
      (order.items || []).forEach((item,i)=>{if(!row[29+4*i] || Number(row[30+4*i])!==Number(item.quantity || 1) || Number(row[31+4*i])!==Number(item.unitPrice || 0))throw new Error(`Productos incorrectos en ${job.code}`);});
      if(centralRows[find(centralRows,job.code)-2][15]!=='🔹 Pasado' || sellerRows[find(sellerRows,job.code)-2][15]!=='🔹 Pasado')throw new Error(`Estado pendiente ${job.code}`);
      if(job.status!=='completed' || !job.result?.formationAlert?.messageId)throw new Error(`Trabajo pendiente ${job.code}`);
    }
    console.log(JSON.stringify({verified:20,duplicates:0,productsAndAmounts:true,statuses:true,telegramConfirmed:20}));return;
  }
  if(!apply)return;
  const missingCount=jobs.filter(j=>!loc.has(j.code)).length;
  const lastRow=(await sheets.fetchSpreadsheetValues(delivery.spreadsheetId,"'Vendedores'!A2:E")).reduce((n,r,i)=>r.some(v=>String(v || '').trim())?i+2:n,1);
  if(lastRow+missingCount>props.gridProperties.rowCount){
    const added=Math.max(100,lastRow+missingCount-props.gridProperties.rowCount), newCount=props.gridProperties.rowCount+added;
    const colName=n=>{let name='';while(n){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26);}return name;};
    const template=await api(delivery.spreadsheetId,`/values/${encodeURIComponent(`'Vendedores'!A${lastRow}:${colName(props.gridProperties.columnCount)}${lastRow}`)}?valueRenderOption=FORMULA`);
    const formulaColumns=(template.values?.[0] || []).flatMap((v,i)=>String(v).startsWith('=')?[i]:[]);
    await api(delivery.spreadsheetId,':batchUpdate',{requests:[{appendDimension:{sheetId:props.sheetId,dimension:'ROWS',length:added}}]});
    const source={sheetId:props.sheetId,startRowIndex:lastRow-1,endRowIndex:lastRow,startColumnIndex:0,endColumnIndex:props.gridProperties.columnCount};
    const destination={sheetId:props.sheetId,startRowIndex:props.gridProperties.rowCount,endRowIndex:newCount,startColumnIndex:0,endColumnIndex:props.gridProperties.columnCount};
    await api(delivery.spreadsheetId,':batchUpdate',{requests:[{copyPaste:{source,destination,pasteType:'PASTE_FORMAT'}},{copyPaste:{source,destination,pasteType:'PASTE_DATA_VALIDATION'}},...formulaColumns.map(col=>({copyPaste:{source:{...source,startColumnIndex:col,endColumnIndex:col+1},destination:{...destination,startColumnIndex:col,endColumnIndex:col+1},pasteType:'PASTE_FORMULA'}}))]});
    console.log(JSON.stringify({deliveryRowsAdded:added,formulaColumns}));
  }
  let lastAlertTime=0;
  const escape=v=>String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  for(const job of jobs){
    let l=loc.get(job.code);
    const order={...job.payload.order,sellerName:sheets.normalizeSellerNameForSheet(job.payload.order.sellerName || 'Jazmín Sánchez')};
    if(!l){loc=await locations();l=loc.get(job.code);}
    if(!l){const appended=await sheets.appendOrderToOperationalSheet(delivery.spreadsheetId,'Vendedores',-1,[job.code],order);if(!appended.success)throw new Error(appended.message);l={sheetName:'Vendedores',row:appended.rowNumbers[0]};loc.set(job.code,l);}
    const centralRow=find(centralRows,job.code), sellerRow=find(sellerRows,job.code);
    for(const [id,name,rows] of [[central.spreadsheetId,central.sheetName,[centralRow]],[seller.spreadsheetId,seller.sheetName,[sellerRow]]]){const state=await sheets.setOrderStatusInSheetRows(id,name,rows,0,'🔹 Pasado');if(!state.success)throw new Error(state.message);}
    let alert=job.result?.formationAlert?.sent ? job.result.formationAlert : journal[job.code]?.alert;
    const latest=await db.from('orders').select('totals,status').eq('id',job.order_id).single();if(latest.error)throw latest.error;
    if(['Cancelado','Anulado'].includes(latest.data.status))throw new Error(`Se anuló ${job.code} durante la recuperación`);
    const existing=(latest.data.totals?.telegram_notifications || []).find(n=>n.type==='formationAlert');
    if(existing)alert={attempted:true,sent:true,messageId:existing.messageId,chatId:existing.chatId};
    if(!alert?.sent){
      if(journal[job.code]?.sending)throw new Error(`Envío incierto para ${job.code}; revisar antes de reintentar`);
      const wait=3100-(Date.now()-lastAlertTime);if(wait>0)await new Promise(r=>setTimeout(r,wait));
      const date=centralRows[centralRow-2][2];
      const sequence=centralRows.slice(0,centralRow-1).filter(r=>r[2]===date && String(r[0] || '').trim()).length;
      const icon=sheets.isExpressFreight ? sheets.isExpressFreight(order.freightType)?'🟢':'📌' : /express/i.test(order.freightType || '')?'🟢':'📌';
      const text=[`<b>${icon} ${sequence}. ${escape(order.locality || 'Sin localidad')} (${escape(job.code)})</b>`,(order.items || []).map(i=>`➖${i.quantity || 1} ${escape(i.name)}`).join('\n'),'──────────────────'].filter(Boolean).join('\n');
      journal[job.code]={...(journal[job.code] || {}),sending:true};saveJournal();
      const sent=await telegram('sendMessage',{chat_id:chatId,text,parse_mode:'HTML'});lastAlertTime=Date.now();
      alert={attempted:true,sent:true,messageId:sent.message_id,chatId};journal[job.code]={alert,delivery:l,sending:false};saveJournal();
    }
    const fresh=await db.from('orders').select('totals').eq('id',job.order_id).single();if(fresh.error)throw fresh.error;
    const notifications=fresh.data.totals?.telegram_notifications || [];
    if(!notifications.some(n=>n.type==='formationAlert')){const saved=await db.from('orders').update({totals:{...fresh.data.totals,telegram_notifications:[...notifications,{type:'formationAlert',messageId:alert.messageId,chatId:String(alert.chatId)}]}}).eq('id',job.order_id);if(saved.error)throw saved.error;}
    const result={...job.result,formationAlert:alert,operationalSyncSucceeded:true,operationalSync:{central:{success:true,sheetName:central.sheetName,rowNumbers:[centralRow]},deliveriesCurrent:{success:true,sheetName:l.sheetName,rowNumbers:[l.row]},sellerStatusSync:{success:true},centralStatusSync:{success:true}},recoveredAt:new Date().toISOString()};
    const saved=await db.from('order_sync_jobs').update({status:'completed',result,message:'Pase a Central y Entregas Actual recuperado; aviso a recorridos enviado.',finished_at:new Date().toISOString()}).eq('id',job.id);if(saved.error)throw saved.error;
    console.log(JSON.stringify({code:job.code,delivery:l,messageId:alert.messageId,completed:true}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
