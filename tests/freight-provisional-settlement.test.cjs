const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Number,Map,Set,String,Date,Intl,JSON,require:n=>imports[n]||{}});return exports;}
const accounting=load('src/lib/logisticsDispatch/settlementAccounting.ts'),presentation=load('src/lib/logisticsDispatch/planningPresentation.ts');
const base={dispatch_id:'trip',status:'in_progress',actual:{extras:[]},paymentState:{paidAmount:300000,state:'paid'}};
const term={dispatch_id:'trip',gross_amount:300000,net_amount:300000,version:1,provisional:true,extra_snapshot:[]};
let row=accounting.applySettlementTerms([base],[term])[0];assert(!row.paymentState.liquidated);assert(!row.settlementNeedsReview);
row=accounting.applySettlementTerms([{...base,status:'completed'}],[term])[0];assert(row.settlementNeedsReview);assert(!row.paymentState.liquidated);assert.equal(presentation.pendingDispatchSettlements([row])[0].kind,'review');
row=accounting.applySettlementTerms([{...base,status:'completed'}],[{...term,provisional:false,net_amount:320000}])[0];assert.equal(row.paymentState.remainingAmount,20000);assert(!row.settlementNeedsReview);
row=accounting.applySettlementTerms([{...base,status:'completed'}],[{...term,provisional:false,net_amount:280000}])[0];assert.equal(row.paymentState.overpaidAmount,20000);assert(!row.paymentState.liquidated);assert.equal(presentation.pendingDispatchSettlements([row])[0].kind,'review');
assert.equal(presentation.pendingDispatchSettlements([{...base,paymentState:{state:'unpaid'}}]).length,1);
assert.equal(presentation.pendingDispatchSettlements([{...base,status:'planned'}]).length,0);
const reviewedExcess={...term,provisional:false,net_amount:299800,difference_acceptance:{version:1,paidAmount:300000,netAmount:299800,difference:200}};
assert(accounting.applySettlementTerms([{...base,status:'completed'}],[reviewedExcess])[0].paymentState.liquidated);
assert(!accounting.applySettlementTerms([{...base,status:'completed'}],[{...reviewedExcess,version:2}])[0].paymentState.liquidated);

(async()=>{
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));const db=new PGlite();
 const actor='00000000-0000-4000-8000-000000000001',laura='00000000-0000-4000-8000-000000000002',carrier='10000000-0000-4000-8000-000000000001',dispatch='20000000-0000-4000-8000-000000000001',sector='30000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table carriers(id uuid primary key,name text);
 create table logistics_dispatches(id uuid primary key,code text);
 create table logistics_dispatch_plans(dispatch_id uuid primary key,carrier_id uuid,status text,actual jsonb default '{}',planned jsonb default '{}',version integer default 1);
 create table cash_transactions(id uuid primary key default gen_random_uuid(),type text,currency text,amount numeric,category text,sub_category text,concept text,notes text,created_at timestamptz,reversal_of_transaction_id uuid,movement_code text,financial_account_id uuid,payment_method_id uuid);
 create table logistics_dispatch_movements(transaction_id uuid,dispatch_id uuid,purpose text);
 create table support_tickets(id uuid primary key default gen_random_uuid(),created_by uuid,assignee_id uuid,title text);
 create table support_profiles(user_id uuid,seller_id uuid);create table sellers(id uuid,full_name text,is_active boolean);
 create table support_sectors(id uuid,name text,active boolean);create table support_sector_members(sector_id uuid,user_id uuid,active boolean);
 create function can_manage_financial_operations(uuid) returns boolean language sql as $$select $1='${actor}'::uuid$$;
 create function can_plan_logistics(uuid) returns boolean language sql as $$select $1='${actor}'::uuid$$;
 create function support_command(text,uuid,uuid,integer,jsonb) returns jsonb language plpgsql as $$declare tid uuid;begin insert into support_tickets(created_by,assignee_id,title) values(current_setting('request.jwt.claim.sub')::uuid,($5->>'assignee_id')::uuid,$5->>'title') returning id into tid;return jsonb_build_object('id',tid);end$$;
 create function save_catalog_financial_operation(uuid,uuid,text,jsonb,jsonb,text) returns jsonb language plpgsql as $$declare t uuid;begin insert into cash_transactions(type,currency,amount,category,concept,notes,created_at,movement_code) values('egreso','ARS',($4->>'amount')::numeric,$4->>'category',$4->>'concept',$4->>'notes',($4->>'effective_date')::date,'PAG-TEST') returning id into t;return jsonb_build_object('transaction_ids',jsonb_build_array(t));end$$;
 insert into carriers values('${carrier}','Fletero');insert into logistics_dispatches values('${dispatch}','LOG_REC_1');insert into logistics_dispatch_plans(dispatch_id,carrier_id,status) values('${dispatch}','${carrier}','in_progress');
 insert into sellers values('${laura}','Laura Guerra',true);insert into support_profiles values('${laura}','${laura}');insert into support_sectors values('${sector}','Tesorería y Finanzas',true);insert into support_sector_members values('${sector}','${laura}',true);`);
 for(const file of ['v208_logistics_payment_tasks','v210_logistics_partial_payments','v213_logistics_integrated_settlement','v214_logistics_close_review_task','v215_logistics_optional_references','v217_freight_accepted_difference','v218_freight_difference_carryforward','v237_freight_refunds_rounding','20261109_freight_provisional_settlement']){const sql=fs.readFileSync('database/db_migration_'+file+'.sql','utf8');await db.exec(sql);await db.exec(sql);}
 const save=(version,gross)=>db.query('select save_logistics_freight_settlement_terms($1,$2,$3,$4) result',[actor,dispatch,version,{grossAmount:gross,netAmount:gross,deductions:[],evidence:'Acuerdo provisorio',extraSnapshot:[]}]);
 await db.query('select ensure_logistics_review_task($1,$2)',[actor,dispatch]);await db.query('select ensure_logistics_review_task($1,$2)',[actor,dispatch]);assert.equal((await db.query('select count(*) n from support_tickets')).rows[0].n,1);
 await save(0,300000);assert((await db.query('select provisional from logistics_freight_settlement_terms')).rows[0].provisional);
 await assert.rejects(save(0,300000),/cambió/);
 const payload={operation_type:'operating_expense',direction:'egreso',category:'Servicio de Flete',amount:'300000.00',concept:'Pago durante el recorrido',notes:'LOG_REC_1',effective_date:'2026-10-23'};
 const pay=(key,version,amount)=>db.query('select pay_logistics_freight($1,$2,$3,$4)',[actor,key,{...payload,amount:String(amount)},[{code:'LOG_REC_1',amount,reason:'Pago al fletero',termsVersion:version}]]);
 const key='40000000-0000-4000-8000-000000000001';await pay(key,1,300000);await pay(key,1,300000);assert.equal((await db.query('select count(*) n from cash_transactions')).rows[0].n,1);
 // No arrival was required, and the same payment remains intact after final review.
 assert.deepEqual((await db.query('select actual from logistics_dispatch_plans')).rows[0].actual,{});
 await db.exec("update logistics_dispatch_plans set status='completed'");
 await assert.rejects(db.query('select accept_logistics_freight_difference($1,$2,$3,$4,$5)',[actor,dispatch,1,300000,'No cerrar provisoria']),/definitiva/);
 await assert.rejects(pay('40000000-0000-4000-8000-000000000002',1,1),/definitiva/);
 await save(1,320000);assert(!(await db.query('select provisional from logistics_freight_settlement_terms')).rows[0].provisional);
 await assert.rejects(pay('40000000-0000-4000-8000-000000000003',2,300000),/supera/);
 await pay('40000000-0000-4000-8000-000000000004',2,20000);assert.equal(Number((await db.query('select sum(amount) total from cash_transactions')).rows[0].total),320000);
 await save(2,280000);assert.equal(Number((await db.query('select sum(amount) total from cash_transactions')).rows[0].total),320000);
 await db.exec("update logistics_dispatch_plans set status='cancelled'");await assert.rejects(save(3,300000),/recorrido/);
 await db.exec("update logistics_dispatch_plans set status='planned'");await assert.rejects(save(3,300000),/recorrido/);
 console.log('PASS provisional freight: in-progress review/payment without arrival, one task, retry idempotency, final review guard, additional balance only, overpayment preserved, invalid states rejected, migration idempotent.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
