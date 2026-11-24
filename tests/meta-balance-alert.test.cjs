/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { formatMessage, latestSpendLimitIncrease } = require('../scripts/send-meta-balance-alert.cjs');

const source = fs.readFileSync('src/app/api/telegram/meta-balance-webhook/route.ts', 'utf8');
const compiled = ts.transpileModule(source + '\nexport { latestSpendLimitIncrease };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function loadWebhook(context = {}) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date, Intl, Number, URL, AbortSignal,
    console: { log() {}, error() {} },
    require: () => ({ NextResponse: { json: (body, options) => Response.json(body, options) }, captureSupportTelegramGroup: async () => false }),
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
  const { POST } = loadWebhook({
    process: { env: {
      META_ACCESS_TOKEN: 'meta-token', LOGISTICS_TELEGRAM_BOT_TOKEN: 'bot-token',
      META_BALANCE_TELEGRAM_CHAT_ID: chatId, META_BALANCE_WEBHOOK_SECRET: 'secret',
      TELEGRAM_EXISTING_WEBHOOK_URL: 'https://example.invalid/forward'
    } },
    fetch: async (url, options) => {
      if (new URL(url).hostname === 'graph.facebook.com') {
        metaQueries++;
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
  const rows = messages[0].text.split('\n').filter(line => line.startsWith('•'));
  assert.equal(rows.length, 10);
  assert.match(rows[0], /20\/10\/2026, 23:00.*111,00/);
  assert.match(rows[9], /11\/10\/2026, 23:00.*102,00/);

  assert.equal((await send('/saldo')).status, 200);
  assert.match(messages[1].text, /1\.347,90/);
  assert.match(messages[1].text, /Historial reciente con \/cargas/);
});
