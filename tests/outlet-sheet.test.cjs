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
    if (name === './orderCategory') return compile('src/lib/orderCategory.ts');
    if (name === './sheetProducts' || name === '@/lib/sheetProducts') return sheetProductsLib;
    if (name === './cancelledOrderSheet') return compile('src/lib/cancelledOrderSheet.ts');
    if (name === './sellerSheetMaintenance') return compile('src/lib/sellerSheetMaintenance.ts');
    throw new Error('Unexpected require: ' + name);
  }
});

test('unique unit identity and net price survive sheet normalization and mixed discounts',()=>{
 const name='Tricapa 500 L · Segunda [O045] · descuento especial por falla';
 assert.equal(sheetProductsLib.normalizeProductNameForSheet(name,'O045'),name);
 const rows=googleSheetsLib.buildSheetOrderItems([{id:'outlet',name,sku:'O045',quantity:1,customPrice:140000,basePrice:200000,is_outlet_unit:true},{id:'normal',name:'Normal',quantity:2,customPrice:1000,basePrice:1000}],200,[]);
 assert.equal(rows[0].name,name);assert.equal(rows[0].unitPrice,140000);
 assert.equal(rows.reduce((sum,r)=>sum+r.quantity*r.unitPrice,0),141800);
});
test('persisted outlet snapshot retains identity when rebuilding a sheet payload',()=>{
 const name='Herramienta · Outlet [OUT-1234] · exhibición';
 const rows=googleSheetsLib.buildSheetOrderItems([{product_name:name,quantity:1,unit_price:400,outlet_snapshot:{code:'OUT-1234'}}]);
 assert.equal(rows[0].name,name);assert.equal(rows[0].unitPrice,400);
});
