const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const snapshotPath = 'tmp/pending-category-correction-2026-10-23.json';

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    const categoriesBefore = (await db.query('select id,category,status from orders order by id')).rows;
    const migration = fs.readFileSync('database/db_migration_v229_autolimpiable_order_category.sql', 'utf8');
    await db.query(migration);
    await db.query(migration);
    for (const [name, sku, qty, expected] of [
      ['BioFort - Autolimpiable 700L', '', 1, true], ['BioFort - Autolimpiante 700L', '', 1, true],
      ['Producto', 'BioFort - Autolimpiable 700L', 1, true], ['Biodigestor 600L', '', 1, true],
      ['BioFort - Autolimpiable 700L', '', 0, false], ['Filtro autolimpiable', '', 1, false],
      ['Cono BioFort Autolimpiable', '', 1, false], ['Descuento BioFort Autolimpiable', '', 1, false],
      ['Kit Instalación Biodigestor Autolimpiante 700L', '', 1, false], ['BioFort - Séptica 600L', '', 1, false]
    ]) assert.equal((await db.query('select is_biodigestor_order_item($1,$2,$3) value', [name, sku, qty])).rows[0].value, expected, name);

    const targets = (await db.query(`select o.*,public.resolve_biofort_order_category(o.id) detected
      from orders o where status='Pendiente' and (
        public.resolve_biofort_order_category(o.id)='BIODIGESTOR' and coalesce(trim(category),'') !~* '^biodigestor(es)?$'
        or legacy_code='JS26392' and category='OTRO') order by id for update of o`)).rows;
    const targetIds = targets.map(o => o.id);
    const itemsBefore = (await db.query('select * from order_items where order_id=any($1::uuid[]) order by id', [targetIds])).rows;
    const jobsBefore = (await db.query('select * from order_sync_jobs where order_id=any($1::uuid[]) order by id', [targetIds])).rows;

    await db.query('savepoint fixtures');
    const sourceId = (await db.query("select id from orders where legacy_code='JS26375'")).rows[0].id;
    const fixture = randomUUID();
    await db.query(`insert into orders(id,customer_name,status,category,seller_id,channel,totals,initial_delivery_date,max_delivery_date,locality,address,freight_type)
      select $1,'Prueba temporal de clasificación','Pendiente','OTRO',seller_id,channel,'{}'::jsonb,initial_delivery_date,max_delivery_date,locality,address,freight_type
      from orders where id=$2`, [fixture, sourceId]);
    await db.query('insert into order_items(order_id,product_id,product_name,quantity,unit_price) select $1,product_id,product_name,quantity,unit_price from order_items where order_id=$2', [fixture, sourceId]);
    const category = async () => (await db.query('select category from orders where id=$1', [fixture])).rows[0].category;
    assert.equal(await category(), 'BIODIGESTOR');
    await db.query("update orders set category='OTRO' where id=$1", [fixture]);
    assert.equal(await category(), 'BIODIGESTOR');
    await db.query('delete from order_items where order_id=$1', [fixture]);
    await db.query("update orders set category='OTRO' where id=$1", [fixture]);
    await db.query("insert into order_items(order_id,product_name,quantity,unit_price) values ($1,'Kit Instalación Biodigestor Autolimpiante 700L',1,2040000),($1,'BioFort - Autolimpiable 700L',1,0)", [fixture]);
    assert.equal(await category(), 'INSTALACIÓN BIOFORT');
    // Simula un pedido cerrado sin generar stock, rendiciones ni notificaciones.
    await db.query('delete from order_items where order_id=$1', [fixture]);
    await db.query("update orders set status='Entregado',category='OTRO' where id=$1", [fixture]);
    await db.query("insert into order_items(order_id,product_name,quantity,unit_price) values ($1,'BioFort - Autolimpiable 700L',1,416160)", [fixture]);
    assert.equal(await category(), 'OTRO', 'Delivered items must not reclassify history');
    await db.query("update orders set category='OTRO' where id=$1", [fixture]);
    assert.equal(await category(), 'OTRO');
    await db.query('rollback to savepoint fixtures');

    for (const order of targets) {
      if (order.legacy_code === 'JS26392') {
        assert.ok(itemsBefore.some(i => i.order_id === order.id && /AquaFort.*500L/i.test(i.product_name)));
      }
      await db.query("update orders set category=$2 where id=$1 and status='Pendiente'", [order.id, order.detected === 'BIODIGESTOR' ? 'BIODIGESTOR' : 'TANQUES']);
      const after = (await db.query('select * from orders where id=$1', [order.id])).rows[0];
      const { detected, ...before } = order;
      assert.equal(after.category, detected === 'BIODIGESTOR' ? 'BIODIGESTOR' : 'TANQUES');
      assert.deepEqual({ ...after, category: before.category }, before, 'Only category may change');
    }
    assert.deepEqual((await db.query('select * from order_items where order_id=any($1::uuid[]) order by id', [targetIds])).rows, itemsBefore);
    assert.deepEqual((await db.query('select * from order_sync_jobs where order_id=any($1::uuid[]) order by id', [targetIds])).rows, jobsBefore);
    const categoriesAfter = (await db.query('select id,category,status from orders order by id')).rows;
    assert.deepEqual(categoriesAfter.filter(o => !targetIds.includes(o.id)), categoriesBefore.filter(o => !targetIds.includes(o.id)), 'All other orders, including delivered, unchanged');
    const pendingOther = (await db.query(`select o.id,o.legacy_code code,o.order_date::text date,o.category,o.status,
      jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price) order by i.id) items
      from orders o left join order_items i on i.order_id=o.id where o.status='Pendiente'
      and coalesce(trim(o.category),'') ~* '^(otro|otros|general)?$' group by o.id order by o.order_date desc`)).rows;
    const result = { mode: apply ? 'applied' : 'validated and rolled back', changes: targets.map(o => ({ id:o.id, code:o.legacy_code, before:o.category, after:o.detected === 'BIODIGESTOR' ? 'BIODIGESTOR' : 'TANQUES' })), pendingOther,
      checks: 'idempotence, JS26375 actual items, override prevention, installation at $0, delivered guard, only category changed, all other orders unchanged, items and jobs unchanged' };
    if (apply) fs.writeFileSync(snapshotPath, JSON.stringify({ capturedAt:new Date().toISOString(), before:targets, itemsBefore, jobsBefore, result }, null, 2));
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify(result));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
