const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
function compile(file, imports = require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: imports, URL, Date, Intl, JSON, Number, Object, Array, Math });
  return exports;
}
const model = compile('src/lib/visits/model.ts');
const { validateCommand } = compile('src/lib/visits/validation.ts', name => name === './model' ? model : require(name));
const now = '2026-10-06T10:00:00-03:00', id = randomUUID();
test('a lost opportunity requires reason and explanation; Other cannot be empty', () => {
  assert.throws(() => validateCommand('outcome', { outcome: 'lost', body: 'No cerró' }), /motivo/);
  assert.throws(() => validateCommand('outcome', { outcome: 'lost', reason: 'other', body: ' ' }), /body/);
  validateCommand('outcome', { outcome: 'lost', reason: 'price', body: 'Cliente indicó que excede el presupuesto' });
});
test('pending outcome requires a scheduled next action and a responsible person', () => {
  assert.throws(() => validateCommand('outcome', { outcome: 'pending', reason: 'response', body: 'Esperando respuesta' }), /next_action/);
  assert.throws(() => validateCommand('outcome', { outcome: 'pending', reason: 'response', body: 'Esperando', next_action: 'Llamar', next_at: now }), /referencia/);
  validateCommand('outcome', { outcome: 'pending', reason: 'response', body: 'Esperando', next_action: 'Llamar', next_at: now, next_owner_id: id });
});
test('kit of interest is required even when there is no order or installer', () => {
  const data = { customer_name: 'Cliente', phone: '1100000000', locality: 'La Plata', request_reason: 'Visita', seller_id: id };
  assert.throws(() => validateCommand('create', data), /referencia/);
  validateCommand('create', { ...data, kit_id: id });
});
test('confirmed appointments require both agreements and real time slots', () => {
  const data = { mode: 'onsite', status: 'confirmed', date: '2026-10-10', start_time: '10:00', end_time: '11:00' };
  assert.throws(() => validateCommand('appointment', data), /confirmación/);
  assert.throws(() => validateCommand('appointment', { ...data, client_confirmed: true, installer_confirmed: true, end_time: '09:00' }), /franja/);
  assert.throws(() => validateCommand('appointment', { ...data, client_confirmed: true, installer_confirmed: true, date: '2026-02-31' }), /fecha/);
  validateCommand('appointment', { ...data, client_confirmed: true, installer_confirmed: true });
});
test('creation permits installer coordination of either day or time without inventing a slot',()=>{
 const data={customer_name:'Cliente',phone:'1100000000',locality:'La Plata',request_reason:'Visita',seller_id:id,kit_id:id};
 for(const scheduling of [{scheduled_date:'',scheduled_time:''},{scheduled_date:'2026-10-15',scheduled_time:''},{scheduled_date:'',scheduled_time:'15:00'},{scheduled_date:'2026-10-15',scheduled_time:'15:00'}])validateCommand('create',{...data,...scheduling});
 assert.throws(()=>validateCommand('create',{...data,scheduled_time:'25:00'}),/hora/);
});
test('reported visit payments and deposits keep valid money and a known payment concept',()=>{
 const payment={amount:50000,body:'Comprobante informado',method:'Transferencia',receiver:'Juan',at:now};
 validateCommand('payment',payment);
 for(const payment_kind of ['visit','deposit'])validateCommand('payment',{...payment,payment_kind});
 assert.throws(()=>validateCommand('payment',{...payment,payment_kind:'unknown'}),/visita o seña/);
 assert.throws(()=>validateCommand('payment',{...payment,payment_kind:'deposit',amount:-1}),/importe/);
});
test('quote arithmetic rounds each line and invalid prices and quantities are rejected', () => {
  const lines = [{ description: 'Adicional', quantity: 1.5, unit_price: 100.15 }, { description: 'Kit', quantity: 1, unit_price: 1000 }];
  assert.equal(model.quoteTotal(lines), 1150.23);
  const data = { kit_id: id, lines, conditions: 'Pago acordado', valid_until: '2099-12-31', status: 'sent', communicated_at: now };
  validateCommand('quote', data);
  for (const bad of [-1, Infinity, NaN, 1.001]) assert.throws(() => validateCommand('quote', { ...data, lines: [{ description: 'Kit', quantity: 1, unit_price: bad }] }));
  assert.throws(() => validateCommand('quote', { ...data, lines: [{ description: 'Kit', quantity: 0, unit_price: 1 }] }), /cantidad/);
});
test('revisits count once for conversion and pending cases stay visible', () => {
  const stats = model.summarizeVisits([{ visit_count: 3, outcome: 'won' }, { visit_count: 1, outcome: 'pending' }, { visit_count: 1, outcome: 'lost', outcome_reason: 'price' }, { visit_count: 0, outcome: 'pending' }]);
  assert.equal(stats.appointments, 5); assert.equal(stats.opportunities, 3); assert.equal(stats.won, 1); assert.equal(stats.conversion, 33); assert.equal(stats.pending, 1); assert.equal(stats.reasons.price, 1);
});
test('dates display in Argentina and unsafe external URLs never render', () => {
  assert.equal(model.localDate('2026-10-07T01:00:00Z'), '2026-10-06');
  assert.equal(model.safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(model.safeExternalUrl('data:text/html,hello'), '');
  assert.equal(model.safeExternalUrl('https://maps.google.com/'), 'https://maps.google.com/');
});
test('installer navigation is limited; sellers including restricted accounts can use visits', () => {
  const nav = compile('src/lib/erpNavigation.ts');
  const paths = roles => nav.visibleErpModules({ roles, restrictedSeller: false, canUseWholesale: false }).flatMap(m => m.links.map(l => l.href));
  assert.deepEqual(Array.from(paths(['instalador'])), ['/visitas']);
  assert.ok(paths(['seller']).includes('/visitas')); assert.ok(paths(['admin']).includes('/visitas'));
  assert.ok(nav.visibleErpModules({ roles: ['seller'], restrictedSeller: true, canUseWholesale: false }).some(m => m.links.some(l => l.href === '/visitas')));
  assert.ok(paths(['instalador', 'compras']).includes('/admin/compras?tab=purchase_orders'));
});

test('kits show self-cleaning first and conventional kits in ascending litres without mutating input',()=>{const names=['Kit Convencional 3000L','Kit Convencional 600L','Kit Autolimpiante 700L','Kit Convencional 500L','Kit Convencional 1000L','Kit Convencional 750L'];const kits=names.map((name,i)=>({id:String(i),name,sku:null,price:0}));const sorted=model.sortVisitKits(kits);assert.deepEqual(Array.from(sorted,k=>k.name),['Kit Autolimpiante 700L','Kit Convencional 500L','Kit Convencional 600L','Kit Convencional 750L','Kit Convencional 1000L','Kit Convencional 3000L']);assert.deepEqual(kits.map(k=>k.name),names);});
