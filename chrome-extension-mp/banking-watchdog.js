// Runs outside the page: a frozen/unloaded content script cannot supervise itself.
(function () {
  const ALARM = 'BANKING_WATCHDOG', KEY = 'bankingWatchdog';
  const GRACE = 90000, WINDOW = 15 * 60000;
  let running = false;
  const get = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
  const set = patch => new Promise(resolve => chrome.storage.local.set(patch, resolve));
  const tabById = id => new Promise(resolve => chrome.tabs.get(id, tab =>
    resolve(chrome.runtime.lastError ? null : tab)));
  function ping(id) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 8000);
      chrome.tabs.sendMessage(id, { action: 'BANK_HEALTH_PING' }).then(value => {
        clearTimeout(timer); resolve(value || null);
      }, () => { clearTimeout(timer); resolve(null); });
    });
  }
  function valid(tab) {
    try {
      const url = new URL(tab?.url);
      return url.protocol === 'https:' &&
        (url.hostname === 'mercadopago.com.ar' || url.hostname.endsWith('.mercadopago.com.ar')) &&
        /^(?:\/banking\/movements(?:\/[1-9]\d*)?|\/balance\/reports\/movements)\/?$/.test(url.pathname);
    } catch { return false; }
  }
  async function alert(config, state, message) {
    // Local notification must work even when the ERP is unreachable.
    if (!state.notifiedAt || Date.now() - state.notifiedAt >= WINDOW) {
      state.notifiedAt = Date.now();
      try { await chrome.notifications.create('ZONO_BANKING_WATCHDOG', {
        type: 'basic', iconUrl: chrome.runtime.getURL('icon.png'), priority: 2,
        title: 'Mercado Pago: Movimientos sin lectura', message
      }); } catch { /* Notification permission/OS settings may block it. */ }
    }
    if (state.delivered || state.alertAttemptAt && Date.now() - state.alertAttemptAt < 60000) return;
    state.alertAttemptAt = Date.now();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(config.webhookUrl || 'https://zono-erp.pages.dev/api/mp-webhook', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-webhook-token': config.secretToken || 'mpchecker_secret_key_123' },
        body: JSON.stringify({ type: 'ALERT_PAGE_ERROR', errorType: 'BANKING_STALLED',
          account: config.accountName || 'pagoszono.26', message,
          timestamp: new Date().toISOString() })
      });
      state.delivered = response.ok && (await response.json()).success === true;
    } catch { state.delivered = false; }
    finally { clearTimeout(timer); }
  }
  async function pulse() {
    if (running) return;
    running = true;
    try {
      const config = await get(['bankingTabId', KEY, 'webhookUrl', 'secretToken', 'accountName', 'autoRefresh']);
      const previous = config[KEY];
      // Keep the last owner after the legacy worker clears a closed/navigated tab.
      const id = config.bankingTabId || previous?.tabId;
      if (!id || config.autoRefresh === false) return;
      const now = Date.now();
      const state = previous?.tabId === id && previous.account === config.accountName ? previous
        : { tabId: id, account: config.accountName, since: now, reloads: [] };
      const tab = await tabById(id);
      const health = valid(tab) ? await ping(id) : null;
      const healthy = health?.active && !health.error && health.confirmedAt > 0 &&
        now - health.confirmedAt <= Math.max(30000, Number(health.intervalMs) || 1800000) + GRACE;
      if (healthy) {
        state.since = now; state.delivered = false; state.notifiedAt = 0; state.alertAttemptAt = 0;
        if (health.refreshDue && !health.busy) {
          await set({ [KEY]: state });
          await chrome.tabs.reload(id);
          return;
        }
      } else if (now - state.since >= GRACE) {
        state.reloads = state.reloads.filter(time => now - time < WINDOW);
        const reload = valid(tab) && state.reloads.length < 3;
        const reason = !tab ? 'La pestaña de Movimientos se cerró.' : !valid(tab)
          ? 'La pestaña de Movimientos salió del listado. Revisá la sesión de Mercado Pago.'
          : health?.error || 'El lector no responde o no confirmó movimientos en el ERP.';
        const message = 'Movimientos: ' + reason + (reload
          ? ' Se intentará recargar automáticamente.'
          : ' Se requiere revisión manual; no se harán más recargas por ahora.');
        await alert(config, state, message);
        // Persist before reloading: navigation and service-worker sleep must not reset the budget.
        if (reload) { state.reloads.push(now); state.since = now; }
        await set({ [KEY]: state });
        if (reload) await chrome.tabs.reload(id);
        return;
      }
      await set({ [KEY]: state });
    } catch (error) { console.warn('[Zono] Watchdog de Movimientos:', error.message); }
    finally { running = false; }
  }
  const setup = () => chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  setup();
  chrome.runtime.onInstalled.addListener(setup);
  chrome.runtime.onStartup.addListener(setup);
  chrome.alarms.onAlarm.addListener(event => { if (event.name === ALARM) void pulse(); });
})();
