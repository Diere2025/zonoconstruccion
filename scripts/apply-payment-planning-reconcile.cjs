// Default exercises the migration inside a transaction, then rolls everything back.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {Client} = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v132_payment_planning_reconcile.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async()=>{
  const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'payment_planning_reconcile_check'});
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    await db.query(sql);
    if (apply) {
      await db.query("notify pgrst,'reload schema'");
      await db.query('commit');
      console.log(JSON.stringify({migration:'v132',status:'applied'}));
      return;
    }
    const actor = (await db.query('select created_by from payment_planning_import_batches order by created_at desc limit 1')).rows[0].created_by;
    const fund = (await db.query("select id from payment_planning_funds where kind='cash' and currency='ARS' and active limit 1")).rows[0].id;
    const account = (await db.query("select id from financial_accounts where name='Caja Efectivo Pesos' and is_active limit 1")).rows[0].id;
    const mp3 = (await db.query("select id from financial_accounts where name='Cuenta MP3' and is_active limit 1")).rows[0].id;
    const concept = (await db.query("select * from financial_concepts where movement_type='Egreso' and is_active order by id limit 1")).rows[0];
    const method = (await db.query("select id from payment_methods where name='Efectivo' order by id limit 1")).rows[0].id;
    const mutate = async(action,payload)=>(await db.query('select payment_planning_mutate($1,$2,$3,$4::jsonb) result',[actor,randomUUID(),action,JSON.stringify(payload)])).rows[0].result;
    const reconcile = async(payload,key=randomUUID())=>(await db.query('select payment_planning_reconcile($1,$2,$3::jsonb) result',[actor,key,JSON.stringify(payload)])).rows[0].result;
    const item = async()=> (await mutate('create_item',{fund_id:fund,kind:'expense',title:'Prueba reversible publicidad',amount:1350000,scheduled_date:'2026-09-30'})).id;
    const movement = async(amount,box=account,date='2026-09-30',type='egreso')=>(await db.query(`insert into cash_transactions(type,category,financial_concept_id,business_unit,amount,currency,payment_method_id,financial_account_id,concept,created_by,created_at)
      values($1,$2,$3,'ZONO',$4,'ARS',$5,$6,'Prueba reversible conciliación',$7,($8::date + time '12:00') at time zone 'America/Argentina/Buenos_Aires') returning id`,[type,concept.category,concept.id,amount,method,box,actor,date])).rows[0].id;
    const totals = async(id)=>(await db.query(`select coalesce(sum(amount),0)::numeric as realized,
      coalesce(sum(amount) filter(where cash_transaction_id is not null),0)::numeric as linked,
      coalesce(sum(amount) filter(where cash_transaction_id is null),0)::numeric as unlinked
      from payment_planning_realizations where item_id=$1 and reversed_at is null`,[id])).rows[0];
    const check = async(id,realized,linked,unlinked)=>assert.deepEqual(Object.values(await totals(id)).map(Number),[realized,linked,unlinked]);
    const reject = async(payload)=>{
      await db.query('savepoint rejected'); let failed=false;
      try {await reconcile(payload);} catch {failed=true;await db.query('rollback to savepoint rejected');}
      assert.ok(failed,'Se aceptó una conciliación inválida');
      await db.query('release savepoint rejected');
    };
    const firstItem=await item();
    await mutate('realize',{item_id:firstItem,fund_id:fund,amount:1350000,effective_date:'2026-09-30'});
    const first=await movement(675000),second=await movement(675000,mp3,'2026-09-29');
    const key=randomUUID(),payload={mode:'existing',item_id:firstItem,transaction_ids:[first]};
    assert.deepEqual(await reconcile(payload,key),await reconcile(payload,key));
    await check(firstItem,1350000,675000,675000);
    await reconcile({mode:'existing',item_id:firstItem,transaction_ids:[second]});
    await check(firstItem,1350000,1350000,0);
    const mapped=(await db.query(`select r.effective_date::text,f.kind from payment_planning_realizations r join payment_planning_funds f on f.id=r.fund_id where r.cash_transaction_id=$1`,[second])).rows[0];
    assert.deepEqual(mapped,{effective_date:'2026-09-29',kind:'personal'});
    const other=await item();
    await reject({mode:'existing',item_id:other,transaction_ids:[first]});
    const linkedId=(await db.query('select id from payment_planning_realizations where cash_transaction_id=$1',[first])).rows[0].id;
    const ledgerBefore=(await db.query('select count(*)::int n from cash_transactions')).rows[0].n;
    await reconcile({mode:'unlink',item_id:firstItem,realization_id:linkedId});
    await check(firstItem,1350000,675000,675000);
    assert.equal((await db.query('select count(*)::int n from cash_transactions')).rows[0].n,ledgerBefore);
    const posted=await reconcile({mode:'create',item_id:firstItem,amount:675000,effective_date:'2026-09-30',financial_account_id:account,financial_concept_id:concept.id,movement_detail:'Prueba reversible crear faltante'});
    assert.ok(posted[0].cash_transaction_id);
    await check(firstItem,1350000,1350000,0);
    assert.equal((await db.query('select count(*)::int n from cash_transactions')).rows[0].n,ledgerBefore+1);
    await reconcile({mode:'existing',item_id:other,transaction_ids:[first]});
    await check(other,675000,675000,0);
    const a=await movement(400000),b=await movement(400000);
    await reject({mode:'existing',item_id:other,transaction_ids:[a,b]});
    await check(other,675000,675000,0);
    assert.equal((await db.query('select count(*)::int n from payment_planning_realizations where cash_transaction_id=any($1::uuid[])',[[a,b]])).rows[0].n,0);
    const wrong=await movement(100,account,'2026-09-30','ingreso');
    await reject({mode:'existing',item_id:other,transaction_ids:[wrong]});
    await reject({mode:'create',item_id:other,amount:100,effective_date:'2026-09-30',financial_account_id:randomUUID(),financial_concept_id:concept.id,movement_detail:'Prueba inválida'});
    await check(other,675000,675000,0);
    const reserved=await item();
    await mutate('reservation',{fund_id:fund,kind:'reserve',amount:1350000,effective_date:'2026-09-29',target_item_id:reserved});
    await mutate('realize',{item_id:reserved,fund_id:fund,amount:1350000,effective_date:'2026-09-30'});
    const r1=await movement(675000),r2=await movement(675000);
    await reconcile({mode:'existing',item_id:reserved,transaction_ids:[r1,r2]});
    await check(reserved,1350000,1350000,0);
    assert.equal(Number((await db.query("select sum(amount) as n from payment_planning_reservations where target_item_id=$1 and kind='consume' and reversed_at is null",[reserved])).rows[0].n),1350000);
    const privileges=(await db.query("select has_function_privilege('service_role','payment_planning_reconcile(uuid,uuid,jsonb)','execute') allowed,has_function_privilege('authenticated','payment_planning_reconcile(uuid,uuid,jsonb)','execute') denied")).rows[0];
    assert.deepEqual(privileges,{allowed:true,denied:false});
    await db.query('rollback');
    console.log(JSON.stringify({status:'verified_and_rolled_back',split:[675000,675000],total:1350000,idempotent:true,atomic:true,unlink_preserves_movement:true,reserve_preserved:true,actual_date_and_account:true}));
  } catch(error){await db.query('rollback');throw error;}
  finally {await db.end();}
})().catch(error=>{console.error(`${error.code || 'ERROR'}: ${error.message}`);process.exitCode=1;});
