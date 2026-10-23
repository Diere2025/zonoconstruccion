const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/orderCategory.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exportsObject });
const detect = exportsObject.detectOrderCategory;
const resolve = exportsObject.resolveOrderCategory;

test('JS26375: BioFort autolimpiable and autolimpiante take priority over accessories and tanks', () => {
  for (const name of ['BioFort - Autolimpiable 700L', 'BIOFORT - AUTOLIMPIANTE 700L']) {
    const items = [{ name, quantity: 1, unit_price: 416160 },
      { name: 'Awaduct - Codo 110', quantity: 20 }, { name: 'AquaFort - TRIC 1000L Gris', quantity: 1 }];
    assert.equal(detect(items), 'BIODIGESTOR');
    assert.equal(resolve(items, 'OTRO'), 'BIODIGESTOR');
    assert.equal(detect(items.map(({ name, ...rest }) => ({ product_name: name, ...rest }))), 'BIODIGESTOR');
    assert.equal(exportsObject.hasBiodigestor([{ name: 'Producto', sku: name, quantity: 1 }]), true);
  }
});

test('autolimpiable kit components and unrelated products do not force a biodigestor sale', () => {
  const component = { name: 'BioFort - Autolimpiable 700L', quantity: 1, unit_price: 0 };
  const installation = { name: 'Kit Instalación Biodigestor Autolimpiante 700L', quantity: 1, unit_price: 2040000 };
  assert.equal(detect([installation, component]), 'INSTALACIÓN BIOFORT');
  assert.equal(detect([component]), 'BIODIGESTOR');
  assert.equal(detect([installation, { ...component, unit_price: 416160 }]), 'BIODIGESTOR');
  for (const name of ['Filtro autolimpiable', 'Cono BioFort Autolimpiable', 'Descuento BioFort Autolimpiable',
    'BioFort - Registro Lodos', 'BioFort - Séptica 600L']) {
    assert.equal(exportsObject.hasBiodigestor([{ name, quantity: 1 }]), false);
  }
  assert.equal(exportsObject.hasBiodigestor([{ ...component, quantity: 0 }]), false);
});

test('JS25835: biodigestor keeps its category when plumbing accessories outnumber it', () => {
  const items = [
    ['BioFort - Biodigestor 500L', 1], ['BioFort - Séptica 500L', 1],
    ['WP Kit cámara de inspección CII', 1], ['Biolam - Concentrado Enzimático 500g', 1],
    ['Awaduct - Caño 110 4mts', 3], ['Awaduct - Codo 110 MH 45°', 2],
    ['Awaduct - Codo 110 MH 90°', 2], ['Awaduct - Ramal T 110', 1],
    ['Awaduct - Sombrero 110', 1], ['Lusqtoff - Aerosol lubricante', 1]
  ].map(([name, quantity]) => ({ name, quantity }));
  assert.equal(detect(items), 'BIODIGESTOR');
  assert.equal(detect(items.map(({ name, quantity }) => ({ product_name: name, quantity }))), 'BIODIGESTOR');
});

test('a physical biodigestor takes priority even when installation is included', () => {
  assert.equal(detect([
    { name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1 },
    { name: 'BioFort - Biodigestor 500L', quantity: 1 },
    { name: 'Awaduct - Caño 110 4mts', quantity: 10 }
  ]), 'BIODIGESTOR');
  assert.equal(detect([{ name: 'Kit Instalación Biodigestor Convencional 500L', quantity: 1 }]), 'INSTALACIÓN BIOFORT');
});

test('biodigestor overrides prior and manually selected categories regardless of other products', () => {
  const items = [{ name: 'Biodigestor 500L', quantity: 1 }, { name: 'Tanque 1000L', quantity: 100 }];
  for (const previous of ['OTRO', 'General', 'TANQUES', 'INSTALACIÓN BIOFORT', 'auto', undefined]) {
    assert.equal(resolve(items, previous), 'BIODIGESTOR');
  }
  assert.equal(resolve([{ name: 'Tanque 1000L', quantity: 1 }], 'TANQUES'), 'TANQUES');
});

test('discounts, installation services, accessories and zero quantities do not force biodigestor', () => {
  for (const item of [
    { name: 'Descuento Combo Biodigestor', quantity: 1 },
    { name: 'Cono Biodigestor', quantity: 1 },
    { name: 'Biodigestor 500L', quantity: 0 }
  ]) assert.equal(resolve([item], 'OTRO'), 'OTRO');
  assert.equal(resolve([{name:'Mano de obra Biodigestor',quantity:1}], 'OTRO'), 'INSTALACIÓN BIOFORT');
});

test('standalone products, SKU matching and unrelated categories stay supported', () => {
  assert.equal(detect([{ name: 'Biodigestor 750L', quantity: 1 }]), 'BIODIGESTOR');
  assert.equal(detect([{ name: 'Producto', sku: 'BioFort - Biodigestor 500L', quantity: 1 }]), 'BIODIGESTOR');
  assert.equal(detect([{ name: 'Tanque 1000L Aquafort', quantity: 1 }]), 'TANQUES');
  assert.equal(detect([{ name: 'Termotanque eléctrico 80L', quantity: 1 }]), 'TERMOTANQUES');
  assert.equal(detect([{ name: 'Kit cámara de inspección CII', quantity: 1 }]), 'OTRO');
  assert.equal(detect([{ name: 'Descuento Combo Biodigestor', quantity: 1 }, { name: 'Tanque 1000L', quantity: 2 }]), 'TANQUES');
  assert.equal(detect([]), 'OTRO');
});

test('JS26123 / JS26124: biodigestor included at $0 belongs to the installation', () => {
  for (const priceField of ['customPrice', 'unit_price', 'unitPrice']) {
    const items = [
      { name: 'Kit Instalación Biodigestor Convencional 600L', quantity: 1, [priceField]: 1730000 },
      { name: 'BioFort - Biodigestor 600L', quantity: 1, [priceField]: 0 },
      { name: 'BioFort - Séptica 600L', quantity: 1, [priceField]: 0 },
      { name: 'Awaduct - Caño 110 4mts', quantity: 3, [priceField]: 0 }
    ];
    assert.equal(detect(items), 'INSTALACIÓN BIOFORT');
    assert.equal(resolve(items, 'BIODIGESTOR'), 'INSTALACIÓN BIOFORT');
    assert.equal(resolve(items.map(({name,...rest})=>({product_name:name,...rest})), 'auto'), 'INSTALACIÓN BIOFORT');
    assert.equal(detect([...items, {name:'BioFort - Biodigestor 600L',quantity:1,[priceField]:300000}]), 'BIODIGESTOR');
  }
  assert.equal(detect([
    {name:'Kit Instalación Biodigestor Convencional 600L',quantity:1},
    {name:'BioFort - Biodigestor 600L',quantity:1,isIncludedInKit:true}
  ]), 'INSTALACIÓN BIOFORT');
  assert.equal(detect([{name:'BioFort - Biodigestor 600L',quantity:1,unit_price:0}]), 'BIODIGESTOR');
  assert.equal(detect([
    {name:'Kit Instalación Biodigestor Convencional 600L',quantity:0},
    {name:'BioFort - Biodigestor 600L',quantity:1,unit_price:0}
  ]), 'BIODIGESTOR');
});
