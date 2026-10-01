// Default: test the lower final amount inside a transaction that is rolled back.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const sql=fs.readFileSync('database/db_migration_v135_payment_planning_lower_actual.sql','utf8').replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'planning_lower_actual_check'});await db.connect();
  try{
    await db.query('begin');await db.query("set local lock_timeout='5s'");await db.query(sql);
    if(process.argv.includes('--apply')){await db.query("notify pgrst,'reload schema'");await db.query('commit');console.log(JSON.stringify({migration:'v135',status:'applied'}));return;}
    const actor=(await db.query('select created_by from payment_planning_import_batches order by created_at desc limit 1')).rows[0].created_by;
    const fund=(await db.query("select id from payment_planning_funds where kind='personal' and currency='ARS' and active limit 1")).rows[0].id;
    const boxes=(await db.query("select id from financial_accounts where name in ('Cuenta MP3','Cuenta MP4') order by name")).rows;
    const method=(await db.query("select id from payment_methods where name='Transferencia' limit 1")).rows[0].id;
    const mutate=async(action,payload)=>(await db.query('select payment_planning_mutate($1,$2,$3,$4::jsonb) result',[actor,randomUUID(),action,JSON.stringify(payload)])).rows[0].result;
    const reconcile=async(payload,key=randomUUID())=>(await db.query('select payment_planning_reconcile($1,$2,$3::jsonb) result',[actor,key,JSON.stringify(payload)])).rows[0].result;
    const reject=async(payload)=>{await db.query('savepoint invalid');let failed=false;try{await reconcile(payload);}catch{failed=true;await db.query('rollback to savepoint invalid');}assert.ok(failed);await db.query('release savepoint invalid');};
    for(const manual of [true,false]){
      const item=await mutate('create_item',{fund_id:fund,kind:'expense',title:'Prueba reversible menor gasto',amount:1300000,scheduled_date:'2026-09-25'});
      if(manual)await mutate('realize',{item_id:item.id,fund_id:fund,amount:1300000,effective_date:'2026-09-25'});
      const ids=[];
      for(const [index,paid] of [140000,1100000].entries())ids.push((await db.query(`insert into cash_transactions(type,category,business_unit,amount,currency,financial_account_id,payment_method_id,concept,created_by,created_at)
        values('egreso','Publicidad','ZONO',$1,'ARS',$2,$3,'Prueba reversible menor gasto',$4,timestamptz '2026-09-25T12:00:00-03:00') returning id`,[paid,boxes[index].id,method,actor])).rows[0].id);
      await reconcile({mode:'existing',item_id:item.id,transaction_ids:ids});
      const version=(await db.query('select version from payment_planning_items where id=$1',[item.id])).rows[0].version;
      const before=(await db.query('select to_jsonb(t) row from cash_transactions t where id=any($1::uuid[]) order by id',[ids])).rows;
      await reject({mode:'finalize_lower',item_id:item.id,version:version-1});
      const key=randomUUID(),payload={mode:'finalize_lower',item_id:item.id,version};
      assert.deepEqual(await reconcile(payload,key),await reconcile(payload,key));
      const final=(await db.query(`select i.amount,i.closed_amount,coalesce(sum(r.amount) filter(where r.reversed_at is null),0) realized,
        coalesce(sum(r.amount) filter(where r.reversed_at is null and r.cash_transaction_id is null),0) unlinked
        from payment_planning_items i left join payment_planning_realizations r on r.item_id=i.id where i.id=$1 group by i.id`,[item.id])).rows[0];
      assert.deepEqual(Object.values(final).map(Number),[1240000,0,1240000,0]);
      assert.deepEqual((await db.query('select to_jsonb(t) row from cash_transactions t where id=any($1::uuid[]) order by id',[ids])).rows,before);
      assert.equal((await db.query("select count(*)::int n from payment_planning_events where entity_id=$1 and action='finalize_reconciliation_lower'",[item.id])).rows[0].n,1);
      await reject({mode:'finalize_lower',item_id:item.id,version:(await db.query('select version from payment_planning_items where id=$1',[item.id])).rows[0].version});
    }
    await db.query('rollback');console.log(JSON.stringify({status:'verified_and_rolled_back',planned:1300000,actual:1240000,manual_remainder_reversed:60000,ledger_unchanged:true,idempotent:true,stale_version_rejected:true,partial_and_manual:true}));
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(`${error.code||'ERROR'}: ${error.message}`);process.exitCode=1;});
