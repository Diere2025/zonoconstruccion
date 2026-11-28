const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsModel = {};
const source = fs.readFileSync('src/lib/eerrNative/advertising.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports: exportsModel});
const {valueWalletConsumption} = exportsModel;

function movement(day, kind, amount, fields = {}) {
  return {
    day, kind, amount: String(amount), wallet: 'binance', reference: kind,
    detail: '', credited: null, bank_amount: null, bank_matches: null, ...fields,
  };
}

test('Meta carries funded cost and fee from October while Redot uses its own funds', () => {
  const ledger = [
    movement('2026-10-29', 'p2p', 50, {bank_amount: '5000', bank_matches: true, bank_code: 'PAG-1'}),
    movement('2026-10-29', 'p2p', 60, {bank_amount: '7200', bank_matches: true}),
    movement('2026-10-30', 'transfer', 55, {credited: '55'}),
    movement('2026-10-30', 'ad_funding', 55, {credited: '50'}),
    movement('2026-11-01', 'p2p', 100, {bank_amount: '20000', bank_matches: true}),
    movement('2026-11-02', 'redot_ads', 11, {wallet: 'redot'}),
    movement('2026-11-02', 'personal', 11, {wallet: 'redot'}),
    movement('2026-11-02', 'service', 0, {wallet: 'redot'}),
  ];
  const spend = new Map([['2026-10-31', 30], ['2026-11-01', 20]]);
  const result = valueWalletConsumption(['2026-11-01', '2026-11-02'], spend, ledger);
  assert.equal(result.days[0].spendArs, 2218.18);
  assert.equal(result.days[0].feeArs, 221.82);
  assert.equal(result.redot.length, 2);
  assert.equal(result.redot[0].amountArs, 1220);
  assert.equal(result.redot[1].amountArs, null);
  assert.equal(result.purchaseReferences[0], 'PAG-1');
});

test('later purchases cannot value an earlier unfunded transfer or consumption', () => {
  const ledger = [
    movement('2026-10-01', 'ad_funding', 21, {credited: '20'}),
    movement('2026-10-02', 'p2p', 21, {bank_amount: '2100', bank_matches: true}),
    movement('2026-10-02', 'ad_funding', 21, {credited: '20'}),
  ];
  const spend = new Map([['2026-10-01', 10], ['2026-10-02', 20]]);
  const result = valueWalletConsumption(['2026-10-01', '2026-10-02'], spend, ledger);
  assert.equal(result.days[0].spendArs, null);
  assert.equal(result.days[1].spendArs, 1000);
  assert.equal(result.days[1].feeArs, 50);
  assert.equal(result.days[1].unvaluedUsd, 10);
});

test('a confirmed cashback credits Meta at zero additional cost and preserves the fee of the paid credit', () => {
  const ledger = [
    movement('2026-11-11', 'p2p', 110, {bank_amount: '11000', bank_matches: true}),
    movement('2026-11-11', 'ad_funding', 110, {credited: '150', detail: 'Carga neta USD 100.00; Confirmada'}),
  ];
  const days = ['2026-11-11', '2026-11-12'];
  const result = valueWalletConsumption(days, new Map([[days[0], 100], [days[1], 50]]), ledger);
  assert.equal(result.days[0].spendArs, 10000);
  assert.equal(result.days[0].feeArs, 1000);
  assert.equal(result.days[1].spendArs, 0);
  assert.equal(result.days[1].feeArs, 0);
  assert.equal(result.days[1].unvaluedUsd, 0);
});

test('readAdvertising fetches 1-ZONO and 2-ZONO daily ARS spend alongside S731.04', async () => {
  const zonoBalance = require('../src/lib/metaZonoBalance.mjs');
  const serverExports = {};
  const serverSource = fs.readFileSync('src/lib/eerrNative/advertisingServer.ts', 'utf8');
  const mockFetch = async (url, options) => {
    const u = new URL(url);
    const p = u.pathname;
    if (p.includes('/act_1077861488005193')) {
      assert.equal(options.headers.Authorization, 'Bearer usd-token');
      if (p.endsWith('/insights')) return { ok: true, json: async () => ({ data: [{ date_start: '2026-10-01', spend: '10' }] }) };
      return { ok: true, json: async () => ({ id: 'act_1077861488005193', name: 'S731.04', currency: 'USD', timezone_name: 'America/Argentina/Buenos_Aires', spend_cap: '100000', amount_spent: '20000' }) };
    }
    if (p.includes('/act_2361501517627802')) {
      assert.equal(options.headers.Authorization, 'Bearer zono-token');
      if (p.endsWith('/insights')) return { ok: true, json: async () => ({ data: [{ date_start: '2026-10-01', spend: '45000.50' }] }) };
      return { ok: true, json: async () => ({ id: 'act_2361501517627802', name: '1-ZONO', currency: 'ARS', timezone_name: 'America/Argentina/Buenos_Aires', spend_cap: '40519027', amount_spent: '20519027' }) };
    }
    if (p.includes('/act_942497128185607')) {
      assert.equal(options.headers.Authorization, 'Bearer zono-token');
      if (p.endsWith('/insights')) return { ok: true, json: async () => ({ data: [{ date_start: '2026-10-02', spend: '30000' }] }) };
      return { ok: true, json: async () => ({ id: 'act_942497128185607', name: '2-ZONO', currency: 'ARS', timezone_name: 'America/Argentina/Buenos_Aires', spend_cap: '710608901', amount_spent: '655608987' }) };
    }
    throw new Error('Unexpected URL ' + url);
  };
  vm.runInNewContext(ts.transpileModule(serverSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: serverExports,
    fetch: mockFetch,
    URL,
    Date,
    Map,
    Number,
    Math,
    Promise,
    AbortSignal,
    process: { env: { META_ACCESS_TOKEN: 'usd-token', META_ZONO_ACCESS_TOKEN: 'zono-token' } },
    require: name => {
      if (name === './advertising') return exportsModel;
      if (name === '@/lib/metaZonoBalance.mjs') return zonoBalance;
      throw new Error(name);
    },
  });
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
    rpc: async () => ({
      data: {
        entries: [
          { ...movement('2026-10-01', 'p2p', 100, { bank_amount: '150000', bank_matches: true }), void_reason: null },
          { ...movement('2026-10-01', 'ad_funding', 100, { credited: '100' }), void_reason: null },
        ],
      },
      error: null,
    }),
  };
  const req = new Request('https://erp.test/api/admin/finanzas/eerr-native', { headers: { authorization: 'Bearer sess' } });
  const adv = await serverExports.readAdvertising(db, req, ['2026-10-01', '2026-10-02']);
  assert.equal(adv.account, 'S731.04');
  assert.equal(adv.arsAccounts.length, 2);
  assert.equal(adv.arsAccounts[0].account, '1-ZONO');
  assert.equal(adv.arsAccounts[0].availableArs, 200000);
  assert.equal(adv.arsAccounts[0].feeRate, 0.05);
  assert.equal(adv.arsAccounts[0].days[0].spendArs, 45000.5);
  assert.equal(adv.arsAccounts[0].days[0].feeArs, 2250.03);
  assert.equal(adv.arsAccounts[0].days[1].spendArs, 0);
  assert.equal(adv.arsAccounts[0].days[1].feeArs, 0);
  assert.equal(adv.arsAccounts[1].account, '2-ZONO');
  assert.equal(adv.arsAccounts[1].availableArs, 549999.14);
  assert.equal(adv.arsAccounts[1].feeRate, 0.05);
  assert.equal(adv.arsAccounts[1].days[0].spendArs, 0);
  assert.equal(adv.arsAccounts[1].days[0].feeArs, 0);
  assert.equal(adv.arsAccounts[1].days[1].spendArs, 30000);
  assert.equal(adv.arsAccounts[1].days[1].feeArs, 1500);
});
