const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, extras = {}) {
  const exports = {};
  const context = vm.createContext({ exports, console, ...extras });
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  return { exports, context };
}
const properties = (title, sheetId, rowCount = 100, columnCount = 84) => ({ properties: { title, sheetId, gridProperties: { rowCount, columnCount } } });
const maintenance = load('src/lib/sellerSheetMaintenance.ts').exports;

test('avoids protected codes and formulas, including overlapping warning protections', () => {
  const sheet = properties('Pendientes', 73);
  sheet.protectedRanges = [
    { range: { sheetId: 73, startColumnIndex: 0, endColumnIndex: 2 } },
    { range: { sheetId: 73, startColumnIndex: 25, endColumnIndex: 26 } },
    { range: { sheetId: 73, startColumnIndex: 25, endColumnIndex: 26 }, warningOnly: true },
    { range: { sheetId: 73, startColumnIndex: 28, endColumnIndex: 30 }, unprotectedRanges: [{ sheetId: 73, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 29, endColumnIndex: 30 }] }
  ];
  const requests = maintenance.buildSellerRowMaintenanceRequests(sheet, [7, 9], [properties('DATABASE', 2)], 'TANQUES', new Map());
  for (const request of requests) {
    const range = (request.repeatCell || request.setDataValidation).range;
    for (let col = range.startColumnIndex; col < range.endColumnIndex; col++) {
      assert.ok(![0, 1, 25, 28].includes(col));
      if (range.startRowIndex === 6) assert.notEqual(col, 29);
    }
  }
  assert.ok(requests.some(r => r.repeatCell?.range.startRowIndex === 8 && r.repeatCell.range.startColumnIndex === 29));
});

test('repairs only the selected rows, shifts delivery columns and preserves cell contents', () => {
  const sheet = properties('Pendientes', 73);
  const requests = maintenance.buildSellerRowMaintenanceRequests(sheet, [7, 9],
    [properties('DATABASE', 2), properties('Data Ads', 3)], 'TANQUES', new Map());
  for (const request of requests) {
    const operation = request.repeatCell || request.setDataValidation;
    assert.equal(operation.range.sheetId, 73);
    assert.ok([6, 8].includes(operation.range.startRowIndex));
    assert.equal(operation.range.endRowIndex, operation.range.startRowIndex + 1);
    assert.ok(!operation.cell?.userEnteredValue);
    assert.ok(!operation.fields?.includes('userEnteredValue'));
  }
  const validation = requests.find(r => r.setDataValidation?.range.startColumnIndex === 9 && r.setDataValidation.rule);
  assert.equal(validation.setDataValidation.rule.condition.values[0].userEnteredValue, "='Data Ads'!$A:$A");
  assert.equal(validation.setDataValidation.rule.strict, false);
  const total = requests.find(r => r.repeatCell?.range.startColumnIndex === 29);
  assert.equal(total.repeatCell.cell.userEnteredFormat.horizontalAlignment, 'CENTER');
});

test('extends missing rows and applies category and existing zone colors', () => {
  const colors = properties('FormatoColores', 4);
  colors.data = [{ rowData: [{ values: [
    { formattedValue: 'TANQUES', userEnteredFormat: { backgroundColor: { red: 1 }, textFormat: { bold: true } } },
    { formattedValue: 'SUR', userEnteredFormat: { backgroundColor: { green: 1 } } }
  ] }] }];
  const requests = maintenance.buildSellerRowMaintenanceRequests(properties('Pendientes', 73, 5), [7], [colors], 'tanques', new Map([[7, 'Sur']]));
  assert.equal(requests[0].appendDimension.length, 2);
  const category = requests.filter(r => r.repeatCell?.range.startColumnIndex === 20).at(-1);
  assert.equal(category.repeatCell.cell.userEnteredFormat.backgroundColor.red, 1);
  const zone = requests.filter(r => r.repeatCell?.range.startColumnIndex === 13).at(-1);
  assert.equal(zone.repeatCell.cell.userEnteredFormat.backgroundColor.green, 1);
});

function integration(failRepair = false, itemCount = 1) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith('?fields=sheets.properties') || url.includes('protectedRanges(')) return { ok: true, json: async () => ({ sheets: [properties('Pendientes', 73), properties('DATABASE', 2)] }) };
    if (url.includes('ranges=')) return { ok: true, json: async () => ({ sheets: [] }) };
    if (url.endsWith(':batchUpdate') && !url.includes('/values:')) return { ok: !failRepair, status: 403, text: async () => 'protected range' };
    if (url.includes('valueRenderOption=FORMULA')) return { ok: true, json: async () => ({ values: [['=custom_existing_formula']] }) };
    if (url.endsWith('/values:batchUpdate')) return { ok: true };
    throw new Error('Unexpected URL: ' + url);
  };
  const sheets = load('src/lib/googleSheets.ts', {
    fetch, process: { env: {} },
    require(name) {
      if (name === './orderCategory') { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/orderCategory.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports}); return exports; } return load(`src/lib/${name.slice(2)}.ts`, { fetch }).exports; }
  });
  sheets.context.slots = Array.from({ length: Math.ceil(itemCount / 12) }, (_, i) => ({ code: 'TEST' + i, rowNumber: 7 + i }));
  vm.runInContext("getGoogleAccessToken = async () => 'test-token'; getNextAvailableSheetSlots = async () => slots", sheets.context);
  const order = { clientName: 'Cliente', category: 'TANQUES', items: Array.from({ length: itemCount }, () => ({ name: 'Tanque', quantity: 1, unitPrice: 100 })) };
  return { calls, run: () => sheets.exports.appendOrderToSellerSheet('test-sheet', 'Pendientes', order) };
}

test('restores formats and missing formulas before writing all rows of a split order', async () => {
  const { calls, run } = integration(false, 13);
  await run();
  const formatIndex = calls.findIndex(call => call.body?.requests);
  const writes = calls.filter(call => call.body?.data);
  assert.equal(writes.length, 4); // formula repair + order data for each row
  assert.ok(formatIndex < calls.findIndex(call => call.body?.data));
  assert.ok(writes[0].body.data.every(update => !update.range.endsWith('!Z7')));
  assert.equal(writes[0].body.data.find(update => update.range.endsWith('!AH7')).values[0][0], '=AF7*AG7');
  assert.ok(writes[1].body.data.some(update => update.range === "'Pendientes'!F7:H7"));
  assert.ok(writes[3].body.data.some(update => update.range === "'Pendientes'!F8:H8"));
});

test('does not load an order if row maintenance fails', async () => {
  const { calls, run } = integration(true);
  await assert.rejects(run(), /restaurar formatos y validaciones/);
  assert.ok(!calls.some(call => call.body?.data));
});
