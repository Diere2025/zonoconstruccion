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
 await get();assert.equal(calls,2);
 now+=3600000;const expired=await get();assert.equal(expired.status,'unavailable');assert.equal(expired.effectiveRate,null);
});
test('cold start provider failure keeps ARS unavailable',async()=>{const fx=await lib.createMetaFxProvider(async()=>{throw Error('blocked')})();assert.equal(fx.status,'unavailable');assert.equal(fx.baseRate,null);});
test('conversion preserves Meta USD, is idempotent and nulls missing quote',()=>{
 const data={campaigns:[{status:'ACTIVE',spendUsd:100,costPerActionUsd:5,dailyBudgetUsd:200,ads:[{spendUsd:100,costPerActionUsd:5}]}],summary:{totalSpendUsd:100,avgCprUsd:5}};
 const fx={effectiveRate:1600*1.055};const a=lib.applyMetaFx(data,fx);assert.equal(a.summary.totalSpendArs,168800);assert.equal(a.campaigns[0].budgetArs,337600);assert.equal(a.campaigns[0].ads[0].cprArs,8440);assert.equal(a.summary.totalSpendUsd,100);assert.equal(lib.applyMetaFx(a,fx).summary.totalSpendArs,168800);assert.equal(lib.applyMetaFx(data,{effectiveRate:null}).summary.totalSpendArs,null);
});
