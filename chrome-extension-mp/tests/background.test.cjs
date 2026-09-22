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
      onAlarm: event('alarm')
    },
    notifications: { create() {} },
    storage: { local: {
      get(_keys, callback) { callback({ ...storage }); },
      set(values, callback) { Object.assign(storage, values); callback?.(); },
      remove(key) { delete storage[key]; }
    } },
    tabs: {
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
    chrome, URL, AbortController, fetch: async () => ({ ok: true, json: async () => ({}) }),
    console, setInterval() {}, setTimeout, clearTimeout
  }, { filename: 'background.js' });

  function message(request, sender) {
    return new Promise(resolve => {
      const keepOpen = listeners.message(request, sender, resolve);
      assert.equal(keepOpen, true);
    });
  }

  return { storage, listeners, sent, message };
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
    const ext = createExtension();
    const response = await ext.message(
      { action: 'GET_MONITOR_STATE' },
      { tab: { id: 22, url: 'https://www.mercadopago.com.ar/home' } }
    );
    assert.equal(response.active, false);
    assert.equal(ext.storage.monitorTabId, undefined, 'only Activities may auto-claim monitoring');
  }

  console.log('5/5 background monitor recovery tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
