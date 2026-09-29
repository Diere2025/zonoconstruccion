const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
process.loadEnvFile('.env.local');
function loadTs(filename) {
  filename = path.resolve(filename);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const baseRequire = mod.require.bind(mod);
  mod.require = name => name.startsWith('./')
    ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : baseRequire(name);
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('googleSheets.ts')) source += '\nexport { appendOrderToOperationalSheet };';
  mod._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  }}).outputText, filename);
  return mod.exports;
}
const sheets = loadTs('src/lib/googleSheets.ts');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const apply = process.argv.includes('--apply');
  const central = sheets.CENTRAL_ORDERS_SHEET;
  const token = await sheets.getGoogleAccessToken();
  async function api(suffix, body) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${central.spreadsheetId}${suffix}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
    return payload;
  }
  const metadata = await api('?fields=sheets(properties)');
  const props = metadata.sheets.find(s => s.properties.title === central.sheetName).properties;
  const {data: jobs, error} = await db.from('order_sync_jobs')
    .select('id,order_id,code,payload,message,result,created_at').eq('kind','create')
    .eq('seller_id','13430e05-b61a-4a3f-9fc3-152d377c4b0c')
    .gte('created_at','2026-09-28T03:00:00Z').order('created_at');
  if (error) throw error;
  const candidates = jobs.filter(j => j.message?.includes('exceeds grid limits') && /^JS257(3[0-9]|4[0-9])$/.test(j.code));
  const ids = candidates.map(j => j.order_id);
  const orders = ids.length ? await db.from('orders').select('id,status,legacy_code').in('id',ids) : {data:[]};
  if (orders.error) throw orders.error;
  const active = candidates.filter(j => {
    const order = orders.data.find(o => o.id === j.order_id);
    return order && !['Cancelado','Anulado'].includes(order.status) && order.legacy_code === j.code;
  });
  async function readCodes() {
    return sheets.fetchSpreadsheetValues(central.spreadsheetId, `'${central.sheetName}'!B2:B`);
  }
  const before = await readCodes();
  const missing = active.filter(j => !before.some(r => String(r[0] || '').trim() === j.code));
  if (missing.some(j => (j.payload.order.items || []).length > 12)) {
    throw new Error('Hay un pedido con más de 12 productos; requiere recuperar sus códigos de continuación.');
  }
  const templateRow = before.reduce((n,r,i) => String(r[0] || '').trim() ? i+2 : n, 2);
  const templatePayload = await api(`/values/${encodeURIComponent(`'${central.sheetName}'!A${templateRow}:IE${templateRow}`)}?valueRenderOption=FORMULA`);
  const template = templatePayload.values || [];
  const formulaColumns = (template[0] || []).flatMap((v,i) => String(v).startsWith('=') ? [i] : []);
  console.log(JSON.stringify({apply,rowCount:props.gridProperties.rowCount,templateRow,formulaColumns,
    affected:active.length,existing:active.length-missing.length,missing:missing.map(j=>j.code)}));
  if (process.argv.includes('--verify')) {
    if (missing.length) throw new Error(`Todavía faltan ${missing.length} pedidos`);
    const rowsPayload = await api(`/values/${encodeURIComponent(`'${central.sheetName}'!A2:BY`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const formulasPayload = await api(`/values/${encodeURIComponent(`'${central.sheetName}'!Z2700:BZ2719`)}?valueRenderOption=FORMULA`);
    for (const job of active) {
      const matches = rowsPayload.values.filter(r=>String(r[1] || '').trim()===job.code);
      if(matches.length!==1) throw new Error(`Código duplicado o faltante: ${job.code}`);
      const row=matches[0], order=job.payload.order;
      if(row[5]!==order.clientName) throw new Error(`Cliente diferente: ${job.code}`);
      if(Number(row[24] || 0)!==Number(order.depositOrPaidAmount || 0)) throw new Error(`Importe diferente: ${job.code}`);
      (order.items || []).forEach((item,i)=>{
        if(!row[30+4*i] || Number(row[31+4*i])!==Number(item.quantity || 1) || Number(row[32+4*i])!==Number(item.unitPrice || 0)) {
          throw new Error(`Producto incompleto: ${job.code}, posición ${i+1}`);
        }
      });
    }
    if ((formulasPayload.values || []).length!==20 || formulasPayload.values.some(r=>!String(r[0] || '').startsWith('='))) {
      throw new Error('Falta fórmula de saldo en una de las filas recuperadas');
    }
    console.log(JSON.stringify({verifiedOrders:active.length,clientsAndAmounts:true,products:true,formulas:true,rowCount:props.gridProperties.rowCount}));
    return;
  }
  if (!apply) return;
  const added = Math.max(0, 3700-props.gridProperties.rowCount);
  if (added) {
    await api(':batchUpdate', {requests:[{appendDimension:{sheetId:props.sheetId,dimension:'ROWS',length:added}}]});
    const source = {sheetId:props.sheetId,startRowIndex:templateRow-1,endRowIndex:templateRow,startColumnIndex:0,endColumnIndex:props.gridProperties.columnCount};
    const destination = {sheetId:props.sheetId,startRowIndex:props.gridProperties.rowCount,endRowIndex:3700,startColumnIndex:0,endColumnIndex:props.gridProperties.columnCount};
    await api(':batchUpdate',{requests:[{copyPaste:{source,destination,pasteType:'PASTE_FORMAT'}},
      {copyPaste:{source,destination,pasteType:'PASTE_DATA_VALIDATION'}},
      ...formulaColumns.map(col=>({copyPaste:{source:{...source,startColumnIndex:col,endColumnIndex:col+1},
        destination:{...destination,startColumnIndex:col,endColumnIndex:col+1},pasteType:'PASTE_FORMULA'}}))]});
    console.log(JSON.stringify({addedRows:added}));
  }
  for (const job of missing) {
    const fresh = await readCodes();
    if (fresh.some(r=>String(r[0] || '').trim()===job.code)) continue;
    const order = {...job.payload.order};
    order.sellerName = sheets.normalizeSellerNameForSheet(order.sellerName || 'Jazmín Sánchez');
    if (!order.source?.trim()) order.source = 'Publicidad Meta';
    const result = await sheets.appendOrderToOperationalSheet(central.spreadsheetId,central.sheetName,0,[job.code],order);
    if (!result.success) throw new Error(result.message);
    console.log(JSON.stringify({code:job.code,rows:result.rowNumbers}));
  }
  const after = await readCodes();
  const verified = active.map(j=>({code:j.code,count:after.filter(r=>String(r[0] || '').trim()===j.code).length}));
  if (verified.some(v=>v.count!==1)) throw new Error(`Verificación fallida: ${JSON.stringify(verified)}`);
  fs.mkdirSync('output/central-recovery',{recursive:true});
  fs.writeFileSync('output/central-recovery/jazmin-2026-09-28.json',JSON.stringify({at:new Date().toISOString(),addedRows:added,inserted:missing.map(j=>j.code),verified},null,2));
  console.log(JSON.stringify({verified:verified.length,inserted:missing.length,duplicates:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
