/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const zonoBalance = require('../src/lib/metaZonoBalance.mjs');

const source = fs.readFileSync('src/lib/metaAdAccountLoads.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadLib() {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Intl,
    Number,
    String,
    Array,
    Map,
    Set,
    URL,
    AbortSignal,
    process: { env: {} },
    require: mod => {
      if (mod === '@/lib/metaZonoBalance.mjs') return zonoBalance;
      if (mod === '@supabase/supabase-js') return { createClient: () => null };
      throw new Error(`Unexpected require: ${mod}`);
    },
  });
  return exports;
}

const { extractMetaLoadsFromActivities, toArgentinaDateISO } = loadLib();

test('toArgentinaDateISO converts UTC late-night timestamps to previous Argentine calendar day', () => {
  // 2026-10-15T02:39:50Z is 2026-10-14 23:39:50 in Argentina (UTC-3)
  const tsMs = Date.parse('2026-10-15T02:39:50+0000');
  assert.equal(toArgentinaDateISO(tsMs), '2026-10-14');
});

test('extractMetaLoadsFromActivities extracts USD spend limit increases and ignores decreases/invalid events', () => {
  const loads = extractMetaLoadsFromActivities(
    { id: 'act_1077861488005193', name: 'S731.04', currency: 'USD' },
    [
      {
        event_time: '2026-10-15T02:39:50+0000',
        event_type: 'ad_account_update_spend_limit',
        extra_data: JSON.stringify({ type: 'payment_amount', old_value: 4215909, new_value: 4291909 }),
      },
      // Duplicate with Z instead of +0000 must deduplicate to same event_key
      {
        event_time: '2026-10-15T02:39:50.000Z',
        event_type: 'ad_account_update_spend_limit',
        extra_data: { type: 'payment_amount', old_value: 4215909, new_value: 4291909 },
      },
      // Decrease should be ignored
      {
        event_time: '2026-10-16T02:00:00Z',
        event_type: 'ad_account_update_spend_limit',
        extra_data: JSON.stringify({ type: 'payment_amount', old_value: 5000000, new_value: 4000000 }),
      },
      // Non-funding event should be ignored
      {
        event_time: '2026-10-16T03:00:00Z',
        event_type: 'update_campaign_run_status',
        extra_data: JSON.stringify({ new_value: 'PAUSED' }),
      },
    ]
  );

  assert.equal(loads.length, 1);
  assert.equal(loads[0].account_id, 'act_1077861488005193');
  assert.equal(loads[0].account_name, 'S731.04');
  assert.equal(loads[0].currency, 'USD');
  assert.equal(loads[0].amount_cents, 76000);
  assert.equal(loads[0].amount, 760);
  assert.equal(loads[0].old_limit_cents, 4215909);
  assert.equal(loads[0].new_limit_cents, 4291909);
  assert.equal(loads[0].event_date_ar, '2026-10-14');
  assert.equal(
    loads[0].event_key,
    'act_1077861488005193|ad_account_update_spend_limit|2026-10-15T02:39:50.000Z|4215909|4291909'
  );
});

test('extractMetaLoadsFromActivities extracts ARS funding_event_successful and ignores failed or mismatched currency', () => {
  const loads = extractMetaLoadsFromActivities(
    { id: 'act_2361501517627802', name: '1-ZONO', currency: 'ARS' },
    [
      {
        event_time: '2026-11-25T01:00:00Z',
        event_type: 'funding_event_failed',
        extra_data: '{"amount":5000000,"currency":"ARS"}',
      },
      {
        event_time: '2026-11-25T00:08:45+0000',
        event_type: 'funding_event_successful',
        extra_data: '{"amount":20000000,"currency":"ARS"}',
      },
      {
        event_time: '2026-11-26T15:00:00Z',
        event_type: 'funding_event_successful',
        extra_data: '{"amount":10000,"currency":"USD"}',
      },
    ]
  );

  assert.equal(loads.length, 1);
  assert.equal(loads[0].account_name, '1-ZONO');
  assert.equal(loads[0].currency, 'ARS');
  assert.equal(loads[0].amount_cents, 20000000);
  assert.equal(loads[0].amount, 200000);
  assert.equal(loads[0].event_date_ar, '2026-11-24');
  assert.equal(loads[0].old_limit_cents, null);
  assert.equal(loads[0].new_limit_cents, null);
});
