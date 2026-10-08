// Only invokes GET handlers. Prints counts and status, never credentials or rows.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
function compile(path,imports={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process,URL,Date,console,TextEncoder,crypto:globalThis.crypto,require:name=>imports[name] || require(name)});return exports;
}
const types=compile('src/lib/financialOperations/types.ts');
const validation=compile('src/lib/financialOperations/validation.ts',{'./types':types});
const specialized=compile('src/lib/financialOperations/specialized.ts',{'./validation':validation});
const transferInput=compile('src/lib/financialOperations/transferInput.ts',{'./validation':validation});
const context={'@/lib/financialOperations/server':{financialContext:async()=>({db,actor:'00000000-0000-0000-0000-000000000000'})},'@/lib/financialOperations/validation':validation,'@/lib/financialOperations/specialized':specialized,'@/lib/financialOperations/transferInput':transferInput};
const treasury=compile('src/lib/treasuryTransactionTime.ts');
const finance=compile('src/app/api/admin/finanzas-data/route.ts',{...context,'@/lib/treasuryTransactionTime':treasury,'@/lib/googleSheets':{fetchSpreadsheetCsv:()=>{throw new Error('Not used by this read-only check');}}});
const operations=compile('src/app/api/admin/financial-operations/route.ts',context);
const special=compile('src/app/api/admin/special-financial-operations/route.ts',context);
const people=compile('src/app/api/admin/financial-people/route.ts',context);
(async()=>{
 const start=new Date();start.setDate(start.getDate()-30);
 const checks=[['real helpers',finance,'http://localhost/api?action=init'],['real movements',finance,`http://localhost/api?action=transactions&startDate=${treasury.treasuryToday(start)}&endDate=${treasury.treasuryToday()}`],['real form catalog',operations,'http://localhost/api?preview=real']];
 for(const [label,route,url] of checks){
  const response=await route.GET(new Request(url)),data=await response.json();
  if(response.status!==200)throw new Error(`${label}: ${response.status} ${data.error}`);
  const counts=Object.fromEntries(Object.entries(data).filter(([,value])=>Array.isArray(value)).map(([key,value])=>[key,value.length]));
  console.log('PASS',label,JSON.stringify(counts));
 }
 const resources=await special.GET(new Request('http://localhost/api'));const resourceData=await resources.json();if(resources.status!==200)throw new Error(resourceData.error);console.log('PASS specialized activation status',resourceData.available);
 const register=await people.GET(new Request('http://localhost/api'));const staff=await register.json();if(register.status!==200)throw new Error(staff.error);console.log('PASS real personnel register',JSON.stringify({total:staff.people.length,active:staff.people.filter(p=>p.is_active).length}));
 const helper=await finance.GET(new Request('http://localhost/api?action=accounts'));const helperData=await helper.json();const account=helperData.financialAccounts?.[0]?.id;
 if(account){const cut=await special.GET(new Request(`http://localhost/api?account_id=${account}&cutoff=${encodeURIComponent(new Date().toISOString())}`));const data=await cut.json();if(cut.status!==200||!data.fingerprint||!Number.isFinite(Number(data.balance)))throw new Error(data.error||'Invalid cut');console.log('PASS real count cut',data.preview_only?'preview-only':'active');}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
