/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {summarizeSales,formatReport,dayAt,allRows}=require('../scripts/send-daily-sales-report.cjs');
test('ventas agrupadas sin cancelados; top neto con descuentos y categorías equivalentes',()=>{
 const orders=[{id:'a',category:'TANQUES',total_amount:200,order_discount_amount:20},{id:'b',category:'Tanques de Agua',total_amount:100},{id:'c',category:'LATEX',total_amount:900,status:'Cancelado'}];
 const items=[{order_id:'a',product_id:'p',product_name:'Tanque',quantity:2,unit_price:100,discount_percentage:10},{order_id:'b',product_id:'p',product_name:'Tanque',quantity:1,unit_price:80},{order_id:'c',product_id:'q',product_name:'Látex',quantity:1,unit_price:900},{order_id:'a',product_id:'zero',product_name:'Incluido',quantity:1,unit_price:0}];
 const result=summarizeSales(orders,items);
 assert.equal(result.count,2);assert.equal(result.revenue,300);
 assert.deepEqual(result.categories,[{name:'Tanques',revenue:300}]);
 assert.deepEqual(result.topProducts,[{name:'Tanque',quantity:3,revenue:240}]);
});
test('proyección a medianoche argentina y CPR sin divisiones por cero',()=>{
 const now=new Date('2026-10-02T02:00:00Z');
 assert.equal(dayAt(now),'2026-10-01');
 const sales={count:17,revenue:3796867,categories:[],topProducts:[]};
 const text=formatReport(sales,{spend:230,messages:230},now);
 assert.match(text,/Proyectado al cierre: US\$\s240,00/);
 assert.match(text,/Proyectadas al cierre: 240/);
 assert.match(text,/CPR.*US\$\s1,00/);
 assert.match(formatReport(sales,{spend:0,messages:0},now),/Sin conversaciones/);
 assert.ok(!text.includes('NaN'));
});
test('paginación consulta todas las ventas incluso por encima de mil',async()=>{
 let pages=0;
 const result=await allRows(()=>({range:async(from,to)=>{pages++;assert.equal(to-from,999);return {data:Array.from({length:from===0?1000:2},(_,i)=>from+i)};}}));
 assert.equal(pages,2);assert.equal(result.length,1002);
});
test('el resumen crea un mensaje por fecha y edita ese mismo mensaje con los nuevos totales',async()=>{
 const source=fs.readFileSync(require.resolve('../src/lib/personalOrderTelegram.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},messages=[];
 let date='2026-10-01';
 let rejectWithoutResponse=false;
 const saved=new Map();
 const orders=[{category:'Tanques <agua>',total_amount:100,customer_name:'Privado'}];
 vm.runInNewContext(compiled,{
  exports,Intl,Date,AbortSignal,process:{env:{LOGISTICS_TELEGRAM_BOT_TOKEN:'fake'}},
  fetch:async(url,options)=>{
   messages.push({method:url.split('/').at(-1),...JSON.parse(options.body)});
   if(rejectWithoutResponse) throw new Error('timeout');
   return {ok:true,json:async()=>({ok:true,result:{message_id:messages.length}})};
  },
 });
 const db={from(table){
  if(table==='daily_order_telegram_messages') return {
   select:()=>({match:key=>({maybeSingle:async()=>({data:saved.get(key.order_date)})})}),
   insert:async key=>{assert.ok(!saved.has(key.order_date));saved.set(key.order_date,{message_id:null});return {};},
   update:row=>({match:async key=>{saved.set(key.order_date,row);return {};}}),
  };
  assert.equal(table,'orders');
  const query={
   select:()=>query,eq:()=>query,gte:()=>query,lt:()=>query,order:()=>query,
   not:(...args)=>{assert.deepEqual(args,['status','in','(Cancelado,Anulado)']);return query;},
   single:async()=>({data:{order_date:date,status:'Pendiente'}}),
   range:async()=>({data:orders}),
  };
  return query;
 }};
 assert.equal((await exports.sendPersonalOrderAlert(db,'a')).sent,true);
 orders.push({category:'tanques <agua>',total_amount:200},{category:'MEP',total_amount:350});
 assert.equal((await exports.sendPersonalOrderAlert(db,'b')).sent,true);
 assert.equal(messages[0].method,'sendMessage');
 assert.equal(messages[1].method,'editMessageText');
 assert.equal(messages[1].message_id,1);
 const text=messages[1].text;
 assert.match(text,/Pedidos del 01\/10\/2026/);
 assert.match(text,/Cantidad de pedidos:<\/b> 3/);
 assert.match(text,/MEP: 1 pedido · \$\s350,00\n• TANQUES &lt;AGUA&gt;: 2 pedidos · \$\s300,00/);
 assert.match(text,/Acumulado.*650,00/);
 assert.ok(!text.includes('Privado'));

 date='2026-10-02';
 rejectWithoutResponse=true;
 await assert.rejects(exports.sendPersonalOrderAlert(db,'c'),/no confirmó/);
 assert.equal(messages[2].method,'sendMessage');
 rejectWithoutResponse=false;
 await assert.rejects(exports.sendPersonalOrderAlert(db,'c'),/sin confirmar/);
 assert.equal(messages.length,3);
});
