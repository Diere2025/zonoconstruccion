const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto');
function load(file,imports={},intl=Intl){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Intl:intl,Date,Number,String,Math,Set,Map,require:n=>imports[n]||{}});return exports;}
const planning=load('src/lib/logisticsDispatch/planning.ts'),liquidation=load('src/lib/logisticsDispatch/liquidation.ts',{'./planning':planning});
test('reopening history keeps DD/MM/YYYY and Buenos Aires 24-hour times with English defaults',()=>{
 const englishIntl={DateTimeFormat:function(locale,options){return new Intl.DateTimeFormat(locale||'en-US',options);},NumberFormat:Intl.NumberFormat};
 const {reopeningWhen}=load('src/components/logistics/DispatchReopenDialog.tsx',{},englishIntl);
 assert.equal(reopeningWhen('2026-10-28T01:05:00Z'),'27/10/2026 22:05');
 assert.equal(reopeningWhen('2026-10-28T16:09:00Z'),'28/10/2026 13:09');
});
test('unpaid automatic approval can be rectified, recalculated and audited without duplicating the payment task',async()=>{
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check'),path.resolve('../../..','.codex-tmp/supplier-account-check')]}));
 const db=new PGlite(),actor=randomUUID(),other=randomUUID(),dispatch=randomUUID(),carrier=randomUUID(),ticket=randomUUID(),request=randomUUID();
 const plan={deliveryDate:'2026-10-28',carrierId:carrier,agreedAmount:null,companion:'Acompañante',loads:[{runNumber:1,plannedKm:200}]},actual={km:265.5,timingMode:'global',globalTimes:{departure:'06:30',arrival:'17:00'},loads:[],extras:[]},tariff={baseDay:260000,includedKm:180,extraKm:1800,companion:40000,includesTolls:true};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create table sellers(id uuid primary key,email text,full_name text,can_plan boolean default false,can_finance boolean default false);
 create function can_plan_logistics(uuid) returns boolean language sql as 'select exists(select 1 from public.sellers where id=$1 and can_plan)';
 create function can_manage_financial_operations(uuid) returns boolean language sql as 'select exists(select 1 from public.sellers where id=$1 and can_finance)';
 create table carriers(id uuid primary key,name text,is_active boolean default true);
 create table logistics_dispatches(id uuid primary key default gen_random_uuid(),code text,delivery_date date,carrier_name text,data jsonb);
 create table logistics_dispatch_plans(dispatch_id uuid primary key,request_key uuid unique,carrier_id uuid,status text,version integer,planned jsonb,actual jsonb,tariff_snapshot jsonb,estimate jsonb,created_by uuid,created_at timestamptz default now(),updated_by uuid,updated_at timestamptz default now());
 create table logistics_dispatch_liquidations(dispatch_id uuid primary key,total numeric,fee jsonb,support_ticket_id uuid unique,approved_by uuid,approved_at timestamptz default now());
 create table logistics_dispatch_review_tasks(dispatch_id uuid primary key,support_ticket_id uuid unique,created_by uuid);
 create table logistics_freight_settlement_terms(dispatch_id uuid primary key);
 create table cash_transactions(id uuid primary key,type text,amount numeric,category text,sub_category text,reversal_of_transaction_id uuid,currency text);
 create table logistics_dispatch_movements(transaction_id uuid,dispatch_id uuid,purpose text);
 create table logistics_freight_payment_allocations(transaction_id uuid,dispatch_id uuid,amount numeric);
 create table logistics_dispatch_settlements(dispatch_id uuid);create table logistics_dispatch_attempts(dispatch_id uuid,executed boolean);
 create table logistics_dispatch_plan_events(id uuid default gen_random_uuid(),dispatch_id uuid,actor_id uuid,previous_version integer,data jsonb,created_at timestamptz default now());
 create table created_tasks(id uuid primary key default gen_random_uuid());
 create function ensure_logistics_review_task(p_actor uuid,p_dispatch uuid) returns jsonb language plpgsql as $$declare target uuid;begin select support_ticket_id into target from logistics_dispatch_review_tasks where dispatch_id=p_dispatch;if target is null then insert into created_tasks default values returning id into target;insert into logistics_dispatch_review_tasks values(p_dispatch,target,p_actor);end if;return jsonb_build_object('id',target);end;$$;`);
 await db.query('insert into sellers(id,full_name,can_plan) values($1,$2,true),($3,$4,false)',[actor,'Matías de prueba',other,'Sin permiso']);await db.query('insert into carriers(id,name) values($1,$2)',[carrier,'Jorge Salcedo']);await db.query('insert into logistics_dispatches(id,code,delivery_date,carrier_name) values($1,$2,$3,$4)',[dispatch,'LOG_REC_05537','2026-10-28','Jorge Salcedo']);
 await db.query("insert into logistics_dispatch_plans(dispatch_id,request_key,carrier_id,status,version,planned,actual,tariff_snapshot,estimate,created_by,updated_by) values($1,$2,$3,'completed',2,$4,$5,$6,$7,$8,$8)",[dispatch,request,carrier,plan,actual,tariff,{amount:336000,basis:'estimated'},actor]);
 const fee=liquidation.approveLiquidation({dispatch_id:dispatch,status:'completed',planned:plan,actual,tariff_snapshot:tariff},{basis:'calculated'});assert.equal(fee.total,453900);
 await db.query('insert into logistics_dispatch_liquidations(dispatch_id,total,fee,support_ticket_id,approved_by) values($1,$2,$3,$4,$5)',[dispatch,fee.total,fee,ticket,actor]);
 await db.exec(fs.readFileSync('database/db_migration_v239_audited_dispatch_reopening.sql','utf8'));
 const state=async(user=actor)=>(await db.query('select logistics_dispatch_reopening_state($1,$2) s',[user,dispatch])).rows[0].s;
 assert.equal((await state()).canReopen,false);
 const migration=fs.readFileSync('database/db_migration_v240_unpaid_dispatch_rectification.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(fs.readFileSync('database/db_migration_v216_logistics_global_times.sql','utf8'));
 const confirm=fs.readFileSync('database/db_migration_v214_logistics_close_review_task.sql','utf8');await db.exec(confirm.slice(confirm.indexOf('create or replace function public.confirm_logistics_payment_task'),confirm.indexOf('revoke all on function public.confirm_logistics_payment_task')));
 const wrapper=fs.readFileSync('database/db_migration_v208_logistics_payment_tasks.sql','utf8');await db.exec(wrapper.slice(wrapper.indexOf('create or replace function public.save_logistics_plan_with_payment_task')));
 const key=randomUUID(),reason='Se cargaron kilómetros incorrectos y corresponde rectificar de 265,5 a 200 km.';
 const reopen=(version=2,k=key,user=actor)=>db.query('select reopen_logistics_dispatch($1,$2,$3,$4,$5) r',[user,dispatch,version,k,reason]).then(q=>q.rows[0].r);
 const current=async()=>(await db.query('select * from logistics_dispatch_plans where dispatch_id=$1',[dispatch])).rows[0];
 assert.equal((await state()).canReopen,true);assert.equal((await state()).resetsLiquidation,true);assert.equal(Number((await state()).approvedAmount),453900);
 await assert.rejects(()=>reopen(2,key,other),/permiso/);await assert.rejects(()=>reopen(1),/modificó/);await assert.rejects(()=>state(other),/permiso/);
 // An audit failure must restore both the operational row and its previous approval.
 await db.exec("create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$;create trigger fail_audit before insert on logistics_dispatch_reopenings for each row execute function fail_audit();");
 await assert.rejects(()=>reopen(),/audit unavailable/);assert.equal((await current()).version,2);assert.equal((await db.query('select count(*)::int n from logistics_dispatch_liquidations')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from logistics_dispatch_review_tasks')).rows[0].n,0);await db.exec('drop trigger fail_audit on logistics_dispatch_reopenings');
 const result=await reopen();assert.deepEqual(await reopen(),result);assert.equal((await current()).status,'in_progress');assert.equal((await db.query('select count(*)::int n from logistics_dispatch_liquidations')).rows[0].n,0);assert.equal((await db.query('select support_ticket_id from logistics_dispatch_review_tasks')).rows[0].support_ticket_id,ticket);
 let history=(await state()).history;assert.equal(history.length,1);assert.equal(history[0].kmBefore,265.5);assert.equal(Number(history[0].previousLiquidation),453900);assert.equal(history[0].kmAfter,null);
 const corrected={...actual,km:200},correctedFee=liquidation.approveLiquidation({dispatch_id:dispatch,status:'completed',planned:plan,actual:corrected,tariff_snapshot:tariff},{basis:'calculated'});assert.equal(correctedFee.total,336000);
 const payload={dispatchId:dispatch,version:3,status:'completed',planned:plan,actual:corrected,tariffSnapshot:tariff,estimate:{amount:336000,basis:'estimated'}};
 // Any downstream closing failure also rolls back the rectification audit.
 await assert.rejects(()=>db.query('select save_logistics_plan_with_payment_task($1,$2,0,$3,$4)',[actor,payload,{...correctedFee,total:99},'Cierre de prueba corregido']),/Importe/);assert.equal((await current()).status,'in_progress');assert.equal((await state()).history[0].rectifiedAt,null);
 const closing=(await db.query('select save_logistics_plan_with_payment_task($1,$2,0,$3,$4) r',[actor,payload,correctedFee,'Cierre de prueba corregido'])).rows[0].r;assert.equal(closing.ticketId,ticket);assert.equal((await current()).actual.km,200);assert.equal((await current()).status,'completed');assert.equal((await db.query('select total from logistics_dispatch_liquidations')).rows[0].total,'336000');assert.equal((await db.query('select count(*)::int n from created_tasks')).rows[0].n,0);
 history=(await state()).history;assert.equal(history[0].kmBefore,265.5);assert.equal(history[0].kmAfter,200);assert.equal(history[0].rectifiedBy,'Matías de prueba');assert(history[0].rectifiedAt);
 await assert.rejects(()=>db.query('select save_logistics_plan_with_payment_task($1,$2,0,$3,$4)',[actor,payload,correctedFee,'Cierre de prueba corregido']),/modificó/);
 await db.query("update logistics_dispatch_plans set planned=planned||'{\"historicalImport\":true}' where dispatch_id=$1",[dispatch]);assert.equal((await state()).canReopen,false);await assert.rejects(()=>reopen(4,randomUUID()),/histórica/);await db.query("update logistics_dispatch_plans set planned=planned-'historicalImport' where dispatch_id=$1",[dispatch]);
 // Treasury confirmations remain intact; partial and allocated payments block reopening; reversed payments do not.
 await db.query('insert into logistics_freight_settlement_terms values($1)',[dispatch]);assert.equal((await state()).canReopen,false);await assert.rejects(()=>reopen(4,randomUUID()),/Tesorería/);await db.exec('delete from logistics_freight_settlement_terms');
 const payment=randomUUID();await db.query("insert into cash_transactions values($1,'egreso',1,'Servicio de Flete',null,null,'ARS')",[payment]);await db.query("insert into logistics_dispatch_movements values($1,$2,'freight_fee')",[payment,dispatch]);assert.equal((await state()).canReopen,false);await assert.rejects(()=>reopen(4,randomUUID()),/pagos/);await db.exec('delete from logistics_dispatch_movements');
 await db.query('insert into logistics_freight_payment_allocations values($1,$2,1)',[payment,dispatch]);await assert.rejects(()=>reopen(4,randomUUID()),/pagos/);await db.exec('delete from logistics_freight_payment_allocations');
 const reversal=randomUUID();await db.query("insert into cash_transactions values($1,'ingreso',1,'Servicio de Flete',null,$2,'ARS')",[reversal,payment]);await db.query("insert into logistics_dispatch_movements values($1,$2,'freight_fee')",[payment,dispatch]);assert.equal((await state()).canReopen,true);
 const cashBefore=(await db.query('select * from cash_transactions order by id')).rows;await reopen(4,randomUUID());assert.deepEqual((await db.query('select * from cash_transactions order by id')).rows,cashBefore);
 assert.equal((await db.query("select has_function_privilege('authenticated','reopen_logistics_dispatch(uuid,uuid,integer,uuid,text)','execute') allowed")).rows[0].allowed,false);assert.equal((await db.query("select has_table_privilege('authenticated','logistics_dispatch_reopenings','update') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
