const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsReceiptPagination.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib });

const regular = id => ({ id, full: false });
const double = id => ({ id, full: true });
const optimize = documents => lib.optimizeTwoUpOrder(documents, document => document.full).map(document => document.id).join(',');

test('moves the following order before an even-position full-page order when it saves a sheet', () => {
  const documents = [regular(1), regular(2), regular(3), double(4), regular(5), regular(6), regular(7)];
  assert.equal(optimize(documents), '1,2,3,5,4,6,7');
});

test('preserves order when the final blank half is unavoidable', () => {
  const documents = [regular(1), regular(2), regular(3), double(4), regular(5), regular(6), regular(7), regular(8)];
  assert.equal(optimize(documents), '1,2,3,4,5,6,7,8');
});

test('handles more than one full-page order and pairs separated odd runs', () => {
  const documents = [regular(1), double(2), regular(3), regular(4), double(5), regular(6)];
  assert.equal(optimize(documents), '1,3,2,4,6,5');
});

test('keeps the relative order of regular documents and full-page documents', () => {
  const documents = [regular(1), double(2), regular(3), regular(4), double(5), regular(6), double(7), regular(8)];
  const result = lib.optimizeTwoUpOrder(documents, document => document.full);
  assert.equal(result.filter(document => !document.full).map(document => document.id).join(','), '1,3,4,6,8');
  assert.equal(result.filter(document => document.full).map(document => document.id).join(','), '2,5,7');
});

test('always reaches the minimum sheet count and only reorders when it saves a sheet', () => {
  const sheetCount = documents => {
    let sheets = 0;
    let pending = false;
    for (const document of documents) {
      if (document.full) {
        if (pending) sheets++;
        pending = false;
        sheets++;
      } else if (pending) {
        sheets++;
        pending = false;
      } else {
        pending = true;
      }
    }
    return sheets + (pending ? 1 : 0);
  };

  for (let length = 1; length <= 9; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      const documents = Array.from({ length }, (_, index) => ({ id: index + 1, full: Boolean(mask & (1 << index)) }));
      const result = lib.optimizeTwoUpOrder(documents, document => document.full);
      const fullCount = documents.filter(document => document.full).length;
      const minimum = fullCount + Math.ceil((documents.length - fullCount) / 2);
      assert.equal(sheetCount(result), minimum, `length=${length}, mask=${mask}`);
      if (sheetCount(documents) === minimum) {
        assert.equal(result.map(document => document.id).join(','), documents.map(document => document.id).join(','));
      }
    }
  }
});
