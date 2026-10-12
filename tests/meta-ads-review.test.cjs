const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const vm=require('vm');const ts=require('typescript');
function compile(file,extras={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Intl,Number,Math,Map,Set,URL,AbortSignal,Promise,console,...extras});return exports;}
const lib=compile('src/lib/meta-ads-review.ts');
const m=(spendUsd=0,messages=0,frequency=1)=>({spendUsd,messages,frequency,ctr:1,impressions:1000});
const p=(today,yesterday=m(),week=m())=>({today,yesterday,week});
test('MEPS low-volume expensive ad is never in range',()=>assert.equal(lib.diagnose(p(m(5.28,1))).label,'Costo elevado, en observación'));
test('one cheap conversation does not certify performance',()=>assert.equal(lib.diagnose(p(m(1,1))).label,'Muestra insuficiente'));
test('historical waste is detected despite little spend today',()=>assert.equal(lib.diagnose(p(m(2.75,0),m(6.78,0),m(18.71,1))).label,'Histórico costoso'));
test('no pause recommendation for inactive ad or stale data',()=>{assert.equal(lib.diagnose(p(m(30,0)),3.5,false).severity,'neutral');assert.equal(lib.diagnose(p(m(30,0)),3.5,true,false).label,'Datos no vigentes');});
test('frequency alone is not fatigue',()=>assert.equal(lib.diagnose(p(m(10,10,2))).label,'Frecuencia elevada'));
test('targets change diagnosis and scale requires history',()=>{assert.equal(lib.diagnose(p(m(20,12))).label,'Dentro del objetivo');assert.equal(lib.diagnose(p(m(20,12),m(20,12),m(100,60))).label,'Candidata a evaluar aumento');assert.equal(lib.diagnose(p(m(10,5)),1).severity,'warning');});
test('Argentina date boundary excludes today from seven full days',()=>{const d=lib.reportingDates(new Date('2026-09-15T02:00:00Z'),'America/Argentina/Buenos_Aires');assert.equal(d.today,'2026-09-14');assert.equal(d.yesterday,'2026-09-13');assert.equal(d.weekStart,'2026-09-07');});
function setup(){let calls=0,fail=false;const fetch=async input=>{calls++;if(fail)return {ok:false,status:400,json:async()=>({error:{code:190}})};const u=new URL(input);let body;const row={campaign_id:'c',campaign_name:'(MEPS)',ad_id:'a',ad_name:'A',spend:'12',frequency:'1.3',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'3'}]};if(u.pathname.endsWith('/insights'))body={data:[row]};else if(u.pathname.endsWith('/activities'))body={data:[{event_type:'update_campaign_budget',event_time:'2026-09-15T10:00:00Z'}]};else if(u.pathname.endsWith('/ads'))body=u.searchParams.has('after')?{data:[{id:'b',name:'Paused',effective_status:'PAUSED',campaign:{id:'c',name:'(MEPS)',effective_status:'ACTIVE'}}]}:{data:[{id:'a',name:'A',effective_status:'ACTIVE',campaign:{id:'c',name:'(MEPS)',effective_status:'ACTIVE',daily_budget:'2500'}}],paging:{next:'https://graph.facebook.com/v21.0/act_test/ads?after=2'}};else body={name:'Test',currency:'USD',timezone_name:'America/Argentina/Buenos_Aires',account_status:1,spend_cap:'10000',amount_spent:'5000'};return {ok:true,json:async()=>body};};let current=Date.now();class FakeDate extends Date{constructor(...args){super(...(args.length?args:[current]));}static now(){return current;}}
const route=compile('src/app/api/admin/meta-ads-live/route.ts',{Date:FakeDate,fetch,process:{env:{META_ACCESS_TOKEN:'test',META_AD_ACCOUNT_ID:'act_test'}},require(name){if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,options})}};if(name==='@/lib/meta-ads-review')return lib;throw Error(name);}});return {get:(q='')=>route.GET({url:'https://local/api?'+q}),calls:()=>calls,fail:()=>{fail=true;current+=190000;}};}
test('complete pages and campaign frequency; cache avoids duplicate reads',async()=>{const s=setup();const r=await s.get();assert.equal(r.body.campaigns[0].frequency,1.3);assert.equal(r.body.campaigns[0].periods.week.messages,3);assert.equal(r.body.account.remaining,50);assert.equal(r.body.activities.length,1);assert.equal(s.calls(),10);await s.get();assert.equal(s.calls(),10);});
test('expired cache failure is explicitly stale, preserves original timestamp',async()=>{const s=setup();const first=await s.get();s.fail();const r=await s.get();assert.equal(r.body.stale,true);assert.match(r.body.apiError,/190/);assert.equal(r.body.updatedAt,first.body.updatedAt);});
test('exchange rate cache isolation and invalid values',async()=>{const s=setup();await s.get();const r=await s.get('exchangeRate=1000');assert.equal(r.body.summary.totalSpendArs,12000);assert.equal(s.calls(),20);assert.equal((await s.get('exchangeRate=-1')).options.status,400);});

test('review panel renders stale data without operational recommendations',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const Component=compile('src/components/admin/MetaReview.tsx',{require(name){return name==='@/lib/meta-ads-review'?lib:require(name);}}).default;
 const html=renderToStaticMarkup(React.createElement(Component,{campaigns:[{commercialOffer:'MEPS',status:'ACTIVE',dailyBudgetUsd:25,ads:[{id:'a',name:'Anuncio',effectiveStatus:'ACTIVE',periods:p(m(30,0))}]}],data:{source:'sheet',stale:true},targets:{},setTarget(){},fresh:false,detailsOpen:false,onDetailsOpenChange(){}}));
 assert.match(html,/Recomendaciones suspendidas/);assert.match(html,/Datos no vigentes/);assert.doesNotMatch(html,/considerar una pausa/);assert.match(html,/Planilla de respaldo/);
});
test('review starts collapsed and excludes paused ads from operational observations',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const Component=compile('src/components/admin/MetaReview.tsx',{require(name){return name==='@/lib/meta-ads-review'?lib:require(name);}}).default;
 const html=renderToStaticMarkup(React.createElement(Component,{campaigns:[{campaignId:'campaign-meps',commercialOffer:'MEPS',status:'ACTIVE',dailyBudgetUsd:25,ads:[{id:'active',name:'Activo caro',effectiveStatus:'ACTIVE',periods:p(m(20,1))},{id:'paused',name:'Pausado histórico',effectiveStatus:'PAUSED',periods:p(m(20,0),m(20,0),m(40,0))}]}],data:{source:'meta_api_direct'},targets:{},setTarget(){},fresh:true,detailsOpen:false,onDetailsOpenChange(){}}));
 assert.match(html,/MEPS/);assert.doesNotMatch(html,/Pausado histórico/);assert.match(html,/Desplegar campañas/);
});
test('activity log translates Meta amounts and status instead of exposing JSON by default',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const Component=compile('src/components/admin/MetaReview.tsx',{require(name){return name==='@/lib/meta-ads-review'?lib:require(name);}}).default;
 const html=renderToStaticMarkup(React.createElement(Component,{campaigns:[],data:{source:'meta_api_direct',activities:[{event_type:'ad_account_update_spend_limit',translated_event_type:'Límite de gasto actualizado',object_name:'S731.04',event_time:'2026-09-15T15:51:41+0000',extra_data:'{"currency":"USD","old_value":2463164,"new_value":2538164,"type":"payment_amount"}'},{event_type:'update_campaign_run_status',translated_event_type:'Estado actualizado',object_name:'MEPS',event_time:'2026-09-15T15:52:00+0000',extra_data:'{"old_value":"Procesamiento pendiente","new_value":"Activa","type":"run_status"}'}]},targets:{},setTarget(){},fresh:true,detailsOpen:false,onDetailsOpenChange(){}}));
 assert.match(html,/Límite de gasto:/);assert.match(html,/Estado: Procesamiento pendiente → Activa/);assert.match(html,/Ver datos técnicos/);
});

test('HTTP errors retain the actual server explanation',async()=>{
 await assert.rejects(lib.readLiveResponse({ok:false,status:503,json:async()=>({error:'Meta: credencial vencida (190)'})}),/credencial vencida/);
});
test('non-JSON errors and incomplete successful payloads are explicit',async()=>{
 await assert.rejects(lib.readLiveResponse({ok:false,status:502,json:async()=>{throw Error('HTML')}}),/HTTP 502/);
 await assert.rejects(lib.readLiveResponse({ok:true,status:200,json:async()=>({})}),/incompleta/);
});
test('history errors retain the server diagnosis and reject incomplete data', async () => {
 await assert.rejects(lib.readHistoryResponse({ok:false,status:500,json:async()=>({error:'Google Sheets API error: 403 acceso denegado'})}), /403 acceso denegado/);
 await assert.rejects(lib.readHistoryResponse({ok:true,status:200,json:async()=>({summary:{},records:[]})}), /incompleta/);
});
