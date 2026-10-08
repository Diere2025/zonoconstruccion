const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/visits/order.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,require:()=>({})});
const {expandVisitOrderLines}=exportsObject;
const products=[{id:'kit',name:'Kit Instalación Biodigestor Convencional 500L'},{id:'bio',name:'Biodigestor 500L'},{id:'pipe',name:'Caño 110'},{id:'extra',name:'Adicionales Instalación Biofort'}];
test('kit components retain quantities, agreed total and their link to the parent',()=>{
 const items=expandVisitOrderLines([{description:'Kit',quantity:2,unit_price:1980000},{description:'Adicionales',quantity:4,unit_price:30000}],['kit','extra'],products,{kit:[{product_id:'bio',quantity:1},{product_id:'pipe',quantity:3}]});
 assert.equal(items.length,4);assert.equal(items[1].quantity,2);assert.equal(items[2].quantity,6);assert.equal(items[1].customPrice,0);assert.equal(items[2].basePrice,0);assert.equal(items[2].bundleParentId,'kit');assert.equal(items[2].isIncludedInKit,true);assert.equal(items[2].baseQuantity,3);assert.equal(items.reduce((total,i)=>total+i.quantity*i.customPrice,0),4080000);
});
test('conversion cannot silently omit a missing kit or component',()=>{
 const lines=[{description:'Kit',quantity:1,unit_price:100}];
 assert.throws(()=>expandVisitOrderLines(lines,['kit'],products,{}),/componentes/);
 assert.throws(()=>expandVisitOrderLines(lines,['kit'],products,{kit:[{product_id:'missing',quantity:1}]}),/componentes/);
});
