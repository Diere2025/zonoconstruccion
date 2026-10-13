const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000,query_timeout:30000});await db.connect();
 try{
 await db.query('begin');await db.query("set local lock_timeout='5s'; set local statement_timeout='30s'");
 const id='ba5d29c3-b15f-4702-a4d1-def2f57e7798';
 const before=(await db.query('select * from orders where id=$1 for update',[id])).rows[0];assert.equal(before.legacy_code,'JS26123 / JS26124');
 const itemsBefore=(await db.query('select * from order_items where order_id=$1 order by id',[id])).rows;
 const jobsBefore=(await db.query('select * from order_sync_jobs where order_id=$1 order by id',[id])).rows;
 const sql=fs.readFileSync('database/db_migration_v203_installation_order_category.sql','utf8');await db.query(sql);await db.query(sql);
 const after=(await db.query('select * from orders where id=$1',[id])).rows[0];assert.equal(after.category,'INSTALACIÓN BIOFORT');
 assert.deepEqual({...after,category:before.category},before,'Only category changes');
 assert.deepEqual((await db.query('select * from order_items where order_id=$1 order by id',[id])).rows,itemsBefore);
 assert.deepEqual((await db.query('select * from order_sync_jobs where order_id=$1 order by id',[id])).rows,jobsBefore);
 await db.query('savepoint fixtures');const fixture=randomUUID();
 await db.query(`insert into orders(id,customer_name,status,category,seller_id,channel,totals,initial_delivery_date,max_delivery_date,locality,address,freight_type)
 select $1,'Ensayo temporal instalación','Pendiente','OTRO',seller_id,channel,'{}'::jsonb,initial_delivery_date,max_delivery_date,locality,address,freight_type from orders where id=$2`,[fixture,id]);
 await db.query('insert into order_items(order_id,product_id,product_name,quantity,unit_price) select $1,product_id,product_name,quantity,unit_price from order_items where order_id=$2',[fixture,id]);
 const category=async()=>(await db.query('select category from orders where id=$1',[fixture])).rows[0].category;
 assert.equal(await category(),'INSTALACIÓN BIOFORT');
 await db.query("update orders set category='BIODIGESTOR' where id=$1",[fixture]);assert.equal(await category(),'INSTALACIÓN BIOFORT');
 await db.query("update order_items set unit_price=300000 where order_id=$1 and product_name='BioFort - Biodigestor 600L'",[fixture]);assert.equal(await category(),'BIODIGESTOR');
 await db.query("update order_items set unit_price=0 where order_id=$1 and product_name='BioFort - Biodigestor 600L'",[fixture]);assert.equal(await category(),'INSTALACIÓN BIOFORT');
 assert.equal((await db.query('select count(*)::int n from order_sync_jobs where order_id=$1',[fixture])).rows[0].n,0);
 await db.query('rollback to savepoint fixtures');
 if(apply)fs.writeFileSync('tmp/js26123-installation-before.json',JSON.stringify({order:before,items:itemsBefore},null,2));
 await db.query(apply?'commit':'rollback');
 console.log(JSON.stringify({mode:apply?'applied':'validated and rolled back',order:before.legacy_code,before:before.category,after:after.category,itemsUnchanged:itemsBefore.length,onlyCategoryChanged:true,checks:'idempotence, actual kit load, stale category override, paid biodigestor, price changes, no sync notifications'}));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
