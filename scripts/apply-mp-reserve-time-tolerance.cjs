const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');process.loadEnvFile('.env.local');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();try{
 await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='60s';select pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0))");
 const before=(await db.query('select * from cash_transactions order by id')).rows;
 const definitions=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('mark_mp_bank_reserve_pairs','sync_mp_reserve_ledger')")).rows;
 assert.equal(definitions.length,2);
 await db.query(fs.readFileSync('database/db_migration_v268_mp_reserve_time_tolerance.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,''));
 const candidates=(await db.query("select c.*,r.mp_account_id,w.operation_id,extract(epoch from w.occurred_at-r.occurred_at)::int difference_seconds from mp_reserve_accounts cfg cross join lateral mp_reserve_transfer_candidates(cfg.mp_account_id) c join mp_reserve_web_rows r on r.id=c.reserve_row_id join mp_bank_web_rows w on w.id=c.bank_capture_id where cfg.enabled and cfg.reserve_id=r.reserve_id and not exists(select 1 from mp_reserve_ledger_links l where l.reserve_row_id=r.id)")).rows;
 const results=[];for(const mp of new Set(candidates.map(c=>c.mp_account_id)))results.push({mp,result:(await db.query('select sync_mp_reserve_ledger($1) result',[mp])).rows[0].result});
 const after=(await db.query('select * from cash_transactions order by id')).rows;assert.equal(after.length,before.length,'No new money movements');
 const changes=[];const allowed=new Set(['financial_account_id','financial_concept_id','concept','category','sub_category','efe_category','bank_review_status','bank_reviewed_at','bank_reviewed_by']);
 for(let i=0;i<before.length;i++){assert.equal(before[i].id,after[i].id);for(const key of Object.keys(before[i]))if(!allowed.has(key))assert.deepEqual(after[i][key],before[i][key],key+' must remain unchanged');if(JSON.stringify(before[i])!==JSON.stringify(after[i]))changes.push({before:before[i],after:after[i]});}
 for(const change of changes){const linked=(await db.query('select * from mp_reserve_ledger_links where cash_transaction_id=$1',[change.after.id])).rows;assert.equal(linked.length,1);}
 const target=after.find(t=>t.movement_code==='PAG-0000013928');assert.equal(target.financial_account_id,'20d20d4b-e33d-4320-b144-614bb3233ef4');
 assert.equal(after.find(t=>t.movement_code==='PAG-0000013927').financial_account_id,'60503fc5-7a3c-4ee7-a004-211c68895088');
 for(const mp of new Set(candidates.map(c=>c.mp_account_id)))assert.equal((await db.query('select sync_mp_reserve_ledger($1) result',[mp])).rows[0].result.allocated,0,'Repeated synchronization must not change anything');
 const apply=process.argv.includes('--apply');const report={applied:apply,candidates,results,changed:changes.map(c=>({code:c.after.movement_code,from:c.before.financial_account_id,to:c.after.financial_account_id})),createdMovements:0,moneyFieldsUnchanged:true,idempotent:true};
 if(apply){fs.mkdirSync('output/mp-reserve-time-tolerance',{recursive:true});fs.writeFileSync('output/mp-reserve-time-tolerance/before.json',JSON.stringify({definitions,changes},null,2));}
 await db.query(apply?'commit':'rollback');console.log(JSON.stringify(report));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
