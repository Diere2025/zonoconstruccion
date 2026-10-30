const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => imports[name], URL, Object, Error });
  return exports;
}
const model = load('src/lib/viaCargo.ts');
const { saveViaCargoDestination } = load('src/lib/viaCargoDestinations.ts', { './viaCargo': model });
const destination = { ...model.emptyViaCargoDestination(), name: 'Ana Pérez', document: '12345678', phone: '3511234567', province: 'Córdoba', locality: 'Córdoba', postal_code: '5000' };
function fixture(updateResult = { data: { id: 'existing' }, error: null }) {
  const operations = [];
  const client = { from(table) {
    assert.equal(table, 'addresses');
    const query = {
      update(values) { operations.push({ operation: 'update', values, filters: [] }); return query; },
      insert(values) { operations.push({ operation: 'insert', values, filters: [] }); return query; },
      eq(...args) { operations.at(-1).filters.push(args); return query; },
      not(...args) { operations.at(-1).filters.push(args); return query; },
      select() { return query; },
      maybeSingle: async () => updateResult,
      single: async () => ({ data: { id: 'new' }, error: null }),
    };
    return query;
  } };
  return { client, operations };
}
test('saving a new order automatically saves its reusable destination', async () => {
  const { client, operations } = fixture();
  assert.equal(await saveViaCargoDestination(client, 'client', destination, ''), 'new');
  assert.equal(operations.length, 1);
  assert.equal(operations[0].operation, 'insert');
  assert.equal(operations[0].values.client_id, 'client');
  assert.equal(operations[0].values.postal_code, '5000');
  assert.equal(operations[0].values.is_default, false);
});
test('a reused destination updates automatically within the client, retaining independent snapshots', async () => {
  const { client, operations } = fixture();
  const historical = { via_cargo: { ...destination } };
  assert.equal(await saveViaCargoDestination(client, 'client', { ...destination, name: 'Otro destinatario' }, 'existing'), 'existing');
  assert.equal(operations.length, 1);
  assert.equal(operations[0].operation, 'update');
  assert.deepEqual(operations[0].filters, [['id', 'existing'], ['client_id', 'client'], ['via_cargo', 'is', null]]);
  assert.equal(historical.via_cargo.name, 'Ana Pérez');
});
test('a deleted destination is recreated; failed updates and invalid data never create duplicates', async () => {
  const missing = fixture({ data: null, error: null });
  assert.equal(await saveViaCargoDestination(missing.client, 'client', destination, 'deleted'), 'new');
  assert.equal(missing.operations[1].operation, 'insert');
  const failed = fixture({ data: null, error: new Error('No access') });
  await assert.rejects(saveViaCargoDestination(failed.client, 'client', destination, 'existing'), /No access/);
  assert.equal(failed.operations.length, 1);
  const invalid = fixture();
  await assert.rejects(saveViaCargoDestination(invalid.client, 'client', { ...destination, postal_code: '' }, ''), /código postal/);
  assert.equal(invalid.operations.length, 0);
});
