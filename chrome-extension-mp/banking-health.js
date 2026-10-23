// A green connection is not proof that the listing was read and acknowledged.
// This loop is independent of the legacy Activity refresh/heartbeat loop.
(function () {
  let lastAttempt = 0, confirmedAt = 0, rows = 0, error = '', busy = false;
  const startedAt = Date.now();
  let identity = '';
  const active = () => isMonitorTab && isBankingPage();
  function syncIdentity() {
    const current = config.accountName + '|' + config.webhookUrl;
    if (current !== identity) {
      identity = current; lastAttempt = 0; confirmedAt = 0; rows = 0; error = '';
    }
  }
  function problem() {
    return error || (confirmedAt && Date.now() - confirmedAt > getBankingInterval() * 1000 + 90000
      ? 'Lectura vencida' : !confirmedAt ? 'Lectura todavía sin confirmar' : '');
  }
  const originalConnectionStatus = setConnectionStatus;
  setConnectionStatus = online => originalConnectionStatus(
    isBankingPage() ? Boolean(online && !problem()) : online);
  if (globalThis.ZonoMonitorUI) {
    const originalApply = ZonoMonitorUI.apply;
    ZonoMonitorUI.apply = (box, options = {}) => originalApply(box,
      active() ? { ...options, error: problem() || options.error } : options);
  }
  function status() {
    syncIdentity();
    return { active: active(), startedAt, confirmedAt, rows, error, account: config.accountName,
      intervalMs: getBankingInterval() * 1000,
      refreshDue: config.autoRefresh !== false && Date.now() - startedAt >= getBankingInterval() * 1000,
      busy: busy || Boolean(globalThis.ZonoCaptureRefresh?.isBusy?.()) };
  }
  function render() {
    if (!active()) return;
    const box = document.getElementById('zono-mp-widget');
    if (!box) return;
    let el = document.getElementById('zono-bank-health');
    if (!el) {
      el = document.createElement('div');
      el.id = 'zono-bank-health';
      el.setAttribute('role', 'status');
      box.appendChild(el);
    }
    const stale = confirmedAt && Date.now() - confirmedAt > status().intervalMs + 90000;
    const problem = error || (stale ? 'Lectura vencida' : '');
    setConnectionStatus(Boolean(confirmedAt && !problem));
    const countdown = document.getElementById('zono-countdown');
    if (countdown) countdown.textContent = config.autoRefresh === false ? 'en pausa'
      : formatCountdown(Math.max(0, Math.ceil((getBankingInterval() * 1000 - (Date.now() - startedAt)) / 1000)));
    const clock = confirmedAt ? new Date(confirmedAt).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '';
    el.textContent = problem ? '⚠ Movimientos: ' + problem
      : confirmedAt ? 'Última lectura confirmada: ' + clock + ' · ' + rows + ' movimientos'
      : 'Verificando lectura y confirmación del ERP…';
    el.style.color = problem ? '#fca5a5' : confirmedAt ? '#6ee7b7' : '#fde68a';
    if (globalThis.ZonoMonitorUI) ZonoMonitorUI.apply(box, { active: true,
      error: problem || (!confirmedAt ? 'Lectura todavía sin confirmar' : '') });
    else if (problem || !confirmedAt) setConnectionStatus(false);
  }
  async function tick() {
    syncIdentity();
    if (!active()) { lastAttempt = 0; confirmedAt = 0; return; }
    if (busy) { render(); return; }
    const retryMs = error ? 30000 : getBankingInterval() * 1000;
    if (lastAttempt && Date.now() - lastAttempt < retryMs) { render(); return; }
    lastAttempt = Date.now(); busy = true;
    const attemptIdentity = identity;
    try {
      if (detectMercadoPagoError().hasError) throw Error('Mercado Pago no pudo cargar el listado');
      if (!globalThis.ZonoCaptureRefresh) throw Error('El lector no se inició');
      const result = await ZonoCaptureRefresh.captureLoaded('banking', true);
      syncIdentity();
      if (attemptIdentity !== identity) return;
      if (!result || result.failed || result.empty || result.skipped)
        throw Error(result?.message || 'No se detectaron movimientos compatibles');
      confirmedAt = Date.now(); rows = lastReadingCount; error = '';
    } catch (failure) {
      syncIdentity();
      if (attemptIdentity === identity) error = failure.message || 'No se confirmó la lectura';
    }
    finally { busy = false; render(); }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.action !== 'BANK_HEALTH_PING') return;
    reply(status());
    void tick();
  });
  setTimeout(tick, 2500);
  setInterval(tick, 15000);
})();
