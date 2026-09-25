const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  .split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const separator = line.indexOf('=');
    const raw = line.slice(separator + 1).trim();
    return [line.slice(0, separator), raw.replace(/^['"]|['"]$/g, '')];
  }));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'database/wholesale-list-12.snapshot.json'), 'utf8'));

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function main() {
  if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.local');
  if (snapshot.listNumber !== '12' || snapshot.items.length !== 116) throw new Error('El snapshot de la Lista 12 está incompleto');
  const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(fs.readFileSync(path.join(root, 'database/db_migration_v68_wholesale_price_lists.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/db_migration_v90_wholesale_list_erp_products.sql'), 'utf8'));

    const products = (await db.query('SELECT id, name, sku, is_active FROM public.products')).rows;
    const byName = new Map();
    for (const product of products.sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active))) {
      for (const key of [normalize(product.name), normalize(product.sku)]) {
        if (key && !byName.has(key)) byName.set(key, product.id);
      }
    }
    const unmatched = snapshot.items.filter(item => !byName.has(normalize(item.name)));
    if (unmatched.length) throw new Error(`${unmatched.length} productos de la lista no coinciden con productos del ERP`);

    const list = (await db.query(`
      INSERT INTO public.wholesale_price_lists
        (list_number, name, valid_text, is_active, global_discount_corralon_pct,
         global_discount_dist_pct, metadata)
      VALUES ($1, $2, $3, true, $4, $5, $6)
      ON CONFLICT (list_number) DO UPDATE SET
        name = EXCLUDED.name, valid_text = EXCLUDED.valid_text,
        is_active = EXCLUDED.is_active,
        global_discount_corralon_pct = EXCLUDED.global_discount_corralon_pct,
        global_discount_dist_pct = EXCLUDED.global_discount_dist_pct,
        metadata = EXCLUDED.metadata, updated_at = now()
      RETURNING id`, [snapshot.listNumber, 'Lista 12 Mayorista', snapshot.listDate,
      snapshot.globalDiscountCorralonPct, snapshot.globalDiscountDistributorPct,
      { source: snapshot.source, itemsCount: snapshot.items.length }])).rows[0];

    for (const item of snapshot.items) {
      await db.query(`
        INSERT INTO public.wholesale_price_list_items
          (price_list_id, product_id, erp_product_id, product_name, category, family,
           liters, is_manufactured, cost_base_real, price_list, price_corralon,
           price_distributor, is_commercialized, is_confirmed, override_mode)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (price_list_id, product_id) DO UPDATE SET
          erp_product_id = EXCLUDED.erp_product_id,
          product_name = EXCLUDED.product_name, category = EXCLUDED.category,
          family = EXCLUDED.family, liters = EXCLUDED.liters,
          is_manufactured = EXCLUDED.is_manufactured,
          cost_base_real = EXCLUDED.cost_base_real,
          price_list = EXCLUDED.price_list,
          price_corralon = EXCLUDED.price_corralon,
          price_distributor = EXCLUDED.price_distributor,
          is_commercialized = EXCLUDED.is_commercialized,
          is_confirmed = EXCLUDED.is_confirmed, updated_at = now()`, [
        list.id, item.id, byName.get(normalize(item.name)), item.name,
        item.category || 'Otros', item.family || '', item.liters || '',
        !!item.isManufactured, Number(item.costBaseReal || 0),
        Number(item.priceList), Number(item.priceCorralon), Number(item.priceDistributor),
        item.isCommercialized !== false, item.isConfirmed !== false, item.mode || 'fixed_price'
      ]);
    }

    await db.query(`INSERT INTO public.site_settings (id, value)
      VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
      ['wholesale_price_list_12', JSON.stringify(snapshot)]);
    await db.query(`INSERT INTO public.site_settings (id, value)
      VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`,
      ['active_wholesale_price_list', JSON.stringify(snapshot)]);
    await db.query('COMMIT');
    console.log(`Lista 12 importada: ${snapshot.items.length} productos vinculados al ERP.`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
