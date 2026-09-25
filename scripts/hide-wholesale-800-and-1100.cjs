const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  .split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'database/wholesale-list-12.snapshot.json'), 'utf8'));
const hiddenNames = snapshot.items.filter(item => /\b(?:800|1100)L\b/i.test(item.name)).map(item => item.name);

async function main() {
  if (hiddenNames.length !== 10) throw new Error(`Se esperaban 10 variantes, hay ${hiddenNames.length}`);
  const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    const list = (await db.query('SELECT id FROM public.wholesale_price_lists WHERE list_number = $1', ['12'])).rows[0];
    if (!list) throw new Error('No existe la Lista 12 en el ERP');
    const updated = await db.query(`UPDATE public.wholesale_price_list_items
      SET is_commercialized = false, updated_at = now()
      WHERE price_list_id = $1 AND product_name = ANY($2)
      RETURNING product_name`, [list.id, hiddenNames]);
    if (updated.rowCount !== hiddenNames.length) throw new Error(`Sólo se encontraron ${updated.rowCount} de ${hiddenNames.length} productos`);

    for (const settingId of ['wholesale_price_list_12', 'active_wholesale_price_list']) {
      const record = (await db.query('SELECT value FROM public.site_settings WHERE id = $1 FOR UPDATE', [settingId])).rows[0];
      if (!record) continue;
      const config = JSON.parse(record.value);
      if (String(config.listNumber) !== '12' || !Array.isArray(config.items)) continue;
      config.items = config.items.map(item => hiddenNames.includes(item.name)
        ? { ...item, defaultCommercialized: false, isCommercialized: false }
        : item);
      if (config.productStates) {
        for (const item of config.items) {
          if (hiddenNames.includes(item.name) && config.productStates[item.id]) {
            config.productStates[item.id].isCommercialized = false;
          }
        }
      }
      await db.query('UPDATE public.site_settings SET value = $2 WHERE id = $1', [settingId, JSON.stringify(config)]);
    }
    await db.query('COMMIT');
    console.log(`Se ocultaron ${updated.rowCount} variantes de 800L y 1100L en Lista 12.`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
