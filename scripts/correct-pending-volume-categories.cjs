const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();
  try {
    await db.query('begin');await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    const allBefore=(await db.query('select id,category,status from orders order by id')).rows;
    const sql=fs.readFileSync('database/db_migration_v230_volume_order_category.sql','utf8');await db.query(sql);await db.query(sql);
    const codes=['JS26348','JS26365'],expected={JS26348:'TANQUES',JS26365:'MEP'};
    const before=(await db.query('select * from orders where legacy_code=any($1::text[]) order by id for update',[codes])).rows;
    assert.equal(before.length,2);for(const o of before)assert.equal(o.status,'Pendiente');
    const ids=before.map(o=>o.id),itemsBefore=(await db.query('select * from order_items where order_id=any($1::uuid[]) order by id',[ids])).rows;
    const jobsBefore=(await db.query('select * from order_sync_jobs where order_id=any($1::uuid[]) order by id',[ids])).rows;
    await db.query('savepoint fixtures');
    for(const order of before){
      const id=randomUUID();
      await db.query(`insert into orders(id,customer_name,status,category,seller_id,channel,totals,initial_delivery_date,max_delivery_date,locality,address,freight_type)
        select $1,'Prueba temporal volumen','Pendiente','OTRO',seller_id,channel,'{}'::jsonb,initial_delivery_date,max_delivery_date,locality,address,freight_type from orders where id=$2`,[id,order.id]);
      await db.query('insert into order_items(order_id,product_id,product_name,quantity,unit_price) select $1,product_id,product_name,quantity,unit_price from order_items where order_id=$2',[id,order.id]);
      const category=async()=>(await db.query('select category from orders where id=$1',[id])).rows[0].category;
      assert.equal(await category(),expected[order.legacy_code]);
      await db.query("update orders set category='OTRO' where id=$1",[id]);assert.equal(await category(),expected[order.legacy_code]);
      await db.query("insert into order_items(order_id,product_name,quantity,unit_price) values ($1,'Pincel N°15',100,100)",[id]);
      assert.equal(await category(),expected[order.legacy_code]);
      await db.query("insert into order_items(order_id,product_name,quantity,unit_price) values ($1,'BioFort - Autolimpiable 700L',1,416160)",[id]);
      assert.equal(await category(),'BIODIGESTOR');
      await db.query('delete from order_items where order_id=$1',[id]);
      await db.query("update orders set status='Entregado',category='OTRO' where id=$1",[id]);
      await db.query('insert into order_items(order_id,product_name,quantity,unit_price) select $1,product_name,quantity,unit_price from order_items where order_id=$2',[id,order.id]);
      assert.equal(await category(),'OTRO','Delivered history must stay unchanged');
    }
    await db.query('rollback to savepoint fixtures');
    for(const order of before){
      const detected=(await db.query('select resolve_volume_order_category($1) category',[order.id])).rows[0].category;
      assert.equal(detected,expected[order.legacy_code]);
      await db.query("update orders set category=$2 where id=$1 and status='Pendiente'",[order.id,detected]);
      const after=(await db.query('select * from orders where id=$1',[order.id])).rows[0];
      assert.equal(after.category,detected);assert.deepEqual({...after,category:order.category},order,'Only category changed');
    }
    assert.deepEqual((await db.query('select * from order_items where order_id=any($1::uuid[]) order by id',[ids])).rows,itemsBefore);
    assert.deepEqual((await db.query('select * from order_sync_jobs where order_id=any($1::uuid[]) order by id',[ids])).rows,jobsBefore);
    assert.deepEqual((await db.query('select id,category,status from orders order by id')).rows.filter(o=>!ids.includes(o.id)),allBefore.filter(o=>!ids.includes(o.id)));
    const pendingOther=(await db.query("select legacy_code,category,status from orders where status='Pendiente' and coalesce(trim(category),'') ~* '^(otro|otros|general)?$'")).rows;
    const result={mode:apply?'applied':'validated and rolled back',changes:before.map(o=>({code:o.legacy_code,before:o.category,after:expected[o.legacy_code]})),pendingOther,
      checks:'idempotence, real items, priority over 100 accessories, biodigestor priority, delivered guard, only category changed, all other orders/items/jobs unchanged'};
    if(apply)fs.writeFileSync('tmp/volume-category-correction-2026-10-23.json',JSON.stringify({capturedAt:new Date().toISOString(),before,itemsBefore,jobsBefore,result},null,2));
    await db.query(apply?'commit':'rollback');console.log(JSON.stringify(result));
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
