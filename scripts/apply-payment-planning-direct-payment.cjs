// Default: install and exercise v121 inside a transaction that is always rolled back.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v121_payment_planning_direct_payment.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis:10000,
    application_name:'payment_planning_direct_payment' });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    await db.query(sql);
    if (!apply) {
      const actor = (await db.query('select created_by from payment_planning_import_batches order by created_at desc limit 1')).rows[0]?.created_by;
      const fund = (await db.query("select id from payment_planning_funds where kind='cash' and currency='ARS' and active limit 1")).rows[0]?.id;
      const account = (await db.query("select id from financial_accounts where name='Caja Efectivo Pesos' and is_active limit 1")).rows[0]?.id;
      const concept = (await db.query("select id from financial_concepts where movement_type='Egreso' and is_active order by id limit 1")).rows[0]?.id;
      if (!actor || !fund || !account || !concept) throw Error('Faltan datos de prueba.');
      const payload = { item:{kind:'expense',fund_id:fund,title:'Prueba reversible gasto directo',priority:'normal'},
        realization:{amount:'1.00',effective_date:'2026-09-30',fund_id:fund},with_movement:false };
      const call = async (key,data) => (await db.query('select payment_planning_create_realized($1,$2,$3::jsonb) as result',[actor,key,JSON.stringify(data)])).rows[0].result;
      const key = randomUUID(), first = await call(key,payload), retry = await call(key,payload);
      if (first.item.id !== retry.item.id || first.realization.id !== retry.realization.id) throw Error('Se duplicó el gasto al repetir la solicitud.');
      const unlinked = (await db.query('select amount,cash_transaction_id from payment_planning_realizations where id=$1',[first.realization.id])).rows[0];
      if (Number(unlinked.amount)!==1 || unlinked.cash_transaction_id) throw Error('El pago sin Movimiento no quedó pendiente de conciliación.');
      const withMovement = {...payload,with_movement:true,realization:{...payload.realization,
        financial_account_id:account,financial_concept_id:concept,movement_detail:'Prueba reversible gasto directo'}};
      const linked = await call(randomUUID(),withMovement);
      const link = (await db.query('select r.amount,t.amount as movement_amount from payment_planning_realizations r join cash_transactions t on t.id=r.cash_transaction_id where r.id=$1',[linked.realization.realization_id])).rows[0];
      if (!link || Number(link.amount)!==1 || Number(link.movement_amount)!==1) throw Error('El gasto no quedó vinculado al Movimiento.');
      const before = (await db.query('select count(*)::int as n from payment_planning_items')).rows[0].n;
      await db.query('savepoint invalid_movement');
      let failed=false;
      try { await call(randomUUID(),{...withMovement,realization:{...withMovement.realization,financial_account_id:randomUUID()}}); }
      catch { failed=true; await db.query('rollback to savepoint invalid_movement'); }
      if (!failed || (await db.query('select count(*)::int as n from payment_planning_items')).rows[0].n!==before) throw Error('Un Movimiento inválido dejó un gasto huérfano.');
      await db.query('rollback');
      console.log(JSON.stringify({status:'verified_and_rolled_back',idempotent:true,atomic:true,linked_and_unlinked:true}));
    } else {
      await db.query("notify pgrst,'reload schema'");
      await db.query('commit');
      console.log(JSON.stringify({migration:'v121',status:'applied'}));
    }
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(`${error.code || 'ERROR'}: ${error.message}`); process.exitCode=1; });
