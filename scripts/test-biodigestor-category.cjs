const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const apply = process.argv.includes('--apply');

(async () => {
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    const original = (await db.query("select id,category,total_amount,totals from public.orders where legacy_code='JS25835'")).rows;
    assert.equal(original.length, 1);
    const sql = fs.readFileSync('database/db_migration_v141_biodigestor_order_category.sql', 'utf8');
    await db.query(sql);
    await db.query(sql);
    await db.query('savepoint fixtures');
    const id = randomUUID();
    await db.query(`insert into public.orders(id,customer_name,status,category,seller_id,channel,totals,initial_delivery_date,max_delivery_date,locality,address,freight_type)
      select $1,'Ensayo temporal categoría biodigestor','Pendiente','OTRO',seller_id,channel,'{}'::jsonb,initial_delivery_date,max_delivery_date,locality,address,freight_type
      from public.orders where id=$2`, [id, original[0].id]);
    const category = async () => (await db.query('select category from public.orders where id=$1', [id])).rows[0].category;
    assert.equal(await category(), 'OTRO');
    // Todos los productos reales del pedido se insertan juntos, como una carga de la vendedora.
    await db.query(`insert into public.order_items(order_id,product_id,product_name,quantity,unit_price)
      select $1,product_id,product_name,quantity,unit_price from public.order_items where order_id=$2`, [id, original[0].id]);
    assert.equal(await category(), 'BIODIGESTOR');
    for (const attempted of ['OTRO', 'TANQUES', 'INSTALACIÓN BIOFORT']) {
      await db.query('update public.orders set category=$2 where id=$1', [id, attempted]);
      assert.equal(await category(), 'BIODIGESTOR');
    }
    const checks = [
      ['Biodigestor 500L', '', 1, true], ['Producto', 'BioFort - Biodigestor 750L', 1, true],
      ['Biodigestor 500L', '', 0, false], ['Descuento Combo Biodigestor', '', 1, false],
      ['Kit Instalación Biodigestor 500L', '', 1, false], ['Cono Biodigestor', '', 1, false]
    ];
    for (const [name, sku, quantity, expected] of checks) {
      assert.equal((await db.query('select public.is_biodigestor_order_item($1,$2,$3) value', [name, sku, quantity])).rows[0].value, expected);
    }
    assert.equal((await db.query('select count(*)::int n from public.order_sync_jobs where order_id=$1', [id])).rows[0].n, 0);
    await db.query('rollback to savepoint fixtures');
    assert.deepEqual((await db.query('select id,category,total_amount,totals from public.orders where id=$1', [original[0].id])).rows, original);
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'validated and rolled back', checks: 'idempotence, actual order items, category override, product exclusions, no notifications, amounts preserved', order: 'JS25835', category: original[0].category }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
