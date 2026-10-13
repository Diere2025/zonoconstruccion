const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');function compile(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,Intl,Map,Set,Number,String,JSON,require:name=>imports[name]||{}});return exports;}
const helper=compile('src/lib/logisticsDispatch/digitalTickets.ts',{'@/lib/orderSync':compile('src/lib/orderSync.ts')});
const settlement=tickets=>[{treasury_settlements:{id:'s',treasury_settlement_electronic_tickets:tickets}}];const ticket={id:'ticket',amount:100,mp_payment_id:null};const payment={id:'mp',amount:100,order_id:'o',order_code:'JS1',received_at:'2026-10-11T01:30:00Z',is_verified:true,is_hidden:false,is_internal:false};const attempts=[{order_id:'o',order_code:'JS1',executed:true}];
const resolve=(tickets,payments)=>helper.resolveDispatchDigitalTickets(settlement(tickets),payments,attempts,'2026-10-10')[0].treasury_settlements.treasury_settlement_electronic_tickets;
assert.equal(resolve([ticket],[payment])[0].digital_match.state,'unique_verified_match');assert.equal(ticket.mp_payment_id,null);
assert.equal(resolve([ticket],[payment,{...payment,id:'other'}])[0].digital_match.state,'ambiguous');
assert.equal(resolve([ticket,{...ticket,id:'second'}],[payment])[0].digital_match.state,'ambiguous');
assert.equal(resolve([ticket],[{...payment,order_id:'other'}])[0].digital_match.state,'unmatched');
assert.equal(resolve([ticket],[{...payment,received_at:'2026-10-11T04:00:00Z'}])[0].digital_match.state,'unmatched');
assert.equal(resolve([ticket],[{...payment,is_verified:false}])[0].digital_match.state,'unmatched');
assert.equal(resolve([{...ticket,order_code:'JS10'}],[payment])[0].digital_match.state,'unmatched');
assert.equal(resolve([{...ticket,mp_payment_id:'mp'},ticket],[payment])[1].digital_match.state,'unmatched');
console.log('PASS unique ticket evidence, Argentina date, no writes, ambiguous amount, duplicate tickets, membership and verified status.');
assert.equal(helper.resolveDispatchDigitalTickets(settlement([{...ticket,mp_payment_id:'mp'}]),[payment],[],'2026-10-10')[0].treasury_settlements.treasury_settlement_electronic_tickets[0].digital_match.state,'linked_verified');
assert.equal(helper.resolveDispatchDigitalTickets(settlement([{...ticket,order_id:'o',order_code:'JS1'}]),[payment],[],'2026-10-10')[0].treasury_settlements.treasury_settlement_electronic_tickets[0].digital_match.state,'unique_verified_match');

assert.equal(resolve([{...ticket,order_id:'o',order_code:'js1'}],[payment])[0].digital_match.state,'unique_verified_match');
