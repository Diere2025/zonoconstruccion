// Read-only diagnostic. No writes to Supabase or Google Sheets.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
process.loadEnvFile('.env.local');
function loadTs(file) {
  const filename = path.resolve(file);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const baseRequire = m.require.bind(m);
  m.require = name => name === './sheetProducts' ? loadTs('src/lib/sheetProducts.ts') : baseRequire(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return m.exports;
}
const sheets = loadTs('src/lib/googleSheets.ts');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(table, columns, configure = q => q) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await configure(db.from(table).select(columns)).order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
async function main() {
  if (process.argv.includes('--current-sheet-statuses')) {
    const token = await sheets.getGoogleAccessToken();
    const codes = ['JS25104','JS25197','JS25430','JS25332','JS25206','JS25378','JS25465','JS25423','LK01668','JS25368','JS25396'];
    const range = encodeURIComponent("'Central pedidos'!A1:CB5000");
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/values/${range}?valueRenderOption=FORMATTED_VALUE`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'No se pudo leer Central pedidos');
    const rows = payload.values || [];
    const matches = [];
    rows.forEach((row, index) => {
      const joined = row.map(value => String(value || '').trim().toUpperCase());
      const found = codes.filter(code => joined.includes(code));
      if (found.length) matches.push({ row: index + 1, codes: found, values: row });
    });
    console.log(JSON.stringify({ header: rows[0]?.slice(0, 40), matches }, null, 2));
    return;
  }
  if (process.argv.includes('--details')) {
    const snapshot = JSON.parse(fs.readFileSync('scratch_stock_audit.json','utf8'));
    const codes = ['JS25104','JS25197','JS25206','JS25332','JS25378','LK01668','JS25396'];
    const selected = snapshot.orders.filter(o => codes.includes(o.legacy_code));
    const {data,error} = await db.from('order_items').select('order_id,product_name,quantity,unit_price').in('order_id',selected.map(o=>o.id));
    if(error) throw new Error(error.message);
    const token = await sheets.getGoogleAccessToken();
    const formulas = {};
    for(const title of ['NPPend','PendientesCentral']) {
      formulas[title] = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/values/${encodeURIComponent(`'${title}'!A1:CB2`)}?valueRenderOption=FORMULA`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
    }
    const details={orders:selected.map(o=>({...o,items:data.filter(i=>i.order_id===o.id)})),formulas};
    fs.writeFileSync('scratch_stock_details.json',JSON.stringify(details));
    console.log(JSON.stringify(details,null,2));
    return;
  }
  if (process.argv.includes('--formulas')) {
    const token = await sheets.getGoogleAccessToken();
    const id = '1vrI3WFH6W35sj9JJ4sa3yr7XlJDaKP920R6t54jLW6o';
    const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, {headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
    const trace = {};
    for (const name of ['NPPendVendedores','NPPendCentral','PendientesCentral','PendientesCentralyVendedores','Últimos4DíasParaStockReal']) {
      const data = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${name}'!A1:AZ6`)}?valueRenderOption=FORMULA`, {headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
      const values = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${name}'!A1:CJ5000`)}?valueRenderOption=FORMATTED_VALUE`, {headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
      trace[name] = {formula:data,values:values.values};
      console.log(JSON.stringify({name,data,rows:values.values?.length}));
    }
    fs.writeFileSync('scratch_stock_trace.json',JSON.stringify(trace));
    return;
  }
  const [products, items, orders, token] = await Promise.all([
    all('products', 'id,name,sku,is_generic,mapped_real_product_id,is_active,stock_physical,stock_reserved,stock_current'),
    all('order_items', 'id,product_id,product_name,quantity,orders!inner(id,legacy_code,customer_name,status,order_date)', q => q.in('orders.status', ['Pendiente','Confirmado','Entregando'])),
    all('orders', 'id,legacy_code,customer_name,status,order_date'),
    sheets.getGoogleAccessToken()
  ]);
  async function google(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
    return response.json();
  }
  const stockId = '1vrI3WFH6W35sj9JJ4sa3yr7XlJDaKP920R6t54jLW6o';
  const meta = await google(`https://sheets.googleapis.com/v4/spreadsheets/${stockId}?fields=sheets.properties`);
  const title = meta.sheets.find(s => s.properties.sheetId === 447948741).properties.title;
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1:AZ600`);
  const [stock, formulas, central, comparison] = await Promise.all([
    google(`https://sheets.googleapis.com/v4/spreadsheets/${stockId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`),
    google(`https://sheets.googleapis.com/v4/spreadsheets/${stockId}/values/${range}?valueRenderOption=FORMULA`),
    sheets.fetchSpreadsheetCsv('https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854'),
    fetch('http://localhost:3000/api/admin/sync-stock').then(async r => { if (!r.ok) throw new Error(`Local HTTP ${r.status}`); return r.json(); })
  ]);
  const result = { at: new Date().toISOString(), stockTitle:title, products, items, orders, stock:stock.values, formulas:formulas.values, central, comparison };
  fs.writeFileSync('scratch_stock_audit.json', JSON.stringify(result));
  console.log(JSON.stringify({at:result.at,stockTitle:title,products:products.length,items:items.length,orders:orders.length,discrepancies:comparison.comparisonList.filter(p=>p.sheetReserved!==p.dbCalculatedReserved)},null,2));
}
main().catch(e => {console.error(e.message);process.exitCode=1;});
