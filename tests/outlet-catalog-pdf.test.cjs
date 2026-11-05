const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/lib/outletCatalogPdf.ts');
const compiled = new Module(file, module); compiled.filename = file; compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
const { createOutletCatalogPdf } = compiled.exports;
const unit = (code, patch = {}) => ({ code, name: 'Tanque 500 L', condition: 'segunda', state: 'available', reason: 'Detalle estético', defect: 'Marca superficial.', list_price: 100000, final_price: 80000, discount: 20, image_urls: [], ...patch });
(async () => {
    const pdf = await createOutletCatalogPdf([unit('O10'), unit('O2'), unit('RESERVADO', { state: 'reserved' }), unit('VENDIDO', { state: 'sold' }), unit('BORRADOR', { state: 'draft' })], () => { throw Error('Unexpected image'); }, new Date('2026-11-05T01:02:00Z'));
    const text = pdf.internal.pages.flat().join('\n');
    assert.equal(pdf.getNumberOfPages(), 1);
    assert(text.indexOf('(O2)') < text.indexOf('(O10)'));
    for (const excluded of ['RESERVADO', 'VENDIDO', 'BORRADOR']) assert(!text.includes(excluded));
    assert(text.includes('aro, tapa, brida y aireador'));
    assert(text.includes('04/11/2026')); // Argentina still has the previous calendar date.
    assert(text.includes('$80.000'));
    await assert.rejects(createOutletCatalogPdf([], async () => null), /No hay unidades/);
    await assert.rejects(createOutletCatalogPdf([unit('FOTO', { image_urls: ['private-photo'] })], async () => { throw Error('Expired'); }), /foto de FOTO/);
    const long = await createOutletCatalogPdf([unit('LONG', { defect: ('Detalle extenso de la falla. ').repeat(300) })], async () => null);
    assert(long.getNumberOfPages() > 1);
    assert(long.internal.pages.flat().join('\n').includes('continuaci'));
    console.log('PASS: only available units, numeric order, local date, accessory notice, prices, photo failures and long descriptions');
})().catch(e => { console.error(e); process.exitCode = 1; });
