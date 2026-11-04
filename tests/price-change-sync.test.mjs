import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{sheetBatch,syncSheet,priceMessage,processJob,execute} from '../workers/price-sync/index.mjs';
const job={id:'e30a8b2b-bb6d-4d2c-874d-cc3e93dce163',product_name:'Polacrin Satinado 10L',sheet_product:'Polacrin - Látex Lavable Interior Satinado 10L',old_price:97800,new_price:87800,effective_date:'2026-11-04',chat_id:'-1003721150179',sheet_state:'pending',telegram_state:'pending'};
test('appends a native calendar date and atomic event marker without overwriting history',()=>{
 const batch=sheetBatch(job);assert.equal(batch.requests[0].appendCells.rows[0].values[0].userEnteredValue.numberValue,46330);
 assert.equal(batch.requests[0].appendCells.rows[0].values[0].userEnteredFormat.numberFormat.pattern,'dd/mm/yyyy');
 assert.equal(batch.requests[0].appendCells.rows[0].values[2].userEnteredValue.numberValue,87800);
 assert.equal(batch.requests[1].createDeveloperMetadata.developerMetadata.metadataValue,job.id);
});
test('notification gives the effective day and both prices independently of English locale',()=>{
 const msg=priceMessage(job);assert.match(msg.text,/04\/11\/2026/);assert.match(msg.text,/\$97\.800/);assert.match(msg.text,/\$87\.800/);assert.equal(msg.chat_id,job.chat_id);
});
test('a recovered Google request does not append a duplicate row',async()=>{
 let calls=0;assert.deepEqual(await syncSheet(job,'token',async()=>{calls++;return Response.json({matchedDeveloperMetadata:[{}]});}),{existing:true});assert.equal(calls,1);
});
test('sends only after Sheets succeeds and records send intent first',async()=>{
 const steps=[];await processJob(job,{sheet:async()=>steps.push('sheet'),patch:async(p)=>steps.push(p.telegram_state||p.sheet_state),send:async()=>{steps.push('send');return {ok:true,result:{message_id:36}};}});
 assert.deepEqual(steps,['sheet','sent','sending','send','sent']);
});
test('Google failures remain pending and never send an inaccurate confirmation',async()=>{
 const patches=[];const result=await processJob(job,{sheet:async()=>{throw Error('timeout')},patch:async p=>patches.push(p),send:async()=>assert.fail('must not send')});
 assert.equal(result.sheet,false);assert.equal(patches[0].retry_seconds,60);assert.ok(!patches[0].sheet_state);
});
test('confirmed sheet writes are not repeated when Telegram retries',async()=>{
 const patches=[];await processJob({...job,sheet_state:'sent'},{sheet:async()=>assert.fail(),patch:async p=>patches.push(p),send:async()=>({ok:false,error_code:429,parameters:{retry_after:600}})});
 assert.equal(patches.at(-1).telegram_state,'pending');assert.equal(patches.at(-1).retry_seconds,600);
});
test('ambiguous Telegram deliveries stop for review; later runs do not resend',async()=>{
 const patches=[];const deps={sheet:async()=>{},patch:async p=>patches.push(p),send:async()=>{throw Error('connection lost')}};
 assert.equal((await processJob(job,deps)).unknown,true);assert.equal(patches.at(-1).telegram_state,'unknown');
 await processJob({...job,sheet_state:'sent',telegram_state:'unknown'},{...deps,send:async()=>assert.fail('unknown must not resend')});
});
test('failure to persist a confirmed Telegram delivery does not retry sendMessage',async()=>{
 let sends=0;await assert.rejects(()=>processJob({...job,sheet_state:'sent'},{sheet:async()=>{},patch:async p=>{if(p.telegram_state==='sent')throw Error('db offline')},send:async()=>{sends++;return {ok:true,result:{message_id:9}}}}));assert.equal(sends,1);
});
test('an empty queue makes no Google or Telegram calls',async()=>{
 let calls=0;const result=await execute({SUPABASE_URL:'https://test',SUPABASE_ANON_KEY:'anon',CONTROL_TOKEN:'secret'},async url=>{assert.match(url,/claim_price_change$/);calls++;return Response.json([])});assert.equal(result.processed,0);assert.equal(calls,1);
});
test('authenticated webhook durably queues a wakeup before returning 202',async()=>{
 let queued=0;const env={CONTROL_TOKEN:'secret',PRICE_CHANGES:{send:async data=>{assert.equal(data.kind,'price-change');queued++;}}};
 const response=await worker.fetch(new Request('https://test/wake',{method:'POST',headers:{authorization:'Bearer secret'}}),env);
 assert.equal(response.status,202);assert.equal(queued,1);assert.deepEqual(await response.json(),{accepted:true});
});
test('webhook rejects missing credentials and does not claim to accept a failed enqueue',async()=>{
 let queued=0;const env={CONTROL_TOKEN:'secret',PRICE_CHANGES:{send:async()=>{queued++;throw Error('Queue unavailable')}}};
 assert.equal((await worker.fetch(new Request('https://test/wake',{method:'POST'}),env)).status,401);assert.equal(queued,0);
 await assert.rejects(()=>worker.fetch(new Request('https://test/wake',{method:'POST',headers:{authorization:'Bearer secret'}}),env));assert.equal(queued,1);
});
test('worker has no scheduled polling handler',()=>{assert.equal(worker.scheduled,undefined);});
test('queue consumer stops when no registered changes remain',async()=>{
 const original=globalThis.fetch;let acked=0,retries=0;
 globalThis.fetch=async url=>Response.json(String(url).endsWith('claim_price_change')?[]:null);
 try{await worker.queue({messages:[{ack:()=>acked++,retry:()=>retries++}]},{SUPABASE_URL:'https://test',CONTROL_TOKEN:'secret'});assert.equal(acked,1);assert.equal(retries,0);}finally{globalThis.fetch=original;}
});
test('a reserved or delayed event schedules a targeted retry',async()=>{
 const original=globalThis.fetch;let delay;let acked=false;
 globalThis.fetch=async url=>Response.json(String(url).endsWith('claim_price_change')?[]:123);
 try{await worker.queue({messages:[{ack:()=>{acked=true},retry:options=>{delay=options.delaySeconds}}]},{SUPABASE_URL:'https://test',CONTROL_TOKEN:'secret'});assert.equal(delay,123);assert.equal(acked,false);}finally{globalThis.fetch=original;}
});
test('temporary database failure retains the queue message for retry',async()=>{
 const original=globalThis.fetch;let delay;
 globalThis.fetch=async()=>{throw Error('Database unavailable')};
 try{await worker.queue({messages:[{ack:()=>assert.fail(),retry:options=>{delay=options.delaySeconds}}]},{SUPABASE_URL:'https://test',CONTROL_TOKEN:'secret'});assert.equal(delay,60);}finally{globalThis.fetch=original;}
});
