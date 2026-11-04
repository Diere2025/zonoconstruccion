// pg_net starts only after commit; this entire integration check rolls back.
const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
process.loadEnvFile('.env.local');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();try{
 await db.query('begin');await db.query(fs.readFileSync('database/price_change_webhook.sql','utf8').replace(/^begin;$/mi,'').replace(/^commit;$/mi,''));
 await db.query("select set_config('price_sync.wake_requested','false',true)");
 const secret=(await db.query("select vault.create_secret('test-webhook-token') id")).rows[0].id;
 await db.query("update price_change_sync_settings set enabled=true,control_hash=md5('test-webhook-token'),dispatch_secret_id=$1,dispatch_url='https://zono-price-sync.diego-boveda.workers.dev/wake',lease_until=null where id",[secret]);
 const count=async()=>Number((await db.query("select count(*) from net.http_request_queue where url='https://zono-price-sync.diego-boveda.workers.dev/wake'")).rows[0].count);
 const before=await count(),id='ef79dcaa-75ef-4a21-aa56-b8f054ec1064';
 await db.query('savepoint rolled_back_price');await db.query('update products set price=price+1 where id=$1',[id]);assert.equal(await count(),before+1);await db.query('rollback to savepoint rolled_back_price');assert.equal(await count(),before);
 await db.query('update products set price=price where id=$1',[id]);assert.equal(await count(),before);
 await db.query('update products set price=price+1 where id=$1',[id]);await db.query('update products set price=price+1 where id=$1',[id]);assert.equal(await count(),before+1,'Bulk transaction must send one wakeup');
 const req=(await db.query("select method,headers,body from net.http_request_queue where url='https://zono-price-sync.diego-boveda.workers.dev/wake' order by id desc limit 1")).rows[0];assert.equal(req.method,'POST');assert.equal(req.headers.Authorization,'Bearer test-webhook-token');assert.equal(JSON.parse(req.body.toString()).kind,'price-change');
 await db.query("update price_change_events set sheet_state='sent',telegram_state='sent'");assert.equal((await db.query("select next_price_change_wake('test-webhook-token') delay")).rows[0].delay,null);
 await db.query('savepoint wrong_token');await assert.rejects(()=>db.query("select next_price_change_wake('wrong')"));await db.query('rollback to savepoint wrong_token');
 await db.query('rollback');console.log('PASS: committed-event webhook, rollback cancellation, unchanged-price silence, one webhook per bulk transaction, Vault authentication, empty-queue silence; all rolled back.');
 }catch(e){await db.query('rollback');throw e}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
