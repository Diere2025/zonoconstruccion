const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function compile(file, extras = {}) {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
  vm.runInNewContext(transpiled, {
    exports,
    Date,
    Intl,
    Number,
    Math,
    Map,
    Set,
    URL,
    AbortSignal,
    Promise,
    console,
    ...extras
  });
  return exports;
}

const sheetProductsLib = compile('src/lib/sheetProducts.ts');
const googleSheetsLib = compile('src/lib/googleSheets.ts', {
  require(name) {
    if (name === './sheetProducts' || name === '@/lib/sheetProducts') return sheetProductsLib;
    throw new Error('Unexpected require: ' + name);
  }
});
const discountRulesLib = compile('src/lib/discountRules.ts');

const catalogProducts = [
  { id: 'kit-500', name: 'Kit Instalación Biodigestor Convencional 500L', sku: 'KIT-BIO-500', price: 500000 },
  { id: 'bio-500', name: 'Biodigestor 500L', sku: 'BioFort - Biodigestor 500L', price: 258600 },
  { id: 'sep-500', name: 'Cámara Séptica 500L', sku: 'BioFort - Séptica 500L', price: 129900 },
  { id: 'insp-cii', name: 'Kit cámara de inspección CII', sku: 'WP Kit cámara de inspección CII', price: 54000 },
  { id: 'deseng', name: 'Cámara Desengrasadora', sku: 'WP - Camara Desengrasadora C/canasto', price: 35000 },
  { id: 'awaduct-110', name: 'Caño Awaduct 110', sku: 'Awaduct - Caño 110', price: 15000 },
  { id: 'tanque-1000', name: 'Tanque 1000L', sku: 'Tanque 1000L Aquafort', price: 200000 },
  { id: 'biolam', name: 'Biolam', sku: 'Biolam - Concentrado Enzimático 500g', price: 18500 }
];

test('Installation Kit: components included in kit go to sheet at $0 and no Descuento Compra Mayorista is added', () => {
  const orderItems = [
    { id: 'kit-500', name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1, customPrice: 500000, basePrice: 500000 },
    { id: 'bio-500', name: 'Biodigestor 500L', quantity: 1, customPrice: 0, basePrice: 0, isIncludedInKit: true },
    { id: 'sep-500', name: 'Cámara Séptica 500L', quantity: 1, customPrice: 0, basePrice: 0, isIncludedInKit: true },
    { id: 'insp-cii', name: 'Kit cámara de inspección CII', quantity: 1, customPrice: 0, basePrice: 0, isIncludedInKit: true },
    { id: 'awaduct-110', name: 'Caño Awaduct 110', quantity: 3, customPrice: 0, basePrice: 0, isIncludedInKit: true }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);

  assert.equal(sheetItems.length, 5);

  const kitItem = sheetItems.find(i => i.name.includes('Kit Instalación'));
  assert.ok(kitItem, 'Debe incluir el producto Kit Instalación');
  assert.equal(kitItem.unitPrice, 500000);
  assert.equal(kitItem.quantity, 1);

  const bioItem = sheetItems.find(i => i.name.includes('Biodigestor 500L'));
  assert.ok(bioItem);
  assert.equal(bioItem.unitPrice, 0, 'El Biodigestor incluido debe salir en $0');

  const sepItem = sheetItems.find(i => i.name.toLowerCase().includes('septica') || i.name.toLowerCase().includes('séptica'));
  assert.ok(sepItem);
  assert.equal(sepItem.unitPrice, 0, 'La Séptica incluida debe salir en $0');

  const inspItem = sheetItems.find(i => i.name.includes('inspección') || i.name.includes('inspeccion') || i.name.includes('CII'));
  assert.ok(inspItem, 'Debe incluir la cámara de inspección');
  assert.equal(inspItem.unitPrice, 0, 'La cámara de inspección debe salir en $0');

  const canoItem = sheetItems.find(i => i.name.includes('110'));
  assert.ok(canoItem);
  assert.equal(canoItem.unitPrice, 0, 'Los caños Awaduct del kit deben salir en $0');
  assert.equal(canoItem.quantity, 3);

  // 4. NO debe existir ninguna línea de Descuento Compra Mayorista
  const discountItem = sheetItems.find(i => i.name.includes('Descuento'));
  assert.equal(discountItem, undefined, 'No debe agregarse ninguna fila de descuento');
});

test('Installation Kit with additional products outside the basic kit: additional items carry their normal price', () => {
  const orderItems = [
    { id: 'kit-500', name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1, customPrice: 500000, basePrice: 500000 },
    { id: 'bio-500', name: 'Biodigestor 500L', quantity: 1, customPrice: 0, basePrice: 0, isIncludedInKit: true },
    { id: 'awaduct-110', name: 'Caño Awaduct 110', quantity: 3, customPrice: 0, basePrice: 0, isIncludedInKit: true },
    { id: 'awaduct-110', name: 'Caño Awaduct 110', quantity: 2, customPrice: 15000, basePrice: 15000, isIncludedInKit: false }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);

  assert.equal(sheetItems.length, 4);

  const kitItem = sheetItems.find(i => i.name.includes('Kit Instalación'));
  assert.equal(kitItem.unitPrice, 500000);

  const canosDelKit = sheetItems.find(i => i.name.includes('110') && i.quantity === 3);
  assert.ok(canosDelKit);
  assert.equal(canosDelKit.unitPrice, 0, 'Los 3 caños del kit deben salir a $0');

  const canosAdicionales = sheetItems.find(i => i.name.includes('110') && i.quantity === 2);
  assert.ok(canosAdicionales);
  assert.equal(canosAdicionales.unitPrice, 15000, 'Los 2 caños adicionales deben salir con su precio de $15.000');

  const discountItem = sheetItems.find(i => i.name.includes('Descuento'));
  assert.equal(discountItem, undefined, 'No debe generarse descuento mayorista');
});

test('Manual entry of $0 in installation order: components entered at $0 do not trigger catalog price or wholesale discount', () => {
  const orderItems = [
    { id: 'kit-500', name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1, customPrice: 500000, basePrice: 500000 },
    { id: 'bio-500', name: 'Biodigestor 500L', quantity: 1, customPrice: 0, basePrice: 258600 },
    { id: 'sep-500', name: 'Cámara Séptica 500L', quantity: 1, customPrice: 0, basePrice: 129900 }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);

  assert.equal(sheetItems.length, 3);
  const bio = sheetItems.find(i => i.name.includes('Biodigestor 500L'));
  assert.equal(bio.unitPrice, 0);

  const sep = sheetItems.find(i => i.name.includes('Séptica 500L'));
  assert.equal(sep.unitPrice, 0);

  const discount = sheetItems.find(i => i.name.includes('Descuento'));
  assert.equal(discount, undefined);
});

test('Standard Wholesale Order: discount stays in the real product price, never as a product', () => {
  const orderItems = [
    { id: 'tanque-1000', name: 'Tanque 1000L Aquafort', quantity: 1, customPrice: 180000, basePrice: 200000 }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);

  assert.equal(sheetItems.length, 1);
  const tanque = sheetItems.find(i => i.name.includes('Tanque'));
  assert.equal(tanque.unitPrice, 180000);

  const disc = sheetItems.find(i => i.name.includes('Descuento Compra Mayorista'));
  assert.equal(disc, undefined);
});

test('Combo BioFort 15% OFF (without installation): net prices stay on the products', () => {
  const orderItems = [
    { id: 'bio-500', name: 'Biodigestor 500L', quantity: 1, customPrice: 219810, basePrice: 258600, discountValue: 15 },
    { id: 'sep-500', name: 'Cámara Séptica 500L', quantity: 1, customPrice: 110415, basePrice: 129900, discountValue: 15 }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);

  const bio = sheetItems.find(i => i.name.includes('Biodigestor 500L'));
  assert.equal(bio.unitPrice, 219810);

  const comboDisc = sheetItems.find(i => i.name === 'Descuento Combo Biodigestor');
  assert.equal(comboDisc, undefined);
});

test('Order-level wholesale discount keeps list prices and is appended as a negative item', () => {
  const orderItems = [
    { id: 'tanque-1000', name: 'Tanque 1000L Aquafort', quantity: 2, customPrice: 200000, basePrice: 200000 },
    { id: 'biolam', name: 'Biolam', quantity: 1, customPrice: 18500, basePrice: 18500 }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 50000, catalogProducts);
  assert.equal(sheetItems[0].unitPrice, 200000);
  assert.equal(sheetItems[1].unitPrice, 18500);
  assert.equal(sheetItems.at(-1).name, 'Descuento Compra Mayorista');
  assert.equal(sheetItems.at(-1).unitPrice, -50000);
  const netTotal = sheetItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  assert.equal(Math.round(netTotal * 100) / 100, 368500);
});

test('Legacy discount rows are consolidated at the end and products recover list price', () => {
  const orderItems = [
    { id: 'tanque-1000', name: 'Tanque 1000L Aquafort', quantity: 1, customPrice: 200000 },
    { name: 'Descuento Compra Mayorista', quantity: 1, customPrice: -20000 }
  ];

  const sheetItems = googleSheetsLib.buildSheetOrderItems(orderItems, 0, catalogProducts);
  assert.equal(sheetItems.length, 2);
  assert.equal(sheetItems[0].name, 'Tanque 1000L Aquafort');
  assert.equal(sheetItems[0].unitPrice, 200000);
  assert.equal(sheetItems[1].name, 'Descuento Compra Mayorista');
  assert.equal(sheetItems[1].unitPrice, -20000);
});

test('Discount suggestions: does not suggest Combo BioFort 15% OFF when order has an installation kit', () => {
  const orderItems = [
    { id: 'kit-500', name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1, customPrice: 500000 },
    { id: 'bio-500', name: 'Biodigestor 500L', quantity: 1, customPrice: 0, isIncludedInKit: true },
    { id: 'sep-500', name: 'Cámara Séptica 500L', quantity: 1, customPrice: 0, isIncludedInKit: true },
    { id: 'insp-cii', name: 'Kit cámara de inspección CII', quantity: 1, customPrice: 0, isIncludedInKit: true },
    { id: 'biolam', name: 'Biolam', quantity: 1, customPrice: 0, isIncludedInKit: true }
  ];

  const suggestions = discountRulesLib.evaluateDiscountSuggestions(orderItems, catalogProducts);
  const comboSug = suggestions.find(s => s.ruleId === 'combo-biofort-15');
  assert.equal(comboSug, undefined, 'No debe sugerir Combo BioFort cuando hay un Kit de Instalación');
});
