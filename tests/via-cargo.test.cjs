const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const model = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/viaCargo.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: model, URL, Object });
const destination = () => ({ ...model.emptyViaCargoDestination(), name: 'Ana Pérez', document: '12345678', phone: '3511234567', province: 'Córdoba', locality: 'Córdoba', postal_code: '5000' });

test('same-client recipients resolve current contact details without mutating saved snapshots', () => {
  assert.equal(model.emptyViaCargoDestination().same_as_client, true);
  const saved = destination();
  const client = { name: 'Cliente actualizado', document: '87654321', phone: '1199999999' };
  const resolved = model.resolveViaCargoRecipient(saved, client);
  assert.equal(resolved.name, client.name);
  assert.equal(resolved.document, client.document);
  assert.equal(resolved.phone, client.phone);
  assert.equal(saved.name, 'Ana Pérez');
  assert.ok(model.deliveryDetailForShipping('', '', resolved).includes(client.document));
  assert.ok(model.validateViaCargo(model.resolveViaCargoRecipient(saved, { ...client, document: '' })));
  for (const same_as_client of [false, undefined]) {
    const separate = model.resolveViaCargoRecipient({ ...saved, same_as_client }, client);
    assert.equal(separate.name, 'Ana Pérez');
    assert.equal(separate.document, saved.document);
  }
});

test('every recipient field including CP is required even when mode is pending', () => {
  assert.equal(model.validateViaCargo(destination()), null);
  for (const key of ['name', 'document', 'phone', 'province', 'locality', 'postal_code']) {
    assert.ok(model.validateViaCargo({ ...destination(), [key]: '   ' }), key);
  }
});
test('branch and home require their own destination; pending permits neither', () => {
  assert.ok(model.validateViaCargo({ ...destination(), mode: 'branch' }));
  assert.equal(model.validateViaCargo({ ...destination(), mode: 'branch', branch: 'Terminal Córdoba' }), null);
  assert.ok(model.validateViaCargo({ ...destination(), mode: 'home' }));
  assert.equal(model.validateViaCargo({ ...destination(), mode: 'home', address: 'Mitre 540, 2 B' }), null);
  assert.ok(model.validateViaCargo({ ...destination(), mode: 'invalid' }));
});
test('maps is optional and only accepts web links', () => {
  for (const maps_url of ['', 'https://maps.app.goo.gl/example', 'https://www.google.com/maps?q=Cordoba']) assert.equal(model.validateViaCargo({ ...destination(), maps_url }), null);
  for (const maps_url of ['javascript:alert(1)', 'not a url', 'file:///private']) assert.ok(model.validateViaCargo({ ...destination(), maps_url }));
});
test('regular delivery CP stays optional and additional instructions survive', () => {
  assert.equal(model.deliveryDetailForShipping('Llamar antes', '', null), 'Llamar antes');
  assert.equal(model.deliveryDetailForShipping('Llamar antes', ' B1878ABC ', null), 'CP: B1878ABC\nLlamar antes');
});
test('sheet detail includes recipient, CP, maps, references and additional instructions without inactive destinations', () => {
  const d = { ...destination(), mode: 'home', address: 'Mitre 540', branch: 'Sucursal anterior', maps_url: 'https://maps.app.goo.gl/example', references: 'Portón verde' };
  const text = model.deliveryDetailForShipping('No apilar', '', d);
  for (const expected of ['VÍA CARGO — ENTREGA A DOMICILIO', 'Ana Pérez', '12345678', '3511234567', 'Córdoba', 'CP: 5000', 'Mitre 540', d.maps_url, 'Portón verde', 'No apilar']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes('Sucursal anterior'));
  const pending = model.deliveryDetailForShipping('', '', { ...d, mode: 'pending' });
  assert.ok(pending.includes('PENDIENTE:'));
  assert.ok(pending.includes('Dirección de destino: Mitre 540'));
  const branch = model.deliveryDetailForShipping('', '', { ...d, mode: 'branch' });
  assert.ok(branch.includes('Dirección de destino: Mitre 540'));
  assert.ok(!model.deliveryDetailForShipping('', '', { ...d, mode: 'pending', address: '' }).includes('Dirección de destino:'));
});
