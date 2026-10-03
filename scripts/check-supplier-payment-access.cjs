// Database rehearsal: always rolls back DDL and fixtures, including on failure.
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='3s'; set local statement_timeout='20s'");
    const sql = fs.readFileSync('database/db_migration_v142_supplier_payment_access.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');
    await db.query(sql);
    const actor = (await db.query("select u.id from auth.users u join sellers s on s.id=u.id where s.full_name ilike '%laura%' and s.is_active and s.role='administracion'")).rows[0]?.id;
    assert.ok(actor,'Active Laura account required');
    assert.equal((await db.query('select can_manage_financial_operations($1) allowed',[actor])).rows[0].allowed,true);
    const template = (await db.query("select * from cash_transactions where created_by=$1 and concept ilike '%fibrosur%' and amount=1400000 order by created_at desc limit 1",[actor])).rows[0];
    assert.ok(template,'Existing movement template required');
    const supplier = (await db.query("select id from suppliers where name ilike 'fibrosur' limit 1")).rows[0]?.id;
    assert.ok(supplier);
    const tx = randomUUID();
    await db.query("insert into cash_transactions(id,type,category,amount,currency,payment_method_id,financial_account_id,concept,created_by) values($1,'egreso','Proveedores',0.01,$2,$3,$4,'Prueba reversible de permisos',$5)",[tx,template.currency,template.payment_method_id,template.financial_account_id,actor]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actor]);
    await db.query('set local role authenticated');
    const payment = await db.query('insert into supplier_payments(supplier_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,notes) values($1,0.01,$2,$3,$4,$5,$6) returning created_by',[supplier,template.currency,template.payment_method_id,tx,template.financial_account_id,'Prueba reversible']);
    assert.equal(payment.rows[0].created_by,actor);
    await db.query('reset role');
    const payload = {operation_type:'supplier_payment',effective_date:'2026-10-02',account_id:template.financial_account_id,direction:'egreso',amount:'0.02',payment_method_id:template.payment_method_id,concept:'Prueba reversible de pago a proveedor',category:'Proveedores',supplier_id:supplier,detail:{},allocations:[],voucher_ids:[]};
    const operation = (await db.query('select mutate_financial_operation($1,$2,$3,$4::jsonb,null,null) result',[actor,randomUUID(),'save',JSON.stringify(payload)])).rows[0].result;
    assert.ok(operation.operation_id);
    const links = (await db.query('select count(*)::int n from supplier_payments p join cash_transactions t on t.id=p.cash_transaction_id where t.operation_id=$1 and p.created_by=$2',[operation.operation_id,actor])).rows[0];
    assert.equal(links.n,1);
    console.log('PASS legacy insert and atomic supplier payment as Laura; verified author and single link; all changes rolled back');
  } finally { await db.query('rollback'); await db.end(); }
})().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
