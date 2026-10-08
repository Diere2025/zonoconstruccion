// Only an isolated local PostgreSQL test instance. Never reads production credentials.
const {Client}=require('pg');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const port=Number(process.argv[2]);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Pass the isolated local PostgreSQL port.');
const db=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000});
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
 create table clients(id uuid primary key);create table orders(id uuid primary key,total_amount numeric,status text,client_id uuid,totals jsonb,payment_status text,payment_approved boolean);
 create table financial_operations(id uuid primary key default gen_random_uuid(),operation_type text,effective_date date,detail jsonb,created_by uuid,version integer default 1,status text default 'posted',updated_at timestamptz,cancelled_at timestamptz);
 create table cash_transactions(id uuid primary key default gen_random_uuid(),type text,category text,amount numeric,currency text,payment_method_id uuid,financial_account_id uuid,concept text,notes text,created_by uuid,created_at timestamptz,sub_category text,efe_category text,business_unit text,cost_center_id uuid,operation_id uuid,operation_line text,reversal_of_transaction_id uuid,route_sheet_id uuid,employee_id uuid,treasury_settlement_id uuid,register_id uuid,financial_concept_id uuid);
 create table supplier_purchases(id uuid primary key,supplier_id uuid,currency text,purchase_date timestamptz,created_at timestamptz,document_type text,total_amount numeric,paid_amount numeric default 0,status text default 'Pendiente');
 create table supplier_payments(id uuid primary key default gen_random_uuid(),supplier_id uuid,amount numeric,currency text,payment_method_id uuid,cash_transaction_id uuid,financial_account_id uuid,notes text,created_by uuid,created_at timestamptz,reversed_at timestamptz);
 create table supplier_payment_allocations(payment_id uuid,purchase_id uuid,amount numeric,primary key(payment_id,purchase_id));
 create table client_payments(id uuid primary key default gen_random_uuid(),order_id uuid,client_id uuid references clients(id),amount numeric check(amount>0),currency text,status text,reversed_at timestamptz,cash_transaction_id uuid,financial_account_id uuid,payment_method_id uuid,notes text,created_by uuid,created_at timestamptz);
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
 const actor=randomUUID(),supplier=randomUUID(),otherSupplier=randomUUID(),account=randomUUID(),method=randomUUID();
 await db.query('insert into suppliers values($1,$2),($3,$4)',[supplier,'Test',otherSupplier,'Other']);await db.query("insert into financial_accounts values($1,'ARS',true)",[account]);await db.query('insert into payment_methods values($1)',[method]);

 const creditMigration=fs.readFileSync('database/db_migration_v159_customer_credit.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(creditMigration);await db.query(creditMigration);
 const alertMigration=fs.readFileSync('database/db_migration_v160_mp_monthly_income_alerts.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(alertMigration);await db.query(alertMigration);
 const client=randomUUID(),order=randomUUID(),receipt=randomUUID();await db.query('insert into clients values($1)',[client]);await db.query("insert into orders(id,client_id,total_amount,status) values($1,$2,3065156,'Pendiente')",[order,client]);
 await db.query("insert into client_payments(id,client_id,order_id,amount,currency,status) values($1,$2,$3,3065156,'ARS','Aprobado')",[receipt,client,order]);
 const base={operation_type:'customer_collection',effective_date:'2026-10-08',account_id:account,payment_method_id:method,direction:'ingreso',amount:'3065200.00',concept:'Cobro real',category:'Cobranza',detail:{},client_id:client,order_id:order,client_payment_id:receipt};
 const mutate=async(payload,target={},key=randomUUID())=>(await db.query('select save_financial_operation($1,$2,$3,$4,$5,$6) result',[actor,key,'save',payload,target,''])).rows[0].result;
 const payments=async(result)=>(await db.query('select order_id,amount::numeric::text from client_payments where cash_transaction_id=any($1) and reversed_at is null order by order_id nulls last',[result.transaction_ids])).rows;
 const key=randomUUID(),result=await mutate(base,{},key);assert.deepEqual((await payments(result)).map(p=>Number(p.amount)),[3065156,44]);assert.equal(Number((await db.query('select amount from cash_transactions where id=$1',[result.transaction_ids[0]])).rows[0].amount),3065200);assert.deepEqual(await mutate(base,{},key),result);
 const credit=await mutate({...base,order_id:undefined,client_payment_id:undefined,amount:'44.00'});assert.equal((await payments(credit))[0].order_id,null);assert.equal(Number((await payments(credit))[0].amount),44);
 const edited=await mutate({...base,amount:'3065256.00'},{transaction_id:result.transaction_ids[0],operation_id:result.operation_id,expected_version:result.version});assert.deepEqual((await payments(edited)).map(p=>Number(p.amount)),[3065156,100]);
 await db.query('select mutate_financial_operation($1,$2,$3,$4,$5,$6)',[actor,randomUUID(),'cancel',{}, {transaction_id:edited.transaction_ids[0],operation_id:edited.operation_id,expected_version:edited.version},'Anulación de prueba']);assert.equal((await payments(edited)).length,0);assert.equal((await db.query('select payment_status from orders where id=$1',[order])).rows[0].payment_status,'Pendiente');
 const fresh=await mutate({...base,client_payment_id:undefined,amount:'3065200.00'});assert.deepEqual((await payments(fresh)).map(p=>Number(p.amount)),[3065156,44]);
 await db.query('savepoint mismatch');await assert.rejects(mutate({...base,client_id:randomUUID(),client_payment_id:undefined}),/cliente no corresponde/);await db.query('rollback to savepoint mismatch');
 await db.query('savepoint tooLow');const another=randomUUID();await db.query("insert into client_payments(id,client_id,order_id,amount,currency,status) values($1,$2,$3,500,'ARS','Aprobado')",[another,client,order]);await assert.rejects(mutate({...base,client_payment_id:another,amount:'100'}),/menor que el comprobante/);await db.query('rollback to savepoint tooLow');
 const alert={month:'2026-10-01',account:'A',threshold:10000000};await db.query("insert into mp_monthly_income_alerts(month,account_id,threshold,lease_until) values($1,$2,$3,now()+interval '2 minutes')",[alert.month,alert.account,alert.threshold]);await db.query('savepoint duplicateAlert');await assert.rejects(db.query("insert into mp_monthly_income_alerts(month,account_id,threshold,lease_until) values($1,$2,$3,now())",[alert.month,alert.account,alert.threshold]),e=>e.code==='23505');await db.query('rollback to savepoint duplicateAlert');await db.query("insert into mp_monthly_income_alerts(month,account_id,threshold,lease_until) values('2026-11-01','A',10000000,now()),('2026-10-01','B',10000000,now())");
 console.log('PASS: full cash amount, receipt allocation + 44 credit, independent credit, idempotent retry, edit, cancel, fresh overpayment, ownership checks, monthly/account alert uniqueness.');
}finally{await db.query('rollback');await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
