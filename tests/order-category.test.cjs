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
    { name: 'Mano de obra Biodigestor', quantity: 1 },
    { name: 'Cono Biodigestor', quantity: 1 },
    { name: 'Biodigestor 500L', quantity: 0 }
  ]) assert.equal(resolve([item], 'OTRO'), 'OTRO');
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
