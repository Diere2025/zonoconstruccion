const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/scheduledSheetImportAccess.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject });
const { authenticateScheduledSheetImport } = exportsObject;
const runId = '01234567-1234-1234-1234-012345678901';
const token = 'a'.repeat(64);
const body = () => ({ sheetName: 'Jazmín Sánchez (Automático)', defaultSellerId: '13430e05-b61a-4a3f-9fc3-152d377c4b0c', defaultChannel: 'web_organica', isCentralSheet: false, skipENC: true, skipCAMB: false, syncPaymentMethods: false, importRunId: runId, rows: [Array(34).fill('')] });
const request = (value, headers = {}) => new Request('https://example.test/api/admin/import-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-scheduled-sheet-sync-token': token, 'x-scheduled-sheet-sync-run': runId, ...headers }, body: JSON.stringify(value) });

test('accepts only the configured source, options and an active run authorized by the database', async () => {
  let calls = 0;
  const db = { rpc: async (name, args) => { calls++; assert.equal(name, 'authorize_scheduled_sheet_import'); assert.equal(args.p_id, runId); assert.equal(args.p_source, 'Jazmín Sánchez'); return { data: true, error: null }; } };
  const req = request(body());
  assert.equal(await authenticateScheduledSheetImport(req, db), true);
  assert.equal((await req.json()).rows.length, 1, 'the importer can still consume its request body');
  assert.equal(calls, 1);
});

test('rejects source, seller, channel, flags, run identity and batch tampering before database calls', async () => {
  const variants = [
    { sheetName: 'Otro' }, { defaultSellerId: 'other' }, { defaultChannel: 'mayorista' }, { isCentralSheet: true },
    { skipENC: false }, { skipCAMB: true }, { syncPaymentMethods: true }, { importRunId: 'other' },
    { rows: [] }, { rows: Array(21).fill(Array(34).fill('')) }, { rows: [Array(34).fill({})] }, { rows: [['short']] },
  ];
  const db = { rpc: async () => { throw Error('Must not reach database'); } };
  for (const variant of variants) assert.equal(await authenticateScheduledSheetImport(request({ ...body(), ...variant }), db), false);
  assert.equal(await authenticateScheduledSheetImport(request(body(), { 'x-scheduled-sheet-sync-token': 'bad' }), db), false);
  assert.equal(await authenticateScheduledSheetImport(request(body(), { 'x-scheduled-sheet-sync-run': 'bad' }), db), false);
});

test('invalid token, expired lease, preview, wrong stage and database errors fail closed', async () => {
  for (const result of [{ data: false, error: null }, { data: null, error: { message: 'Denied' } }]) {
    assert.equal(await authenticateScheduledSheetImport(request(body()), { rpc: async () => result }), false);
  }
});
