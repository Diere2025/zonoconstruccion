const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process:{env:{}},Date,Number,String,JSON,AbortSignal,Error,console:{warn(){},error(){}},require:n=>imports[n]||{}});return exports;}
const m=load('src/lib/support/telegram.ts');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const job={id:id(1),ticket_id:id(2),ticket_number:5192,title:'No podemos crear la rendición',creator_name:'Carolina Ibarra',priority:'high',chat_id:'-123',attempts:1,claim_token:id(3)};
const payload=m.supportTelegramMessage(job);assert(payload.text.includes('INC-005192'));assert(payload.text.includes('Carolina Ibarra'));assert(payload.text.includes('🟠 Alta'));assert.equal(payload.reply_markup.inline_keyboard[0][0].url,'https://erp.zono.com.ar/incidencias/'+id(2));assert(!payload.parse_mode);
for(const [priority,label] of Object.entries({low:'Baja',medium:'Media',high:'Alta',critical:'Crítica'}))assert(m.supportTelegramMessage({...job,priority}).text.includes(label));
assert.throws(()=>m.supportTelegramMessage({...job,ticket_id:'https://other.invalid'}),/inválida/);
function senderDb(){const patches=[];let claimed=false;return {patches,rpc:async(name,input)=>{assert.equal(name,'support_claim_telegram_jobs');assert.equal(input.p_ticket,job.ticket_id);if(claimed)return {data:[]};claimed=true;return {data:[job]}},from(table){assert.equal(table,'support_telegram_jobs');const q={update(p){patches.push(p);return q},eq(){return q},then(resolve){return Promise.resolve({error:null}).then(resolve)}};return q}};}
(async()=>{
 let candidate=null;
 const discovery={from:table=>{assert.equal(table,'support_telegram_candidates');return {upsert:async row=>{candidate=row;return {error:null}}}}};
 assert.equal(await m.captureSupportTelegramGroup({message:{text:'/incidencias',chat:{id:-123,title:'Incidencias',type:'group'}}},discovery),true);assert.equal(candidate.chat_id,'-123');assert(!('enabled' in candidate));
 candidate=null;assert.equal(await m.captureSupportTelegramGroup({message:{text:'/incidencias',chat:{id:-123,title:'Otro grupo',type:'group'}}},discovery),false);assert.equal(candidate,null);
 assert.equal(await m.captureSupportTelegramGroup({message:{text:'saldo',chat:{id:-123,title:'Incidencias',type:'group'}}},discovery),false);
 let requests=0;const db=senderDb(),fetcher=async(url,options)=>{requests++;assert.equal(JSON.parse(options.body).chat_id,'-123');return {ok:true,json:async()=>({ok:true,result:{message_id:123}})}};
 assert.equal((await m.dispatchSupportTelegram(job.ticket_id,{db,fetcher,token:'fixture'})).sent,1);await m.dispatchSupportTelegram(job.ticket_id,{db,fetcher,token:'fixture'});assert.equal(requests,1);assert.equal(db.patches[0].state,'sent');
 const failed=senderDb();await m.dispatchSupportTelegram(job.ticket_id,{db:failed,token:'fixture',fetcher:async()=>({ok:false,status:429,json:async()=>({ok:false,error_code:429,description:'secret must not be stored',parameters:{retry_after:45}})})});assert.equal(failed.patches[0].state,'error');assert(!JSON.stringify(failed.patches).includes('secret'));
 const lost=senderDb();await m.dispatchSupportTelegram(job.ticket_id,{db:lost,token:'fixture',fetcher:async()=>{throw Error('fixture token in network error')}});assert.equal(lost.patches[0].state,'unknown');assert(!JSON.stringify(lost.patches).includes('fixture'));
 assert.equal((await m.dispatchSupportTelegram()).configured,false);
 let notify=0,saveError=false,sendError=false;
 const route=load('src/app/api/support/[...path]/route.ts',{
  '@/lib/support/server':{authorize:async()=>({db:{rpc:async()=>({data:{id:job.ticket_id},error:saveError?Error('save failed'):null})},user:{id:id(4)}}),body:async()=>({}),json:(data,status=200)=>({data,status})},
  '@/lib/support/validation':{SupportError:class extends Error{},operation:()=>({key:id(5),data:{}}),databaseError:e=>{if(e)throw e}},
  '@/lib/support/telegram':{dispatchSupportTelegram:async ticket=>{notify++;assert.equal(ticket,job.ticket_id);if(sendError)throw Error('telegram failure')}}
 });
 const req={method:'POST',nextUrl:{searchParams:new URLSearchParams(),pathname:'/api/support/tickets'}},ctx={params:Promise.resolve({path:['tickets']})};
 assert.equal((await route.POST(req,ctx)).status,201);assert.equal(notify,1);sendError=true;assert.equal((await route.POST(req,ctx)).status,201);saveError=true;assert.equal((await route.POST(req,ctx)).status,503);assert.equal(notify,2);
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]})),sql=new PGlite();
 try{
  await sql.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table sellers(id uuid primary key,full_name text);create table support_profiles(user_id uuid primary key,seller_id uuid);
   create table support_tickets(id uuid primary key,number bigint,created_by uuid,title text,priority text,workflow text);
   insert into sellers values('${id(10)}','Carolina Ibarra');insert into support_profiles values('${id(11)}','${id(10)}');`);
  const migration=fs.readFileSync('database/db_migration_v235_support_telegram.sql','utf8');await sql.exec(migration);await sql.exec(migration);
  const create=async(n,workflow='incident')=>sql.query('insert into support_tickets values($1,$2,$3,$4,$5,$6)',[id(n),n,id(11),'Ticket de prueba','critical',workflow]);
  await create(20);assert.equal((await sql.query('select * from support_telegram_jobs')).rows.length,0);
  await sql.exec("update support_telegram_settings set enabled=true,chat_id='-123' where id");await create(21);await create(22,'shipping');
  let jobs=(await sql.query('select * from support_telegram_jobs')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].creator_name,'Carolina Ibarra');assert.equal(jobs[0].priority,'critical');
  await sql.exec(`update support_tickets set title='Modificado' where id='${id(21)}'`);assert.equal((await sql.query('select * from support_telegram_jobs')).rows.length,1);
  let claimed=(await sql.query('select * from support_claim_telegram_jobs($1,1)',[id(21)])).rows;assert.equal(claimed.length,1);assert.equal(claimed[0].attempts,1);assert.equal((await sql.query('select * from support_claim_telegram_jobs($1,1)',[id(21)])).rows.length,0);
  await sql.exec("update support_telegram_jobs set claimed_at=now()-interval '3 minutes'");await sql.query('select * from support_claim_telegram_jobs()');assert.equal((await sql.query('select state from support_telegram_jobs')).rows[0].state,'unknown');
  await create(23);await sql.exec("update support_telegram_jobs set state='error',next_attempt_at=now()+interval '1 hour' where state='pending'");assert.equal((await sql.query('select * from support_claim_telegram_jobs()')).rows.length,0);
  await sql.exec("update support_telegram_jobs set next_attempt_at=now()-interval '1 second' where state='error'");assert.equal((await sql.query('select * from support_claim_telegram_jobs()')).rows.length,1);
  for(const role of ['anon','authenticated']){const permissions=(await sql.query(`select has_table_privilege('${role}','support_telegram_jobs','select') r,has_function_privilege('${role}','support_claim_telegram_jobs(uuid,integer)','execute') x`)).rows[0];assert.equal(permissions.r,false);assert.equal(permissions.x,false);}
  await sql.exec('begin');await create(24);await sql.exec('rollback');assert.equal((await sql.query('select * from support_telegram_jobs where ticket_id=$1',[id(24)])).rows.length,0);
 }finally{await sql.close()}
 console.log('PASS support Telegram: creator/priority/link, create handler nonblocking failures, durable queue, incident-only future creation, retries and atomic claims, ambiguous sends held, private jobs and rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
