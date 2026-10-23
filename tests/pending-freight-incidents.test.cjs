const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),path=require('node:path');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl,Map,Set,Number,String,JSON,require:n=>imports[n]||{}});return exports;}
const payments=load('src/lib/logisticsDispatch/planningPayments.ts');
const {freightPaymentCandidates}=load('src/lib/logisticsDispatch/paymentCandidates.ts',{'./planningPayments':payments});
const plan={logistics_dispatches:{code:'LOG_REC_05518',carrier_name:'Pablo Damián Lavayen'}};
const tx={id:'a',movement_code:'PAG-1',created_at:'2026-10-23T15:00:00Z',type:'egreso',currency:'ARS',category:'Servicio de Flete',amount:300000,notes:'LOG_REC_05518'};
assert.equal(freightPaymentCandidates([tx],plan,new Set(),new Set())[0].match,'log');
for(const t of [{...tx,type:'ingreso'},{...tx,currency:'USD'},{...tx,amount:0},{...tx,category:'Peajes'},{...tx,notes:'LOG_REC_055180'},{...tx,notes:'LOG_REC_05519'},{...tx,reversal_of_transaction_id:'x'}])assert.equal(freightPaymentCandidates([t],plan,new Set(),new Set()).length,0);
assert.equal(freightPaymentCandidates([tx],plan,new Set(['a']),new Set()).length,0);
assert.equal(freightPaymentCandidates([tx],plan,new Set(),new Set(['a'])).length,0);
assert.equal(freightPaymentCandidates([{...tx,notes:'LAVAYEN, PABLO DAMIAN'}],plan,new Set(),new Set())[0].match,'carrier');
assert.equal(freightPaymentCandidates([{...tx,notes:''}],plan,new Set(),new Set())[0].match,'review');
(async()=>{
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));const db=new PGlite();
 const dispatch='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',transaction='00000000-0000-4000-8000-000000000003';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table logistics_dispatch_plans(dispatch_id uuid primary key,version integer,status text);
 create table logistics_dispatch_liquidations(dispatch_id uuid,support_ticket_id uuid);
 create table cash_transactions(id uuid,type text,currency text,amount numeric,reversal_of_transaction_id uuid,category text,sub_category text);
 create table logistics_dispatch_movements(transaction_id uuid,dispatch_id uuid,purpose text);
 create table logistics_freight_payment_allocations(transaction_id uuid,dispatch_id uuid);
 create table tasks(dispatch_id uuid primary key,id uuid default gen_random_uuid());
 create function save_logistics_dispatch_plan(uuid,jsonb,bigint) returns jsonb language plpgsql as $$begin if $1<>'${actor}'::uuid then raise exception 'Sin permiso';end if;update logistics_dispatch_plans set status='completed',version=version+1 where dispatch_id=($2->>'dispatchId')::uuid and version=($2->>'version')::integer;if not found then raise exception 'Version cambió';end if;return jsonb_build_object('dispatchId',$2->>'dispatchId');end$$;
 create function ensure_logistics_review_task(uuid,uuid) returns jsonb language plpgsql as $$declare task uuid;begin insert into tasks(dispatch_id) values($2) on conflict do nothing;select id into task from tasks where dispatch_id=$2;return jsonb_build_object('id',task);end$$;
 create function confirm_logistics_payment_task(uuid,uuid,integer,jsonb,text) returns jsonb language sql as $$select jsonb_build_object('approved',true)$$;
 insert into logistics_dispatch_plans values('${dispatch}',1,'planned');
 insert into cash_transactions values('${transaction}','egreso','ARS',302800,null,'Servicio de Flete',null);
 insert into logistics_dispatch_movements values('${transaction}','${dispatch}','freight_fee');`);
 const sql=fs.readFileSync('database/db_migration_v233_freight_close_with_payments.sql','utf8');await db.exec(sql);await db.exec(sql);
 const save=(who,version)=>db.query('select save_logistics_plan_with_payment_task($1,$2,0,$3,$4) result',[who,{dispatchId:dispatch,version},{},'Cierre con pagos previos']);
 await assert.rejects(save(transaction,1),/permiso/);await assert.rejects(save(actor,0),/cambió/);
 let result=(await save(actor,1)).rows[0].result;assert(result.reviewExistingPayments);assert.equal((await db.query('select status from logistics_dispatch_plans')).rows[0].status,'completed');
 await save(actor,2);assert.equal((await db.query('select count(*) n from tasks')).rows[0].n,1);
 await db.exec('delete from logistics_dispatch_movements');await db.query('insert into logistics_freight_payment_allocations values($1,$2)',[transaction,dispatch]);assert((await save(actor,3)).rows[0].result.reviewExistingPayments);
 await db.exec('delete from logistics_freight_payment_allocations');assert((await save(actor,4)).rows[0].result.approved);
 assert.equal(Number((await db.query('select sum(amount) total from cash_transactions')).rows[0].total),302800);
 assert.equal((await db.query('select count(*) n from logistics_dispatch_liquidations')).rows[0].n,0);
 console.log('PASS pending freight incidents: active unlinked candidates only; evidence and cross-LOG exclusion; paid closing, allocated closing, permissions, versions, one review task, unchanged cash.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
