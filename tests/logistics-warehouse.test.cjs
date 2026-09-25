const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(name, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: name => dependencies[name] });
  return exports;
}
const print = load('logisticsPrintOrders');
const notes = load('logisticsOrderNotes', { './logisticsPrintOrders': print });
const categoryConfig = load('warehouseCategoryConfig');
const warehouse = load('logisticsWarehouse', { './logisticsOrderNotes': notes, './warehouseCategoryConfig': categoryConfig });

function order(code, zone, items) {
  return { id: code, codes: [code], legacyCode: code, deliveryDate: '25/09/2026',
    customerName: code, sourceRows: [Number(code.replace(/\D/g, ''))], trip: { zone, route: zone, carrier: 'Pablo', driver: 'Jorge', vehicle: 'Agrale', companion: 'Benjamín', departure: '7:00' }, items };
}
function item(name, quantity, unitPrice = 10) { return { name, quantity, unitPrice }; }

test('separate totals combine zones and omit discounts', () => {
  const [group] = warehouse.warehouseGroups([
    order('JS10', 'CABA', [item('Tanque 500L', 2), item('Descuento Compra Mayorista', 1, -100)]),
    order('JS11', 'Sur', [item('Tanque 500L', 3), item('Base Hierro', 1)])
  ]);
  assert.equal(group.orders.length, 2);
  assert.deepEqual(Array.from(group.separate, line => [line.name, line.quantity, line.category]), [['Tanque 500L', 5, 'Tanques de agua'], ['Base Hierro', 1, 'Accesorios']]);
  assert.deepEqual(Array.from(group.load, row => row.code), ['JS10', 'JS11']);
  assert.equal(group.load[0].lines.length, 1);
});

test('loading order follows the pasted delivery-order column within each route', () => {
  const first = order('JS10', 'R1', [item('A', 1)]);
  first.deliveryOrder = '12';
  const second = order('JS11', 'R1', [item('B', 1)]);
  second.deliveryOrder = '3';
  const third = order('JS12', 'R2', [item('C', 1)]);
  third.deliveryOrder = '1';
  const [group] = warehouse.warehouseGroups([first, second, third]);
  assert.deepEqual(Array.from(group.load, row => [row.code, row.route, row.deliveryOrder]), [
    ['JS11', 'R1', '3'], ['JS10', 'R1', '12'], ['JS12', 'R2', '1']
  ]);
});

test('delivery order is read from the grid and retained when linked orders merge', () => {
  const first = Array(84).fill('');
  first[1] = 'JS20'; first[2] = '25/09/2026'; first[10] = 'VA CON JS21';
  first[14] = 'R1'; first[15] = '8'; first[30] = 'Tanque 500L'; first[31] = '1';
  const second = [...first];
  second[1] = 'JS21'; second[10] = ''; second[15] = '9';
  const orders = print.mergeLogisticsPrintOrders(print.parseLogisticsPrintRows([first, second]));
  assert.equal(orders[0].deliveryOrder, '8');
  assert.equal(warehouse.warehouseGroups(orders)[0].load[0].deliveryOrder, '8');
});

test('bulk marking follows the product prefixes from the reference sheet', () => {
  assert.equal(warehouse.isBulkyWarehouseProduct('AquaFort - TRIC 500L Gris'), true);
  assert.equal(warehouse.isBulkyWarehouseProduct('BioFort - Autolimpiable 700L'), true);
  assert.equal(warehouse.isBulkyWarehouseProduct('WP Kit cámara de inspección'), true);
  assert.equal(warehouse.isBulkyWarehouseProduct('Cooper Termotanque 80L'), false);
});

test('total separation merges all dates and drivers and uses product categories', () => {
  const first = order('JS20', 'R1', [item('Tanque 500L', 2)]);
  const second = order('JS21', 'R2', [item('Tanque 500L', 3), item('Flotante Eco', 1)]);
  second.deliveryDate = '26/09/2026';
  second.trip.driver = 'Otro chofer';
  assert.equal(warehouse.warehouseGroups([first, second]).length, 2);
  const total = warehouse.warehouseTotalGroup([first, second]);
  assert.deepEqual(Array.from(total.separate, line => [line.name, line.quantity]), [['Tanque 500L', 5], ['Flotante Eco', 1]]);
  assert.equal(total.orders.length, 2);
});

test('printing categories are inferred by product name, independently of catalog categories', () => {
  assert.equal(categoryConfig.warehouseCategory('AquaFort - TRIC 500L'), 'Tanques de agua');
  assert.equal(categoryConfig.warehouseCategory('Base Hierro'), 'Accesorios');
  assert.equal(categoryConfig.warehouseCategory('Equilibrio MEP FRENTES Gris (20Kg)'), 'Pinturas');
  assert.equal(categoryConfig.warehouseCategory('Flotante Eco Varilla Plástica 1/2"'), 'Accesorios');
  assert.equal(categoryConfig.warehouseCategory('TF - Codo 20 mm 90° (C2090)'), 'Termofusión');
  assert.equal(categoryConfig.warehouseCategory('Pincel Profesional N°30'), 'Accesorios pintura');
  assert.equal(categoryConfig.warehouseCategory('Awaduct - Sombrero 110'), 'Awaduct / PVC');
  assert.equal(categoryConfig.warehouseCategory('Producto desconocido'), 'Sin categoría');
  const custom = order('JS30', 'R1', [{ ...item('Tanque 500L', 1), category: 'Otros', categoryOverride: true }]);
  assert.equal(warehouse.separateWarehouseLines([custom])[0].category, 'Otros');
  const catalogOnly = order('JS31', 'R1', [{ ...item('Tanque 500L', 1), category: 'Categoría del catálogo' }]);
  assert.equal(warehouse.separateWarehouseLines([catalogOnly])[0].category, 'Tanques de agua');
});

test('saved category assignments normalize names and discard invalid values', () => {
  const assignments = categoryConfig.warehouseCategoryAssignments({ assignments: {
    '  TANQUE   500L ': '  Otros  ',
    'Producto inválido': 42
  } });
  assert.equal(assignments['tanque 500l'], 'Otros');
  assert.equal(assignments['producto inválido'], undefined);
});

test('categorization editor excludes discounts and bonuses', () => {
  assert.equal(categoryConfig.isCategorizationProduct('TF - Codo 20 mm 90°'), true);
  assert.equal(categoryConfig.isCategorizationProduct('Descuento Compra Mayorista'), false);
  assert.equal(categoryConfig.isCategorizationProduct('Bonificación comercial'), false);
  assert.equal(categoryConfig.isCategorizationProduct('  '), false);
  assert.equal(categoryConfig.isCategorizationProduct('Kit Instalación Biodigestor Convencional 1000L'), false);
  assert.equal(categoryConfig.isCategorizationProduct('WP Kit cámara de inspección CII'), true);
  assert.equal(categoryConfig.categorizationSku({ sku: 'Base Hierro Reforzada 85 cms', name: 'Base de Hierro Reforzada para Tanque (85 cm)' }), 'Base Hierro Reforzada 85 cms');
  assert.equal(categoryConfig.categorizationSku({ sku: 'Kit Instalación Biodigestor Convencional 1000L', name: 'Kit de Instalación para Biodigestor' }), '');
  assert.equal(categoryConfig.categorizationSku({ sku: 'DESCUENTO MAYORISTA', name: 'Descuento' }), '');
  assert.equal(categoryConfig.categorizationSku({ sku: '', name: 'Base de Hierro Reforzada para Tanque (85 cm)' }), '');
});

test('biodigester installation kits do not appear on picking or vehicle loading sheets', () => {
  const [group] = warehouse.warehouseGroups([order('JS50', 'R1', [
    item('BioFort - Biodigestor 1000L', 1),
    item('Kit Instalación Biodigestor Convencional 1000L', 1),
    item('WP Kit cámara de inspección CII', 1)
  ])]);
  assert.deepEqual(Array.from(group.separate, line => line.name), ['BioFort - Biodigestor 1000L', 'WP Kit cámara de inspección CII']);
  assert.deepEqual(Array.from(group.load[0].lines, line => line.name), ['BioFort - Biodigestor 1000L', 'WP Kit cámara de inspección CII']);
});

test('saved category order controls grouping and legacy assignments remain available', () => {
  const config = categoryConfig.warehouseCategoryConfig({ assignments: { 'Producto especial': 'Prioritario' } });
  assert.ok(config.categories.includes('Prioritario'));
  assert.ok(config.categories.includes('Sin categoría'));
  const lines = warehouse.separateWarehouseLines([order('JS40', 'R1', [item('Tanque 500L', 1), item('Flotante Eco', 1)])], ['Accesorios', 'Tanques de agua', 'Sin categoría']);
  assert.deepEqual(Array.from(lines, line => line.category), ['Accesorios', 'Tanques de agua']);
});

test('requested printing rules reclassify old assignments and remain editable after saving', () => {
  const legacy = categoryConfig.warehouseCategoryConfig({ categories: ['Sin categoría'], assignments: {
    'TF - Codo 20 mm': 'Sin categoría',
    'ENTONADOR UNIVERSAL': 'Sin categoría'
  } });
  const cases = [
    ['TF - Codo 20 mm', 'Termofusión'],
    ['ENTONADOR UNIVERSAL', 'Accesorios pintura'],
    ['Lija al Agua G120', 'Accesorios pintura'],
    ['Venda Premium 10CM', 'Accesorios pintura'],
    ['FW - Griferia Pulse', 'Grifería y Sanitarios'],
    ['GM - Monocomando', 'Grifería y Sanitarios'],
    ['PVC - Codo 110', 'Awaduct / PVC'],
    ['Lusqtoff - Bomba', 'Bombas y Herramientas'],
    ['Konan - Bomba Periférica', 'Bombas y Herramientas'],
    ['Omaha - Bomba Presurizadora', 'Bombas y Herramientas'],
    ['Daewoo - Sierra Ingletadora', 'Bombas y Herramientas']
  ];
  for (const [name, expected] of cases) {
    assert.equal(categoryConfig.resolveWarehouseCategory(name, legacy), expected, name);
    assert.ok(legacy.categories.includes(expected), expected);
  }
  const saved = categoryConfig.warehouseCategoryConfig({
    categories: legacy.categories, assignments: { 'TF - Codo 20 mm': 'Sin categoría' }, classificationVersion: 1
  });
  assert.equal(categoryConfig.resolveWarehouseCategory('TF - Codo 20 mm', saved), 'Sin categoría');
  assert.equal(categoryConfig.resolveWarehouseCategory('TF - Codo 25 mm', saved), 'Termofusión');
});
