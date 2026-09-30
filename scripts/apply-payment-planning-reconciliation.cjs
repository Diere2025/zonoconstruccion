// Rehearse by default; --apply installs the source/ledger linkage in v116.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v116_payment_planning_reconciliation.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:apply?'payment_planning_reconciliation_apply':'payment_planning_reconciliation_rehearsal'});
  await db.connect();
  try{
    const installed=(await db.query("select to_regclass('public.payment_planning_source_rows') is not null as installed")).rows[0].installed;
    if(installed){console.log(JSON.stringify({migration:'v116',status:'already_installed'}));return;}
    await db.query('begin');
    try{
      await db.query("set local lock_timeout='5s'");
      await db.query("set local statement_timeout='120s'");
      await db.query(sql);
      const check=(await db.query("select to_regclass('public.payment_planning_source_rows') is not null as source_rows,exists(select 1 from information_schema.columns where table_schema='public' and table_name='payment_planning_realizations' and column_name='cash_transaction_id') as ledger_link")).rows[0];
      if(!check.source_rows||!check.ledger_link)throw new Error('v116 incompleta');
      if(apply){await db.query("notify pgrst,'reload schema'");await db.query('commit');console.log(JSON.stringify({migration:'v116',status:'applied'}));}
      else{await db.query('rollback');console.log(JSON.stringify({migration:'v116',status:'rehearsed',changes:'rolled_back'}));}
    }catch(error){await db.query('rollback');throw error;}
  }finally{await db.end();}
})().catch(error=>{console.error(`Migración v116: ${error.code||error.message}`);process.exitCode=1});
