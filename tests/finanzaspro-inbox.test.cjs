const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),{webcrypto}=require('crypto');
function load(file,imports={},extras={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n],Request,Response,TextEncoder,TextDecoder,Uint8Array,atob,AbortSignal,crypto:webcrypto,process:{env:{}},...extras});return exports;}
test('Firebase session checks signature, project, expiry and subject',async()=>{
 const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'test'},now=Math.floor(Date.now()/1000);
 const {verifyFinanzasToken}=load('src/lib/finanzasPro/firebaseAuth.ts',{}, {fetch:async()=>Response.json({keys:[jwk]})});
 const claims={aud:'finanzaspro-2-b28cb',iss:'https://securetoken.google.com/finanzaspro-2-b28cb',sub:'personal-user',exp:now+600,iat:now,auth_time:now};
 const token=async(c)=>{const data=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');return data+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(data))).toString('base64url');};
 assert.equal((await verifyFinanzasToken(await token(claims))).sub,'personal-user');
 for(const changed of [{aud:'another-project'},{iss:'https://attacker.invalid'},{exp:now-1},{sub:''},{iat:now+120}])await assert.rejects(()=>token({...claims,...changed}).then(verifyFinanzasToken));
 const valid=await token(claims);await assert.rejects(()=>verifyFinanzasToken(valid.slice(0,-12)+'AAAAAAAAAAAA'));
});
test('Inbox rejects unauthenticated calls and foreign origins before database access',async()=>{
 let calls=0;
 const route=load('src/app/api/finanzaspro/zono-inbox/route.ts',{'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},'@supabase/supabase-js':{createClient(){calls++;throw Error('unexpected database access')}},'@/lib/finanzasPro/firebaseAuth':{verifyFinanzasToken(){throw Error('Sesión inválida')}}});
 assert.equal((await route.GET(new Request('https://example.test/api'))).status,401);
 assert.equal((await route.GET(new Request('https://example.test/api',{headers:{Origin:'https://attacker.invalid',Authorization:'Bearer invalid'}}))).status,401);
 assert.equal((await route.OPTIONS(new Request('https://example.test/api',{method:'OPTIONS',headers:{Origin:'https://finanzaspro-2-b28cb.web.app'}}))).status,204);
 assert.equal((await route.OPTIONS(new Request('https://example.test/api',{method:'OPTIONS',headers:{Origin:'https://attacker.invalid'}}))).status,403);
 assert.equal(calls,0);
});
