const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/stockControlSorting.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { sortStockProducts, stockSupplierLabel } = helper.exports;
const product = (id, sku, physical, reserved = 0) => ({ id, name: sku, sku, dbPhysical: physical, dbCalculatedReserved: reserved });
const supply = (names, pendingIncoming = 0) => ({ suppliers: names.map(name => ({id:name,name})), pendingIncoming, pendingOrders:[] });
const products = [product('a', 'Producto 10', 10, 12), product('b', 'Producto 2', 2), product('c', 'Sin proveedor', 0)];
const context = { a: supply(['Zeta']), b: supply(['Álamo'], 30), c: supply([]) };
const ids = rows => rows.map(p => p.id);

test('ordena por proveedor en español y mantiene los productos sin proveedor al final', () => {
  assert.deepEqual(ids(sortStockProducts(products,context,'supplier','asc')), ['b','a','c']);
  assert.deepEqual(ids(sortStockProducts(products,context,'supplier','desc')), ['a','b','c']);
  assert.deepEqual(ids(products), ['a','b','c']);
});
test('ordena SKU con números de manera natural', () => {
  assert.deepEqual(ids(sortStockProducts(products,context,'name','asc')), ['b','a','c']);
});
test('compara cantidades numéricas, reservas, faltantes e ingresos proyectados', () => {
  for (const [key, expected] of [['physical',['c','b','a']],['reserved',['b','c','a']],['available',['a','c','b']],['incoming',['a','c','b']],['projected',['a','c','b']]]) {
    assert.deepEqual(ids(sortStockProducts(products,context,key,'asc')), expected, key);
  }
});
test('no interpreta ingresos desconocidos como cero', () => {
  const incomplete = { a: supply(['Zeta'], 4), b: supply(['Álamo'], 30) };
  assert.deepEqual(ids(sortStockProducts(products,incomplete,'incoming','desc')), ['b','a','c']);
});
test('proveedores múltiples tienen una etiqueta y un orden consistentes', () => {
  assert.equal(stockSupplierLabel(supply(['Zeta','Álamo'])), 'Álamo · Zeta');
  const rows = [product('x','Z',1), product('y','A',1)];
  assert.deepEqual(ids(sortStockProducts(rows,{x:supply(['Zeta','Álamo']),y:supply(['Álamo','Zeta'])},'supplier','asc')), ['y','x']);
});
test('acepta también filas emparejadas identificadas con productId', () => {
  const rows = products.map(({id,...p}) => ({...p,productId:id}));
  assert.deepEqual(sortStockProducts(rows,context,'supplier','asc').map(p=>p.productId),['b','a','c']);
});
test('en la comparación ordena por el disponible de DB mostrado en la columna', () => {
  const rows = [ {...products[0], dbAvailable: 50}, {...products[1], dbAvailable: -5} ];
  assert.deepEqual(ids(sortStockProducts(rows,context,'available','asc', p=>p.dbAvailable)),['b','a']);
});
