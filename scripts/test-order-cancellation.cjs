const fs=require('fs'), vm=require('vm'), ts=require('typescript'), assert=require('node:assert/strict');
const code=ts.transpile(fs.readFileSync('src/lib/googleSheets.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020});
async function run(failCentral=false,missingSibling=false) {
  const writes=[];
  const exports={};
  const rows={Pendientes:[['TEST1',,,,,,,,,'Nota original'],['TEST2',,,,,,,,,'']],
    'Central pedidos':[['TEST1',,,,,,,,,'Nota central'], ...(missingSibling?[]:[['TEST2']])],
    Vendedores:[['TEST1',,,,,,,,,'Nota logística']],Pend:[['TEST2']]};
  const context=vm.createContext({exports,console,process:{env:{}},Set,Date,TextEncoder,URL,
    mockRead:async(id,range)=>rows[range.match(/^'(.+)'!/)[1]] || [],
    fetch:async(url,options)=>{
      if(url.includes('?fields='))return {ok:true,json:async()=>({sheets:[{properties:{title:'Vendedores'}},{properties:{title:'Pend'}}]})};
      if(failCentral && url.includes('1nz545'))return {ok:false,status:403,text:async()=>'test denied'};
      const data=JSON.parse(options.body).data;
      writes.push(...data);
      data.forEach(cell=>{const match=cell.range.match(/^'(.+)'!([JK])(\d+):/);if(match)rows[match[1]][Number(match[3])-2][9]=cell.values[0][0];});
      return {ok:true};
    }
  });
  vm.runInContext(code,context);
  vm.runInContext('getGoogleAccessToken=async()=>"test"; fetchSpreadsheetValues=mockRead;',context);
  const seller=Object.keys(exports.SELLER_SHEET_CONFIG)[0];
  const result=await exports.cancelOrderInAllSheets(seller,'TEST1 / TEST2','Cliente desistió');
  assert.equal(result.seller.success,true);
  assert.equal(result.deliveriesCurrent.success,true);
  assert.equal(result.central.success,!failCentral&&!missingSibling);
  for(const range of ["'Pendientes'!Q2:Q2","'Pendientes'!Q3:Q3","'Vendedores'!P2:P2","'Pend'!P2:P2"])
    assert.ok(writes.some(cell=>cell.range===range&&cell.values[0][0]==='❌ Anulado'),range);
  assert.ok(writes.some(cell=>cell.range==="'Vendedores'!J2:J2"&&cell.values[0][0].startsWith('Nota logística / ')));
  const before=rows.Pendientes[0][9];
  await exports.cancelOrderInAllSheets(seller,'TEST1 / TEST2','Cliente desistió');
  assert.equal(rows.Pendientes[0][9],before,'same cancellation reason must not be duplicated');
}
(async()=>{await run();await run(true);await run(false,true);console.log('PASS: all destinations, multi-row orders, routed orders, B/A and Q/P offsets, notes preserved, idempotence and independent partial failures.');})()
.catch(error=>{console.error(error);process.exitCode=1;});
