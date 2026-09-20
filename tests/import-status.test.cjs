const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/importStatus.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib });

test('marks Jazmin orders reported as cancelled by Central as processed', () => {
  assert.equal(lib.isJazminCentralCancellation(lib.JAZMIN_SELLER_ID, 'Cancelado'), true);
  assert.equal(lib.isJazminCentralCancellation(lib.JAZMIN_SELLER_ID, '❌ Cancelado'), true);
});

test('does not apply the rule to other sellers or other statuses', () => {
  assert.equal(lib.isJazminCentralCancellation('other-seller', 'Cancelado'), false);
  assert.equal(lib.isJazminCentralCancellation(lib.JAZMIN_SELLER_ID, 'Anulado'), false);
  assert.equal(lib.isJazminCentralCancellation(lib.JAZMIN_SELLER_ID, 'Pendiente'), false);
});

test('both import modes apply the Jazmin processed-status rule without Telegram dispatch', () => {
  for (const path of ['src/app/api/admin/import-sheet/route.ts', 'src/app/api/admin/import-job/route.ts']) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /isJazminCentralCancellation/);
    assert.match(source, /setOrderStatusInSellerSheetByCode/);
    assert.doesNotMatch(source, /sendTelegram|telegram-notify|api\.telegram\.org/i);
  }
});
