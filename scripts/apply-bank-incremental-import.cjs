// Default: exercise the migration and roll back every test row and schema change.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const sql=fs.readFileSync('database/db_migration_v133_bank_incremental_import.sql','utf8').replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
const key=()=>`bank-sheet:${createHash('sha256').update(randomUUID()).digest('hex')}`;
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'bank_incremental_import_check'});await db.connect();
  try{
    await db.query('begin');await db.query("set local lock_timeout='5s'");await db.query(sql);
    if(process.argv.includes('--apply')){await db.query("notify pgrst,'reload schema'");await db.query('commit');console.log(JSON.stringify({migration:'v133',status:'applied'}));return;}
    const actor=(await db.query('select created_by from payment_planning_import_batches order by created_at desc limit 1')).rows[0].created_by;
    const bank=(await db.query("select id from financial_accounts where name='Cuenta MP3' and is_active limit 1")).rows[0].id;
    const cash=(await db.query("select id from financial_accounts where name='Caja Efectivo Pesos' and is_active limit 1")).rows[0].id;
    const before=(await db.query('select count(*)::int n from cash_transactions')).rows[0].n;
    const row={key:key(),accountId:bank,date:'2026-09-30',type:'egreso',amount:0.17,concept:'Prueba reversible bancaria',category:'Otro',businessUnit:'ZONO'};
    const call=async(rows,user=actor)=>(await db.query('select import_bank_movements($1,$2::jsonb) result',[user,JSON.stringify(rows)])).rows[0].result;
    const reject=async(rows,user)=>{await db.query('savepoint invalid');let failed=false;try{await call(rows,user);}catch{failed=true;await db.query('rollback to savepoint invalid');}assert.ok(failed);await db.query('release savepoint invalid');};
    // Use a small unique amount absent from this bank/day in the existing ledger.
    while((await db.query("select 1 from cash_transactions where financial_account_id=$1 and amount=$2 and type='egreso' and (created_at at time zone 'America/Argentina/Buenos_Aires')::date=date '2026-09-30' limit 1",[bank,row.amount])).rowCount)row.amount=Math.round((row.amount+0.01)*100)/100;
    assert.deepEqual(await call([row]),{inserted:1,skipped:0});
    assert.deepEqual(await call([row]),{inserted:0,skipped:1});
    assert.deepEqual(await call([{...row,key:key(),concept:'Mismo pago con detalle diferente'}]),{inserted:0,skipped:1});
    const existingId=(await db.query('select id from cash_transactions where bank_import_key=$1',[row.key])).rows[0].id;
    await db.query('update cash_transactions set is_imported=false,bank_import_key=null where id=$1',[existingId]);
    assert.deepEqual(await call([{...row,key:key()}]),{inserted:0,skipped:1});
    await reject([{...row,key:key(),accountId:cash}]);
    await reject([{...row,key:key(),date:'2026-09-29'}, {...row,key:key(),accountId:cash}]);
    await reject([{...row,key:key(),date:'2026-09-29'}],randomUUID());
    assert.equal((await db.query('select count(*)::int n from cash_transactions')).rows[0].n,before+1);
    assert.ok((await db.query('select 1 from cash_transactions where id=$1',[existingId])).rowCount);
    await db.query('rollback');console.log(JSON.stringify({status:'verified_and_rolled_back',incremental:true,retry_no_duplicates:true,manual_match_held:true,cash_rejected:true,atomic:true}));
  }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(`${error.code||'ERROR'}: ${error.message}`);process.exitCode=1;});
