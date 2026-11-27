const step = 10000;
const grossStep = 10500;
const money = amount => '$' + Math.round(amount).toLocaleString('es-AR');
const timeZone = 'America/Argentina/Buenos_Aires';

async function readPages(account, edge, params, token, fetcher) {
  const rows = [];
  let url = new URL('https://graph.facebook.com/v24.0/' + account + '/' + edge);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('limit', '200');
  while (url) {
    if (url.origin !== 'https://graph.facebook.com') throw Error('Paginación inválida');
    const response = await fetcher(url, { cache: 'no-store', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    const page = await response.json();
    if (!response.ok || !Array.isArray(page.data)) throw Error('Presupuestos sin confirmar');
    rows.push(...page.data);
    url = page.paging?.next ? new URL(page.paging.next) : null;
  }
  return rows;
}

export async function readRechargeDemand(id, token, fetcher, now) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const midnight = Date.parse(day + 'T00:00:00-03:00');
  const dayMs = 86400000;
  const [sets, spend] = await Promise.all([
    readPages(id, 'adsets', { fields:'id,status,start_time,end_time,daily_budget,campaign{id,effective_status,daily_budget}' }, token, fetcher),
    readPages(id, 'insights', { fields:'campaign_id,adset_id,spend',level:'adset',time_range:JSON.stringify({since:day,until:day}) }, token, fetcher),
  ]);
  const weekday = new Date(midnight).getUTCDay();
  // On Sunday the next transfer is Monday. Otherwise reserve today's remainder and tomorrow.
  const budgets = [];
  for (const offset of (weekday === 0 ? [1] : [0,1])) {
    const from = offset ? midnight + dayMs : now.getTime();
    const until = midnight + (offset + 1) * dayMs;
    const pools = new Map();
    for (const set of sets) {
      if (!set.campaign || !set.id) throw Error('Campaña sin confirmar');
      if (set.status !== 'ACTIVE' || set.campaign.effective_status !== 'ACTIVE') continue;
      if (Date.parse(set.start_time) >= until || Date.parse(set.end_time) <= from) continue;
      const shared = Number(set.campaign.daily_budget) > 0;
      const daily = Number(shared ? set.campaign.daily_budget : set.daily_budget) / 100;
      if (!(daily > 0) || !Number.isFinite(daily)) throw Error('Presupuesto diario sin confirmar');
      const key = shared ? set.campaign.id : set.id;
      pools.set(key, { daily, shared });
    }
    let demand = 0;
    for (const [id, pool] of pools) {
      const used = offset ? 0 : spend.filter(row => (pool.shared ? row.campaign_id : row.adset_id) === id)
        .reduce((sum, row) => sum + Number(row.spend), 0);
      if (!Number.isFinite(used)) throw Error('Gasto sin confirmar');
      demand += Math.max(0,pool.daily - used);
    }
    budgets.push(demand);
  }
  return budgets.reduce((a,b)=>a+b,0);
}

export function rechargeNotice(accounts, now = new Date()) {
  if (accounts.length !== 2 || accounts.some(a => !a || !Number.isFinite(a.available) || !Number.isFinite(a.demand))) {
    return 'Próxima carga en pesos pendiente de cálculo. Falta confirmar el saldo, el gasto o el presupuesto diario de las dos cuentas.';
  }
  const weekday = new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short'}).format(now);
  const cap = weekday === 'Sat' ? 1000000 : 1350000;
  const units = [0,0];
  for (let n = 0; n < Math.floor(cap / grossStep); n++) {
    let chosen = -1;
    let lowest = 1;
    accounts.forEach(({available,demand}, i) => {
      const coverage = demand > 0 ? (available + units[i]*step) / demand : Infinity;
      if (coverage < lowest) { lowest = coverage; chosen = i; }
    });
    if (chosen < 0) break;
    units[chosen]++;
  }
  const net = (units[0]+units[1])*step;
  const lines = [weekday === 'Sun' ? '💳 Carga recomendada para el lunes' : '💳 Carga recomendada para hoy',
    weekday === 'Sun' ? 'Cobertura estimada del lunes.' : 'Cobertura estimada del resto de hoy y mañana con los presupuestos vigentes.'];
  accounts.forEach(({name,demand,available},i) => lines.push(name + ' · gasto previsto ' + money(demand) + ' · saldo ' + money(available) + ' · cargar ' + money(units[i]*step)));
  lines.push('Neto Meta ' + money(net) + ' + fee 5% ' + money(net/20) + ' = transferir ' + money(net + net/20));
  const short = accounts.reduce((sum,a,i)=>sum+Math.max(0,a.demand-a.available-units[i]*step),0);
  if (short > 0) lines.push('Faltante estimado por el tope de carga: ' + money(short));
  return lines.join('\n');
}
