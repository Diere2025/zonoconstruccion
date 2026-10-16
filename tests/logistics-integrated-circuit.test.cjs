const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Number,Map,Set,String,Date,Intl,JSON,require:n=>imports[n]||{}});return exports;}
const costs=load('src/lib/logisticsDispatch/costs.ts'),profit=load('src/lib/logisticsDispatch/profitability.ts');
const delivered=[{order_id:'order',order_code:'JS1',outcome:'Entregado',executed:true}];
const cash=[{purpose:'freight_fee',transaction_id:'tx',cash_transactions:{id:'tx',type:'egreso',currency:'ARS',category:'Servicio de Flete',amount:280000}}];
const terms={gross_amount:300000,deductions:[{kind:'offset',amount:20000}]};
const result=costs.calculateRealDispatchCosts(delivered,cash,new Set(),terms);
assert.equal(result.serviceCostAmount,300000);assert.equal(result.paidAmount,280000);assert.equal(result.costPerDelivered,300000);
assert.equal(costs.calculateRealDispatchCosts(delivered,[],new Set(),terms).serviceCostAmount,300000);
assert.equal(costs.calculateRealDispatchCosts(delivered,cash,new Set(),{gross_amount:300000,deductions:[{kind:'discount',amount:10000},{kind:'offset',amount:20000}]}).serviceCostAmount,290000);
assert.equal(costs.calculateRealDispatchCosts(delivered,cash,new Set(),{...terms,cost_pending:true}).allocatedAmount,null);
const margins=[{id:'order',day:'2026-10-10',sales:1000000,freightCharged:0,surchargesCharged:0,margin:500000}];
const p=profit.dispatchProfitability([{code:'LOG_REC_1',delivery_date:'2026-10-10',realCosts:result}],margins)[0].profit;assert.equal(p.after,200000);assert.equal(p.freightPercent,30);assert.equal(p.actualCashPaid,280000);
const unknown=profit.dispatchProfitability([{code:'LOG_REC_1',delivery_date:'2026-10-10',realCosts:costs.calculateRealDispatchCosts(delivered,cash)}],margins)[0].profit;assert.equal(unknown.after,null);assert.equal(unknown.orders[0].after,null);assert.equal(unknown.paid,null);
(async()=>{
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));const db=new PGlite();
 const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',c1='10000000-0000-4000-8000-000000000001',c2='10000000-0000-4000-8000-000000000002',d1='20000000-0000-4000-8000-000000000001',d2='20000000-0000-4000-8000-000000000002',n='30000000-0000-4000-8000-000000000001',key='40000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table carriers(id uuid primary key,name text);create table logistics_dispatches(id uuid primary key,code text);create table logistics_dispatch_plans(dispatch_id uuid primary key,carrier_id uuid,status text,actual jsonb default '{}');create table cash_transactions(id uuid primary key default gen_random_uuid(),type text,currency text,amount numeric,category text,sub_category text,concept text,notes text,created_at timestamptz,reversal_of_transaction_id uuid,movement_code text);create table logistics_dispatch_movements(transaction_id uuid,dispatch_id uuid,purpose text);create function can_manage_financial_operations(uuid) returns boolean language sql as $$select $1='${actor}'::uuid$$;insert into carriers values('${c1}','GOMEZ, GUSTAVO'),('${c2}','RAMALLO, MARIO JORGE');insert into logistics_dispatches values('${d1}','LOG_REC_1'),('${d2}','LOG_REC_2');insert into logistics_dispatch_plans(dispatch_id,carrier_id,status) values('${d1}','${c1}','completed'),('${d2}','${c2}','completed');
 create function save_catalog_financial_operation(uuid,uuid,text,jsonb,jsonb,text) returns jsonb language plpgsql as $$declare t uuid;begin insert into cash_transactions(type,currency,amount,category,concept,notes,created_at,movement_code) values('egreso','ARS',($4->>'amount')::numeric,$4->>'category',$4->>'concept',$4->>'notes',($4->>'effective_date')::date,'PAG-TEST') returning id into t;return jsonb_build_object('transaction_ids',jsonb_build_array(t));end$$;`);
 for(const file of ['database/db_migration_v210_logistics_partial_payments.sql','database/db_migration_v213_logistics_integrated_settlement.sql','database/db_migration_v215_logistics_optional_references.sql']){const sql=fs.readFileSync(file,'utf8');await db.exec(sql);await db.exec(sql);}
 const novelty={carrier_id:null,company_key:'gyv',origin_date:'2026-10-09',source_dispatch_id:d1,kind:'shortage',label:'Faltante de rendición',reference:'',amount:20000};
 await assert.rejects(db.query('select save_logistics_freight_novelty($1,$2,$3)',[other,n,novelty]),/permiso/);
 await db.query('select save_logistics_freight_novelty($1,$2,$3)',[actor,n,novelty]);await db.query('select save_logistics_freight_novelty($1,$2,$3)',[actor,n,novelty]);
 const save=(id,version,gross,deductions)=>db.query('select save_logistics_freight_settlement_terms($1,$2,$3,$4)',[actor,id,version,{grossAmount:gross,netAmount:gross-deductions.reduce((s,d)=>s+d.amount,0),deductions,evidence:'Confirmación de prueba',extraSnapshot:[]}]);
 const deduction=amount=>({kind:'offset',amount,label:'Faltante',reference:'',noveltyId:n});
 await save(d1,0,300000,[deduction(15000)]);await assert.rejects(save(d2,0,300000,[deduction(10000)]),/supera/);await save(d2,0,300000,[deduction(5000)]);
 assert.equal(Number((await db.query('select sum(amount) value from logistics_freight_novelty_applications')).rows[0].value),20000);
 const payload={operation_type:'operating_expense',direction:'egreso',category:'Servicio de Flete',amount:'100000.00',concept:'Pago conjunto',notes:'LOG_REC_1 / LOG_REC_2',effective_date:'2026-10-12'};
 const allocations=[{code:'LOG_REC_1',amount:50000,reason:'Parcial',termsVersion:1},{code:'LOG_REC_2',amount:50000,reason:'Parcial',termsVersion:1}];
 const pay=(request,values=allocations,input=payload)=>db.query('select pay_logistics_freight($1,$2,$3,$4) result',[actor,request,input,values]);
 await pay(key);await pay(key);assert.equal((await db.query('select count(*) n from cash_transactions')).rows[0].n,1);assert.equal(Number((await db.query('select sum(amount) n from logistics_freight_payment_allocations')).rows[0].n),100000);
 await assert.rejects(pay('40000000-0000-4000-8000-000000000002',[{...allocations[0],amount:300000}],{...payload,amount:'300000.00'}),/supera/);
 await assert.rejects(pay('40000000-0000-4000-8000-000000000003',[{...allocations[0],amount:50000,termsVersion:2}],{...payload,amount:'50000.00'}),/Confirmá/);
 assert.equal((await db.query('select count(*) n from cash_transactions')).rows[0].n,1);
 await save(d1,1,300000,[]);assert.equal(Number((await db.query('select sum(amount) n from logistics_freight_novelty_applications')).rows[0].n),5000);
 console.log('PASS: service cost versus cash, margin, partial payments, commercial discounts, missing cost, GyV grouping, novelty capacity, retry safety, permissions, versions and no duplicate ledger entries.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
