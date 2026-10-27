const {test}=require('node:test'),assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript'),{randomUUID}=require('crypto');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>imports[n]||{},Number,String,Math,Set,Map});return exports;}
const reason=load('src/lib/logisticsDispatch/reopening.ts');
test('reopening requires a concrete explanation and keeps the verified server actor',async()=>{for(const value of [null,'','abrir','a'.repeat(30),'. '.repeat(40),'x'.repeat(2001)])assert.throws(()=>reason.reopeningReason(value));const text='Se cerró sin elegir la tarifa y corresponde corregir el importe.';assert.equal(reason.reopeningReason(' '+text+' '),text);let received;const server=load('src/lib/logisticsDispatch/reopeningServer.ts',{'./reopening':reason}),id=randomUUID(),key=randomUUID();await server.reopenDispatch({rpc:async(name,args)=>{received={name,args};return {data:{status:'in_progress'}}}},'VERIFIED',{actor:'FORGED',dispatchId:id,key,version:4,reason:text});assert.equal(received.args.p_actor,'VERIFIED');assert.equal(received.args.p_reason,text);await assert.rejects(()=>server.reopenDispatch({},'A',{dispatchId:id,key,version:0,reason:text}));});
test('isolated database: justified reopening is atomic, audited, versioned, retry-safe and financially gated',async()=>{
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]})),db=new PGlite();const actor=randomUUID(),other=randomUUID(),dispatch=randomUUID(),payment=randomUUID(),allocation=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table sellers(id uuid primary key,full_name text,can_plan boolean default false,can_finance boolean default false);
 create function can_plan_logistics(uuid) returns boolean language sql as 'select coalesce((select can_plan from public.sellers where id=$1),false)';
 create function can_manage_financial_operations(uuid) returns boolean language sql as 'select coalesce((select can_finance from public.sellers where id=$1),false)';
 create table logistics_dispatches(id uuid primary key,code text);
 create table logistics_dispatch_plans(dispatch_id uuid primary key,carrier_id uuid,status text,version integer,planned jsonb,actual jsonb,tariff_snapshot jsonb,estimate jsonb,created_by uuid,created_at timestamptz default now(),updated_by uuid,updated_at timestamptz default now());
 create table logistics_dispatch_liquidations(dispatch_id uuid primary key);
 create table logistics_freight_settlement_terms(dispatch_id uuid primary key);
 create table cash_transactions(id uuid primary key,type text,amount numeric,category text,sub_category text,reversal_of_transaction_id uuid);
 create table logistics_dispatch_movements(transaction_id uuid,dispatch_id uuid,purpose text);
 create table logistics_freight_payment_allocations(transaction_id uuid,dispatch_id uuid,amount numeric);
 create table logistics_dispatch_plan_events(id uuid default gen_random_uuid(),dispatch_id uuid,actor_id uuid,previous_version integer,data jsonb,created_at timestamptz default now());`);
 await db.query('insert into sellers(id,full_name,can_plan) values($1,$2,true),($3,$4,false)',[actor,'Matías de prueba',other,'Otra persona']);await db.query('insert into logistics_dispatches values($1,$2)',[dispatch,'LOG_TEST']);
 await db.query("insert into logistics_dispatch_plans(dispatch_id,carrier_id,status,version,planned,actual,estimate,created_by,updated_by) values($1,$2,'completed',4,$3,$4,$5,$2,$2)",[dispatch,actor,{deliveryDate:'2026-10-27',tariffId:null,agreedAmount:null,loads:[{runNumber:1,plannedKm:137.9}]},{km:0,extras:[{label:'Retiro',amount:40000}]},{amount:null,basis:'pending'}]);
 const sql=fs.readFileSync('database/db_migration_v239_audited_dispatch_reopening.sql','utf8');await db.exec(sql);await db.exec(sql);
 const state=async()=>(await db.query('select logistics_dispatch_reopening_state($1,$2) s',[actor,dispatch])).rows[0].s;
 const plan=async()=>(await db.query('select * from logistics_dispatch_plans where dispatch_id=$1',[dispatch])).rows[0];
 const text='Se cerró sin elegir la tarifa y corresponde corregir el importe.',key=randomUUID();
 const reopen=(u=actor,v=4,k=key,r=text)=>db.query('select reopen_logistics_dispatch($1,$2,$3,$4,$5) r',[u,dispatch,v,k,r]).then(q=>q.rows[0].r);
 assert.equal((await state()).canReopen,true);assert.equal((await db.query("select has_function_privilege('authenticated','public.reopen_logistics_dispatch(uuid,uuid,integer,uuid,text)','execute') allowed")).rows[0].allowed,false);assert.equal((await db.query("select has_table_privilege('authenticated','public.logistics_dispatch_reopenings','select') allowed")).rows[0].allowed,false);
 await assert.rejects(()=>reopen(other));await assert.rejects(()=>reopen(null));await assert.rejects(()=>reopen(actor,3));await assert.rejects(()=>reopen(actor,4,key,'abrir'));await assert.rejects(()=>reopen(actor,4,key,'. '.repeat(30)));
 for(const table of ['logistics_dispatch_liquidations','logistics_freight_settlement_terms']){await db.query('insert into '+table+' values($1)',[dispatch]);assert.equal((await state()).canReopen,false);await assert.rejects(()=>reopen());await db.query('delete from '+table);}
 await db.query("insert into cash_transactions values($1,'egreso',100,'Servicio de Flete',null,null),($2,'egreso',50,'Otros',null,null)",[payment,allocation]);
 await db.query("insert into logistics_dispatch_movements values($1,$2,'freight_fee')",[payment,dispatch]);assert((await state()).blockers.some(b=>b.includes('pagos')));await assert.rejects(()=>reopen());await db.exec('delete from logistics_dispatch_movements');
 await db.query('insert into logistics_freight_payment_allocations values($1,$2,50)',[allocation,dispatch]);assert.equal((await state()).canReopen,false);await assert.rejects(()=>reopen());await db.exec('delete from logistics_freight_payment_allocations');
 await db.query("update logistics_dispatch_plans set planned=planned||'{\"historicalImport\":true}' where dispatch_id=$1",[dispatch]);await assert.rejects(()=>reopen());await db.query("update logistics_dispatch_plans set planned=planned-'historicalImport' where dispatch_id=$1",[dispatch]);
 const before=await plan();await db.exec("create function deny_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$;create trigger audit_failure before insert on logistics_dispatch_reopenings for each row execute function deny_audit();");await assert.rejects(()=>reopen());assert.deepEqual(await plan(),before);await db.exec('drop trigger audit_failure on logistics_dispatch_reopenings');
 const first=await reopen();assert.deepEqual(await reopen(),first);await assert.rejects(()=>reopen(actor,4,key,text+' Otro motivo.'));await assert.rejects(()=>reopen(other,4,key));
 const after=await plan();assert.equal(after.status,'in_progress');assert.equal(after.version,5);for(const field of ['planned','actual','tariff_snapshot','estimate','carrier_id','created_by','created_at'])assert.deepEqual(after[field],before[field]);
 const audit=(await db.query('select * from logistics_dispatch_reopenings')).rows;assert.equal(audit.length,1);assert.equal(audit[0].reason,text);assert.equal(audit[0].actor_id,actor);assert.equal(audit[0].before_snapshot.status,'completed');assert.equal(audit[0].after_snapshot.status,'in_progress');assert.equal((await state()).history[0].actor_name,'Matías de prueba');assert.equal((await db.query('select count(*)::int n from logistics_dispatch_plan_events')).rows[0].n,1);await assert.rejects(()=>reopen(actor,5,randomUUID()));
 await db.exec("update logistics_dispatch_plans set status='completed',version=6");await reopen();assert.equal((await plan()).status,'completed');assert.equal((await plan()).version,6);
 const next=await reopen(actor,6,randomUUID());assert.equal(next.version,7);assert.equal((await state()).history.length,2);
 }finally{await db.close();}
});
