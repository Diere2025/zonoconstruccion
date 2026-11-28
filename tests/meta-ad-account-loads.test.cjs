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

test('meta-ads-sheet history merges USD sheet rows with ARS 1-ZONO and 2-ZONO Meta insights (+5% fee) without duplicating', async () => {
  const sheetSrc = fs.readFileSync('src/app/api/admin/meta-ads-sheet/route.ts', 'utf8');
  const sheetCompiled = ts.transpileModule(sheetSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const csv = [
    'date_start,account,campaign,messages,comments,ctr,cprUsd,spendUsd,reactions,reach,impressions,frequency,cpm,feePercent,exchangeRate,col15,spendArs,feeArs',
    '26/11/2026,S731.04,(Tanques) Camp USD [4592],10,0,2.0%,2.50,25.00,0,1000,1500,1.5,10,11%,1600,0,40000,4400',
  ].join('\n');

  const routeExports = {};
  vm.runInNewContext(sheetCompiled, {
    exports: routeExports,
    Date,
    Intl,
    Number,
    String,
    Array,
    Map,
    Set,
    URL,
    AbortSignal,
    console: { log() {}, warn() {}, error() {} },
    process: {
      env: {
        META_ZONO_ACCESS_TOKEN: 'zono-token',
        META_ZONO_API_VERSION: 'v24.0',
      },
    },
    fetch: async input => {
      const u = new URL(input);
      if (u.pathname.includes('/act_2361501517627802/insights')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                date_start: '2026-11-26',
                campaign_name: '(MEPS) Camp 1-ZONO [1234]',
                spend: '100000',
                actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '25' }],
                impressions: '5000',
                reach: '4000',
                frequency: '1.25',
                ctr: '3.2',
                cpm: '20000',
              },
            ],
          }),
        };
      }
      if (u.pathname.includes('/act_942497128185607/insights')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                date_start: '2026-11-26',
                campaign_name: '(Bio) Camp 2-ZONO [5678]',
                spend: '200000',
                actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '50' }],
                impressions: '9000',
                reach: '7000',
                frequency: '1.28',
                ctr: '2.9',
                cpm: '22000',
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    },
    require: mod => {
      if (mod === 'next/server') return { NextResponse: { json: (body, options) => ({ body, options }) } };
      if (mod === '@supabase/supabase-js') {
        return {
          createClient: () => ({
            rpc: async () => ({ data: [{ order_date: '2026-11-26', revenue: 1000000, orders_count: 5 }], error: null }),
          }),
        };
      }
      if (mod === '@/lib/googleSheets') return { fetchSpreadsheetCsv: async () => csv };
      if (mod === '@/lib/metaZonoBalance.mjs') return zonoBalance;
      throw new Error(`Unexpected require: ${mod}`);
    },
  });

  const res = await routeExports.GET({
    url: 'https://local/api/admin/meta-ads-sheet?tab=history&dateFrom=2026-11-26&dateTo=2026-11-26',
  });
  const body = res.body;
  assert.equal(body.records.length, 3);
  assert.equal(body.summary.totalMessages, 85); // 10 + 25 + 50
  assert.equal(body.summary.totalSpendUsd, 25);
  assert.equal(body.summary.totalSpendArsNative, 300000); // 100k + 200k
  // Spend ARS = 40,000 + 100,000 + 200,000 = 340,000
  // Fee ARS = 4,400 + 5,000 (5%) + 10,000 (5%) = 19,400
  assert.equal(body.summary.totalSpendArs, 340000);
  assert.equal(body.summary.totalFeeArs, 19400);
  assert.equal(body.summary.totalInvestmentArs, 359400);
  assert.equal(body.dailyTimeline.length, 1);
  assert.equal(body.dailyTimeline[0].accounts['1-ZONO'].totalInvestmentArs, 105000);
  assert.equal(body.dailyTimeline[0].accounts['2-ZONO'].totalInvestmentArs, 210000);
});
