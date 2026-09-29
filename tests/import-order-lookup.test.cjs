const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const orderSync = {};
const lib = {};
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInNewContext(compile('src/lib/orderSync.ts'), { exports: orderSync });
vm.runInNewContext(compile('src/lib/importOrderLookup.ts'), {
  exports: lib, require: () => orderSync
});

function database(exact, grouped) {
  const calls = [];
  return { calls, from: () => ({ select: () => ({
    in: async (_, codes) => { calls.push(['exact', Array.from(codes)]); return exact; },
    or: async filter => { calls.push(['partial', filter]); return grouped; }
  }) }) };
}

test('existing single codes use only the exact lookup, deduplicating incoming codes', async () => {
  const db = database({ data: [{ id: 'a', legacy_code: 'JS25619' }] });
  const orders = await lib.findImportOrders(db, ['JS25619', 'js25619'], 'id, legacy_code');
  assert.equal(orders.length, 1);
  assert.deepEqual(db.calls, [['exact', ['JS25619']]]);
});

test('fallback preserves grouped codes without matching code prefixes', async () => {
  const db = database({ data: [{ id: 'a', legacy_code: 'JS25620' }] }, { data: [
    { id: 'b', legacy_code: 'JS25619 / LK1695' },
    { id: 'c', legacy_code: 'JS256190' }
  ] });
  const orders = await lib.findImportOrders(db, ['JS25619', 'JS25620', 'LK1695'], 'id, legacy_code');
  assert.deepEqual(Array.from(orders, order => order.id), ['a', 'b']);
  assert.equal(db.calls[1][1], 'legacy_code.ilike."%JS25619%",legacy_code.ilike."%LK1695%"');
});

test('failed reads propagate instead of treating existing orders as new', async () => {
  const error = new Error('canceling statement due to statement timeout');
  for (const db of [database({ error }), database({ data: [] }, { error })]) {
    await assert.rejects(lib.findImportOrders(db, ['JS25619'], 'id, legacy_code'), /statement timeout/);
  }
});

test('empty batches do not query the database', async () => {
  const db = database({ data: [] });
  assert.equal((await lib.findImportOrders(db, [], 'id')).length, 0);
  assert.equal(db.calls.length, 0);
});
