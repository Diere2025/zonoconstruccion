/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { formatMessage, latestSpendLimitIncrease } = require('../scripts/send-meta-balance-alert.cjs');
const zonoBalance = require('../src/lib/metaZonoBalance.mjs');
const { rechargeNotice, readRechargeDemand } = require('../src/lib/metaRecharge.mjs');

test('fee is paid on top and net loads respect each local day limit', () => {
  const plans = [{name:'1-ZONO', available:0, demand:620000}, {name:'2-ZONO', available:2000, demand:632000}];
  const friday = new Date('2026-11-28T01:30:00Z');
  assert.match(rechargeNotice(plans, friday), /1\.250\.000 \+ fee 5% \$62\.500 = transferir \$1\.312\.500/);
  const large = plans.map(p => ({...p, demand:900000}));
  assert.match(rechargeNotice(large, friday), /transferir \$1\.344\.000/);
  assert.match(rechargeNotice(large, new Date('2026-11-28T12:00:00Z')), /transferir \$997\.500/);
  assert.match(rechargeNotice(plans.map(p=>({...p, available:p.demand})), friday), /transferir \$0/);
  assert.match(rechargeNotice([plans[0], undefined], friday), /pendiente de cálculo/);
});

test('budget forecast counts shared campaigns once and includes scheduled starts and ends', async () => {
  const campaign = {id:'c', effective_status:'ACTIVE', daily_budget:'24000000'};
  const start_time = '2026-11-28T05:30:00-03:00';
  const sets = [{id:'a',status:'ACTIVE',campaign,start_time}, {id:'b',status:'ACTIVE',campaign,start_time},
    {id:'old',status:'ACTIVE',campaign:{id:'oldc',effective_status:'ACTIVE'},daily_budget:'12000000',end_time:'2026-11-27T23:30:00-03:00'},
    {id:'paused',status:'PAUSED',campaign}];
  const fetcher = async url => Response.json({data:url.pathname.endsWith('/adsets') ? sets : [{adset_id:'old',campaign_id:'oldc',spend:'80000'}]});
  assert.equal(await readRechargeDemand('act_1','token',fetcher,new Date('2026-11-27T15:00:00Z')),280000);
});

const source = fs.readFileSync('src/app/api/telegram/meta-balance-webhook/route.ts', 'utf8');
const compiled = ts.transpileModule(source + '\nexport { latestSpendLimitIncrease };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function loadWebhook(context = {}) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date, Intl, Number, URL, AbortSignal,
    console: { log() {}, error() {} },
    require: module => module === '@/lib/metaZonoBalance.mjs' ? zonoBalance : ({
      NextResponse: { json: (body, options) => Response.json(body, options) },
      captureSupportTelegramGroup: async () => false,
    }),
    ...context
  });
  return exports;
}

const exportsForTest = loadWebhook();

const activity = (time, old_value, new_value) => ({
  event_time: time, event_type: 'ad_account_update_spend_limit',
  extra_data: JSON.stringify({ type: 'payment_amount', old_value, new_value })
});
const history = [activity('2026-10-15T02:39:50+0000', 4215909, 4291909)];

for (const [name, format] of Object.entries({ scheduled: latestSpendLimitIncrease, webhook: exportsForTest.latestSpendLimitIncrease })) {
  test(`${name}: stale history does not claim the previous increase is the latest`, () => {
    const result = format(history, '4366909');
    assert.match(result, /historial de Meta todavía no refleja el límite actual/);
    assert.doesNotMatch(result, /760|14\/10/);
  });
  test(`${name}: matching history uses Argentine calendar date and 24-hour time`, () => {
    const result = format(history, '4291909');
    assert.match(result, /14\/10\/2026, 23:39/);
    assert.match(result, /760,00/);
  });
  test(`${name}: newly published increase supersedes the previous event`, () => {
    const result = format([...history, activity('2026-10-16T02:00:00+0000', 4291909, 4366909)], '4366909');
    assert.match(result, /15\/10\/2026, 23:00/);
    assert.match(result, /750,00/);
  });
}

test('available balance includes the current limit even while history lags', () => {
  const result = formatMessage({ name: 'S731.04', currency: 'USD', spend_cap: '4366909', amount_spent: '4232119', activities: { data: history } });
  assert.equal(result.remaining.toFixed(2), '1347.90');
  assert.match(result.text, /1\.347,90/);
  assert.match(result.text, /no se puede confirmar el último aumento/);
});

test('Telegram /cargas replies with up to ten recent increases in the configured group', async () => {
  const chatId = '-123';
  const increases = Array.from({ length: 12 }, (_, index) =>
    activity(`2026-10-${String(index + 10).padStart(2, '0')}T02:00:00+0000`, 10000, 20000 + index * 100));
  const messages = [];
  let metaQueries = 0;
  let zonoAccount = { id: 'act_2361501517627802', currency: 'ARS', is_prepay_account: true,
    balance: '0', amount_spent: '20519027', spend_cap: '40519027', activities: { data: [
      { event_type: 'funding_event_failed', event_time: '2026-11-25T01:00:00Z', extra_data: '{"amount":5000000,"currency":"ARS"}' },
      { event_type: 'funding_event_successful', event_time: '2026-11-25T00:08:45+0000', extra_data: '{"amount":20000000,"currency":"ARS"}' }
    ] } };
  const secondZonoAccount = { id: 'act_942497128185607', currency: 'ARS', is_prepay_account: true,
    balance: '0', spend_cap: '710608901', amount_spent: '655608987', activities: { data: [
      { event_type: 'funding_event_successful', event_time: '2026-11-25T02:00:00Z', extra_data: '{"amount":54949400,"currency":"ARS"}' }
    ] } };
  const { POST } = loadWebhook({
    process: { env: {
      META_ACCESS_TOKEN: 'meta-token', META_ZONO_ACCESS_TOKEN: 'zono-token', LOGISTICS_TELEGRAM_BOT_TOKEN: 'bot-token',
      META_BALANCE_TELEGRAM_CHAT_ID: chatId, META_BALANCE_WEBHOOK_SECRET: 'secret',
      TELEGRAM_EXISTING_WEBHOOK_URL: 'https://example.invalid/forward'
    } },
    fetch: async (url, options) => {
      if (new URL(url).hostname === 'graph.facebook.com') {
        metaQueries++;
        if (new URL(url).pathname.endsWith('/act_2361501517627802')) {
          assert.equal(options.headers.Authorization, 'Bearer zono-token');
          return zonoAccount ? Response.json(zonoAccount) : Response.json({ error: { code: 190 } }, { status: 401 });
        }
        if (new URL(url).pathname.endsWith('/act_942497128185607')) {
          assert.equal(options.headers.Authorization, 'Bearer zono-token');
          return Response.json(secondZonoAccount);
        }
        return Response.json({ id: 'act_1077861488005193', name: 'S731.04', currency: 'USD',
          spend_cap: '4366909', amount_spent: '4232119', is_prepay_account: false,
          activities: { data: [activity('2026-10-23T00:00:00Z', 20000, 10000), ...increases] } });
      }
      if (new URL(url).hostname === 'api.telegram.org') messages.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
  });
  const send = (text, id = chatId, secret = 'secret') => POST(new Request('https://example.invalid/webhook', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ message: { text, chat: { id }, message_id: 45 } })
  }));

  assert.equal((await send('/cargas', chatId, 'invalid')).status, 401);
  assert.equal((await send('/cargas', '-456')).status, 200);
  assert.equal(metaQueries, 0);
  assert.equal(messages.length, 0);
  assert.equal((await send('/cargas@ModificacionesZono_Bot')).status, 200);
  assert.equal(messages[0].reply_to_message_id, 45);
  const rows = messages[0].text.split('Cuenta Meta 1-ZONO')[0].split('\n').filter(line => line.startsWith('•'));
  assert.equal(rows.length, 10);
  assert.match(rows[0], /20\/10\/2026, 23:00.*111,00/);
  assert.match(rows[9], /11\/10\/2026, 23:00.*102,00/);
  assert.equal(metaQueries, 3);
  assert.match(messages[0].text, /Pagos acreditados recientes\n• 24\/11\/2026, 21:08.*ARS\s+200\.000,00/);
  assert.match(messages[0].text, /2-ZONO · ARS\nPagos acreditados recientes\n• 24\/11\/2026, 23:00.*ARS\s+549\.494,00/);
  assert.doesNotMatch(messages[0].text, /50\.000,00/);

  assert.equal((await send('/saldo')).status, 200);
  assert.match(messages[1].text, /1\.347,90/);
  assert.match(messages[1].text, /Historial reciente con \/cargas/);
  assert.match(messages[1].text, /1-ZONO · ARS/);
  assert.match(messages[1].text, /Disponible hasta el límite de gasto: ARS\s+200\.000,00/);
  assert.match(messages[1].text, /Último pago acreditado: 24\/11\/2026, 21:08.*ARS\s+200\.000,00/);
  assert.match(messages[1].text, /2-ZONO · ARS\nDisponible hasta el límite de gasto: ARS\s+549\.999,14/);

  zonoAccount = { ...zonoAccount, is_prepay_account: true, spend_cap: '0' };
  assert.equal((await send('/saldo')).status, 200);
  assert.match(messages[2].text, /Saldo sin confirmar/);
  assert.doesNotMatch(messages[2].text, /Importe pendiente de pago/);

  zonoAccount = null;
  assert.equal((await send('/saldo')).status, 200);
  assert.match(messages[3].text, /1\.347,90/);
  assert.match(messages[3].text, /1-ZONO · ARS\nSaldo sin confirmar/);
  assert.match(messages[3].text, /2-ZONO · ARS\nDisponible hasta el límite de gasto: ARS\s+549\.999,14/);
});
