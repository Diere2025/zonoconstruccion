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
    require: () => ({ cancelOrderInAllSheets: async () => ({
      seller: { success: true }, central: { success: true },
      cancelledSheet: { success: true }, deliveriesCurrent: { success: true }
    }) }),
    URL,
    fetch: async (url, options) => {
      message = JSON.parse(options.body).message;
      return { ok: true, json: async () => ({ ok: true }) };
    }
  }).exports;
  await worker.processOrderCancellation({}, 'https://example.com', {
    order_id: 'test', seller_id: 'seller', payload: { reason: 'Anulado por Logística. Sin stock' }
  }, { legacy_code: 'LK01514', customer_name: 'Cliente' });
  assert.match(message, /Motivo de Anulación:\*\* Anulado por Logística\. Sin stock/);
  assert.doesNotMatch(message, /Anulado desde ERP/);
});
