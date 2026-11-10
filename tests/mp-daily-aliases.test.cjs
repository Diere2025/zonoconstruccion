const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dates = require('../src/lib/mpPaymentDate.ts');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: () => dates });
  return exports;
}
const { MP_ALIAS_LIMITS, suggestDailyAliases } = load('src/lib/mpDailyAliases.ts');
const { summarizeAccountIncome } = load('src/lib/mpAccountIncome.ts');
const asOf = '2026-11-10';
const accounts = MP_ALIAS_LIMITS.map(({ id, alias }) => ({ id, name: alias, is_active: true }));
const amounts = (totals, expected, day = asOf) => accounts.map((account, i) => ({
  ...account, asOf: day, isActive: true, monthAmount: totals[i], todayCustomerAmount: i === 0 ? expected : 0,
}));
const aliasesOf = plan => Array.from(plan.aliases, item => item.alias);

test('prefers accounts with less progress toward their monthly ceilings', () => {
  const plan = suggestDailyAliases(amounts([14_128_959, 15_435_314, 4_654_550], 2_000_000), asOf);
  assert.deepEqual(aliasesOf(plan), ['cobroszono', 'diegozono.mp']);
  assert.equal(plan.date, '2026-11-11');
  assert.equal(plan.expected, 2_000_000);
  assert.equal(plan.usesException, false);
});

test('uses the 30M exception only if needed and blocks publication without two eligible accounts', () => {
  const normal = suggestDailyAliases(amounts([38e6, 37e6, 20e6], 5e6), asOf);
  assert.deepEqual(aliasesOf(normal), ['pagoszono.26', 'diegozono.mp']);
  assert.equal(normal.usesException, false);
  const exception = suggestDailyAliases(amounts([38e6, 37e6, 20e6], 5e6 + 0.01), asOf);
  assert.equal(exception.usesException, true);
  assert.equal(exception.aliases.find(item => item.alias === 'cobroszono').limit, 30e6);
  assert.equal(suggestDailyAliases(amounts([40e6, 39e6, 30e6], 1), asOf).aliases.length, 0);
  assert.equal(suggestDailyAliases(amounts([38e6, 39e6, 30e6], 3e6 + 0.01), asOf).aliases.length, 0);
  const inactive = amounts([40e6, 39e6, 10e6], 1);
  inactive[2].isActive = false;
  assert.equal(suggestDailyAliases(inactive, asOf).aliases.length, 0);
});

test('resets the ceilings for tomorrow at month and year rollover', () => {
  const lastDay = '2026-12-31';
  const plan = suggestDailyAliases(amounts([40e6, 40e6, 30e6], 2e6, lastDay), lastDay);
  assert.equal(plan.date, '2027-01-01');
  assert.equal(plan.expected, 2e6);
  assert.deepEqual(aliasesOf(plan), ['diegozono.mp', 'pagoszono.26']);
  assert.equal(plan.aliases[0].remaining, 40e6);
});

test('own transfers count toward the ceiling but not the customer estimate; the cut is in Buenos Aires', () => {
  const [account] = accounts;
  const rows = [
    ['2026-11-10T02:59:59.999Z', 100, false],
    ['2026-11-10T03:00:00.000Z', 250.50, false],
    ['2026-11-10T15:00:00.000Z', 300, true],
  ].map(([received_at, amount, is_internal]) => ({ account_id: account.id, received_at, amount, is_internal }));
  const [summary] = summarizeAccountIncome([], rows, accounts, asOf);
  assert.equal(summary.monthAmount, 650.50);
  assert.equal(summary.todayCustomerAmount, 250.50);
});
