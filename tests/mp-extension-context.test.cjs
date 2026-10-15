const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('chrome-extension-mp/extension-context.js','utf8');
function fixture(path='/activities'){
 let valid=true,reloads=0,pulse;
 const context={chrome:{runtime:{id:'extension',getManifest(){if(!valid)throw Error('Extension context invalidated.');return {version:'1.7.2'};}}},location:{pathname:path,reload(){reloads++;}},setInterval(fn){pulse=fn;}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,pulse:()=>pulse(),invalidate:()=>{valid=false;},reloads:()=>reloads};
}
test('healthy context never reloads; invalidation recovers each monitor page once',()=>{
 for(const path of ['/activities','/banking/movements','/banking/movements/2','/balance/reports/movements','/savings/movements/000101a7-1f12-4102-9d9e-871da7f7b326/']){
  const f=fixture(path);f.pulse();assert.equal(f.reloads(),0);assert.equal(f.context.ZonoExtensionContext.alive(),true);
  f.invalidate();f.pulse();f.pulse();assert.equal(f.context.ZonoExtensionContext.alive(),false);assert.equal(f.reloads(),1);
 }
});
test('missing runtime ID recovers without calling the invalid extension API',()=>{
 const f=fixture();delete f.context.chrome.runtime.id;f.context.chrome.runtime.getManifest=()=>{throw Error('Must not be called');};f.pulse();assert.equal(f.reloads(),1);
});
test('invalidation never reloads payment, transfer or other operating pages',()=>{
 for(const path of ['/transfer','/activities/detail/123','/savings','/banking/payments']){
  const f=fixture(path);f.invalidate();f.pulse();assert.equal(f.reloads(),0);
  f.context.location.pathname='/activities';f.pulse();assert.equal(f.reloads(),1);
 }
});
test('invalid content scripts stop heartbeat, remote polling and payment sends',async()=>{
 const content=fs.readFileSync('chrome-extension-mp/content.js','utf8');
 const context={ZonoExtensionContext:{alive:()=>false},Promise};vm.createContext(context);
 for(const [begin,end]of [['function sendHeartbeat() {','function startMonitoring() {'],['function reportPayment(payment, isManualAction = false) {','function getRowDate(']]){
  vm.runInContext(content.slice(content.indexOf(begin),content.indexOf(end)),context);
 }
 assert.doesNotThrow(()=>context.sendHeartbeat());assert.equal(await context.reportPayment({}),'failed');
 vm.runInContext(fs.readFileSync('chrome-extension-mp/capture-refresh.js','utf8'),Object.assign(context,{setTimeout(){},setInterval(){}}));
 await context.ZonoCaptureRefresh.poll();assert.equal((await context.ZonoCaptureRefresh.captureLoaded('activity')).failed,true);
});
test('content lifecycle guard loads before the scripts that use extension APIs',()=>{
 const manifest=JSON.parse(fs.readFileSync('chrome-extension-mp/manifest.json','utf8'));
 assert.equal(manifest.content_scripts[0].js[0],'extension-context.js');
});
