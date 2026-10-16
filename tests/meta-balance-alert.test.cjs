/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { formatMessage, latestSpendLimitIncrease } = require('../scripts/send-meta-balance-alert.cjs');

const source = fs.readFileSync('src/app/api/telegram/meta-balance-webhook/route.ts', 'utf8');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(source + '\nexport { latestSpendLimitIncrease };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, {
  exports: exportsForTest, require: () => ({ NextResponse: {} }), Date, Intl, Number
});

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
