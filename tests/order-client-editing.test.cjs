const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
function run(expression, context) {
  return vm.runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
}
function event(node, name) {
  const attrs = node.attributes || node.openingElement.attributes;
  return attrs.properties.find(p => p.name?.getText(ast) === name).initializer.expression.getText(ast);
}

test('Editing a selected client keeps client, address and the rest of the order intact', () => {
  const button = nodes.find(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'button' && n.getText(ast).includes("'Editar datos'"));
  assert.ok(button);
  const state = { isEditingClientDetails: false, selectedClientId: 'client-1', direccion: 'Mitre 123', newClientPhones: ['111', '222'], orderItems: ['tank'] };
  const before = JSON.stringify(state);
  const context = new Proxy({ setIsEditingClientDetails(update) { state.isEditingClientDetails = update(state.isEditingClientDetails); } }, {
    get(target, key) { if (!(key in target)) throw Error(`Unexpected state access: ${String(key)}`); return target[key]; }
  });
  const toggle = run(event(button, 'onClick'), context);
  toggle();
  assert.equal(state.isEditingClientDetails, true);
  toggle();
  assert.equal(JSON.stringify(state), before);
});

test('Editing and adding phones retains other numbers', () => {
  const input = nodes.find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'input' && n.getText(ast).includes('prev.map((value, i)'));
  let phones = ['111', '222'];
  const context = { index: 0, setNewClientPhones(update) { phones = update(phones); } };
  run(event(input, 'onChange'), context)({ target: { value: '333' } });
  assert.deepEqual(Array.from(phones), ['333', '222']);
  const add = nodes.find(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'button' && n.getText(ast).includes('Agregar teléfono'));
  run(event(add, 'onClick'), context)();
  assert.deepEqual(Array.from(phones), ['333', '222', '']);
});

test('Both create and update persist all edited contact data', () => {
  const snapshots = nodes.filter(n => ts.isPropertyAssignment(n) && n.name.getText(ast) === 'customer_snapshot');
  assert.equal(snapshots.length, 2);
  for (const snapshot of snapshots) {
    const result = run(snapshot.initializer.getText(ast), { isNewClient: false, cliente: 'Updated name', newClientName: 'Updated name', newClientTaxId: '12345678', newClientPhones: ['111', '222', '333'] });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { name: 'Updated name', tax_id: '12345678', phone_primary: '111', phone_secondary: '222, 333' });
  }
});

test('Sheet and notification payloads use edited phones for every seller', () => {
  const declarations = nodes.filter(n => ts.isVariableDeclaration(n) && ['clientPhone', 'clientPhone2'].includes(n.name.getText(ast)) && n.initializer?.getText(ast).includes('newClientPhones.map'));
  assert.equal(declarations.length, 5);
  for (const declaration of declarations) {
    const value = run(declaration.initializer.getText(ast), { newClientPhones: ['111', '222', '333'], cleanPhoneForSaving: value => value });
    assert.equal(value, declaration.name.getText(ast) === 'clientPhone' ? '111' : '222, 333');
  }
});

test('A seller can open the editor with the current phones and delivery address populated', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const selection = nodes.find(n => ts.isConditionalExpression(n) && n.condition.getText(ast) === 'selectedClientId' && n.whenTrue.getText(ast).includes('Cliente Existente Seleccionado'));
  const code = ts.transpileModule(`(${selection.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
  }).outputText;
  const context = {
    React, selectedClientId: 'client-1', isWholesaleContext: false, isAnabelSeller: false,
    isEditingClientDetails: true, cliente: 'Cliente actual', newClientTaxId: '12345678',
    newClientPhones: ['111', '222', '333'], selectedAddressId: 'address-1',
    clientAddresses: [{ id: 'address-1', alias: 'Principal', full_address: 'Mitre 123' }],
    PICKUP_ADDRESS_ID: 'pickup', PICKUP_LABEL: 'Retiro', handleAddressChange() {},
    Plus: () => null, Trash2: () => null
  };
  const html = renderToStaticMarkup(vm.runInNewContext(code, context));
  for (const value of ['Cliente actual', '12345678', '111', '222', '333']) assert.ok(html.includes(`value="${value}"`));
  assert.ok(html.includes('Agregar teléfono'));
  assert.ok(html.includes('Mitre 123'));
  assert.ok(html.includes('Cambiar cliente'));
});
