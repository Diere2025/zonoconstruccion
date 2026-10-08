const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/lib/serviceProducts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};new Function('module','exports',source)(mod,mod.exports);
const {isServiceProduct}=mod.exports;
test('installation services exclude inventory even with a stale catalogue cache',()=>{
 for(const name of ['Kit Instalación Biodigestor Convencional 500L','Adicionales Instalación Biofort','Terminación Instalación Biofort'])assert.equal(isServiceProduct({name}),true);
 assert.equal(isServiceProduct({name:'  TERMINACION INSTALACION BIOFORT  '}),true);
});
test('physical products including the actual biodigester retain inventory',()=>{
 assert.equal(isServiceProduct({name:'Biodigestor Convencional 500L'}),false);
 assert.equal(isServiceProduct({name:'Kit Instalación Biodigestor Convencional 1000L'}),true);
 assert.equal(isServiceProduct({name:'Kit Instalación Biodigestor Autolimpiante 700L'}),true);
 assert.equal(isServiceProduct({name:'Kit Cámara de Inspección Inyectada'}),false);
 assert.equal(isServiceProduct({name:'Caño adicional'}),false);
 assert.equal(isServiceProduct({name:'Servicio con nombre actualizado',is_service:true}),true);
});
test('a kit reserves physical components even when their included price is zero',()=>{
 const lines=[{name:'Kit Instalación Biodigestor Convencional 500L',quantity:2},
 {name:'Biodigestor Convencional 500L',quantity:2,customPrice:0,isIncludedInKit:true},
 {name:'Cámara de lodos',quantity:2,customPrice:0,isIncludedInKit:true}];
 assert.deepEqual(lines.filter(line=>!isServiceProduct(line)),lines.slice(1));
});
