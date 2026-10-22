const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('deactivation is audited, permission/version checked, retry safe, and preserves classified payments and other rules',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table bank_classification_rules(id uuid primary key,description text,direction text,financial_concept_id uuid,financial_account_id uuid,association_group text,version integer not null default 1,is_active boolean not null default true);
   create table bank_statement_events(id bigint generated always as identity,action text,before_value jsonb,after_value jsonb,actor_id uuid);
   create table cash_transactions(id uuid,amount numeric,financial_concept_id uuid,concept text);
   create function can_manage_financial_operations(uuid) returns boolean language sql as 'select coalesce($1=''${id(9)}''::uuid,false)';
   insert into bank_classification_rules(id,description,direction,financial_concept_id,association_group,financial_account_id) values('${id(1)}','pablo javier mercado','egreso','${id(5)}','common',null),('${id(2)}','binance persona','egreso','${id(5)}','binance_p2p',null),('${id(3)}','por cuenta','ingreso','${id(6)}','common','${id(7)}');
   insert into cash_transactions values('${id(8)}',1000000,'${id(5)}','Binance');`);
  await db.exec(fs.readFileSync('database/db_migration_v224_bank_rule_deactivation.sql','utf8'));
  const payments=(await db.query('select * from cash_transactions')).rows;
  const deactivate=(rule=id(1),version=1,actor=id(9))=>db.query('select deactivate_bank_classification_rule($1,$2,$3) result',[actor,rule,version]);
  await assert.rejects(deactivate(id(1),1,id(99)),e=>e.code==='42501');await assert.rejects(deactivate(id(1),null),/Versión/);await assert.rejects(deactivate(id(1),2),e=>e.code==='40001');await assert.rejects(deactivate(id(99)),e=>e.code==='40001');
  assert.equal((await db.query('select count(*)::int n from bank_statement_events')).rows[0].n,0);
  assert.equal((await deactivate()).rows[0].result.saved,true);
  assert.deepEqual((await db.query('select is_active,version from bank_classification_rules where id=$1',[id(1)])).rows[0],{is_active:false,version:2});
  const event=(await db.query('select * from bank_statement_events')).rows[0];assert.equal(event.action,'rule.deactivate');assert.equal(event.before_value.is_active,true);assert.equal(event.after_value.is_active,false);assert.equal(event.actor_id,id(9));
  assert.equal((await deactivate()).rows[0].result.already_inactive,true);assert.equal((await db.query('select count(*)::int n from bank_statement_events')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from bank_classification_rules where is_active')).rows[0].n,2);
  await db.exec('begin');await deactivate(id(2));assert.equal((await db.query('select is_active from bank_classification_rules where id=$1',[id(2)])).rows[0].is_active,false);await db.exec('rollback');assert.equal((await db.query('select is_active from bank_classification_rules where id=$1',[id(2)])).rows[0].is_active,true);
  await deactivate(id(2));await deactivate(id(3));assert.deepEqual((await db.query('select * from cash_transactions')).rows,payments);assert.equal((await db.query('select count(*)::int n from bank_classification_rules')).rows[0].n,3);
  const privileges=(await db.query("select has_function_privilege('anon','deactivate_bank_classification_rule(uuid,uuid,integer)','execute') anon,has_function_privilege('authenticated','deactivate_bank_classification_rule(uuid,uuid,integer)','execute') client,has_function_privilege('service_role','deactivate_bank_classification_rule(uuid,uuid,integer)','execute') server")).rows[0];assert.deepEqual(privileges,{anon:false,client:false,server:true});
 }finally{await db.close();}
});
test('API validates association identity/version, requires write authorization and propagates concurrent edits',async()=>{
 class OperationError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 let calls=[],write=false,rpcError=null;const exports={};
 const imports={'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/financialOperations/server':{financialContext:async(_,w)=>{write=w;return {actor:id(9),db:{rpc:async(name,args)=>{calls.push({name,args});return {data:{saved:true},error:rpcError};}}};}},'@/lib/financialOperations/validation':{isUuid:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v),OperationError}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/bank-statements/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Error,Number,require:name=>imports[name]||{}});
 const request=body=>({headers:{get:()=> 'application/json'},json:async()=>body});
 for(const body of [{action:'rule-deactivate',rule:'bad',version:1},{action:'rule-deactivate',rule:id(1),version:0},{action:'rule-deactivate',rule:id(1),version:'1'}])assert.equal((await exports.POST(request(body))).status,400);
 assert.equal(calls.length,0);assert.equal((await exports.POST(request({action:'rule-deactivate',rule:id(1),version:3}))).status,200);assert.equal(write,true);assert.equal(calls[0].name,'deactivate_bank_classification_rule');assert.equal(calls[0].args.p_version,3);assert.equal(calls[0].args.p_rule,id(1));
 rpcError={code:'40001',message:'La asociación cambió'};assert.equal((await exports.POST(request({action:'rule-deactivate',rule:id(1),version:3}))).status,409);
});
