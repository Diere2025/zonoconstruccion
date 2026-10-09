const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/adaptiveImportBatch.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib });

test('grows only after two consecutive fast full batches and caps at twenty', () => {
  const batch = lib.createAdaptiveImportBatch();
  assert.equal(batch.size, 5);
  assert.equal(batch.observe(3000, false, 5), 5);
  assert.equal(batch.observe(3000, false, 5), 10);
  assert.equal(batch.observe(3000, false, 10), 10);
  assert.equal(batch.observe(3000, false, 10), 20);
  for (let i=0; i<10; i++) assert.equal(batch.observe(1000, false, 20), 20);
});

test('slow batches and problems reduce size, while partial tails cannot trigger growth', () => {
  const batch = lib.createAdaptiveImportBatch();
  batch.observe(1000, false, 5);
  assert.equal(batch.observe(1000, false, 2), 5);
  assert.equal(batch.observe(1000, false, 5), 5);
  assert.equal(batch.observe(1000, false, 5), 10);
  assert.equal(batch.observe(8000, false, 10), 5);
  batch.observe(1000, false, 5);
  batch.observe(1000, false, 5);
  assert.equal(batch.observe(1000, true, 10), 5);
  assert.equal(batch.observe(NaN, false, 5), 5);
  assert.equal(lib.createAdaptiveImportBatch().size, 5);
});

test('variable slices cover every row once despite a failed batch recovered individually', () => {
  const batch = lib.createAdaptiveImportBatch();
  const rows = Array.from({length:87}, (_, i) => i);
  const handled = [];
  const sizes = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const chunk = rows.slice(cursor, cursor + batch.size);
    sizes.push(chunk.length);
    const failed = cursor === 30;
    if (failed) for (const row of chunk) handled.push(row);
    else handled.push(...chunk);
    cursor += chunk.length;
    batch.observe(1500, failed, chunk.length);
  }
  assert.deepEqual(handled, rows);
  assert.deepEqual(sizes, [5,5,10,10,20,10,10,17]);
});

test('page loop recovers a failed large batch and continues without dropping or duplicating rows', async () => {
  const source = fs.readFileSync('src/app/admin/importar-pedidos/page.tsx', 'utf8');
  const start = source.indexOf('        if (targetRows.length > 0) {');
  const end = source.indexOf('        if (cancelImportRef.current) break;\n        sheetsDone++', start);
  assert.ok(start >= 0 && end > start);
  const targetRows = Array.from({length:87}, (_, i) => ['', 'DB' + i]);
  const applied = [];
  let failedLargeBatch = false;
  const requests = [];
  const context = {
    exports: {}, createAdaptiveImportBatch: lib.createAdaptiveImportBatch,
    targetRows, sheet:{name:'Test',isCentralSheet:false}, sheets:[{}],
    cancelImportRef:{current:false}, skipENC:false,skipCAMB:false,syncPaymentMethods:false,
    totalImported:0,totalUpdated:0,totalItemsImported:0,sheetsDone:0,stepBase:20,
    problemCount:0,failedCodes:new Set(),
    addLog:()=>{},setStats:()=>{},setProgressPercent:()=>{},sanitizeErrorMessage:String,
    fetch:async (_, options) => {
      const body = JSON.parse(options.body);
      requests.push(body.rows.length);
      if (body.rows.length === 20 && !failedLargeBatch) {
        failedLargeBatch = true;
        return {ok:false,clone:()=>({text:async ()=>'statement timeout'}),text:async ()=>'statement timeout'};
      }
      applied.push(...body.rows.map(row=>row[1]));
      return {ok:true,json:async ()=>({totalImported:body.rows.length})};
    }
  };
  const wrapped = 'exports.run = async function() { ' + source.slice(start,end) + ' };';
  vm.runInNewContext(ts.transpileModule(wrapped, {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,context);
  await context.exports.run();
  assert.deepEqual(applied,targetRows.map(row=>row[1]));
  assert.equal(context.totalImported,87);
  assert.equal(context.failedCodes.size,0);
  assert.equal(failedLargeBatch,true);
  assert.deepEqual(requests.slice(0,5),[5,5,10,10,20]);
  assert.equal(requests.filter(size=>size===1).length,20);
  assert.deepEqual(requests.slice(-3),[10,10,17]);
});
