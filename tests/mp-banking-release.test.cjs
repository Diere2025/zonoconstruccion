const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const release = 'output/mp-extension-1.7.5/';
for (const lane of ['banking', 'activity']) test('release capture retry policy: ' + lane, async () => {
  let now = 10000000, sent = 0;
  const row = { operationId: '123456789', amount: '1.00', occurredAt: '2026-10-24T12:00:00-03:00' };
  const ctx = { config: { accountName: 'pagoszono.26', webhookUrl: 'https://example.invalid', secretToken: 'test' },
    isMonitorTab: true, document: {}, location: { pathname: lane === 'banking' ? '/banking/movements' : '/activities' },
    ZonoMpBanking: { scan: () => [row], scanActivities: () => [row] }, getRowDate() {},
    getBankingInterval: () => 1800, updateReadingStatus() {}, lastBankCaptureError: '', lastActivityCaptureError: '',
    showToast() {}, chrome: { runtime: { sendMessage(_message, cb) { sent++; cb({ ok: false }); } } },
    URL, Date: { now: () => now }, setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    reportBankingRows() {}, reportActivityBankRows() {} };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(release + 'capture-refresh.js', 'utf8'), ctx);
  await ctx.ZonoCaptureRefresh.captureLoaded(lane); assert.equal(sent, 1);
  now += 30000; await ctx.ZonoCaptureRefresh.captureLoaded(lane);
  assert.equal(sent, lane === 'banking' ? 1 : 2);
  if (lane === 'banking') {
    now += 270000; await ctx.ZonoCaptureRefresh.captureLoaded(lane); assert.equal(sent, 2);
  }
});
test('release preserves Activity and Reserve code and only changes banking capture backoff', () => {
  for (const name of ['content.js', 'background.js', 'reserve-monitor.js', 'reserve-reader.js'])
    assert.equal(fs.readFileSync(release + name, 'utf8'), fs.readFileSync('output/mp-extension-1.7.4/' + name, 'utf8'));
  const previous = fs.readFileSync('output/mp-extension-1.7.4/capture-refresh.js', 'utf8');
  assert.equal(fs.readFileSync(release + 'capture-refresh.js', 'utf8'), previous.replace(
    'Date.now()-(failedAt.get(key)||0)<30000', "Date.now()-(failedAt.get(key)||0)<(lane==='banking'?300000:30000)"));
});
