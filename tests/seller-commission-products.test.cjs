const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sellerCommissionProducts.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exported });
const summarize = exported.summarizeCommissionProducts;
function line(id, quantity, net, group = 'tanks') {
  return { product_id: id, product_name: id, category: group, group_id: group, group_name: group, quantity, net_sales: net };
}
const rates = [{ group_id: 'tanks', applied_rate_pct: 1.6 }, { group_id: 'tools', applied_rate_pct: 1 }];
test('repeated products aggregate quantity and discounted revenue and sort by revenue', () => {
  const rows = summarize([line('A', 1, 600), line('B', 4, 1500, 'tools'), line('A', 2, 900)], rates);
  assert.equal(rows.length, 2);
  const a = rows.find(r => r.product_id === 'A');
  assert.equal(a.quantity, 3);
  assert.equal(a.net_sales, 1500);
  assert.equal(a.rate_pct, 1.6);
  assert.equal(a.commission, 24);
  assert.equal(rows.reduce((s, r) => s + r.net_sales, 0), 3000);
  assert.equal(rows.reduce((s, r) => s + r.commission, 0), 39);
  assert.ok(rows.every((r, i) => !i || rows[i - 1].net_sales >= r.net_sales));
});
test('different commission groups keep distinct percentages for the same product', () => {
  const rows = summarize([line('A', 1, 1000), line('A', 1, 1000, 'tools')], rates);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((s, r) => s + r.commission, 0), 26);
});
test('negative discounts retain their contribution and an unreached tier has zero commission', () => {
  const rows = summarize([line('A', 1, 1000), line('Discount', 1, -100)], []);
  assert.equal(rows.reduce((s, r) => s + r.net_sales, 0), 900);
  assert.equal(rows.reduce((s, r) => s + r.commission, 0), 0);
});
