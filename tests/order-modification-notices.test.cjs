const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,context={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...context});return exports;}
const sync=load('src/lib/orderSync.ts');
function fixture({failSend=false,noToken=false,failTicket=false}={}){
 const notice={id:'event',lease:'lease',original_code:'JS26307',code:'JS26307 / JS26399',new_codes:['JS26399'],failures:[],telegram_error:'',
 details:{clientName:'Ángel <Grossi>',sellerName:'Jazmín',items:Array.from({length:13},(_,i)=>({name:i===12?'Flotante Eco Varilla Plástica 1/2"':`Producto ${i+1}`,quantity:1}))},
 results:{seller:{success:true},central:{success:true},deliveriesCurrent:{success:true}}};
 const calls=[],messages=[];let claimed=false;
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:notice})}),rpc:async(name,args)=>{calls.push({name,args});
  if(name==='claim_order_modification_notice'){if(claimed)return {data:[]};claimed=true;return {data:[{...notice}]};}
  if(name==='prepare_order_modification_ticket'){
   if(failTicket)return {error:{message:'support unavailable'}};
   if(notice.failures.length || notice.telegram_error){notice.ticket_id='ticket';notice.ticket_number=1234;}
   return {data:{...notice}};
  }
  if(name==='complete_order_modification_notice'){if(!args.p_sent)notice.telegram_error=args.p_error;else notice.sent_at='sent';return {data:null};}
  if(name==='finish_order_modification_notice')return {data:null};
  throw new Error(name);
 }};
 const lib=load('src/lib/orderModificationNotices.ts',{require:()=>sync,process:{env:noToken?{}:{LOGISTICS_TELEGRAM_BOT_TOKEN:'test-token'}},AbortSignal,
 console:{error(){}},fetch:async(url,options)=>{messages.push(JSON.parse(options.body));return {ok:!failSend,json:async()=>failSend?{ok:false,description:'Telegram unavailable'}:{ok:true,result:{message_id:99}}};}});
 return {lib,db,notice,calls,messages};
}
test('aviso especial identifica origen, nuevo código, producto y referencias cruzadas',()=>{
 const f=fixture(),message=f.lib.buildOrderModificationNotice(f.notice);
 assert.match(message,/NUEVO CÓDIGO POR MODIFICACIÓN/);assert.match(message,/pedido <b>JS26399<\/b> por la modificación del pedido <b>JS26307/);
 assert.match(message,/Flotante Eco/);assert.match(message,/JS26307: VA CON EL PEDIDO JS26399/);
 assert.match(message,/Ángel &lt;Grossi&gt;/);assert.doesNotMatch(message,/Ticket|CON FALLAS/);
});
test('fallo de planilla incluye ticket a Diego y no informa éxito en esa planilla',async()=>{
 const f=fixture();f.notice.failures=['Central no respondió'];f.notice.results.central={success:false,message:'sin acceso'};
 const result=await f.lib.processOrderModificationNotice(f.db,'event');assert.equal(result.sent,true);assert.equal(result.ticketId,'ticket');
 assert.match(f.messages[0].text,/MODIFICACIÓN CON FALLAS/);assert.match(f.messages[0].text,/❌ Central: sin acceso/);
 assert.match(f.messages[0].text,/Ticket #1234 asignado a Diego/);
 const completed=f.calls.find(c=>c.name==='complete_order_modification_notice');assert.equal(completed.args.p_lease,'lease');assert.equal(completed.args.p_message,99);
});
for(const mode of ['Telegram caído','sin bot'])test(`${mode}: crea ticket y deja el envío para reintento`,async()=>{
 const f=fixture({failSend:mode==='Telegram caído',noToken:mode==='sin bot'});
 const result=await f.lib.processOrderModificationNotice(f.db);assert.equal(result.sent,false);assert.equal(result.pending,true);assert.equal(result.ticketId,'ticket');
 assert.equal(f.calls.find(c=>c.name==='complete_order_modification_notice').args.p_sent,false);
 assert.equal(f.calls.at(-1).name,'prepare_order_modification_ticket');
});
test('no envía si no puede registrar el ticket de una falla',async()=>{
 const f=fixture({failTicket:true});f.notice.failures=['falló la actualización'];
 const result=await f.lib.processOrderModificationNotice(f.db);assert.equal(result.pending,true);assert.equal(f.messages.length,0);
});
test('no vuelve a enviar cuando no puede reclamar otro aviso',async()=>{
 const f=fixture();await f.lib.processOrderModificationNotice(f.db);const result=await f.lib.processOrderModificationNotice(f.db);
 assert.equal(result.pending,false);assert.equal(f.messages.length,1);
});
test('si otro intento ya lo envió, devuelve el estado guardado sin duplicar Telegram',async()=>{
 const f=fixture();await f.lib.processOrderModificationNotice(f.db,'event');
 const again=await f.lib.processOrderModificationNotice(f.db,'event');
 assert.equal(again.sent,true);assert.equal(again.pending,false);assert.equal(f.messages.length,1);
});
test('mensajes largos mantienen ticket, estados y HTML completo dentro del límite',()=>{
 const f=fixture();f.notice.new_codes=[];f.notice.details.changes=Array(20).fill('<producto>'.repeat(100));
 f.notice.failures=['ERROR'.repeat(500)];f.notice.ticket_id='ticket';f.notice.ticket_number=1234;
 const message=f.lib.buildOrderModificationNotice(f.notice);assert.ok(message.length<=4096);assert.match(message,/Ticket #1234/);
 assert.equal((message.match(/<b>/g)||[]).length,(message.match(/<\/b>/g)||[]).length);
});
