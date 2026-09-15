const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/app/api/admin/mp-telegram-alert/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ saveFails = false, telegramFails = false } = {}) {
  const config = { enabled: true, bot_token: 'fake', chat_id: 'fake', last_alert_at: null,
    was_offline: true, accounts_state: { pagoszono_26: { was_offline: true, last_alert_at: null } } };
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
        if (table === 'mp_accounts') return { data: [{ id: 'pagoszono_26', name: 'pagoszono.26', status: 'online', last_seen_at: new Date().toISOString() }] };
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
    exports, process: { env: {} }, console: { warn() {}, error() {} }, Date, Intl,
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: () => database };
      if (name === 'next/server') return { NextResponse: { json: x => x } };
      throw new Error(name);
    },
    fetch: async (_url, options) => {
      messages.push(JSON.parse(options.body));
      assert.equal(JSON.parse(row.value).accounts_state.pagoszono_26.was_offline, false, 'Recovery must be saved before sending');
      return { json: async () => ({ ok: !telegramFails, description: telegramFails ? 'Unavailable' : undefined }) };
    }
  });
  return { api: exports, messages, stored: () => JSON.parse(row.value) };
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
