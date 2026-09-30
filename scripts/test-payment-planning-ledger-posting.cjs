// Transactional integration check; always rolls back the test Movimiento.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const migration = fs.readFileSync('database/db_migration_v120_payment_planning_ledger_posting.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    application_name: 'payment_planning_ledger_posting_test' });
  await db.connect();
  try {
    await db.query('begin');
    try {
      await db.query("set local lock_timeout='5s'");
      await db.query("set local statement_timeout='120s'");
      await db.query(migration);
      const actor = (await db.query('select created_by from public.payment_planning_import_batches order by created_at desc limit 1')).rows[0]?.created_by;
      const item = (await db.query(`
        select i.id,i.title,i.amount from public.payment_planning_items i
        join public.payment_planning_funds f on f.id=i.fund_id
        where i.status='active' and i.kind='expense' and i.scheduled_date>=date '2026-09-30'
          and i.amount>0 and f.kind='cash' and f.currency='ARS'
          and not exists(select 1 from public.payment_planning_realizations r where r.item_id=i.id and r.reversed_at is null)
        order by i.scheduled_date,i.id limit 1
      `)).rows[0];
      const account = (await db.query("select id from public.financial_accounts where name='Caja Efectivo Pesos' and is_active")).rows[0];
      const concept = (await db.query("select id from public.financial_concepts where movement_type='Egreso' and is_active order by id limit 1")).rows[0];
      if (!actor || !item || !account || !concept) throw new Error('Faltan datos de prueba para la integración.');
      const key = randomUUID();
      const payload = { item_id:item.id,amount:'1.00',effective_date:'2026-09-30',
        financial_account_id:account.id,financial_concept_id:concept.id,
        movement_detail:`Prueba reversible: ${item.title}`,notes:'Prueba reversible' };
      const call = async () => (await db.query('select public.payment_planning_realize_with_movement($1,$2,$3::jsonb) as result',
        [actor,key,JSON.stringify(payload)])).rows[0].result;
      const first = await call();
      const retry = await call();
      if (first.cash_transaction_id !== retry.cash_transaction_id || first.realization_id !== retry.realization_id) {
        throw new Error('La clave de idempotencia generó movimientos distintos.');
      }
      const linked = (await db.query(`
        select r.cash_transaction_id, t.type,t.amount,t.financial_account_id,t.currency
        from public.payment_planning_realizations r
        join public.cash_transactions t on t.id=r.cash_transaction_id where r.id=$1
      `, [first.realization_id])).rows[0];
      if (!linked || linked.type !== 'egreso' || Number(linked.amount) !== 1 || linked.financial_account_id !== account.id) {
        throw new Error('El Movimiento no quedó correctamente vinculado a la realización.');
      }
      const personalItem = (await db.query(`
        select i.id,i.title from public.payment_planning_items i
        join public.payment_planning_funds f on f.id=i.fund_id
        where i.status='active' and i.kind='expense' and i.scheduled_date>=date '2026-09-30'
          and i.amount>0 and f.kind='personal' and f.currency='ARS'
          and not exists(select 1 from public.payment_planning_realizations r where r.item_id=i.id and r.reversed_at is null)
        order by i.scheduled_date,i.id limit 1
      `)).rows[0];
      const mp3 = (await db.query("select id from public.financial_accounts where name='Cuenta MP3' and is_active")).rows[0];
      if (!personalItem || !mp3) throw new Error('Faltan datos de prueba para MP3.');
      const personalPayload = { ...payload, item_id:personalItem.id, financial_account_id:mp3.id,
        movement_detail:`Prueba reversible: ${personalItem.title}` };
      const personalResult = (await db.query('select public.payment_planning_realize_with_movement($1,$2,$3::jsonb) as result',
        [actor,randomUUID(),JSON.stringify(personalPayload)])).rows[0].result;
      const personalLink = (await db.query(`
        select t.financial_account_id,f.kind as planning_fund_kind from public.payment_planning_realizations r
        join public.cash_transactions t on t.id=r.cash_transaction_id
        join public.payment_planning_funds f on f.id=r.fund_id where r.id=$1
      `, [personalResult.realization_id])).rows[0];
      if (!personalLink || personalLink.financial_account_id !== mp3.id || personalLink.planning_fund_kind !== 'personal') {
        throw new Error('La Cuenta MP3 no se imputó a Cuentas personales.');
      }
      console.log(JSON.stringify({ status:'verified_and_rolled_back',type:linked.type,amount:linked.amount,currency:linked.currency,
        accounts:['Caja Efectivo Pesos','Cuenta MP3'],idempotent:true }));
    } finally { await db.query('rollback'); }
  } finally { await db.end(); }
})().catch(error => { console.error(`${error.code || 'ERROR'}: ${error.message}`); process.exitCode = 1; });
