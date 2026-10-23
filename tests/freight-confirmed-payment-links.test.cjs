const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),path=require('node:path');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl,Map,Set,Number,String,JSON,require:n=>imports[n]||{}});return exports;}
const costs=load('src/lib/logisticsDispatch/costs.ts'),refs=load('src/lib/financialOperations/references.ts');
const payments=load('src/lib/logisticsDispatch/planningPayments.ts',{'./costs':costs,'@/lib/financialOperations/references':refs});
(async()=>{
 // A source preview must not turn an unconfirmed whole payment into a posted amount.
 const plan={dispatch_id:'old',status:'completed',planned:{agreedAmount:null},logistics_dispatches:{code:'LOG_REC_05430'}};
 const before=payments.dispatchPaymentState(plan,[]);
 const preview={rows:[{transactionId:'mixed',source:{code:'LOG_REC_05430',row:10,date:'2026-10-13',amount:271600}}],issues:[]};
 const issues=payments.paymentSourceReviewIssues(preview);assert.equal(issues[0].transactionId,'mixed');assert.equal(before.paidAmount,null);
 // Reading plans must not search free-form notes or manufacture an association.
 const calls=[];const db={from:table=>{calls.push(table);return {select(){return this},in(){return this},order(){return this}}}};
 const server=load('src/lib/logisticsDispatch/planningPaymentsServer.ts',{'./planningServer':{planningRows:async()=>[]},'./settlementAccountingServer':{allocationLinks:async(_db,links)=>links},'./planningPayments':payments});
 const read=await server.planningPaymentStates(db,[plan]);assert.equal(read[0].paymentState.paidAmount,null);assert(!calls.includes('cash_transactions'));
 // Partial allocations, including a payment made later, preserve only each LOG's share.
 const mixed={id:'mixed',type:'egreso',currency:'ARS',category:'Servicio de Flete',amount:271600,created_at:'2026-10-13T15:00:00Z'};
 assert.equal(payments.dispatchPaymentState(plan,[{transaction_id:'mixed',allocated_amount:30000,cash_transactions:mixed}]).paidAmount,30000);
 const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));const sql=new PGlite();
 try{
  await sql.exec(`create role anon;create role authenticated;create role service_role;
   create table cash_transactions(id uuid primary key,type text,currency text,amount numeric,category text,sub_category text,notes text,reversal_of_transaction_id uuid);
   create table logistics_dispatches(id uuid primary key,code text unique);
   create table logistics_dispatch_movements(transaction_id uuid primary key,dispatch_id uuid,method text,purpose text);
   create table logistics_freight_payment_allocations(transaction_id uuid,dispatch_id uuid,amount numeric);
   insert into logistics_dispatches values('00000000-0000-4000-8000-000000000001','LOG_REC_05430');`);
  await sql.exec(fs.readFileSync('database/db_migration_v209_logistics_new_payment_references.sql','utf8'));
  const migration=fs.readFileSync('database/db_migration_v228_freight_confirmed_payment_links.sql','utf8');await sql.exec(migration);await sql.exec(migration);
  const tx='00000000-0000-4000-8000-000000000010',owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
  await sql.query("insert into cash_transactions values($1,'egreso','ARS',271600,'Servicio de Flete',null,'LOG_REC_05430',null)",[tx]);
  assert.equal((await sql.query('select * from logistics_dispatch_movements')).rows.length,0,'New notes-only payment remains unassigned');
  await sql.query("insert into logistics_dispatch_movements values($1,$2,'movement_log_reference','freight_fee')",[tx,owner]);
  assert.equal((await sql.query('select * from logistics_dispatch_movements')).rows.length,0,'Old importer cannot recreate notes-only ownership');
  await sql.query("insert into logistics_dispatch_movements values($1,$2,'source_verified','freight_fee')",[tx,owner]);
  await sql.query('insert into logistics_freight_payment_allocations values($1,$2,30000),($1,$3,241600)',[tx,owner,other]);
  await assert.rejects(sql.query("update logistics_dispatch_movements set dispatch_id=$2,method='source_row_unique' where transaction_id=$1",[tx,other]),/desglose confirmado/);
  await sql.query("update logistics_dispatch_movements set dispatch_id=$2,method='incident_verified' where transaction_id=$1",[tx,other]);
  assert.equal(Number((await sql.query('select sum(amount) n from logistics_freight_payment_allocations')).rows[0].n),271600);
  assert.equal((await sql.query('select notes from cash_transactions')).rows[0].notes,'LOG_REC_05430');
  console.log('PASS INC-005177: new payments cannot inherit ownership from notes; previews remain pending; confirmed splits survive reimports; later payments and cash amounts are preserved.');
 }finally{await sql.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
