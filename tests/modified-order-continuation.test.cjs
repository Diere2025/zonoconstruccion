const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const exports = {}, grids = new Map(), writes = [];
  let failSheet = '', failReservation = false;
  const grid = (id, name) => {
    const key = `${id}/${name}`;
    if (!grids.has(key)) grids.set(key, [[], []]);
    return grids.get(key);
  };
  const column = value => [...value].reduce((n,c) => n*26+c.charCodeAt(0)-64,0)-1;
  const parse = range => {
    const m = range.match(/^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d*)$/);
    assert.ok(m, range);
    return {name:m[1],start:column(m[2]),row:Number(m[3])-1,end:column(m[4]),last:m[5]?Number(m[5])-1:null};
  };
  const read = async (id, range) => {
    const p = parse(range), rows = grid(id,p.name);
    return rows.slice(p.row,p.last===null?undefined:p.last+1).map(row =>
      Array.from({length:p.end-p.start+1},(_,i)=>String(row[p.start+i]??'')));
  };
  const context = vm.createContext({exports,console:{error(){},warn(){}},process:{env:{}},
    read,fetch:async (url,options) => {
      const id = url.match(/spreadsheets\/([^/]+)/)[1], body = JSON.parse(options.body);
      assert.ok(url.endsWith('/values:batchUpdate'),url);
      if (id===failSheet || (failReservation && body.valueInputOption==='RAW')) return {ok:false,status:503,text:async()=>'unavailable'};
      writes.push({id,body});
      for (const entry of body.data) {
        const p = parse(entry.range), rows = grid(id,p.name);
        entry.values.forEach((values,offset) => {
          rows[p.row+offset] ||= [];
          values.forEach((value,i) => { rows[p.row+offset][p.start+i]=value; });
        });
      }
      return {ok:true};
    },require(name){
      if(name==='./orderCategory') return {detectVolumeOrderCategory:()=>null};
      if(name==='./sellerSheetMaintenance') return {restoreSellerRowFormats:async()=>{}};
      if(name==='./cancelledOrderSheet') return {};
      if(name==='./sheetProducts') return {normalizeProductNameForSheet:name=>name};
      throw new Error(name);
    }});
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/googleSheets.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,context);
  vm.runInContext("getGoogleAccessToken=async()=> 'token'; fetchSpreadsheetValues=read; ensureOrderSheetRowCapacity=async()=>{}; restoreMissingCalculatedFormulas=async()=>{}; formatSheetNoteCell=async()=>{}",context);
  const seller = exports.SELLER_SHEET_CONFIG['13430e05-b61a-4a3f-9fc3-152d377c4b0c'];
  const central = exports.CENTRAL_ORDERS_SHEET, deliveries = exports.DELIVERIES_CURRENT_SHEET;
  for (const [id,name,offset] of [[seller.spreadsheetId,'Pendientes',0],[central.spreadsheetId,central.sheetName,0],[deliveries.spreadsheetId,'Entregando',-1]]) {
    const row=grid(id,name)[1]; row[1+offset]='JS26307'; row[5+offset]='Cliente';
    row[16+offset]=offset===-1?'🟡 Entregando':'🔹 Pasado';
    row[25+offset]='=RECARGO'; row[29+offset]='=SALDO';
  }
  // Las continuaciones pueden quedar antes que el código original en otra hoja.
  grid(seller.spreadsheetId,'Pendientes').push([]);
  grid(seller.spreadsheetId,'Pendientes')[2][1]='JS26399';
  const order = count => ({clientName:'Cliente',sellerName:'Jazmín',category:'BIODIGESTOR',deliveryNotes:'ANTES DEL SABADO',
    depositOrPaidAmount:100,freightCost:200,paymentStatus:'Señado',items:Array.from({length:count},(_,i)=>({name:`Producto ${i+1}`,sku:`P${i+1}`,quantity:1,unitPrice:1000+i}))});
  const prepare = (code,payload,persist) => exports.prepareOrderModificationCodes(seller.spreadsheetId,'Pendientes',code,payload,persist);
  const sync = async (code,payload) => {
    const result=await exports.syncOrderModificationToOperationalSheets(code,payload);
    await exports.updateOrderInSellerSheet(seller.spreadsheetId,'Pendientes',code,payload,undefined,'🔹 Pasado');
    return result;
  };
  return {exports,grid,writes,seller,central,deliveries,order,prepare,sync,
    fail(id){failSheet=id;}, failReservation(value){failReservation=value;}};
}

for (const count of [12,13,25]) test(`${count} productos: reparte sin perder artículos y conserva importes, fórmulas y ruteo`,async()=>{
  const f=fixture(), order=f.order(count); let stored='JS26307', assignments=0;
  const code=await f.prepare(stored,order,async value=>{stored=value;assignments++;});
  const codes=code.split(' / ');
  assert.equal(codes.length,Math.ceil(count/12));
  assert.equal(assignments,count>12?1:0);
  const result=await f.sync(code,order);
  assert.equal(result.central.success,true); assert.equal(result.deliveriesCurrent.success,true);
  for(const [id,names,offset] of [[f.seller.spreadsheetId,['Pendientes'],0],[f.central.spreadsheetId,[f.central.sheetName],0],[f.deliveries.spreadsheetId,['Entregando','Vendedores'],-1]]) {
    const rows=names.flatMap(name=>f.grid(id,name)).filter(row=>codes.includes(row[1+offset]));
    assert.equal(rows.length,codes.length);
    codes.forEach((code,index)=>{
      const row=rows.find(row=>row[1+offset]===code);
      const products=Array.from({length:12},(_,i)=>row[30+offset+4*i]).filter(Boolean);
      assert.deepEqual(products,order.items.slice(index*12,(index+1)*12).map(item=>item.name));
      assert.equal(row[24+offset],index===0?100:0);
      assert.equal(row[27+offset],index===0?200:0);
      assert.equal(row[23+offset],index===0?'Señado':'Abonado');
      assert.equal(row[10+offset],codes.length>1?`VA CON EL PEDIDO ${codes.filter(c=>c!==code).join(' / ')} / ANTES DEL SABADO`:'ANTES DEL SABADO');
    });
    const original=rows.find(row=>row[1+offset]==='JS26307');
    assert.equal(original[25+offset],'=RECARGO'); assert.equal(original[29+offset],'=SALDO');
    if(offset===-1) assert.equal(original[15],'🟡 Entregando');
  }
  const again=await f.prepare(stored,order,async()=>{throw new Error('No debe asignar otro código');});
  await f.sync(again,order);
  assert.equal(again,code);
  assert.equal(f.grid(f.central.spreadsheetId,f.central.sheetName).filter(row=>row[1]==='JS26399').length,count>12?1:0);
});

test('si falla la reserva después de guardar en ERP, reintenta con los mismos códigos',async()=>{
  const f=fixture(), order=f.order(13);let stored='JS26307';
  f.failReservation(true);
  await assert.rejects(f.prepare(stored,order,async code=>{stored=code;}),/reservar/);
  assert.equal(stored,'JS26307 / JS26399');
  f.failReservation(false);
  assert.equal(await f.prepare(stored,order,async()=>assert.fail('código duplicado')),stored);
  const result=await f.sync(stored,order);assert.equal(result.central.success,true);
});

test('falla operativa informa parcial y un reintento crea sólo la continuación faltante',async()=>{
  const f=fixture(),order=f.order(13);let stored='JS26307';
  stored=await f.prepare(stored,order,async()=>{});
  f.fail(f.central.spreadsheetId);
  const first=await f.sync(stored,order);
  assert.equal(first.central.success,false);assert.equal(first.deliveriesCurrent.success,true);
  f.fail('');
  const retry=await f.sync(stored,order);assert.equal(retry.central.success,true);
  assert.equal(f.grid(f.deliveries.spreadsheetId,'Vendedores').filter(row=>row[0]==='JS26399').length,1);
});

test('actualiza el primer código declarado aunque la continuación esté antes físicamente',async()=>{
  const f=fixture(), order=f.order(13),rows=f.grid(f.seller.spreadsheetId,'Pendientes');
  [rows[1],rows[2]]=[rows[2],rows[1]]; rows[1][5]='Cliente';
  await f.exports.updateOrderInSellerSheet(f.seller.spreadsheetId,'Pendientes','JS26307 / JS26399',order);
  assert.equal(rows[2][30],'Producto 1');assert.equal(rows[1][30],'Producto 13');
  assert.equal(rows[2][24],100);assert.equal(rows[1][24],0);
});

function routeFixture() {
  const f=fixture(), exports={}, stored={id:'order-id',legacy_code:'JS26307'};
  const reports=[];
  const db={rpc:async()=>({data:null,error:null}),from(table){assert.equal(table,'orders');let patch;return {
    select(){return this;},update(value){patch=value;return this;},
    eq(key,value){if(patch){assert.equal(key,'id');Object.assign(stored,patch);return Promise.resolve({error:null});}return this;},
    maybeSingle:async()=>({data:{...stored},error:null})
  };}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/vendedores/update-sheet-order/route.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{exports,crypto:require('node:crypto').webcrypto,process:{env:{}},console:{error(){},warn(){}},require(name){
    if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
    if(name==='@supabase/supabase-js')return {createClient:()=>db};
    if(name==='@/lib/googleSheets')return f.exports;
    if(name==='@/lib/orderModificationNotices')return {finishOrderModificationNotice:async(db,id,code,results,failures)=>{reports.push({id,code,results,failures});return {managed:true,sent:true,pending:false};}};
    throw new Error(name);
  }});
  return {...f,stored,reports,run:()=>exports.POST({json:async()=>({sellerId:'13430e05-b61a-4a3f-9fc3-152d377c4b0c',orderId:stored.id,
    legacyCode:'JS26307',order:f.order(13)})})};
}

test('API guarda ambos códigos en ERP y devuelve parcial si falla Central; reintenta aun con código viejo de la UI',async()=>{
  const f=routeFixture();f.fail(f.central.spreadsheetId);
  const partial=await f.run();assert.equal(partial.status,200);assert.equal(partial.body.synced,false);
  assert.equal(partial.body.code,'JS26307 / JS26399');assert.equal(f.stored.legacy_code,partial.body.code);
  assert.ok(f.reports[0].failures.length>0);assert.equal(partial.body.modificationNotice.managed,true);
  f.fail('');
  const retry=await f.run();assert.equal(retry.body.synced,true);assert.equal(retry.body.code,partial.body.code);
  assert.equal(f.grid(f.deliveries.spreadsheetId,'Vendedores').filter(row=>row[0]==='JS26399').length,1);
});

test('API devuelve los códigos persistidos incluso si falla la escritura de reserva',async()=>{
  const f=routeFixture();f.failReservation(true);
  const failed=await f.run();assert.equal(failed.status,500);assert.equal(failed.body.code,'JS26307 / JS26399');
  assert.match(f.reports[0].failures[0],/reservar/);
  f.failReservation(false);
  const retry=await f.run();assert.equal(retry.body.synced,true);assert.equal(retry.body.code,failed.body.code);
});

test('No está mantiene su circuito: genera continuación sólo en vendedora',async()=>{
  const f=routeFixture();f.grid(f.seller.spreadsheetId,'Pendientes')[1][0]='No está';
  const result=await f.run();assert.equal(result.body.synced,true);assert.equal(result.body.operationalSyncSkipped,true);
  assert.equal(f.grid(f.seller.spreadsheetId,'Pendientes')[2][30],'Producto 13');
  assert.equal(f.writes.some(write=>write.id!==f.seller.spreadsheetId),false);
});

test('al volver a editar no duplica los prefijos de pedidos hermanos',async()=>{
  const f=fixture(),order=f.order(13);order.deliveryNotes='VA CON EL PEDIDO JS26399 / ANTES DEL SABADO';
  const code=await f.prepare('JS26307',order,async()=>{});await f.sync(code,order);
  const original=f.grid(f.seller.spreadsheetId,'Pendientes')[1];
  assert.equal(original[10],'VA CON EL PEDIDO JS26399 / ANTES DEL SABADO');
});
