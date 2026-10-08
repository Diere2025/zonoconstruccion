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
test('aviso personal usa número diario, tipo, importe y acumulado sin datos de cliente',async()=>{
 const source=fs.readFileSync(require.resolve('../src/lib/personalOrderTelegram.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},messages=[];
 vm.runInNewContext(compiled,{exports,Intl,Date,process:{env:{LOGISTICS_TELEGRAM_BOT_TOKEN:'fake'}},fetch:async(_url,options)=>{messages.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:{message_id:1}})};},require:()=>({})});
 const db={from(table){const query={select(){return query;},eq(){return query;},gt(){return query;},gte(){return query;},lt(){return query;},neq(){return query;},order(){return query;},single:async()=>({data:{id:'a',order_date:'2026-10-01',category:'Tanques <agua>',total_amount:100,status:'Pendiente',customer_name:'Privado'}}),range:async()=>({data:table==='order_sync_jobs'?[]:[{id:'a',total_amount:100},{id:'b',total_amount:200}]})};return query;}};
 const result=await exports.sendPersonalOrderAlert(db,'a','CODIGO','2026-10-01T16:00:00Z');
 assert.equal(result.sent,true);
 const text=messages[0].text;
 assert.match(text,/Pedido N° 2/);assert.match(text,/Tanques &lt;agua&gt;/);
 assert.match(text,/Acumulado.*300,00/);
 assert.ok(!text.includes('CODIGO')&&!text.includes('Cliente')&&!text.includes('Privado'));
});
