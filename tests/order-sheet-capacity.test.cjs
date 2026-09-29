const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({rows=2699,offset=0,failExpansion=false}={}) {
  const calls=[];
  let rowCount=rows;
  const compiled=ts.transpileModule(fs.readFileSync('src/lib/googleSheets.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const exports={};
  const fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):undefined;
    calls.push({url,body});
    if(url.endsWith('?fields=sheets.properties'))return {ok:true,json:async()=>({sheets:[
      {properties:{title:'Central pedidos',sheetId:7,gridProperties:{rowCount,columnCount:239}}},
      {properties:{title:'Vendedores',sheetId:8,gridProperties:{rowCount,columnCount:238}}},
      {properties:{title:'Pendientes',sheetId:9,gridProperties:{rowCount,columnCount:239}}}
    ]})};
    if(url.includes('valueRenderOption=FORMULA')){
      const values=Array.from({length:20},()=>[]);
      // Deliberately leave the final row blank and use a custom formula above it.
      values[18][0]=`=CUSTOM(${offset===-1?'W':'X'}${rowCount-1})`;
      values[18][8]=`=${offset===-1?'AE':'AF'}${rowCount-1}*${offset===-1?'AF':'AG'}${rowCount-1}`;
      return {ok:true,json:async()=>({values})};
    }
    if(url.endsWith(':batchUpdate')&&!url.includes('/values:')){
      if(failExpansion)return {ok:false,status:403,text:async()=> 'protected range'};
      for(const request of body.requests){
        if(request.appendDimension)rowCount+=request.appendDimension.length;
        if(request.copyPaste){assert.ok(request.copyPaste.destination.endRowIndex<=rowCount);}
      }
      return {ok:true};
    }
    if(url.endsWith('/values:batchUpdate')){
      for(const data of body.data){
        const target=Number(data.range.match(/![A-Z]+(\d+)/)[1]);
        assert.ok(target<=rowCount,`Range ${data.range} exceeds grid limits`);
      }
      return {ok:true};
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const context=vm.createContext({exports,fetch,process:{env:{}},console:{error(){},warn(){}},
    require(name){
      if(name==='./sellerSheetMaintenance')return {restoreSellerRowFormats:async()=>{calls.push({maintenance:true});}};
      if(name==='./sheetProducts')return {normalizeProductNameForSheet:name=>name};
      return {};
    }
  });
  vm.runInContext(compiled,context);
  vm.runInContext("getGoogleAccessToken=async()=> 'test-token'; restoreMissingCalculatedFormulas=async()=>{}",context);
  return {exports,context,calls,get rowCount(){return rowCount;}};
}

test('capacity no-op leaves an existing grid untouched and repeated checks do not grow it',async()=>{
  const f=fixture();
  await f.exports.ensureOrderSheetRowCapacity('central','Central pedidos',[2699],0,'token');
  assert.equal(f.calls.length,1);
  await f.exports.ensureOrderSheetRowCapacity('central','Central pedidos',[2700,2701],0,'token');
  assert.equal(f.rowCount,2799);
  const count=f.calls.length;
  await f.exports.ensureOrderSheetRowCapacity('central','Central pedidos',[2701],0,'token');
  assert.equal(f.calls.length,count+1);
  assert.equal(f.rowCount,2799);
});

for(const [sheetName,offset,sheetId] of [['Central pedidos',0,7],['Pendientes',0,9],['Vendedores',-1,8]]){
  test(`${sheetName}: expands before writing and copies only new-row formats, validations and existing formulas`,async()=>{
    const f=fixture({offset});
    await f.exports.ensureOrderSheetRowCapacity('sheet',sheetName,[2700,2701],offset,'token');
    const requests=f.calls.find(c=>c.body?.requests).body.requests;
    assert.equal(requests[0].appendDimension.sheetId,sheetId);
    assert.equal(requests[0].appendDimension.length,100);
    const copies=requests.filter(r=>r.copyPaste).map(r=>r.copyPaste);
    assert.deepEqual(copies.map(c=>c.pasteType),['PASTE_FORMAT','PASTE_DATA_VALIDATION','PASTE_FORMULA','PASTE_FORMULA']);
    for(const copy of copies){
      assert.equal(copy.destination.sheetId,sheetId);
      assert.equal(copy.destination.startRowIndex,2699);
      assert.equal(copy.destination.endRowIndex,2799);
      assert.notEqual(copy.pasteType,'PASTE_NORMAL');
    }
    const formulas=copies.filter(c=>c.pasteType==='PASTE_FORMULA');
    assert.deepEqual(formulas.map(c=>c.source.startColumnIndex),[25+offset,33+offset]);
    assert.ok(formulas.every(c=>c.source.startRowIndex===2697));
    const generated=requests.filter(r=>r.repeatCell).map(r=>r.repeatCell);
    assert.equal(generated.length,13);
    assert.ok(generated.every(r=>r.range.startRowIndex===2699 && r.cell.userEnteredValue.formulaValue.startsWith('=')));
    const total=generated.find(r=>r.range.startColumnIndex===28+offset);
    assert.match(total.cell.userEnteredValue.formulaValue,offset===-1?/AG2700\+AK2700/:/AH2700\+AL2700/);
  });
}

test('large split order adds all required rows instead of stopping at the reserve',async()=>{
  const f=fixture();
  await f.exports.ensureOrderSheetRowCapacity('central','Central pedidos',[3000,3001],0,'token');
  assert.equal(f.rowCount,3001);
});

test('Central and Entregas Actual support a split order at the grid boundary',async()=>{
  const f=fixture();
  vm.runInContext('getNextEmptyOperationalRows=async()=>[2700,2701]',f.context);
  const result=await f.exports.appendNewOrderToOperationalSheets(['TEST1','TEST2'],{
    clientName:'Cliente',items:Array.from({length:13},(_,i)=>({name:`Producto ${i}`,quantity:1,unitPrice:100}))
  });
  assert.equal(result.central.success,true);
  assert.equal(result.deliveriesCurrent.success,true);
  assert.equal(f.calls.filter(c=>c.body?.data).length,2);
  const calls=f.calls;
  assert.ok(calls.findIndex(c=>c.body?.requests)<calls.findIndex(c=>c.body?.data));
  assert.ok(calls.some(c=>c.body?.data?.some(d=>d.range==="'Vendedores'!A2701:A2701")));
});

test('seller split orders grow before format restoration and save every original code',async()=>{
  const f=fixture();
  vm.runInContext("getNextAvailableSheetSlots=async()=>[{code:'JS1',rowNumber:2700},{code:'JS2',rowNumber:2701}]",f.context);
  const result=await f.exports.appendOrderToSellerSheet('seller','Pendientes',{
    clientName:'Cliente',items:Array.from({length:13},()=>({name:'Tanque',quantity:1,unitPrice:100}))
  });
  assert.equal(result.code,'JS1 / JS2');
  assert.equal(f.calls.filter(c=>c.body?.data).length,2);
  assert.ok(f.calls.findIndex(c=>c.body?.requests)<f.calls.findIndex(c=>c.body?.data));
});

test('an expansion permission failure prevents order writes and blocks the downstream delivery load',async()=>{
  const f=fixture({failExpansion:true});
  vm.runInContext('getNextEmptyOperationalRows=async()=>[2700]',f.context);
  const result=await f.exports.appendNewOrderToOperationalSheets(['JS1'],{clientName:'Cliente',items:[]});
  assert.equal(result.central.success,false);
  assert.match(result.central.message,/agregar filas.*403/);
  assert.equal(result.deliveriesCurrent.success,false);
  assert.ok(!f.calls.some(c=>c.body?.data));
  assert.equal(f.calls.filter(c=>c.url.endsWith('?fields=sheets.properties')).length,1);
});
