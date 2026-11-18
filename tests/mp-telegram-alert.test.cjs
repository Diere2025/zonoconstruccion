const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/mpTelegramAlert.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ saveFails = false, telegramFails = false, initiallyOffline = true, signalAgeMinutes = 0, accountStatus = 'online' } = {}) {
  let now = Date.parse('2026-11-18T15:00:00Z');
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const config = { enabled: true, bot_token: 'fake', chat_id: 'fake', last_alert_at: null,
    was_offline: initiallyOffline, accounts_state: { pagoszono_26: { was_offline: initiallyOffline, last_alert_at: null } } };
  const account = { id: 'pagoszono_26', name: 'pagoszono.26', status: accountStatus, last_seen_at: new Date(now - signalAgeMinutes * 60000).toISOString() };
  let row = { value: JSON.stringify(config), updated_at: '2026-01-01T00:00:00.000Z' };
  const messages = [];
  const database = { from(table) {
    let mutation;
    const filters = {};
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; },
      is(key, value) { filters[key] = value; return query; }, limit() { return query; },
      update(value) { mutation = value; return query; }, upsert(value) { mutation = value; return query; },
      maybeSingle() { return Promise.resolve({ data: { ...row } }); },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (table === 'mp_accounts') return { data: [account] };
        if (saveFails) return { error: { message: 'Database unavailable' }, data: null };
        if (Object.hasOwn(filters, 'updated_at') && filters.updated_at !== row.updated_at) return { data: [] };
        row = { ...row, ...mutation };
        return { data: [{ updated_at: row.updated_at }] };
      }).then(resolve, reject); }
    };
    return query;
  } };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, process: { env: {} }, console: { warn() {}, error() {} }, Date: TestDate, Intl,
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: () => database };
      if (name === 'next/server') return { NextResponse: { json: x => x } };
      throw new Error(name);
    },
    fetch: async (_url, options) => {
      const message = JSON.parse(options.body);
      messages.push(message);
      if (message.text.includes('RESTABLECIDO')) {
        assert.equal(JSON.parse(row.value).accounts_state.pagoszono_26.was_offline, false);
      }
      if (message.text.includes('EN PROBLEMAS')) {
        assert.equal(JSON.parse(row.value).accounts_state.pagoszono_26.was_offline, true);
      }
      return { json: async () => ({ ok: !telegramFails, description: telegramFails ? 'Unavailable' : undefined }) };
    }
  });
  return { api: exports, messages, stored: () => JSON.parse(row.value),
    advance(minutes) { now += minutes * 60000; },
    heartbeat() { account.last_seen_at = new Date(now).toISOString(); } };
}

test('Repeated checks send one recovery and persist online state', async () => {
  const { api, messages, stored } = setup();
  await api.checkAndDispatchTelegramAlert();
  await api.checkAndDispatchTelegramAlert();
  await api.checkAndDispatchTelegramAlert();
  assert.equal(messages.length, 1);
  assert.equal(stored().was_offline, false);
  assert.equal(stored()._updatedAt, undefined);
});
test('A failed database save sends no recovery', async () => {
  const { api, messages } = setup({ saveFails: true });
  const result = await api.checkAndDispatchTelegramAlert();
  assert.equal(result.success, false);
  assert.equal(messages.length, 0);
});
test('Concurrent checks claim a recovery only once', async () => {
  const { api, messages } = setup();
  const configs = await Promise.all([api.getTelegramConfig(), api.getTelegramConfig()]);
  await Promise.all(configs.map(c => api.checkAndDispatchTelegramAlert(c)));
  assert.equal(messages.length, 1);
});
test('Telegram failure restores a retryable state', async () => {
  const { api, messages, stored } = setup({ telegramFails: true });
  const result = await api.checkAndDispatchTelegramAlert();
  assert.equal(result.results[0].status, 'recovery_failed');
  assert.equal(result.results[0].retrySaved, true);
  assert.equal(stored().was_offline, true);
  assert.equal(messages.length, 1);
});
test('A stale page-error writer cannot restore old offline state', async () => {
  const { api, stored } = setup();
  const staleConfig = await api.getTelegramConfig();
  await api.checkAndDispatchTelegramAlert();
  assert.equal(await api.saveTelegramConfig(staleConfig), false);
  assert.equal(stored().was_offline, false);
});

test('A local page error is silent while either PC keeps the shared heartbeat fresh', async () => {
  const f = setup({ initiallyOffline: false, signalAgeMinutes: 3, accountStatus: 'error' });
  await f.api.checkAndDispatchTelegramAlert();
  f.heartbeat();
  for (let i = 0; i < 3; i++) {
    f.advance(3);
    await f.api.checkAndDispatchTelegramAlert();
    f.heartbeat();
  }
  assert.equal(f.messages.length, 0);
  assert.equal(f.stored().was_offline, false);
});

test('A persistent outage sends one alert across concurrent checks and retries after recovery only beyond cooldown', async () => {
  const f = setup({ initiallyOffline: false, signalAgeMinutes: 4 });
  const configs = await Promise.all([f.api.getTelegramConfig(), f.api.getTelegramConfig()]);
  await Promise.all(configs.map(c => f.api.checkAndDispatchTelegramAlert(c)));
  assert.equal(f.messages.length, 1);
  f.advance(90);
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 1);
  f.heartbeat();
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 2);
  f.advance(4);
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 3);
  f.heartbeat();
  await f.api.checkAndDispatchTelegramAlert();
  f.advance(4);
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 4);
});

test('Office and overnight grace intervals allow a page to recover silently', async () => {
  const f = setup({ initiallyOffline: false });
  f.advance(600); // 22:00 in Argentina.
  f.heartbeat();
  f.advance(14);
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 0);
  f.advance(1);
  await f.api.checkAndDispatchTelegramAlert();
  assert.match(f.messages[0].text, /15.*minutos/);
});

test('Failed outage deliveries can be retried and failed claims send nothing', async () => {
  const f = setup({ initiallyOffline: false, signalAgeMinutes: 4, telegramFails: true });
  const result = await f.api.checkAndDispatchTelegramAlert();
  assert.equal(result.results[0].retrySaved, true);
  assert.equal(f.stored().was_offline, false);
  await f.api.checkAndDispatchTelegramAlert();
  assert.equal(f.messages.length, 2);
  const unavailable = setup({ initiallyOffline: false, signalAgeMinutes: 4, saveFails: true });
  await unavailable.api.checkAndDispatchTelegramAlert();
  assert.equal(unavailable.messages.length, 0);
});

test('Movements shares its six-hour cooldown across PCs without marking Activities offline', async () => {
  const f = setup({ initiallyOffline: false });
  const report = () => f.api.dispatchBankingMonitorAlert('pagoszono_26', 'pagoszono.26');
  await Promise.all([report(), report()]);
  f.advance(359);
  await report();
  assert.equal(f.messages.length, 1);
  assert.equal(f.stored().was_offline, false);
  assert.match(f.messages[0].text, /Movimientos sin lectura/);
  f.advance(1);
  await report();
  assert.equal(f.messages.length, 2);
});
