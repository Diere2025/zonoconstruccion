const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let addressChange;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleAddressChange') addressChange = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

function harness() {
  const state = {};
  const context = {
    PICKUP_ADDRESS_ID: 'retiro_deposito_fabrica',
    PICKUP_LABEL: 'Retiro en depósito/fábrica',
    selectedClientId: 'saved-client',
    manualAddressClientIdRef: { current: '' },
    localities: [
      { id: 'depot', name: 'Depósito' },
      { id: 'home-city', name: 'Quilmes', zones: { delivery_times: { name: 'Flete Regular' } } }
    ],
    clientAddresses: [{ id: 'home', full_address: 'Mitre 540', locality_id: 'home-city', map_link: 'https://maps.example/home', delivery_notes: 'Timbre' }]
  };
  for (const field of ['SelectedAddressId', 'IsLocalityDropdownOpen', 'Direccion', 'LocalidadId', 'LocalitySearch', 'LinkMaps', 'Aclaraciones', 'Flete', 'IsFreeShipping', 'ShippingCost']) {
    context[`set${field}`] = value => { state[field] = value; };
  }
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`const changeAddress = ${addressChange};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { state, context, change(value) { context.value = value; vm.runInContext('changeAddress(value)', context); } };
}

test('A saved client can choose pickup without changing the saved address', () => {
  const form = harness();
  form.change('retiro_deposito_fabrica');
  assert.equal(form.state.SelectedAddressId, 'retiro_deposito_fabrica');
  assert.equal(form.state.LocalidadId, 'depot');
  assert.equal(form.state.Direccion, 'Retiro en depósito/fábrica');
  assert.equal(form.state.Flete, 'Retiro en depósito/fábrica');
  assert.equal(form.state.IsFreeShipping, true);
  assert.equal(form.state.ShippingCost, 0);
  assert.equal(form.context.clientAddresses[0].full_address, 'Mitre 540');
  assert.equal(form.context.manualAddressClientIdRef.current, 'saved-client');
});

test('Switching back restores the saved destination and delivery type', () => {
  const form = harness();
  form.change('retiro_deposito_fabrica');
  form.change('home');
  assert.equal(form.state.SelectedAddressId, 'home');
  assert.equal(form.state.Direccion, 'Mitre 540');
  assert.equal(form.state.LocalidadId, 'home-city');
  assert.equal(form.state.LinkMaps, 'https://maps.example/home');
  assert.equal(form.state.Flete, 'Flete Regular');
});

test('Pickup saves without creating an address and is recognized on edit', () => {
  assert.match(source, /else if \(isPickup\) \{[\s\S]*?finalAddressId = null;[\s\S]*?\} else if \(selectedAddressId === "nueva_direccion"/);
  assert.match(source, /const locName = isPickup \? 'Depósito'/);
  assert.match(source, /order\.locality === 'Depósito' && order\.freight_type === PICKUP_LABEL/);
  assert.match(source, /<option value=\{PICKUP_ADDRESS_ID\}>\{PICKUP_LABEL\}<\/option>/);
});
