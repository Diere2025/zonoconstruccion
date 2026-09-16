const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const source = fs.readFileSync('src/app/api/vendedores/order-sync-worker/route.ts','utf8');
const compiled = ts.transpile(source, {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020});

async function run(mode, authenticated = true) {
  const writes=[];
  let claimed=false, calls=0;
  const db={
    from(table) { return {
      select() {return this;}, eq() {return this;},
      async single() {return {data:{secret:'test-only'}};},
      update(value) {return {eq:async()=>{writes.push({table,value});return {error:null};}}}
    };},
    async rpc() {
      if(claimed)return {data:[]};
      claimed=true;
      return {data:[{id:'job',order_id:'order',seller_id:'seller',payload:{order:{clientName:'Test'}}}]};
    }
  };
  const exports={};
  vm.runInNewContext(compiled, {exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}},
    Date,URL,Set, console,
    require(name) {
      if(name==='next/server')return {NextRequest,NextResponse};
      if(name==='@supabase/supabase-js')return {createClient:()=>db};
      if(name==='@/lib/processSheetOrder')return {processSheetOrder:async(req,onCode)=>{
        calls++;
        if(mode==='sheet-error')return NextResponse.json({error:'Sheets unavailable'},{status:500});
        await onCode('TEST123');
        return NextResponse.json({synced:true,code:'TEST123',operationalSyncSucceeded:true,
          formationAlert:{attempted:true,sent:mode!=='telegram-error',message:'Telegram unavailable'},
          expressAlert:{attempted:false,sent:false}});
      }};
      throw Error(name);
    }
  });
  const response=await exports.POST(new NextRequest('https://example.test/api/vendedores/order-sync-worker',{
    method:'POST',headers:authenticated?{authorization:'Bearer test-only'}:{}
  }));
  if(!authenticated){assert.equal(response.status,401);assert.equal(calls,0);return;}
  assert.equal(response.status,200);
  assert.equal(calls,1);
  const final=writes.filter(w=>w.table==='order_sync_jobs'&&w.value.status).at(-1).value;
  assert.equal(final.status,mode==='success'?'completed':'attention');
  if(mode==='telegram-error')assert.match(final.message,/Telegram recorridos/);
  if(mode==='sheet-error')assert.match(final.message,/Sheets unavailable/);
  if(mode!=='sheet-error')assert.ok(writes.some(w=>w.table==='orders'&&w.value.legacy_code==='TEST123'));
}
(async()=>{for(const mode of ['success','telegram-error','sheet-error'])await run(mode);await run('success',false);
  console.log('PASS: worker authentication, code update, completion, sheet failure and Telegram failure inbox results.');
})().catch(error=>{console.error(error);process.exitCode=1;});
