const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
function fixture() {
  let now = Date.parse('2026-10-23T22:14:00Z'), calls = 0, response = { captured: 4 };
  const timers = [], elements = {}, theme = [];
  const context = {
    config: { accountName: 'pagoszono.26', webhookUrl: 'https://example.invalid', autoRefresh: true },
    isMonitorTab: true, isBankingPage: () => true, getBankingInterval: () => 1800,
    formatCountdown: value => value + 's',
    detectMercadoPagoError: () => ({ hasError: false }), lastReadingCount: 4,
    setConnectionStatus(value) { context.connected = value; },
    ZonoMonitorUI: { apply(_box, options) { theme.push(options); } },
    ZonoCaptureRefresh: { captureLoaded: async () => { calls++; return response; } },
    document: { getElementById: id => elements[id], createElement: () => ({ style: {}, setAttribute() {} }) },
    chrome: { runtime: { onMessage: { addListener(fn) { context.listener = fn; } } } },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; }
    }, setTimeout: fn => timers.push(fn), setInterval: fn => timers.push(fn)
  };
  elements['zono-mp-widget'] = { appendChild(el) { elements[el.id] = el; } };
  vm.runInNewContext(fs.readFileSync('chrome-extension-mp/banking-health.js', 'utf8'), context);
  return { context, elements, theme, calls: () => calls,
    advance: ms => { now += ms; }, response: value => { response = value; },
    tick: async () => { await timers[0](); },
    ping: () => { let result; context.listener({ action: 'BANK_HEALTH_PING' }, {}, value => { result = value; }); return result; }
  };
}
test('only ERP acknowledgement confirms reading, with explicit Argentina clock under English locale', async () => {
  const f = fixture(); assert.equal(f.ping().confirmedAt, 0); await f.tick();
  assert.equal(f.calls(), 1); assert.ok(f.ping().confirmedAt > 0);
  assert.match(f.elements['zono-bank-health'].textContent, /19:14:00.*4 movimientos/);
  f.context.setConnectionStatus(true); assert.equal(f.context.connected, true);
});
test('empty, failed and skipped capture never produce green health', async () => {
  for (const result of [{ empty: true }, { failed: true, message: 'ERP caído' }, { skipped: true }]) {
    const f = fixture(); f.response(result); await f.tick();
    assert.equal(f.ping().confirmedAt, 0); assert.ok(f.ping().error);
    f.context.setConnectionStatus(true); assert.equal(f.context.connected, false);
    f.context.ZonoMonitorUI.apply({}, { active: true }); assert.ok(f.theme.at(-1).error);
  }
});
test('retry after failure, skip overlap, passive tabs and account switch', async () => {
  const f = fixture(); f.response({ failed: true }); await f.tick();
  await f.tick(); assert.equal(f.calls(), 1);
  f.advance(30000); f.response({ captured: 4 }); await f.tick(); assert.equal(f.calls(), 2);
  f.context.config.accountName = 'cobroszono'; await f.tick(); assert.equal(f.calls(), 3);
  f.context.isMonitorTab = false; await f.tick(); assert.equal(f.calls(), 3);
});
test('responsive page requests periodic fresh reload but defers during history capture', async () => {
  const f = fixture(); await f.tick(); assert.equal(f.ping().refreshDue, false);
  f.advance(1800000); f.context.ZonoCaptureRefresh.isBusy = () => true;
  const status = f.ping(); assert.equal(status.refreshDue, true); assert.equal(status.busy, true);
});
