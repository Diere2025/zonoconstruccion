// Isolated PGlite regression. Never reads production credentials.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
const engine=new PGlite();
const db={connect:async()=>{},query:(sql,args)=>args?engine.query(sql,args):engine.exec(sql).then(results=>results.at(-1)||{rows:[]}),end:()=>engine.close()};
function definition(name){const sql=fs.readFileSync('database/db_migration_v136_financial_operations.sql','utf8');const start=sql.indexOf(`create or replace function public.${name}(`);return sql.slice(start,sql.indexOf('$$;',start)+3);}
(async()=>{await db.connect();try{
 await db.query('begin');
 await db.query(`
 create role anon;create role authenticated;create role service_role;
 create table suppliers(id uuid primary key,name text);
 create table financial_accounts(id uuid primary key,currency text,is_active boolean);
 create table payment_methods(id uuid primary key);
 create table financial_concepts(id uuid primary key,category text,sub_category text,efe_category text,is_active boolean);
 create table employees(id uuid primary key,is_active boolean);
 create table cost_centers(id uuid primary key,code text);
 create table financial_concept_operation_types(financial_concept_id uuid,operation_type text);
 create table orders(id uuid primary key,total_amount numeric,status text,client_id uuid);
 create table financial_operations(id uuid primary key default gen_random_uuid(),operation_type text,effective_date date,detail jsonb,created_by uuid,version integer default 1,status text default 'posted',updated_at timestamptz,cancelled_at timestamptz);
 create table cash_transactions(id uuid primary key default gen_random_uuid(),type text,category text,amount numeric,currency text,payment_method_id uuid,financial_account_id uuid,concept text,notes text,created_by uuid,created_at timestamptz,sub_category text,efe_category text,business_unit text,cost_center_id uuid,operation_id uuid,operation_line text,reversal_of_transaction_id uuid,route_sheet_id uuid,employee_id uuid,treasury_settlement_id uuid,register_id uuid,financial_concept_id uuid);
 create table supplier_purchases(id uuid primary key,supplier_id uuid,currency text,purchase_date timestamptz,created_at timestamptz,document_type text,total_amount numeric,paid_amount numeric default 0,status text default 'Pendiente');
 create table supplier_payments(id uuid primary key default gen_random_uuid(),supplier_id uuid,amount numeric,currency text,payment_method_id uuid,cash_transaction_id uuid,financial_account_id uuid,notes text,created_by uuid,created_at timestamptz,reversed_at timestamptz);
 create table supplier_payment_allocations(payment_id uuid,purchase_id uuid,amount numeric,primary key(payment_id,purchase_id));
 create table client_payments(id uuid primary key,order_id uuid,client_id uuid,amount numeric,currency text,status text,reversed_at timestamptz,cash_transaction_id uuid);
 create table payment_planning_realizations(cash_transaction_id uuid);create table payment_planning_source_rows(cash_transaction_id uuid);
 create table financial_operation_events(operation_id uuid,action text,before_value jsonb,after_value jsonb,reason text,actor_id uuid);
 create table financial_operation_requests(actor_id uuid,request_key uuid,action text,payload jsonb,result jsonb,primary key(actor_id,request_key));
 create table operation_vouchers(operation_id uuid,voucher_id uuid);
 create function can_manage_financial_operations(uuid) returns boolean language sql as $$select true$$;
 `);
 await db.query(definition('recalculate_operation_documents'));
 await db.query(definition('mutate_financial_operation'));
 const eventual=fs.readFileSync('database/db_migration_v143_eventual_supplier_purchase.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(eventual);
 const migration=fs.readFileSync('database/db_migration_v149_supplier_payment_fifo.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(migration);await db.query(migration);assert.equal((await db.query('select supplier_payment_fifo_available() ready')).rows[0].ready,true);
 const saveMigration=fs.readFileSync('database/db_migration_v152_financial_save_roundtrips.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(saveMigration);await db.query(saveMigration);
 const cents=fs.readFileSync('database/db_migration_v162_supplier_payment_cents.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(cents);await db.query(cents);
 const actor=randomUUID(),supplier=randomUUID(),otherSupplier=randomUUID(),account=randomUUID(),method=randomUUID();
 await db.query('insert into suppliers values($1,$2),($3,$4)',[supplier,'Test',otherSupplier,'Other']);await db.query("insert into financial_accounts values($1,'ARS',true)",[account]);await db.query('insert into payment_methods values($1)',[method]);
 const oldest=randomUUID(),newer=randomUUID(),future=randomUUID(),credit=randomUUID(),voided=randomUUID(),usd=randomUUID();
 for(const [id,date,total,currency,type,status] of [[oldest,'2026-08-01',100000,'ARS','Remito','Pendiente'],[newer,'2026-09-01',80000,'ARS','Factura','Pendiente'],[future,'2026-12-01',100000,'ARS','Factura','Pendiente'],[credit,'2026-01-01',20000,'ARS','Nota de Crédito','Pendiente'],[voided,'2026-01-01',20000,'ARS','Factura','Anulado'],[usd,'2026-01-01',20000,'USD','Factura','Pendiente']])await db.query('insert into supplier_purchases(id,supplier_id,purchase_date,created_at,total_amount,currency,document_type,status) values($1,$2,$3,$3,$4,$5,$6,$7)',[id,supplier,date,total,currency,type,status]);
 const base={operation_type:'supplier_payment',effective_date:'2026-10-06',account_id:account,payment_method_id:method,direction:'egreso',amount:'130000.00',concept:'Pago a cuenta corriente',category:'Proveedores',detail:{supplier_allocation_mode:'oldest_first'},supplier_id:supplier,allocations:[],voucher_ids:[]};
 const mutate=async(key,payload,target={})=>(await db.query('select save_financial_operation($1,$2,$3,$4,$5,$6) result',[actor,key,'save',payload,target,''])).rows[0].result;
 const allocated=async(result)=>(await db.query('select a.purchase_id,a.amount::text from supplier_payment_allocations a join supplier_payments p on p.id=a.payment_id where p.cash_transaction_id=any($1) and p.reversed_at is null order by a.purchase_id',[result.transaction_ids])).rows;
 const key=randomUUID(),first=await mutate(key,base),rows=await allocated(first);
 assert.equal(rows.find(r=>r.purchase_id===oldest).amount,'100000.00');assert.equal(rows.find(r=>r.purchase_id===newer).amount,'30000.00');assert.equal(rows.length,2);
 assert.deepEqual(await mutate(key,base),first,'Retry must not apply to newer balances again');
 const edited=await mutate(randomUUID(),{...base,amount:'110000.00'},{transaction_id:first.transaction_ids[0],operation_id:first.operation_id,expected_version:first.version});const editedRows=await allocated(edited);assert.equal(editedRows.find(r=>r.purchase_id===newer).amount,'10000.00');
 const second=await mutate(randomUUID(),{...base,amount:'90000.00'});const secondRows=await allocated(second);assert.equal(secondRows.length,1);assert.equal(secondRows[0].purchase_id,newer);assert.equal(secondRows[0].amount,'70000.00');
 const excess=await mutate(randomUUID(),{...base,amount:'500.00'});assert.equal((await allocated(excess)).length,0);
 const manual=await mutate(randomUUID(),{...base,amount:'100.00',detail:{supplier_allocation_mode:'documents'},allocations:[{purchase_id:future,amount:'100.00'}]});assert.equal((await allocated(manual))[0].purchase_id,future);
 await db.query('select mutate_financial_operation($1,$2,$3,$4,$5,$6)',[actor,randomUUID(),'cancel',{}, {transaction_id:second.transaction_ids[0],operation_id:second.operation_id,expected_version:second.version},'Test cancellation']);
 const repaid=await mutate(randomUUID(),{...base,amount:'70000.00'});assert.equal((await allocated(repaid))[0].amount,'70000.00');
 assert.equal((await db.query('select paid_amount::text from supplier_purchases where id=$1',[newer])).rows[0].paid_amount,'80000.00');
 async function rejected(code,pattern){await db.query('savepoint reject_test');await assert.rejects(code,pattern);await db.query('rollback to savepoint reject_test');}
 const residual=randomUUID();
 await db.query('insert into supplier_purchases(id,supplier_id,currency,purchase_date,created_at,total_amount) values($1,$2,$3,$4,$4,$5)',[residual,supplier,'ARS','2026-09-15','266291.44999999995']);
 const residualPayment=await mutate(randomUUID(),{...base,amount:'266291.45'});
 assert.equal((await allocated(residualPayment)).find(r=>r.purchase_id===residual).amount,'266291.45');
 assert.equal((await db.query('select status from supplier_purchases where id=$1',[residual])).rows[0].status,'Pagado');
 await rejected(()=>mutate(randomUUID(),{...base,amount:'0.01',detail:{supplier_allocation_mode:'documents'},allocations:[{purchase_id:residual,amount:'0.01'}]}),/saldo de imputación/);
 await db.query('select mutate_financial_operation($1,$2,$3,$4,$5,$6)',[actor,randomUUID(),'cancel',{}, {transaction_id:residualPayment.transaction_ids[0],operation_id:residualPayment.operation_id,expected_version:residualPayment.version},'Test cancellation']);
 const explicit=await mutate(randomUUID(),{...base,amount:'266291.45',detail:{supplier_allocation_mode:'documents'},allocations:[{purchase_id:residual,amount:'266291.45'}]});
 assert.equal((await allocated(explicit))[0].amount,'266291.45');
 const above=randomUUID();
 await db.query('insert into supplier_purchases(id,supplier_id,currency,purchase_date,created_at,total_amount) values($1,$2,$3,$4,$4,$5)',[above,supplier,'ARS','2026-09-16','0.30000000000000004']);
 await mutate(randomUUID(),{...base,amount:'0.30'});
 assert.equal((await db.query('select status from supplier_purchases where id=$1',[above])).rows[0].status,'Pagado');
 await db.query('create or replace function can_manage_financial_operations(uuid) returns boolean language sql as $$select false$$');
 await rejected(()=>mutate(randomUUID(),base),/permisos/);
 await db.query('create or replace function can_manage_financial_operations(uuid) returns boolean language sql as $$select true$$');
 await db.query('create or replace function supplier_payment_fifo_available() returns boolean language sql as $$select false$$');
 await rejected(()=>mutate(randomUUID(),base),/todavía no está habilitado/);
 await db.query('create or replace function supplier_payment_fifo_available() returns boolean language sql as $$select true$$');
 await rejected(()=>db.query('select save_financial_operation($1,$2,$3,$4,$5,$6)',[actor,randomUUID(),'cancel',base,{},'']),/guardado inválida/);
 await db.query('rollback');console.log('PASS isolated PostgreSQL cents regression: FIFO, partial payment, exclusions, repeatable migration, retry, editing, surplus, manual override and cancellation; isolated fixtures rolled back.');
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message, e.position, e.internalQuery, e.query);process.exitCode=1;});



