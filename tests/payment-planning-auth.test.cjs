const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function contextWith(error) {
  const output = {};
  const source = ts.transpileModule(fs.readFileSync('src/lib/paymentPlanning/server.ts','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  vm.runInNewContext(source, {
    exports:output,
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}},
    require:name => name === '@supabase/supabase-js'
      ? {createClient:() => ({auth:{getUser:async () => ({data:{user:null},error})}})} : {}
  });
  return output.planningContext;
}

test('a Supabase connection failure is unavailable service, not an expired session', async () => {
  const request = new Request('http://localhost/api', {headers:{Authorization:'Bearer test'}});
  for (const error of [
    {name:'AuthRetryableFetchError',status:0,message:'fetch failed'},
    {name:'AuthApiError',status:429,message:'Too many requests'},
    {name:'AuthApiError',status:503,message:'Unavailable'}
  ]) {
    await assert.rejects(contextWith(error)(request), error => error.status === 503 && error.message.includes('conexión'));
  }
});

test('an invalid credential still requires signing in', async () => {
  const request = new Request('http://localhost/api', {headers:{Authorization:'Bearer test'}});
  await assert.rejects(contextWith({name:'AuthApiError',status:401,message:'Invalid token'})(request), error => error.status === 401);
  await assert.rejects(contextWith(null)(new Request('http://localhost/api')), error => error.status === 401);
});
