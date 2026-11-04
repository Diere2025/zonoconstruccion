// All price changes, event rows, and migration DDL roll back. No external calls.
const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
process.loadEnvFile('.env.local');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();try{
 await db.query('begin');
 const migration=fs.readFileSync('database/price_change_sync.sql','utf8').replace(/^begin;$/mi,'').replace(/^commit;$/mi,'');await db.query(migration);
 const id='ef79dcaa-75ef-4a21-aa56-b8f054ec1064';
 const original=(await db.query('select price from products where id=$1 for update',[id])).rows[0];assert.ok(original);
 await db.query("update price_change_sync_settings set enabled=true,chat_id='-1003721150179',control_hash=md5('test-token'),lease_until=null where id");
 const before=Number((await db.query('select count(*) from price_change_events')).rows[0].count);
 await db.query('update products set price=price where id=$1',[id]);assert.equal(Number((await db.query('select count(*) from price_change_events')).rows[0].count),before);
 await db.query('update products set price=price+1 where id=$1',[id]);
 const event=(await db.query('select * from price_change_events where product_id=$1 order by event_no desc limit 1',[id])).rows[0];
 assert.equal(Number(event.old_price),Number(original.price));assert.equal(Number(event.new_price),Number(original.price)+1);
 const expected=(await db.query("select (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date::text as current_day")).rows[0].current_day;
 assert.equal(event.effective_date.toISOString().slice(0,10),expected);
 await db.query('savepoint bad_token');await assert.rejects(()=>db.query("select * from claim_price_change('invalid')"));await db.query('rollback to savepoint bad_token');
 // Isolate test claims from any existing pending operational events.
 await db.query("update price_change_events set sheet_state='sent',telegram_state='sent' where id<>$1",[event.id]);
 const claim=(await db.query("select * from claim_price_change('test-token')")).rows[0];assert.equal(claim.id,event.id);
 assert.equal((await db.query("select * from claim_price_change('test-token')")).rowCount,0);
 await db.query("select update_price_change('test-token',$1,$2,'{\"sheet_state\":\"sent\",\"telegram_state\":\"sending\"}',false)",[event.id,claim.claim_token]);
 await db.query("update price_change_sync_settings set lease_until=now()-interval '1 second' where id");
 await db.query("select * from claim_price_change('test-token')");
 assert.equal((await db.query('select telegram_state from price_change_events where id=$1',[event.id])).rows[0].telegram_state,'unknown');
 await db.query('rollback');console.log('PASS: trigger, unchanged prices, Argentina calendar date, token authorization, exclusive lease, ambiguous Telegram recovery; all rolled back.');
 }catch(e){await db.query('rollback');throw e}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
