/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const CHAT_ID = '-5320088914'; // Informe de Ventas, verified via Telegram getChat.
const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' });
const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function dayAt(now, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = key => parts.find(p => p.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function categoryName(raw) {
  const value = String(raw || 'Otros').trim();
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/^TANQUES?( DE AGUA)?$/.test(key)) return 'Tanques';
  if (/^TERMOTANQUES?$/.test(key)) return 'Termotanques';
  if (/^BIODIGESTOR(ES)?$/.test(key)) return 'Biodigestores';
  if (/^OTROS?$/.test(key)) return 'Otros';
  if (key === 'LATEX') return 'Látex';
  if (key === 'ESCALERAS') return 'Escaleras';
  return value;
}
function summarizeSales(orders, items) {
  const categories = new Map(), products = new Map();
  const included = orders.filter(o => o.status !== 'Cancelado');
  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }
  let revenue = 0;
  for (const order of included) {
    const total = Number(order.total_amount || 0);
    revenue += total;
    const category = categoryName(order.category);
    categories.set(category, (categories.get(category) || 0) + total);
    const lines = (itemsByOrder.get(order.id) || []).map(item => ({
      item, net: Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - Number(item.discount_percentage || 0) / 100)
    })).filter(line => line.net > 0 && Number(line.item.quantity) > 0);
    const subtotal = lines.reduce((sum, line) => sum + line.net, 0);
    const discount = Math.max(0, Number(order.order_discount_amount || order.totals?.order_discount_amount || 0));
    const factor = subtotal ? Math.max(0, subtotal - discount) / subtotal : 0;
    for (const { item, net } of lines) {
      const name = String(item.product_name || 'Producto sin nombre').trim();
      const key = item.product_id || name.toLocaleLowerCase('es-AR');
      if (!products.has(key)) products.set(key, { name, quantity:0, revenue:0 });
      const product = products.get(key);
      product.quantity += Number(item.quantity);
      product.revenue += net * factor;
    }
  }
  return { revenue, count:included.length,
    categories:[...categories].map(([name, revenue]) => ({name,revenue})).sort((a,b) => b.revenue-a.revenue),
    topProducts:[...products.values()].sort((a,b) => b.revenue-a.revenue || b.quantity-a.quantity).slice(0,10) };
}
function formatReport(sales, meta, now = new Date()) {
  const day = dayAt(now);
  const elapsed = Math.max(1/60, Math.min(24, (now - new Date(`${day}T03:00:00Z`)) / 3600000));
  const factor = 24 / elapsed;
  const at = new Intl.DateTimeFormat('es-AR',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
  return [
    `<b>📊 Informe de Ventas — ${day.split('-').reverse().join('/')}, ${at}</b>`,
    '',
    `📣 Gasto publicitario: ${usd.format(meta.spend)}`,
    `Proyectado al cierre: ${usd.format(meta.spend * factor)}`,
    `💵 Facturación acumulada: ${ars.format(sales.revenue)}`,
    `📦 Pedidos totales: ${sales.count}`,
    `🎯 CPR (costo por conversación): ${meta.messages > 0 ? usd.format(meta.spend / meta.messages) : 'Sin conversaciones'}`,
    `💬 Conversaciones recibidas (Meta): ${meta.messages}`,
    `Proyectadas al cierre: ${Math.round(meta.messages * factor)}`,
    '',
    '<b>Facturación por tipo de producto</b>',
    ...(sales.categories.length ? sales.categories.map(c => `• ${escape(c.name.slice(0,60))}: ${ars.format(c.revenue)}`) : ['Sin pedidos hoy.']),
    '',
    '<i>Proyección a las 24:00 según el ritmo del día. Meta: S731.04, importes en USD. Ventas en ARS.</i>'
  ].join('\n');
}
async function allRows(build) {
  const rows = [];
  for(let offset=0;;offset+=1000) {
    const {data,error}=await build().range(offset,offset+999);
    if(error)throw new Error(error.message);
    rows.push(...data);
    if(data.length < 1000) return rows;
  }
}
async function collectReport(now) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const day = dayAt(now);
  const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
  const orders = await allRows(()=>db.from('orders').select('id,total_amount,category,status,order_discount_amount,totals')
    .gte('order_date',day).lt('order_date',next.toISOString().slice(0,10)).lte('created_at',now.toISOString()).neq('status','Cancelado').order('id'));
  const items = [];
  for(let i=0;i<orders.length;i+=100) {
    const ids = orders.slice(i,i+100).map(o=>o.id);
    items.push(...await allRows(()=>db.from('order_items').select('order_id,product_id,product_name,quantity,unit_price,discount_percentage').in('order_id',ids).order('id')));
  }
  const version = process.env.META_API_VERSION || 'v21.0';
  const account = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  async function graph(endpoint, params) {
    const url = new URL(`https://graph.facebook.com/${version}/${endpoint}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    url.searchParams.set('access_token',process.env.META_ACCESS_TOKEN);
    const response = await fetch(url,{signal:AbortSignal.timeout(25000)});
    const data = await response.json();
    if(!response.ok || data.error)throw new Error(`Meta rechazó la consulta (${data.error?.code || response.status}).`);
    return data;
  }
  const identity = await graph(account,{fields:'name,currency,timezone_name'});
  if(identity.name !== 'S731.04' || identity.currency !== 'USD' || dayAt(now,identity.timezone_name) !== day)throw new Error('La cuenta o el día publicitario no coinciden con el informe.');
  const insights = await graph(`${account}/insights`,{fields:'spend,actions',level:'account',time_range:JSON.stringify({since:day,until:day})});
  if(!Array.isArray(insights.data) || insights.paging?.next)throw new Error('Meta devolvió un resumen incompleto.');
  const meta = {spend:0,messages:0};
  for(const row of insights.data) {
    meta.spend += Number(row.spend || 0);
    meta.messages += Number(row.actions?.find(a=>a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0);
  }
  if(!Number.isFinite(meta.spend) || !Number.isFinite(meta.messages))throw new Error('Meta devolvió métricas inválidas.');
  if(dayAt(new Date()) !== day)throw new Error('Cambió el día durante la consulta; revisar el informe antes de enviarlo.');
  return formatReport(summarizeSales(orders,items),meta,now);
}
async function main() {
  const env = path.join(__dirname,'..','.env.local');
  if(fs.existsSync(env))process.loadEnvFile(env);
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','META_ACCESS_TOKEN','LOGISTICS_TELEGRAM_BOT_TOKEN'])if(!process.env[key])throw new Error(`Falta configurar ${key}.`);
  const now = new Date(), date = dayAt(now);
  const statePath = path.join(__dirname,'..','.codex-tmp',`sales-report-${date}.json`);
  const dryRun = process.argv.includes('--dry-run');
  if(!dryRun && fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(state.status === 'sent') {console.log('El informe de hoy ya fue enviado.');return;}
    throw new Error('Hay un envío previo sin confirmación. Revisar Telegram antes de reintentar.');
  }
  const text = await collectReport(now);
  if(text.length > 4096)throw new Error('El informe supera el máximo de Telegram.');
  if(dryRun) {console.log(text);return;}
  fs.mkdirSync(path.dirname(statePath),{recursive:true});
  fs.writeFileSync(statePath,JSON.stringify({status:'sending',date}),{flag:'wx'});
  const response = await fetch(`https://api.telegram.org/bot${process.env.LOGISTICS_TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:'HTML'}),signal:AbortSignal.timeout(30000)});
  const result = await response.json();
  if(!response.ok || !result.ok)throw new Error(`Telegram rechazó el informe: ${result.description || response.status}`);
  fs.writeFileSync(statePath,JSON.stringify({status:'sent',date,messageId:result.result.message_id}));
  console.log('Informe enviado a Informe de Ventas.');
}
if(require.main === module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports = { summarizeSales, formatReport, dayAt, categoryName, allRows };
