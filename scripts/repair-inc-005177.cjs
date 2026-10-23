const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const repairs = [
  { pag: 'PAG-0000012715', amount: 250000, oldCode: 'LOG_REC_05430', origin: 'LOG_REC_05437', message: 984422,
    parts: [{ code: 'LOG_REC_05437', amount: 250000, reason: 'INC-005177: servicio del 12/10/2026 por $300.000 menos segunda cuota de termotanque de $50.000. Chat Matías 984422.' }] },
  { pag: 'PAG-0000012726', amount: 271600, oldCode: 'LOG_REC_05430', origin: 'LOG_REC_05440', message: 984795,
    parts: [{ code: 'LOG_REC_05440', amount: 241600, reason: 'INC-005177: servicio del 13/10/2026 por $300.000 menos recupero de $58.400 (Laura fila 1580). Chat Matías 984795; conciliación confirmada el 16/10/2026.' },
      { code: 'LOG_REC_05430', amount: 30000, reason: 'INC-005177: espera del 09/10/2026 abonada con el viaje del 13/10/2026. Adicional al servicio base de $318.000. Chat Matías 984795; conciliación confirmada el 16/10/2026.' }] },
  { pag: 'PAG-0000012716', amount: 410900, oldCode: 'LOG_REC_05433', origin: 'LOG_REC_05438', message: 984422,
    parts: [{ code: 'LOG_REC_05438', amount: 386300, reason: 'INC-005177: servicio del 12/10/2026 por $386.285; se conservan $15 de cambio en el LOG emisor conforme al criterio histórico. Chat Matías 984422.' },
      { code: 'LOG_REC_05433', amount: 24600, reason: 'INC-005177: 12 km adicionales del 10/10/2026, pagados con el viaje del 12/10/2026. Chat Matías 984422 y revisión histórica de atribución.' }] },
];
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await db.connect();
  try {
    await db.query('begin isolation level serializable');
    await db.query("set local lock_timeout='5s';set local statement_timeout='90s'");
    await db.query("select pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'))");
    const actor = (await db.query("select user_id from support_admins where user_id='381df0d1-183f-4ccb-aaf2-8147c76159a9' and active")).rows[0]?.user_id;
    assert(actor, 'Verified incident administrator required');
    const digest = async () => (await db.query("select count(*)::int n,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) hash from cash_transactions t")).rows[0];
    const before = await digest();
    const migration = fs.readFileSync('database/db_migration_v228_freight_confirmed_payment_links.sql', 'utf8').replace(/^begin;\s*/, '').replace(/commit;\s*$/, '');
    await db.query(migration);
    const result = [];
    for (const repair of repairs) {
      const payments = (await db.query('select * from cash_transactions where movement_code=$1 for update', [repair.pag])).rows;
      assert.equal(payments.length, 1);
      const tx = payments[0];
      assert.equal(Number(tx.amount), repair.amount);
      assert.equal(tx.type, 'egreso'); assert.equal(tx.currency, 'ARS');
      assert.equal(tx.reversal_of_transaction_id, null);
      assert.equal((await db.query('select 1 from cash_transactions where reversal_of_transaction_id=$1', [tx.id])).rowCount, 0);
      const previous = (await db.query('select dispatch_id,amount,reason from logistics_freight_payment_allocations where transaction_id=$1 order by dispatch_id', [tx.id])).rows;
      const target = (await db.query('select id from logistics_dispatches where code=$1', [repair.origin])).rows[0];
      assert(target);
      const existing = (await db.query('select l.*,d.code from logistics_dispatch_movements l join logistics_dispatches d on d.id=l.dispatch_id where l.transaction_id=$1 for update of l', [tx.id])).rows[0];
      assert(existing && [repair.oldCode,repair.origin].includes(existing.code), 'Unexpected current payment owner');
      // Never replace an independently edited allocation on a rerun.
      if (previous.length) {
        const actual = (await db.query('select d.code,a.amount,a.reason from logistics_freight_payment_allocations a join logistics_dispatches d on d.id=a.dispatch_id where a.transaction_id=$1 order by d.code', [tx.id])).rows.map(r=>({...r,amount:Number(r.amount)}));
        assert.deepEqual(actual, [...repair.parts].sort((a,b)=>a.code.localeCompare(b.code)));
      } else {
        await db.query('select allocate_logistics_freight_payment($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)', [actor,tx.id,JSON.stringify(tx),JSON.stringify(previous),JSON.stringify(repair.parts)]);
      }
      if (existing.dispatch_id !== target.id || existing.method !== 'incident_verified') {
        const updated = (await db.query("update logistics_dispatch_movements set dispatch_id=$2,settlement_id=null,method='incident_verified',purpose='freight_fee',linked_at=now() where transaction_id=$1 returning *", [tx.id,target.id])).rows[0];
        await db.query('insert into logistics_payment_link_events(transaction_id,actor_id,previous_link,new_link,source_evidence) values($1,$2,$3,$4,$5)', [tx.id,actor,JSON.stringify(existing),JSON.stringify(updated),JSON.stringify({ticket:'INC-005177',sourceMessage:repair.message,parts:repair.parts,notesPreserved:true})]);
      }
      result.push({payment:repair.pag,origin:repair.origin,parts:repair.parts});
    }
    const totals = (await db.query(`with effective as (
      select a.dispatch_id,a.transaction_id,a.amount from logistics_freight_payment_allocations a
      union all select l.dispatch_id,l.transaction_id,t.amount from logistics_dispatch_movements l join cash_transactions t on t.id=l.transaction_id
      where not exists(select 1 from logistics_freight_payment_allocations a where a.transaction_id=l.transaction_id)
    ) select d.code,sum(e.amount)::numeric paid from effective e join logistics_dispatches d on d.id=e.dispatch_id join cash_transactions t on t.id=e.transaction_id
      where d.code=any($1) and t.type='egreso' and t.currency='ARS' and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
      and (ltrim(lower(t.category))='servicio de flete' or ltrim(lower(t.sub_category))='servicio de flete') group by d.code order by d.code`, [['LOG_REC_05430','LOG_REC_05433','LOG_REC_05437','LOG_REC_05438','LOG_REC_05440']])).rows;
    for (const [code,expected] of Object.entries({LOG_REC_05430:348000,LOG_REC_05433:586050,LOG_REC_05437:250000,LOG_REC_05438:386300,LOG_REC_05440:241600})) assert.equal(Number(totals.find(r=>r.code===code)?.paid),expected,code);
    assert.deepEqual(await digest(),before,'Cash ledger must remain byte-for-byte unchanged');
    await db.query(apply ? 'commit' : 'rollback');
    const report = {recordedAt:new Date().toISOString(),applied:apply,cashUnchanged:true,result,totals};
    fs.mkdirSync('output/inc-005177',{recursive:true});
    fs.writeFileSync('output/inc-005177/'+(apply?'applied':'rehearsed')+'.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } catch (e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
