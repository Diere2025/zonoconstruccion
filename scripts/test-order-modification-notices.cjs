// Transactional integration test. No Telegram calls; all rows and DDL roll back.
const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
const local=!process.argv[2] || process.argv[2]==='--local';
if(!local)process.loadEnvFile(process.argv[2]);
let db;
if(local){
 const {PGlite}=require('../.codex-tmp/modification-notice-test/node_modules/@electric-sql/pglite');
 const pg=new PGlite();
 db={connect:async()=>{
  await pg.exec(fs.readFileSync('tests/fixtures/order-modification-bootstrap.sql','utf8'));
  for(const file of ['db_migration_v106_support_tickets.sql','db_migration_v109_support_compact_workflow.sql','db_migration_v123_shipping_requests.sql','db_migration_v124_support_responsibility.sql'])await pg.exec(fs.readFileSync(`database/${file}`,'utf8'));
 },query:async(sql,args)=>args?pg.query(sql,args.map(value=>value && typeof value==='object'?JSON.stringify(value):value)):(await pg.exec(sql)).at(-1),end:()=>pg.close()};
}else db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:20000});
(async()=>{
 await db.connect();
 await db.query(fs.readFileSync('database/db_migration_v231_order_modification_notices.sql','utf8').replace(/commit;\s*$/i,''));
 const actor='381df0d1-183f-4ccb-aaf2-8147c76159a9';
 const order=(await db.query("insert into orders(seller_id,customer_name,locality,address,freight_type,initial_delivery_date,max_delivery_date,legacy_code) values($1,'TEST AVISOS MODIFICACIÓN','TEST','TEST','Regular',current_date,current_date,'TESTMOD1') returning id",[actor])).rows[0].id;
 async function history(code='TESTMOD1',modified={items:[],legacy_code:code,sync_monitor:true}){
  return (await db.query("insert into order_history(order_id,changed_by_id,changed_by_name,change_reason,original_data,modified_data) values($1,$2,'TEST','Modificación de pedido',$3,$4) returning id",[order,actor,{legacy_code:code,items:[]},modified])).rows[0].id;
 }
 const id=await history();
 assert.equal((await db.query('select count(*)::int n from order_modification_notices where id=$1',[id])).rows[0].n,1);
 await db.query('select start_order_modification_notice($1,$2,$3,$4,true)',[id,order,'TESTMOD1',{clientName:'TEST',sellerName:'TEST'}]);
 const results={seller:{success:true},central:{success:false,message:'sin acceso'},deliveriesCurrent:{success:true}};
 await db.query('select finish_order_modification_notice($1,$2,$3,$4)',[id,'TESTMOD1 / TESTMOD2',results,['Central: sin acceso']]);
 const claim=(await db.query('select * from claim_order_modification_notice($1)',[id])).rows[0];
 assert.deepEqual(claim.new_codes,['TESTMOD2']);assert.ok(claim.lease);
 assert.equal((await db.query('select * from claim_order_modification_notice($1)',[id])).rows.length,0);
 const first=(await db.query('select prepare_order_modification_ticket($1) result',[id])).rows[0].result;
 const second=(await db.query('select prepare_order_modification_ticket($1) result',[id])).rows[0].result;
 assert.ok(first.ticket_id);assert.equal(first.ticket_id,second.ticket_id);
 const ticket=(await db.query('select assignee_id,type,suggested_priority from support_tickets where id=$1',[first.ticket_id])).rows[0];
 assert.equal(ticket.assignee_id,actor);assert.equal(ticket.type,'error');assert.equal(ticket.suggested_priority,'high');
 await db.query('select complete_order_modification_notice($1,$2,false,$3)',[id,claim.lease,'Telegram unavailable']);
 assert.equal((await db.query('select * from claim_order_modification_notice($1)',[id])).rows.length,0);
 await db.query("update order_modification_notices set lease_until=now()-interval '1 second' where id=$1",[id]);
 const retry=(await db.query('select * from claim_order_modification_notice($1)',[id])).rows[0];
 assert.notEqual(retry.lease,claim.lease);assert.equal(retry.attempts,2);
 await db.query('savepoint stale_lease');
 await assert.rejects(db.query('select complete_order_modification_notice($1,$2,true,$3,99)',[id,claim.lease,'']),/propietario/);
 await db.query('rollback to savepoint stale_lease');
 assert.equal((await db.query('select prepare_order_modification_ticket($1) result',[id])).rows[0].result.ticket_id,first.ticket_id);
 await db.query('select complete_order_modification_notice($1,$2,true,$3,99)',[id,retry.lease,'']);
 assert.equal((await db.query('select * from claim_order_modification_notice($1)',[id])).rows.length,0);
 const regular=await history();
 await db.query('select finish_order_modification_notice($1,$2,$3,$4)',[regular,'TESTMOD1',results,[]]);
 assert.equal((await db.query('select * from claim_order_modification_notice($1)',[regular])).rows.length,0);
 assert.equal((await db.query('select prepare_order_modification_ticket($1) result',[regular])).rows[0].result.ticket_id,null);
 const stale=await history();
 await db.query("update order_modification_notices set created_at=now()-interval '6 minutes' where id=$1",[stale]);
 await db.query("update orders set legacy_code='TESTMOD1 / TESTMOD3' where id=$1",[order]);
 const recovered=(await db.query('select * from claim_order_modification_notice($1)',[stale])).rows[0];
 assert.deepEqual(recovered.new_codes,['TESTMOD3']);assert.match(recovered.failures[0],/no confirmó/);
 assert.ok((await db.query('select prepare_order_modification_ticket($1) result',[stale])).rows[0].result.ticket_id);
 const cancel=await history('TESTMOD1',{status:'Cancelado'});
 assert.equal((await db.query('select count(*)::int n from order_modification_notices where id=$1',[cancel])).rows[0].n,0);
 for(const fn of ['start_order_modification_notice(uuid,uuid,text,jsonb,boolean)','claim_order_modification_notice(uuid)','prepare_order_modification_ticket(uuid)']){
  const access=(await db.query("select has_function_privilege('authenticated',$1,'execute') a,has_function_privilege('anon',$1,'execute') b,has_function_privilege('service_role',$1,'execute') c",[`public.${fn}`])).rows[0];
  assert.deepEqual(access,{a:false,b:false,c:true});
 }
 console.log('PASS: capture, continuation, atomic ticket assigned to Diego, duplicate prevention, leases, backoff, stale recovery and RPC permissions. All changes rolled back.');
})().catch(error=>{console.error('Integration test failed:',error.message);process.exitCode=1;}).finally(async()=>{await db.query('rollback').catch(()=>{});await db.end();});
