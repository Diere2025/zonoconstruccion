const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture() {
  let now = 1000000, health = null, offline = false;
  const storage = { bankingTabId: 2, accountName: 'pagoszono.26' };
  const tabs = new Map([[2, { id: 2, url: 'https://www.mercadopago.com.ar/banking/movements' }]]);
  const notifications = [], reloads = [], requests = [], alarms = [], listeners = {};
  const event = key => ({ addListener(fn) { listeners[key] = fn; } });
  const chrome = {
    runtime: { onInstalled: event('install'), onStartup: event('startup'), getURL: x => x },
    storage: { local: { get: (keys, cb) => cb({ ...storage }), set: (patch, cb) => { Object.assign(storage, patch); cb?.(); } } },
    alarms: { create: (...args) => alarms.push(args), onAlarm: event('alarm') },
    notifications: { create: async (...args) => notifications.push(args) },
    tabs: { get: (id, cb) => cb(tabs.get(id)), sendMessage: async () => health,
      reload: async id => reloads.push(id) }
  };
  const context = { chrome, URL, console, AbortController, Date: class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; }
  }, setTimeout, clearTimeout, fetch: async (...args) => {
    requests.push(args); if (offline) throw Error('offline');
    return { ok: true, json: async () => ({ success: true }) };
  } };
  const source = fs.readFileSync('chrome-extension-mp/banking-watchdog.js', 'utf8');
  function load() { vm.runInNewContext(source, context); }
  load();
  return { storage, tabs, reloads, notifications, requests, alarms, load,
    setHealth: value => { health = value; }, setOffline: value => { offline = value; },
    advance: ms => { now += ms; }, now: () => now,
    async pulse() { listeners.alarm({ name: 'BANKING_WATCHDOG' });
      for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); }
  };
}
test('checks every five minutes and recovers silently after ten minutes', async () => {
  const f = fixture(); await f.pulse(); assert.equal(f.reloads.length, 0);
  assert.equal(f.alarms[0][1].periodInMinutes, 5);
  f.advance(5 * 60000); await f.pulse(); assert.equal(f.reloads.length, 0);
  f.advance(5 * 60000); await f.pulse();
  assert.deepEqual(f.reloads, [2]); assert.equal(f.notifications.length, 0);
  f.advance(50 * 60000); await f.pulse(); assert.equal(f.notifications.length, 1);
  assert.equal(JSON.parse(f.requests[0][1].body).errorType, 'BANKING_STALLED');
});
test('persisted recovery budget survives worker restart; no reload storm and one outage alert', async () => {
  const f = fixture(); await f.pulse();
  for (let i = 0; i < 6; i++) { f.advance(10 * 60000); f.load(); await f.pulse(); }
  assert.equal(f.reloads.length, 3); assert.equal(f.notifications.length, 1); assert.equal(f.requests.length, 1);
  f.advance(10 * 60000); await f.pulse(); assert.equal(f.reloads.length, 4);
});
test('ERP failure notifies after one hour and retries delivery only every fifteen minutes', async () => {
  const f = fixture(); f.setOffline(true); await f.pulse(); f.advance(60 * 60000); await f.pulse();
  assert.equal(f.notifications.length, 1); assert.equal(f.storage.bankingWatchdog.delivered, false);
  f.setOffline(false); f.advance(5 * 60000); await f.pulse(); assert.equal(f.requests.length, 1);
  f.advance(10 * 60000); await f.pulse();
  assert.equal(f.storage.bankingWatchdog.delivered, true); assert.equal(f.requests.length, 2);
});
test('login/wrong page and closed tabs alert without reloading or creating tabs', async () => {
  for (const closed of [false, true]) {
    const f = fixture(); await f.pulse(); delete f.storage.bankingTabId;
    if (closed) f.tabs.delete(2); else f.tabs.get(2).url = 'https://www.mercadopago.com.ar/login';
    f.advance(60 * 60000); await f.pulse();
    assert.equal(f.notifications.length, 1); assert.equal(f.reloads.length, 0);
  }
});
test('unchanged but confirmed listing stays healthy; periodic refresh and busy history are distinct', async () => {
  const f = fixture(); f.setHealth({ active: true, confirmedAt: f.now(), intervalMs: 1800000 });
  await f.pulse(); f.advance(100000); await f.pulse(); assert.equal(f.reloads.length, 0);
  f.setHealth({ active: true, confirmedAt: f.now(), refreshDue: true, busy: true });
  await f.pulse(); assert.equal(f.reloads.length, 0);
  f.setHealth({ active: true, confirmedAt: f.now(), refreshDue: true });
  await f.pulse(); assert.equal(f.reloads.length, 1); assert.equal(f.notifications.length, 0);
});
test('stale confirmations and reader errors cannot be hidden by a responsive script', async () => {
  for (const extra of [{ error: 'No se pudo capturar' }, { confirmedAt: 1, intervalMs: 30000 }]) {
    const f = fixture(); f.setHealth({ active: true, confirmedAt: f.now(), ...extra });
    await f.pulse(); f.advance(10 * 60000); await f.pulse(); assert.equal(f.reloads.length, 1);
  }
});
test('flapping and worker restarts retain the six-hour alert cooldown', async () => {
  const f = fixture(); await f.pulse(); f.advance(60 * 60000); await f.pulse();
  assert.equal(f.notifications.length, 1); assert.equal(f.requests.length, 1);
  f.setHealth({ active: true, confirmedAt: f.now() }); await f.pulse();
  f.load(); f.setHealth(null); f.advance(60 * 60000); await f.pulse();
  assert.equal(f.notifications.length, 1); assert.equal(f.requests.length, 1);
  f.advance(5 * 60 * 60000); await f.pulse();
  assert.equal(f.notifications.length, 2); assert.equal(f.requests.length, 2);
  const count = f.reloads.length;
  f.storage.autoRefresh = false; f.advance(10 * 60000); await f.pulse(); assert.equal(f.reloads.length, count);
});
