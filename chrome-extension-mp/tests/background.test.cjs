/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function createExtension({ monitorTabId, tabs = [], failMessages = false } = {}) {
  const storage = monitorTabId == null ? {} : { monitorTabId };
  const listeners = {};
  const sent = [];
  const requests = [];
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  const runtime = {
    lastError: undefined,
    onInstalled: event('installed'),
    onStartup: event('startup'),
    onMessage: event('message'),
    getURL: value => value
  };
  const chrome = {
    runtime,
    alarms: {
      create() {},
      clear() {},
      onAlarm: event('alarm')
    },
    notifications: { create() {} },
    storage: { local: {
      get(_keys, callback) {
        if (callback) callback({ ...storage });
        else return Promise.resolve({ ...storage });
      },
      set(values, callback) { Object.assign(storage, values); callback?.(); },
      remove(key) { delete storage[key]; }
    } },
    tabs: {
      onUpdated: event('updated'),
      onRemoved: event('removed'),
      sendMessage(tabId, message) {
        sent.push({ tabId, message });
        return failMessages ? Promise.reject(new Error('Receiving end does not exist')) : Promise.resolve();
      },
      get(tabId, callback) {
        const tab = tabs.find(item => item.id === tabId);
        if (!tab) runtime.lastError = { message: 'No tab with id' };
        callback(tab);
        runtime.lastError = undefined;
      }
    }
  };

  vm.runInNewContext(source, {
    chrome, URL, AbortController, fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true }) };
    },
    console, setInterval() {}, setTimeout, clearTimeout
  }, { filename: 'background.js' });

  function message(request, sender) {
    return new Promise(resolve => {
      const keepOpen = listeners.message(request, sender, resolve);
      assert.equal(keepOpen, true);
    });
  }

  return { storage, listeners, sent, requests, message };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
}

(async () => {
  {
    const ext = createExtension({
      monitorTabId: 10,
      tabs: [{ id: 10, url: 'https://www.mercadopago.com.ar/activities' }],
      failMessages: true
    });
    ext.listeners.alarm({ name: 'POLL_PULSE' });
    await settle();
    assert.equal(ext.storage.monitorTabId, 10, 'a transient content-script failure must not deactivate a live tab');
  }

  {
    const ext = createExtension({ monitorTabId: 10, tabs: [] });
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/activities#from-section=menu' } }
    );
    assert.equal(response.active, true);
    assert.equal(response.recovered, true);
    assert.equal(ext.storage.monitorTabId, 22, 'a restored Activities tab should replace a stale tab id');
  }

  {
    const ext = createExtension({
      monitorTabId: 10,
      tabs: [{ id: 10, url: 'https://www.mercadopago.com.ar/activities' }]
    });
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/activities' } }
    );
    assert.equal(response.active, false);
    assert.equal(ext.storage.monitorTabId, 10, 'a second live tab must remain passive');
  }

  {
    const ext = createExtension({
      monitorTabId: 10,
      tabs: [{ id: 10, url: 'https://example.com/' }]
    });
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/activities' } }
    );
    assert.equal(response.active, true);
    assert.equal(ext.storage.monitorTabId, 22, 'a recycled id owned by an unrelated tab must be replaced');
  }

  {
    const tab = { id: 10, url: 'https://www.mercadopago.com.ar/home', status: 'complete' };
    const ext = createExtension({ monitorTabId: 10, tabs: [tab] });
    ext.listeners.updated(10, { url: tab.url }, tab);
    ext.listeners.alarm({ name: 'WRONG_PAGE_CHECK' });
    await settle();
    assert.equal(ext.requests.length, 1, 'leaving Activities must report an alert');
    assert.equal(JSON.parse(ext.requests[0].options.body).errorType, 'WRONG_PAGE');
    ext.listeners.alarm({ name: 'WRONG_PAGE_CHECK' });
    await settle();
    assert.equal(ext.requests.length, 1, 'the same outage must not alert twice');
    tab.url = 'https://www.mercadopago.com.ar/activities';
    ext.listeners.updated(10, { url: tab.url }, tab);
    await settle();
    assert.equal(ext.storage.wrongPageAlertedTabId, undefined, 'returning to Activities clears the alert state');
  }

  {
    const ext = createExtension({
      monitorTabId: 10,
      tabs: [{ id: 10, url: 'https://www.mercadopago.com.ar/home' }]
    });
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/activities' } }
    );
    assert.equal(response.active, false);
    assert.equal(ext.storage.monitorTabId, 10, 'navigating the monitor tab must not transfer ownership');
  }

  {
    const ext = createExtension({ monitorTabId: 10, tabs: [] });
    ext.listeners.removed(10);
    ext.listeners.alarm({ name: 'WRONG_PAGE_CHECK' });
    await settle();
    assert.equal(ext.requests.length, 1, 'closing the monitor tab must report an alert');
    assert.match(JSON.parse(ext.requests[0].options.body).message, /se cerró/);
  }

  {
    const ext = createExtension();
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/home' } }
    );
    assert.equal(response.active, false);
    assert.equal(ext.storage.monitorTabId, undefined, 'only Activities may auto-claim monitoring');
  }

  console.log('8/8 background monitor recovery and navigation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
