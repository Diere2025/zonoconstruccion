const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');

test('old payloads save Contado while card and mixed payment labels stay intact',()=>{
 const source=fs.readFileSync('src/lib/googleSheets.ts','utf8');
 const exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({}),Date,Map,Set});
 const normalize=exports.normalizePaymentMethodForSheet;
 assert.equal(normalize('Efectivo / Transferencia'),'Contado');
 assert.equal(normalize(' efectivo/transferencia '),'Contado');
 assert.equal(normalize('Contado'),'Contado');
 assert.equal(normalize('Payway 3 cuotas'),'Payway 3 cuotas');
 assert.equal(normalize('Transferencia MP (10%)'),'Transferencia MP (10%)');
 assert.equal(normalize(undefined),'');
});

test('renaming the cash method does not add contado orders to electronic-payment validation',()=>{
 const source=fs.readFileSync('src/app/api/admin/finanzas-data/route.ts','utf8');
 const expression=source.match(/const isCash = ([^;]+);/)[1];
 for(const [pmName,expected] of [['Contado',true],['Efectivo / Transferencia',true],['Payway 3 cuotas',false],['QR Mercado Pago',false],['',false]]){
  assert.equal(vm.runInNewContext(expression,{pmName}),expected,pmName);
 }
});
