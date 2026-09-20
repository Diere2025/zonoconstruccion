const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/orderSync.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Map, Set, Promise });

test('active order matching is exact, supports merged codes and ignores closed orders', () => {
  const active = lib.activeOrderCodes([
    { legacy_code: 'DB10 / AQU20, aq-30', status: 'Pendiente' },
    { legacy_code: 'DB2', status: 'Entregado' }
  ]);
  assert.equal(lib.hasActiveOrder('DB1', active), false);
  assert.equal(lib.hasActiveOrder(' db10 ', active), true);
  assert.equal(lib.hasActiveOrder('DB2', active), false);
  assert.equal(lib.hasActiveOrder('unknown / AQ-30', active), true);
  assert.equal(lib.hasActiveOrder('', active), false);
});

test('central and wholesale share one download per run, but later runs fetch again', async () => {
  let calls = 0;
  const loader = async () => { calls++; return ['row']; };
  const read = lib.oncePerKey(loader);
  const [central, wholesale] = await Promise.all([read('same-sheet'), read('same-sheet')]);
  assert.equal(calls, 1);
  assert.equal(central, wholesale);
  await lib.oncePerKey(loader)('same-sheet');
  assert.equal(calls, 2);
});

test('failed downloads can be retried, not cached forever', async () => {
  let calls = 0;
  const read = lib.oncePerKey(async () => {
    if (++calls === 1) throw new Error('offline');
    return 'ok';
  });
  await assert.rejects(read('sheet'), /offline/);
  assert.equal(await read('sheet'), 'ok');
});

test('cancelled and partial runs never report success', () => {
  assert.equal(lib.syncOutcome(true, 0), 'cancelled');
  assert.equal(lib.syncOutcome(true, 2), 'cancelled');
  assert.equal(lib.syncOutcome(false, 1), 'partial');
  assert.equal(lib.syncOutcome(false, 0), 'success');
});

test('logistics accepts wholesale AQ codes with hyphen and retains existing codes', () => {
  for (const code of ['AQ-123', ' aq-001 ', 'AQU123', 'POW123', 'DB0066', 'CAMB12']) {
    assert.equal(lib.isLogisticsOrderCode(code), true, code);
  }
  for (const code of ['', 'AQ-', 'AQ--123', 'ORIG-AQ-123', 'AQ-FP123', 'Pedido', 'AQ-123 / DB12']) {
    assert.equal(lib.isLogisticsOrderCode(code), false, code);
  }
});
