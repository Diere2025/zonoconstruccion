const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}) { const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name in imports)return imports[name];throw new Error(name);},structuredClone,Date,Map,Set,Promise,Intl,console:{log(){},error(){}},process:{env:{}}});return exports; }
const review=load('src/lib/logisticsReview.ts');
const now=new Date('2026-10-09T12:00:00Z');
test('defaults to three calendar days, weekly full review and Argentina day boundary',()=>{
 const recent=review.logisticsReviewPolicy({},'2026-10-08T12:00:00Z',now);
 assert.equal(recent.mode,'recent');assert.equal(recent.since,'2026-10-07');
 assert.equal(review.logisticsReviewPolicy({reviewDays:7},'2026-10-08T12:00:00Z',now).since,'2026-10-03');
 assert.equal(review.logisticsReviewPolicy({},null,now).mode,'full');
 assert.equal(review.logisticsReviewPolicy({},'2026-10-02T12:00:00Z',now).mode,'full');
 assert.equal(review.logisticsReviewPolicy({reviewMode:'full'},now.toISOString(),now).mode,'full');
 assert.equal(review.logisticsReviewPolicy({},'2026-10-08T12:00:00Z',new Date('2026-10-09T01:00:00Z')).today,'2026-10-08');
 assert.equal(review.logisticsReviewPolicy({reviewMode:'resolved-recent',reviewSince:'2026-10-01'},null,now).since,'2026-10-01');
 assert.throws(()=>review.logisticsReviewPolicy({reviewSince:'2026-02-30'},now.toISOString(),now),/fecha/);
 assert.throws(()=>review.logisticsReviewPolicy({reviewSince:'2026-10-10'},now.toISOString(),now),/fecha/);
});
test('old delivered orders are excluded only when state and actual delivery date are reconciled',()=>{
 const policy=review.logisticsReviewPolicy({},now.toISOString(),now);
 const old={status:'🟢 Entregado',realDeliveryDate:'2026-09-01',ambiguousDeliveryDate:false,preserveCommercialData:false};
 const db={status:'Entregado',hasRealDeliveryDate:true};
 assert.equal(review.shouldReviewLogisticsOrder(old,db,policy),false);
 assert.equal(review.shouldReviewLogisticsOrder({...old,realDeliveryDate:'2026-10-07'},db,policy),true);
 for(const order of [{...old,status:'Entregando'},{...old,preserveCommercialData:true},{...old,realDeliveryDate:null},{...old,ambiguousDeliveryDate:true}]) assert.equal(review.shouldReviewLogisticsOrder(order,db,policy),true);
 assert.equal(review.shouldReviewLogisticsOrder(old,{...db,status:'Confirmado'},policy),true);
 assert.equal(review.shouldReviewLogisticsOrder(old,{...db,hasRealDeliveryDate:false},policy),true);
 assert.equal(review.shouldReviewLogisticsOrder(old,undefined,policy),true);
});

test('route filters history, keeps missing dates, preserves cursors across workers, and records only complete runs',async()=>{
 const sync=load('src/lib/orderSync.ts'),cache=load('src/lib/runReadCache.ts');
 const old='2020-01-01',today=review.logisticsReviewPolicy({},new Date().toISOString()).today;
 const orders=[{id:'old',legacy_code:'DB1',status:'Entregado',total_amount:0,deliveries:{real_delivery_date:old}},{id:'pending',legacy_code:'AQ-FP00031',status:'Entregado',total_amount:0,deliveries:[{real_delivery_date:null}]},{id:'recent',legacy_code:'DB3',status:'Entregado',total_amount:0,deliveries:[{real_delivery_date:today}]}];
 const settings=[{id:review.LOGISTICS_REVIEW_SETTING,value:JSON.stringify({completedAt:new Date().toISOString()})}];
 let failOrders=false,writes=0;
 const db={from(table){let rows=table==='orders'?orders:table==='site_settings'?settings:table==='deliveries'?orders.map(o=>({order_id:o.id,real_delivery_date:(Array.isArray(o.deliveries)?o.deliveries[0]:o.deliveries).real_delivery_date})):[],patch,upsert,single=false;
 const q={select(){return q;},not(){return q;},range(a,b){rows=rows.slice(a,b+1);return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},in(k,ids){rows=rows.filter(r=>ids.includes(r[k]));return q;},is(k,v){rows=rows.filter(r=>r[k]===v);return q;},maybeSingle(){single=true;return q;},upsert(value){upsert=value;return q;},update(value){patch=value;return q;},then(resolve){if(failOrders&&table==='orders'&&patch)return Promise.resolve({data:null,error:{message:'write failed'}}).then(resolve);
 if(patch){writes++;for(const row of rows){Object.assign(row,patch);if(table==='deliveries')orders.find(o=>o.id===row.order_id).deliveries[0].real_delivery_date=row.real_delivery_date;}}
 if(upsert){const existing=settings.find(r=>r.id===upsert.id);if(existing)Object.assign(existing,upsert);else settings.push(upsert);writes++;}
 return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null}).then(resolve);}};return q;}};
 const dateText=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
 const csv=['header',...orders.map(o=>{const r=Array(30).fill('');r[0]=o.legacy_code;r[1]=dateText(o.id==='recent'?today:old);r[15]='🟢 Entregado';r[27]='0';return r.map(JSON.stringify).join(',');})].join('\n');
 const imports={'next/server':{NextResponse:{json:body=>body}},'@supabase/supabase-js':{createClient:()=>db},'@/lib/googleSheets':{fetchSpreadsheetCsv:async()=>csv,fetchSpreadsheetValues:async()=>[]},'@/lib/cancelledOrderSheet':{logisticsCancellationReasons:()=>new Map(),logisticsCancellationReason:()=>''},'@/lib/orderSync':sync,'@/lib/logisticsBatchItems':{loadLogisticsBatchItems:async()=>[]},'@/lib/runReadCache':cache,'@/lib/logisticsReview':review};
 const run=(route,options)=>route.POST({json:async()=>options});
 let route=load('src/app/api/admin/audit-deliveries/route.ts',imports);
 const dry=await run(route,{syncRunId:'dry',batchSize:1,dryRun:true});assert.equal(dry.success,true,JSON.stringify(dry));assert.equal(dry.totalOrders,2);assert.equal(dry.excludedHistoricalOrdersCount,1);assert.equal(writes,0);
 const first=await run(route,{syncRunId:'recent',batchSize:1});assert.equal(first.success,true,JSON.stringify(first));assert.equal(first.syncedDeliveryDatesCount,1);assert.equal(first.done,false);
 route=load('src/app/api/admin/audit-deliveries/route.ts',imports); // a different worker reloads the now repaired delivery
 const second=await run(route,{syncRunId:'recent',batchSize:1,cursor:1,reviewMode:'resolved-recent',reviewSince:first.review.since,reviewOrderCodes:first.reviewOrderCodes});assert.equal(second.success,true,JSON.stringify(second));assert.equal(second.totalOrders,2);assert.equal(second.nextCursor,2);assert.equal(second.done,true);assert.equal(second.fullReviewRecorded,false);
 settings[0].value=JSON.stringify({completedAt:null});
 const incomplete=await run(route,{syncRunId:'weekly',batchSize:1});assert.equal(incomplete.review.mode,'full');assert.equal(incomplete.fullReviewRecorded,false);assert.equal(JSON.parse(settings[0].value).completedAt,null);
 orders[1].total_amount=10;failOrders=true;
 const failed=await run(route,{syncRunId:'weekly',batchSize:1,cursor:1,reviewMode:'full',reviewOrderCodes:incomplete.reviewOrderCodes});assert.match(failed.error,/write failed/);assert.equal(JSON.parse(settings[0].value).nextCursor,1);assert.equal(JSON.parse(settings[0].value).completedAt,null);
 failOrders=false;
 const middle=await run(route,{syncRunId:'weekly',batchSize:1,cursor:1,reviewMode:'full',reviewOrderCodes:incomplete.reviewOrderCodes});assert.equal(middle.fullReviewRecorded,false);
 const last=await run(route,{syncRunId:'weekly',batchSize:1,cursor:2,reviewMode:'full',reviewOrderCodes:incomplete.reviewOrderCodes});assert.equal(last.fullReviewRecorded,true);assert.ok(JSON.parse(settings[0].value).completedAt);
 settings[0].value=JSON.stringify({completedAt:null});
 const orphan=await run(route,{syncRunId:'orphan',batchSize:1,cursor:2,reviewMode:'full'});assert.equal(orphan.fullReviewRecorded,false);assert.equal(JSON.parse(settings[0].value).completedAt,null);
});
