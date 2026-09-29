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
  const original = mod.require.bind(mod);
  mod.require = name => name.startsWith('./') ? loadTs(path.resolve(path.dirname(file), `${name}.ts`)) : original(name);
  let source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('googleSheets.ts')) source += '\nexport { appendOrderToOperationalSheet };';
  mod._compile(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return mod.exports;
}
const sheets = loadTs('src/lib/googleSheets.ts');
const {createClient} = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sellerId = '54b2d319-8f6f-47ff-b794-b7731978410a';
async function main() {
  const apply = process.argv.includes('--apply');
  const token = await sheets.getGoogleAccessToken();
  const seller = sheets.SELLER_SHEET_CONFIG[sellerId];
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${seller.spreadsheetId}?fields=sheets(properties,protectedRanges)`, {headers:{Authorization:`Bearer ${token}`}});
  if (!res.ok) throw new Error(`Metadata HTTP ${res.status}`);
  const meta = await res.json();
  const target = meta.sheets.find(s => s.properties.title === seller.sheetName);
  console.log(JSON.stringify({properties:target.properties,protections:(target.protectedRanges || []).map(p=>({id:p.protectedRangeId,range:p.range,warningOnly:p.warningOnly,requestingUserCanEdit:p.requestingUserCanEdit,unprotectedRanges:p.unprotectedRanges}))}));
  const slots = await sheets.getNextAvailableSheetSlots(seller.spreadsheetId,seller.sheetName,3);
  console.log(JSON.stringify({slots}));
  const jobs = await db.from('order_sync_jobs').select('*').eq('seller_id',sellerId).eq('kind','create').gte('created_at','2026-09-29T00:00:00Z').order('created_at');
  if (jobs.error) throw jobs.error;
  fs.mkdirSync('output/ludmila-recovery',{recursive:true});
  fs.writeFileSync('output/ludmila-recovery/before.json',JSON.stringify(jobs.data,null,2));
  console.log(JSON.stringify({jobs:jobs.data.map(j=>({id:j.id,status:j.status,code:j.code,items:j.payload.order.items.length,client:j.payload.order.clientName}))}));
  const expectedIds = ['3dbf174b-7b1b-4c2f-872d-45f7a326cf96','73b5efdf-f6b9-4587-bf3b-b04cbe6e139a','00245d9a-881d-494d-a1f1-388994b6377c'];
  const targets = jobs.data.filter(j => expectedIds.includes(j.id));
  if (targets.length !== 3) throw new Error('Faltan trabajos del incidente');
  const central = sheets.CENTRAL_ORDERS_SHEET, delivery = sheets.DELIVERIES_CURRENT_SHEET;
  const journalPath = 'output/ludmila-recovery/journal.json';
  const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath,'utf8')) : {};
  const save = () => fs.writeFileSync(journalPath, JSON.stringify(journal,null,2));
  async function rows(config, offset = 0, name = config.sheetName) {
    return sheets.fetchSpreadsheetValues(config.spreadsheetId, `'${name}'!${offset === -1 ? 'A' : 'B'}2:${offset === -1 ? 'BY' : 'BZ'}`);
  }
  async function location(config, code, offset = 0, names = [config.sheetName]) {
    const matches = [];
    const codeColumn = offset === -1 ? 'A' : 'B';
    const all = await sheets.fetchSpreadsheetValueRanges(config.spreadsheetId,names.map(name=>`'${name}'!${codeColumn}2:${codeColumn}`));
    for (const [index,name] of names.entries()) {
      const values = all[index];
      values.forEach((r,i)=>{if(String(r[0] || '').trim() === code) matches.push({sheetName:name,rowNumber:i+2,values:r});});
    }
    if (matches.length > 1) throw new Error(`Código duplicado: ${code}`);
    const found = matches[0];
    if (found) {
      const range = `'${found.sheetName}'!${codeColumn}${found.rowNumber}:${offset === -1 ? 'BY' : 'BZ'}${found.rowNumber}`;
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,{headers:{Authorization:`Bearer ${token}`}});
      if (!response.ok) throw new Error(`Read row HTTP ${response.status}`);
      found.values = (await response.json()).values?.[0] || [];
    }
    return found;
  }
  async function checkOrder(job) {
    const current = await db.from('orders').select('status,legacy_code').eq('id',job.order_id).single();
    if (current.error) throw current.error;
    if (['Cancelado','Anulado'].includes(current.data.status)) throw new Error('Pedido anulado durante recuperación');
    return current.data;
  }
  if (apply) {
    const active = await db.from('order_sync_jobs').select('id').eq('status','processing');
    if (active.error || active.data.length) throw new Error('Hay una sincronización en curso; reintentar luego');
    for (const job of targets) {
      const current = await checkOrder(job);
      const entry = journal[job.id] ||= {};
      if (entry.sellerStarted && !entry.code) throw new Error('Escritura incierta; revisar antes de reintentar');
      let code = current.legacy_code || entry.code;
      const order = {...job.payload.order, sellerName:'Ludmila Krenz',source:job.payload.order.source || 'Publicidad Meta',status:job.payload.order.status === 'En Espera' ? 'En Espera' : '🔸 Validado'};
      if (order.items.length > 12) throw new Error('Requiere recuperación de códigos de continuación');
      if (!code) {
        if (job.status !== 'attention' || !job.message.includes('setDataValidation')) throw new Error('El error del trabajo cambió');
        const freshSlot = (await sheets.getNextAvailableSheetSlots(seller.spreadsheetId,seller.sheetName,1))[0];
        entry.sellerStarted = true; entry.expectedCode = freshSlot.code; save();
        const result = await sheets.appendOrderToSellerSheet(seller.spreadsheetId,seller.sheetName,order);
        code = result.code; entry.code = code; entry.sellerRows = result.rowNumbers; save();
        if (code !== freshSlot.code) throw new Error('Cambió la asignación de código');
      }
      const sellerLocation = await location(seller,code);
      if (!sellerLocation || sellerLocation.values[4] !== order.clientName) throw new Error('No coincide la fila de Ludmila');
      const updated = await db.from('orders').update({legacy_code:code}).eq('id',job.order_id);
      if (updated.error) throw updated.error;
      const progress = await db.from('order_sync_jobs').update({code}).eq('id',job.id);
      if (progress.error) throw progress.error;
      for (const [key, config, offset, names] of [['central',central,0,[central.sheetName]],['delivery',delivery,-1,delivery.sheetNames]]) {
        await checkOrder(job);
        let found = await location(config,code,offset,names);
        if (!found) {
          if (entry[`${key}Started`]) throw new Error('Escritura operativa incierta; revisar antes de reintentar');
          entry[`${key}Started`] = true; save();
          const result = await sheets.appendOrderToOperationalSheet(config.spreadsheetId,key === 'central' ? config.sheetName : 'Vendedores',offset,[code],order);
          if (!result.success) throw new Error(result.message);
          found = await location(config,code,offset,names);
        }
        if (!found) throw new Error('No se pudo confirmar escritura operativa');
        entry[key] = {sheetName:found.sheetName,rowNumbers:[found.rowNumber]}; save();
      }
      for (const [config, name, row] of [[seller,seller.sheetName,sellerLocation.rowNumber],[central,entry.central.sheetName,entry.central.rowNumbers[0]]]) {
        const result = await sheets.setOrderStatusInSheetRows(config.spreadsheetId,name,[row],0,'🔹 Pasado');
        if (!result.success) throw new Error(result.message);
      }
      console.log(JSON.stringify({recovered:code,client:order.clientName}));
    }
  }
  const verified = [];
  for (const job of targets) {
    const current = await checkOrder(job), code = current.legacy_code;
    if (!code) { if (apply || process.argv.includes('--verify')) throw new Error('Pedido sin código'); continue; }
    const locations = [await location(seller,code),await location(central,code),await location(delivery,code,-1,delivery.sheetNames)];
    const order = job.payload.order;
    for (const l of locations) {
      if (!l) throw new Error(`Falta ${code} en una planilla`);
      const r = l.values; // Range begins at the code in all three layouts.
      if (r[4] !== order.clientName || Number(r[23] || 0) !== Number(order.depositOrPaidAmount || 0)) throw new Error(`Cliente o importe incorrecto: ${code}`);
      order.items.forEach((item,i)=>{
        if(r[29+4*i] !== sheets.normalizeProductNameForSheet(item.name,item.sku) || Number(r[30+4*i]) !== Number(item.quantity || 1) || Number(r[31+4*i]) !== Number(item.unitPrice || 0)) throw new Error(`Producto incorrecto: ${code}`);
      });
    }
    if (locations[0].values[15] !== '🔹 Pasado' || locations[1].values[15] !== '🔹 Pasado') throw new Error('Estado de pase incorrecto');
    verified.push({code,rows:locations.map(l=>({sheetName:l.sheetName,rowNumber:l.rowNumber}))});
    if (apply) {
      const result = {...job.result}; delete result.error;
      Object.assign(result,{synced:true,code,operationalSyncSucceeded:true,recoveredAt:new Date().toISOString(),operationalSync:{central:{success:true,...journal[job.id].central},deliveriesCurrent:{success:true,...journal[job.id].delivery},sellerStatusSync:{success:true},centralStatusSync:{success:true}}});
      const saved = await db.from('order_sync_jobs').update({status:'completed',code,result,message:'Carga recuperada y verificada en Ludmila, Central y Entregas Actual.',finished_at:new Date().toISOString()}).eq('id',job.id);
      if (saved.error) throw saved.error;
    }
  }
  fs.writeFileSync('output/ludmila-recovery/verified.json',JSON.stringify({at:new Date().toISOString(),verified},null,2));
  console.log(JSON.stringify({verified,duplicates:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
