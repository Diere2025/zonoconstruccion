// Planning evidence only: SELECT queries inside an enforced read-only transaction.
const fs=require('node:fs');
const {Client}=require('pg');
process.loadEnvFile('.env.local');
(async()=>{
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try {
await db.connect();
await db.query('BEGIN READ ONLY');
await db.query("SET LOCAL statement_timeout='20s'");
const tables=['suppliers','supplier_account_starts','supplier_account_history','supplier_account_entries','supplier_purchases','supplier_payments','supplier_payment_allocations','supplier_bills','supplier_bill_lines','purchase_receptions','cash_transactions','financial_operations','financial_accounts','client_payments'];
const columns=(await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,ordinal_position",[tables])).rows;
const counts={};
for(const table of tables) if(columns.some(c=>c.table_name===table)) counts[table]=(await db.query('SELECT count(*)::int n FROM public.'+table)).rows[0].n;
const functions=(await db.query("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (proname LIKE '%supplier%' OR proname IN ('mutate_financial_operation','save_financial_operation','save_catalog_financial_operation')) ORDER BY proname")).rows;
const out={capturedAt:new Date().toISOString(),mode:'READ ONLY',columns,counts,functions};
out.suppliers=(await db.query('SELECT id,name,business_unit,is_active FROM suppliers ORDER BY name')).rows;
out.starts=(await db.query('SELECT s.name,a.* FROM supplier_account_starts a JOIN suppliers s ON s.id=a.supplier_id')).rows;
out.purchases=(await db.query('SELECT s.name,p.id,p.supplier_id,p.invoice_number,p.purchase_date,p.due_date,p.total_amount,p.paid_amount,p.currency,p.status,p.document_type,p.purchase_reception_id,p.purchase_order_id,p.notes FROM supplier_purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.purchase_date,p.id')).rows;
out.payments=(await db.query('SELECT s.name,p.id,p.supplier_id,p.purchase_id,p.amount,p.currency,p.cash_transaction_id,p.created_at,p.reversed_at,t.created_at cash_date,t.movement_code,t.operation_id FROM supplier_payments p JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN cash_transactions t ON t.id=p.cash_transaction_id ORDER BY p.created_at,p.id')).rows;
out.allocations=(await db.query('SELECT * FROM supplier_payment_allocations ORDER BY id')).rows;
out.movements=(await db.query("SELECT t.id,t.created_at,t.type,t.amount,t.currency,t.concept,t.category,t.sub_category,t.business_unit,t.operation_id,t.reversal_of_transaction_id,t.bank_import_key,t.movement_code,t.is_imported,a.name account_name,o.status operation_status FROM cash_transactions t LEFT JOIN financial_accounts a ON a.id=t.financial_account_id LEFT JOIN financial_operations o ON o.id=t.operation_id WHERE t.category IN ('Proveedores','Proveedores (Deuda)','Insumo de Producto') ORDER BY t.created_at,t.id")).rows;
out.balances=(await db.query('SELECT * FROM get_supplier_account_balances()')).rows;
out.readiness=(await db.query("SELECT supplier_payment_fifo_available() fifo, position('supplier cents v162' in pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure))>0 cents_fix")).rows;
fs.mkdirSync('output/cc-planning',{recursive:true});
fs.writeFileSync('output/cc-planning/erp-schema.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({counts:out.counts,starts:out.starts,readiness:out.readiness,movements:out.movements.length,output:'output/cc-planning/erp-schema.json'}));
await db.query('ROLLBACK');
} finally{await db.end();}
})().catch(e=>{console.error(e.code||e.name);process.exitCode=1;});
