const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');const ts=require('typescript');
const lib={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/meta-ads-fx.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:lib,fetch,AbortSignal,Date,Number,Math,Promise});
const offer=(price,extra={})=>({adv:{price:String(price),minSingleTransAmount:'1000',maxSingleTransAmount:'2000000',surplusAmount:'2000',...extra}});
const good=[offer(1600),offer(1602),offer(1604)];
test('median excludes unusable liquidity, limits and invalid prices',()=>{assert.equal(lib.selectBinanceRate([...good,offer(1,{surplusAmount:'1'}),offer(1200,{minSingleTransAmount:'2000000'}),offer('NaN')]),1602);assert.throws(()=>lib.selectBinanceRate(good.slice(0,2)));});
test('fee is applied once, cache coalesces and expiry never fabricates ARS',async()=>{
 let now=1800000000000,calls=0,fail=false;
 const get=lib.createMetaFxProvider(async()=>{calls++;if(fail)throw Error('network');return {ok:true,json:async()=>({code:'000000',data:good})}},()=>now);
 const [a,b]=await Promise.all([get(),get()]);assert.equal(calls,1);assert.equal(a.effectiveRate,1602*1.055);assert.equal(a.quotedAt,b.quotedAt);
 now+=600001;fail=true;const stale=await get();assert.equal(stale.status,'stale');assert.equal(stale.quotedAt,a.quotedAt);
 await get();assert.equal(calls,5);
 now+=3600000;const expired=await get();assert.equal(expired.status,'unavailable');assert.equal(expired.effectiveRate,null);
});
test('cold start provider failure keeps ARS unavailable',async()=>{const fx=await lib.createMetaFxProvider(async()=>{throw Error('blocked')})();assert.equal(fx.status,'unavailable');assert.equal(fx.baseRate,null);});
test('conversion preserves Meta USD, is idempotent and nulls missing quote',()=>{
 const data={campaigns:[{status:'ACTIVE',spendUsd:100,costPerActionUsd:5,dailyBudgetUsd:200,ads:[{spendUsd:100,costPerActionUsd:5}]}],summary:{totalSpendUsd:100,avgCprUsd:5}};
 const fx={effectiveRate:1600*1.055};const a=lib.applyMetaFx(data,fx);assert.equal(a.summary.totalSpendArs,168800);assert.equal(a.campaigns[0].budgetArs,337600);assert.equal(a.campaigns[0].ads[0].cprArs,8440);assert.equal(a.summary.totalSpendUsd,100);assert.equal(lib.applyMetaFx(a,fx).summary.totalSpendArs,168800);assert.equal(lib.applyMetaFx(data,{effectiveRate:null}).summary.totalSpendArs,null);
});

test('alternate Binance host succeeds when primary is blocked',async()=>{
 const urls=[];const get=lib.createMetaFxProvider(async url=>{urls.push(url);if(url.includes('p2p.binance.com'))return {ok:false,json:async()=>({})};return {ok:true,json:async()=>({code:'000000',data:good})}});
 const fx=await get();assert.equal(fx.status,'fresh');assert.equal(fx.transport,'direct');assert.equal(urls.length,2);assert.ok(urls[1].startsWith('https://www.binance.com/'));
});
test('aggregator fallback keeps Binance purchase side and original time',async()=>{
 const now=1800000000000;const get=lib.createMetaFxProvider(async url=>{if(url.includes('binance.com'))throw Error('blocked');return {ok:true,json:async()=>({ask:1605,bid:1590,time:(now-60000)/1000})}},()=>now);
 const fx=await get();assert.equal(fx.transport,'criptoya');assert.equal(fx.baseRate,1605);assert.equal(fx.effectiveRate,1605*1.055);assert.equal(fx.quotedAt,new Date(now-60000).toISOString());
});
test('aggregator rejects outdated and malformed quotes',async()=>{
 const now=1800000000000;for(const body of [{ask:1605,time:(now-601000)/1000},{ask:0,time:now/1000},{ask:1605,time:(now+120000)/1000}]){
 const get=lib.createMetaFxProvider(async url=>{if(url.includes('binance.com'))throw Error('blocked');return {ok:true,json:async()=>body}},()=>now);assert.equal((await get()).effectiveRate,null);
 }
});

test('default provider calls fetch with the runtime global receiver',async()=>{
 const isolated={};const nativeFetch=async function(){'use strict';assert.notEqual(this,undefined);return {ok:true,json:async()=>({code:'000000',data:good})}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/meta-ads-fx.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:isolated,fetch:nativeFetch,AbortSignal,Date,Number,Math,Promise});
 assert.equal((await isolated.getMetaFx()).status,'fresh');
});

test('official C2C host is tried before the aggregator',async()=>{
 const get=lib.createMetaFxProvider(async url=>{if(!url.startsWith('https://c2c.binance.com/'))throw Error('unavailable');return {ok:true,json:async()=>({code:'000000',data:good})}});
 const fx=await get();assert.equal(fx.transport,'direct');assert.equal(fx.baseRate,1602);
});

test('scheduled snapshot preserves original time and recomputes agency fee',async()=>{
 const now=1800000000000;let calls=0;
 const get=lib.createMetaFxProvider(async()=>{calls++;return {ok:true,json:async()=>({source:'binance_p2p',transport:'direct',baseRate:1600,referenceArs:1000000,quotedAt:new Date(now-60000).toISOString(),effectiveRate:99999})}},()=>now,true);
 const fx=await get();assert.equal(fx.status,'fresh');assert.equal(fx.delivery,'scheduled');assert.equal(fx.effectiveRate,1688);assert.equal(fx.quotedAt,new Date(now-60000).toISOString());await get();assert.equal(calls,1);
});
test('scheduled snapshot is stale after ten minutes and never used beyond one hour',async()=>{
 const now=1800000000000;
 for(const age of [900000,3600001,-120000]) {
  const get=lib.createMetaFxProvider(async url=>{if(!url.includes('raw.githubusercontent.com'))throw Error('blocked');return {ok:true,json:async()=>({source:'binance_p2p',transport:'direct',baseRate:1600,referenceArs:1000000,quotedAt:new Date(now-age).toISOString()})}},()=>now,true);
  const fx=await get();assert.equal(fx.status,age===900000?'stale':'unavailable');assert.equal(fx.effectiveRate,age===900000?1688:null);
 }
});
test('scheduled snapshot rejects another market or inconsistent reference amount',async()=>{
 const now=1800000000000;
 for(const change of [{source:'dolar_blue'},{referenceArs:1},{baseRate:0},{transport:'other'}]) {
 const get=lib.createMetaFxProvider(async url=>{if(!url.includes('raw.githubusercontent.com'))throw Error('blocked');return {ok:true,json:async()=>({source:'binance_p2p',transport:'direct',baseRate:1600,referenceArs:1000000,quotedAt:new Date(now).toISOString(),...change})}},()=>now,true);
 assert.equal((await get()).effectiveRate,null);
 }
});
