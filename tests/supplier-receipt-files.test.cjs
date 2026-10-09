const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const id = '00000000-0000-0000-0000-000000000001';
const objects = new Map(); let writes = 0; let bucket = false;
const storage = {
  getBucket: async () => bucket ? {data:{}} : {error:{message:'Bucket not found'}},
  createBucket: async (_, options) => {assert.equal(options.public,false); bucket=true; return {};},
  from: () => ({
    list: async prefix => ({data:[...objects.keys()].filter(k=>k.startsWith(prefix+'/')).map(k=>({id:k,name:k.slice(prefix.length+1)}))}),
    upload: async (key, bytes) => {objects.set(key,bytes);writes++;return {};},
    createSignedUrl: async (key, seconds) => {assert.equal(seconds,900);return {data:{signedUrl:'https://example.com/'+key}};}
  })
};
function api(denied=null,exists=true) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/supplier-receipt-files/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, URL, File, FormData, crypto:globalThis.crypto, process:{env:{}},
    require: name => {
      if(name==='next/server') return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
      if(name==='@/lib/financeAdminAccess') return {requireFinanceAdmin:async()=>denied};
      if(name==='@/lib/supplierAccount') return {isUuid:value=>value===id};
      if(name==='@supabase/supabase-js') return {createClient:()=>({storage,from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:exists?{id}:null})})})};
      throw Error(name);
    }
  });
  return exports;
}
function req(files) {const form=new FormData();form.set('id',id);files.forEach(f=>form.append('files',f));return {url:'https://example.com/files?id='+id,formData:async()=>form};}
(async()=>{
  assert.equal((await api({status:403,error:'Denied'}).POST({formData:()=>assert.fail('Unauthorized body read')})).status,403);
  const file=new File(['remito'], 'remito.pdf', {type:'application/pdf'});
  assert.equal((await api(null,false).POST(req([file]))).status,404);
  assert.equal((await api().GET(req([]))).body.files.length,0);
  assert.equal((await api().POST(req([new File(['x'],'x.exe',{type:'application/octet-stream'})]))).status,400);
  assert.equal(writes,0);
  assert.equal((await api().POST(req([file]))).status,200);
  assert.equal((await api().POST(req([file]))).status,200);
  assert.equal(objects.size,1,'Retry keeps one attachment');
  const result=await api().GET(req([]));assert.equal(result.body.files[0].name,'remito.pdf');assert.match(result.body.files[0].url,/example.com/);
  const many=Array.from({length:5},(_,i)=>new File(['doc'+i],'doc'+i+'.pdf',{type:'application/pdf'}));
  assert.equal((await api().POST(req(many))).status,400);assert.equal(objects.size,1);
  console.log('Receipt files: admin access, ownership, private bucket, signed links, validation and safe retries: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
