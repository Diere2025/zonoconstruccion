const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const gasExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/costs/gasConsumption.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:gasExports});
test('factory report reads all fabrication and assembly values instead of the CSV that omits hidden rows',async()=>{
  const exports={},reads=[];
  const sheets={
    fetchSpreadsheetCsv:async()=>'',
    fetchSpreadsheetValues:async(id,range)=>{
      reads.push(range);
      if(range.includes('Carga'))return [['Fecha','Hora','Tipo','Antes','Litros','Después','Precio']];
      if(range.includes('Fabricación'))return [['Fecha','Producto','#','Turno','Tipo','Operario','Secundario','Calidad','Estado'],['01/09/2026','AquaFort - TRIC 500L Gris','12','','','Rodrigo Ramirez','','De primera','Fabricado'],['02/09/2026','AquaFort - TRIC 500L Gris','28','','','Rodrigo Ramirez','','De primera','Fabricado']];
      return [['Fecha','Producto','#','Operario','','Estado'],['02/09/2026','BioFort - Séptica 1000L','17','Matias Olivera','','Ensamblado']];
    }
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/gas-consumo-data/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='next/server'?{NextResponse:{json:body=>({body})}}:n.includes('gasConsumption')?gasExports:sheets,process:{env:{}},fetch:async()=>({ok:true,json:async()=>[]}),Date,Math,Set,Map,console});
  const {body}=await exports.GET();
  assert.equal(body.success,true);
  assert.deepEqual(reads,["'Carga'!A:I","'Fabricación'!A:I","'Ensamblaje'!A:I"]);
  assert.equal(body.monthlyBreakdown.find(m=>m.monthKey==='2026-09').tanquesFabricados,40);
  assert.equal(body.operatorsData.find(o=>o.key==='OLIVERA_MATIAS').months['2026-09'].tanksAssembled,17);
});
test('gas refill at an interval boundary is counted once, and stock remaining is not expensed',()=>{
  const reading=(timestamp,pct,liters=0)=>({timestamp,fecha:'2026-09-10',hora:'',tipo:liters?'Recarga':'Lectura',porcentajeAntes:pct,cargaLitros:liters,precioLitro:1000});
  const events=[reading(1,20),reading(2,10,2000),reading(3,55)];
  assert.equal(gasExports.measuredGas(events.slice(0,2),4000).liters,400);
  assert.equal(gasExports.measuredGas(events.slice(1),4000).liters,200);
  assert.equal(gasExports.measuredGas(events,4000).liters,600);
  assert.equal(gasExports.measuredGas(events,4000).cost,600000);
});
