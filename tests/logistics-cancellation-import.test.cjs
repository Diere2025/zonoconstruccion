const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, extras = {}) {
  const exports = {};
  const context = vm.createContext({ exports, ...extras });
  vm.runInContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  return { exports, context };
}

test('imports reuse one read of B:D and a new import refreshes the reasons', async () => {
  const helpers = load('src/lib/cancelledOrderSheet.ts').exports;
  const sheets = load('src/lib/googleSheets.ts', { require: () => helpers, process: { env: {} } });
  let reads = 0;
  sheets.context.mockRead = async (id, range) => {
    assert.equal(id, '1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg');
    assert.equal(range, "'Cancelados'!B2:D");
    reads++;
    return [['Sin stock', '', 'LK01514']];
  };
  vm.runInContext('fetchSpreadsheetValues = mockRead', sheets.context);
  const lookup = sheets.exports.createLogisticsCancellationReasonLookup();
  assert.equal(await lookup('LK01514'), 'Anulado por Logística. Sin stock');
  assert.match(await lookup('UNKNOWN'), /Pedido no encontrado/);
  assert.equal(reads, 1);
  await sheets.exports.createLogisticsCancellationReasonLookup()('LK01514');
  assert.equal(reads, 2);
  sheets.context.mockRead = async () => { throw new Error('API unavailable'); };
  vm.runInContext('fetchSpreadsheetValues = mockRead', sheets.context);
  await assert.rejects(sheets.exports.createLogisticsCancellationReasonLookup()('LK01514'), /API unavailable/);
});

test('cancellation notice uses the imported reason', async () => {
  let message;
  const worker = load('src/lib/processOrderCancellation.ts', {
    require: name => name.includes('orderNotificationText') ? load('src/lib/orderNotificationText.ts').exports : ({ cancelOrderInAllSheets: async () => ({
      seller: { success: true }, central: { success: true },
      cancelledSheet: { success: true }, deliveriesCurrent: { success: true }
    }) }),
    URL,
    fetch: async (url, options) => {
      message = JSON.parse(options.body).message;
      return { ok: true, json: async () => ({ ok: true }) };
    }
  }).exports;
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data:{full_name:'Jazmín Sánchez'}}) }) };
  await worker.processOrderCancellation(db, 'https://example.com', {
    order_id: 'test', seller_id: 'seller', payload: { reason: 'Anulado por Logística. Sin stock' }
  }, { legacy_code: 'LK01514', customer_name: 'Cliente' });
  assert.match(message, /ANULADO: LK01514 \(Jazmín\)/);
  assert.match(message, /Motivo:\*\* Sin stock/);
  assert.match(message, /✅ Cancelados Logística/);
  assert.match(message, /✅ Entregas Actual/);
  assert.doesNotMatch(message, /PEDIDO|Cliente|Sánchez|Registrado en|Retirado de|Motivo de Anulación/);
  assert.doesNotMatch(message, /Anulado desde ERP/);
});

test('imported cancellations send a clean notice without reading or writing Sheets', async () => {
  for (const origin of [{ payload: { source: 'sheet_sync' } }, { submitted_by: null, payload: {} }]) {
    let message;
    const worker = load('src/lib/processOrderCancellation.ts', {
      require: name => name.includes('orderNotificationText') ? load('src/lib/orderNotificationText.ts').exports : ({
        cancelOrderInAllSheets: async () => { throw new Error('Imported cancellations must not touch Sheets'); }
      }),
      URL,
      fetch: async (url, options) => {
        message = JSON.parse(options.body).message;
        return { ok: true, json: async () => ({ ok: true }) };
      }
    }).exports;
    const db = { from: table => {
      assert.equal(table, 'sellers');
      return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data:{full_name:'Jazmín Sánchez'}}) };
    } };
    const result = await worker.processOrderCancellation(db, 'https://example.com', {
      order_id: 'test', seller_id: 'seller', ...origin,
      payload: { ...origin.payload, reason: 'Anulado por Logística. Problemas personales' }
    }, { legacy_code: 'JS25756' });
    assert.equal(message, '🚨 **ANULADO: JS25756 (Jazmín)**\n❌ **Motivo:** Problemas personales');
    assert.equal(result.result.telegramSent, true);
    assert.equal(result.result.cancellationSync.skipped, true);
    assert.equal(result.warnings.length, 0);
  }
});

test('manual cancellation retains detailed errors in the ERP but omits API internals from Telegram', async () => {
  let message;
  let sheetCalls = 0;
  const rawError = 'Google Sheets API error: 429 { "code": 429, "status": "RESOURCE_EXHAUSTED" }';
  const worker = load('src/lib/processOrderCancellation.ts', {
    require: name => name.includes('orderNotificationText') ? load('src/lib/orderNotificationText.ts').exports : ({
      cancelOrderInAllSheets: async () => {
        sheetCalls++;
        return { seller: { success: false, message: rawError }, central: { success: false, message: rawError },
          cancelledSheet: { success: false, message: rawError }, deliveriesCurrent: { success: false, message: rawError } };
      }
    }),
    URL,
    fetch: async (url, options) => {
      message = JSON.parse(options.body).message;
      return { ok: true, json: async () => ({ ok: true }) };
    }
  }).exports;
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({data:{full_name:'Jazmín'}}) }) };
  const result = await worker.processOrderCancellation(db, 'https://example.com', {
    order_id: 'test', seller_id: 'seller', submitted_by: 'user', payload: { source: 'erp', reason: 'Problemas personales' }
  }, { legacy_code: 'JS25756' });
  assert.equal(sheetCalls, 1);
  assert.match(message, /ANULADO: JS25756/);
  assert.match(message, /sincronización quedó pendiente/);
  assert.doesNotMatch(message, /429|RESOURCE_EXHAUSTED|Google Sheets|"code"/);
  assert.match(result.warnings.join('\n'), /RESOURCE_EXHAUSTED/);
});
