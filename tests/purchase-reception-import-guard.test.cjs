const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/erp/purchaseReceptionGuard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);const {canImportPurchaseReception:c,purchaseSlipKey:k}=m.exports;
assert.equal(c({status:'Pendiente',purchase_order_items:[]},false),true);assert.equal(c(undefined,false),true);
assert.equal(c({status:'Cumplido'},false),false);assert.equal(c({status:'Cancelado'},false),false);
assert.equal(c({status:'Parcial',purchase_order_items:[{quantity_received:'1'}]},false),false);
assert.equal(c(undefined,true),false);assert.equal(k('a','3.427'),k('a','3427'));assert.notEqual(k('a','3427'),k('b','3427'));
console.log('Purchase reception import checks passed');
