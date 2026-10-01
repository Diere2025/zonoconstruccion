const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const sql=fs.readFileSync('database/db_migration_v134_payment_planning_reconciliation_difference.sql','utf8').replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'planning_difference_check'});await db.connect();
  try{
    await db.query('begin');await db.query("set local lock_timeout='5s'");await db.query(sql);
    if(process.argv.includes('--apply')){await db.query("notify pgrst,'reload schema'");await db.query('commit');console.log(JSON.stringify({migration:'v134',status:'applied'}));return;}
    const actor=(await db.query('select created_by from payment_planning_import_batches order by created_at desc limit 1')).rows[0].created_by;
    const fund=(await db.query("select id from payment_planning_funds where kind='cash' and currency='ARS' and active limit 1")).rows[0].id;
    const account=(await db.query("select id from financial_accounts where name='Caja Efectivo Pesos' limit 1")).rows[0].id;
    const method=(await db.query("select id from payment_methods where name='Efectivo' limit 1")).rows[0].id;
    const mutate=async(action,payload)=>(await db.query('select payment_planning_mutate($1,$2,$3,$4::jsonb) result',[actor,randomUUID(),action,JSON.stringify(payload)])).rows[0].result;
    const reconcile=async(payload,key=randomUUID())=>(await db.query('select payment_planning_reconcile($1,$2,$3::jsonb) result',[actor,key,JSON.stringify(payload)])).rows[0].result;
    const reject=async(payload)=>{await db.query('savepoint invalid');let failed=false;try{await reconcile(payload);}catch{failed=true;await db.query('rollback to savepoint invalid');}assert.ok(failed);await db.query('release savepoint invalid');};
    for(const [planned,paid] of [[281039,281100],[210971,211000]]){
      const item=await mutate('create_item',{fund_id:fund,kind:'expense',title:'Prueba reversible diferencia',amount:planned,scheduled_date:'2026-09-26'});
      await mutate('realize',{item_id:item.id,fund_id:fund,amount:planned,effective_date:'2026-09-26'});
      const transaction=(await db.query(`insert into cash_transactions(type,category,business_unit,amount,currency,financial_account_id,payment_method_id,concept,created_by,created_at)
        values('egreso','Sueldos','ZONO',$1,'ARS',$2,$3,'Prueba reversible diferencia',$4,timestamptz '2026-09-26T12:00:00-03:00') returning id`,[paid,account,method,actor])).rows[0].id;
      const payload={mode:'existing',item_id:item.id,transaction_ids:[transaction]};
      await reject(payload);
      await reject({...payload,adjust_amount:true,expected_amount:planned+1});
      const key=randomUUID(),confirmed={...payload,adjust_amount:true,expected_amount:planned};
      assert.deepEqual(await reconcile(confirmed,key),await reconcile(confirmed,key));
      const result=(await db.query(`select i.amount,coalesce(sum(r.amount) filter(where r.reversed_at is null),0) realized,
        coalesce(sum(r.amount) filter(where r.reversed_at is null and r.cash_transaction_id is not null),0) linked
        from payment_planning_items i left join payment_planning_realizations r on r.item_id=i.id where i.id=$1 group by i.id`,[item.id])).rows[0];
      assert.deepEqual(Object.values(result).map(Number),[paid,paid,paid]);
      assert.equal((await db.query("select count(*)::int n from payment_planning_events where entity_id=$1 and action='adjust_reconciliation_amount'",[item.id])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from cash_transactions where id=$1',[transaction])).rows[0].n,1);
    }
    await db.query('rollback');console.log(JSON.stringify({status:'verified_and_rolled_back',differences:[61,29],explicit_confirmation:true,stale_amount_rejected:true,idempotent:true,counted_once:true}));
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(`${error.code||'ERROR'}: ${error.message}`);process.exitCode=1;});
