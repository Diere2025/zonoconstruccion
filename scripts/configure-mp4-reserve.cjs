const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const reserveId='7b241292-a4d8-46ca-9fa2-9ea6b61427fa',mp='pagoszono_26',apply=process.argv.includes('--apply');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{
 await db.query('begin');await db.query("set local lock_timeout='15s';set local statement_timeout='45s';select pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0))");
 const before=(await db.query('select * from cash_transactions order by id')).rows;
 const main=(await db.query('select financial_account_id id from bank_statement_mp_accounts where mp_account_id=$1',[mp])).rows;
 assert.equal(main.length,1);
 const actor=(await db.query("select actor_id from mp_reserve_accounts where mp_account_id='diegozono_mp' and enabled")).rows[0]?.actor_id;assert.ok(actor);
 assert.equal((await db.query('select can_manage_financial_operations($1) ok',[actor])).rows[0].ok,true);
 let account=(await db.query("select * from financial_accounts where name='MP4 Reserva Diego'")).rows;assert.ok(account.length<=1);
 if(!account.length)account=(await db.query("insert into financial_accounts(name,type,currency,is_active,is_custody) values('MP4 Reserva Diego','virtual','ARS',true,false) returning *")).rows;
 assert.equal(account[0].currency,'ARS');assert.equal(account[0].is_active,true);
 await db.query("insert into mp_reserve_accounts(mp_account_id,reserve_id,main_account_id,reserve_account_id,actor_id,history_from) values($1,$2,$3,$4,$5,'2026-10-22') on conflict(mp_account_id,reserve_id) do nothing",[mp,reserveId,main[0].id,account[0].id,actor]);
 const cfg=(await db.query('select * from mp_reserve_accounts where mp_account_id=$1 and reserve_id=$2',[mp,reserveId])).rows[0];assert.equal(cfg.main_account_id,main[0].id);assert.equal(cfg.reserve_account_id,account[0].id);assert.equal(cfg.enabled,true);
 const sql=fs.readFileSync('database/db_migration_v222_mp4_reserve.sql','utf8').replace(/^\s*begin;\s*$/im,'').replace(/^\s*commit;\s*$/im,'');await db.query(sql);
 // The user's screenshot confirms the initial reserve transfer; the bank evidence
 // must independently contain both linked sides at this exact instant and amount.
 const pair=(await db.query("select w.amount::text,w.id,l.cash_transaction_id,t.type,t.financial_account_id from mp_bank_web_rows w join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) join cash_transactions t on t.id=l.cash_transaction_id where w.mp_account_id=$1 and w.operation_id='184501044625' and w.operation_kind='reserve_transfer' and w.occurred_at='2026-10-22T12:31:00-03:00' and abs(w.amount)=447200",[mp])).rows;
 assert.equal(pair.length,2);const positive=pair.find(r=>r.amount==='447200.00'),negative=pair.find(r=>r.amount==='-447200.00');assert.ok(positive&&negative);assert.equal(negative.financial_account_id,main[0].id);
 const payload=[{occurredAt:'2026-10-22T12:31:00-03:00',amount:'447200.00',kind:'deposit',description:'Dinero reservado',occurrence:1}];
 const capture=async()=> (await db.query('select capture_mp_reserve_web($1,$2,$3::jsonb) result',[mp,reserveId,JSON.stringify(payload)])).rows[0].result;
 await capture();await capture();
 await db.query('select capture_mp_reserve_web($1,$2,$3::jsonb)',[mp,reserveId,JSON.stringify([{...payload[0],description:'Dinero ingresado'}])]);
 assert.equal((await db.query('select count(*)::int n from mp_reserve_web_rows where mp_account_id=$1 and reserve_id=$2',[mp,reserveId])).rows[0].n,1);
 const links=(await db.query('select l.* from mp_reserve_ledger_links l join mp_reserve_web_rows r on r.id=l.reserve_row_id where r.mp_account_id=$1 and r.reserve_id=$2',[mp,reserveId])).rows;
 assert.equal(links.length,1);assert.equal(links[0].cash_transaction_id,positive.cash_transaction_id);assert.equal(links[0].counterpart_transaction_id,negative.cash_transaction_id);
 const after=(await db.query('select * from cash_transactions order by id')).rows;assert.equal(after.length,before.length);
 const beforeMap=new Map(before.map(r=>[r.id,r]));for(const row of after){const old=beforeMap.get(row.id);if(row.id===positive.cash_transaction_id){assert.equal(row.financial_account_id,account[0].id);for(const key of ['id','movement_code','amount','type','currency','created_at','operation_id','bank_import_key'])assert.deepEqual(row[key],old[key]);}else assert.deepEqual(row,old,'Unrelated movement changed');}
 const balance=after.filter(r=>r.financial_account_id===account[0].id).reduce((n,r)=>n+(r.type==='ingreso'?1:-1)*Math.round(Number(r.amount)*100),0);assert.equal(balance,44720000);
 await db.query('savepoint invalid_pair');await assert.rejects(()=>db.query('select capture_mp_reserve_web($1,$2,$3::jsonb)',['diegozono_mp',reserveId,'[]']),/Reserva no configurada/);await db.query('rollback to savepoint invalid_pair');
 const report={accountId:account[0].id,name:account[0].name,reserveId,mpAccountId:mp,balance:balance/100,initialTransfer:positive.cash_transaction_id,counterpart:negative.cash_transaction_id,createdMovements:0,totalMoneyUnchanged:true,repeatedCaptureDoesNotDuplicate:true};
 if(positive.financial_account_id!==account[0].id)await db.query("insert into bank_statement_events(action,after_value,actor_id) values('reserve.configure',$1::jsonb,$2)",[JSON.stringify({...report,initialEvidence:'User screenshot and unique bank transfer 184501044625, 22/10/2026 12:31'}),actor]);
 await db.query(apply?'commit':'rollback');fs.mkdirSync('output/mp4-reserve',{recursive:true});fs.writeFileSync('output/mp4-reserve/'+(apply?'applied':'preview')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,committed:apply}));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
