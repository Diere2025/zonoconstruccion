const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,requireFn){const value={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:value,require:requireFn,Response,File,Set,Number,Error});return value;}
const helper=load('src/lib/bankStatements/fileAccounts.ts',require);
class OperationError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const mp3='00000000-0000-4000-8000-000000000003',mp5='00000000-0000-4000-8000-000000000005';
test('server rejects a known extract assigned to a different account before parsing or writing',async()=>{
 let effects=0;const api=load('src/app/api/admin/bank-statements/route.ts',name=>{
  if(name==='next/server')return{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}};
  if(name.endsWith('/financialOperations/server'))return{financialContext:async()=>({actor:mp3,db:{rpc:()=>{effects++;throw Error('Must not write');},storage:{from:()=>{effects++;throw Error('Must not upload');}}}})};
  if(name.endsWith('/financialOperations/validation'))return{isUuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v),OperationError};
  if(name.endsWith('/bankStatements/fileAccounts'))return helper;
  if(name.endsWith('/bankStatements/model'))return{MAX_STATEMENT_BYTES:2097152};
  if(name.endsWith('/bankStatements/workbook'))return{readStatementWorkbook:()=>{effects++;throw Error('Must not parse');}};
  if(name.endsWith('/bankStatements/server'))return{statementCatalog:async()=>({accounts:[{id:mp3,name:'Cuenta MP3'},{id:mp5,name:'Cuenta MP5'}],fileAccounts:[{external_account_id:'3168927031',financial_account_id:mp3,version:1}]})};
  if(name.endsWith('/bankStatements/initializeInboxes')||name.endsWith('/bankStatements/inbox'))return {};
  throw Error(name);
 });
 const form=new FormData();form.append('file',new File(['fixture'],'3168927031_movements_report.xlsx'));form.append('accountId',mp5);
 const response=await api.POST(new Request('http://localhost/api/admin/bank-statements',{method:'POST',body:form}));assert.equal(response.status,400);assert.match((await response.json()).error,/pertenece a Cuenta MP3/);assert.equal(effects,0);
});
