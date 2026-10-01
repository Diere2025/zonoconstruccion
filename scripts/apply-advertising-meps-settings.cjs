const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const migrations = ['db_migration_v129_retail_latex_source.sql', 'db_migration_v130_roof_membrane_category.sql', 'db_migration_v131_advertising_source_settings.sql'];
const apply = process.argv.includes('--apply');
async function main() {
  await db.connect();
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout = '5s'");
    const backup = {
      sources: (await db.query('SELECT * FROM public.advertising_sources ORDER BY name')).rows,
      products: (await db.query("SELECT id,name,category FROM public.products WHERE name ~* 'membrana\\s+techos?\\M'")).rows,
    };
    if (apply) fs.writeFileSync('tmp/advertising-meps-before-deploy.json', JSON.stringify(backup, null, 2));
    for (const file of migrations) {
      const sql = fs.readFileSync(`database/${file}`, 'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gmi, '');
      await db.query(sql);
    }
    const sources = (await db.query('SELECT * FROM public.advertising_sources ORDER BY sort_order,name,id')).rows;
    const retail = sources.filter(source => source.is_active && ['minorista', 'ambos'].includes(source.channel));
    assert.equal(retail.at(-1).name, 'Mayorista');
    assert.ok(retail.some(source => source.name === 'Meta - Látex Zono'));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.products WHERE name ~* 'membrana\\s+techos?\\M' AND category IS DISTINCT FROM 'MEPS'")).rows[0].n, 0);
    // Exercise settings operations as a real administrator, rolling every test change back.
    await db.query('SAVEPOINT settings_test');
    const admin = (await db.query("SELECT s.id FROM public.sellers s JOIN auth.users u ON u.id=s.id WHERE s.role='admin' AND s.is_active LIMIT 1")).rows[0];
    assert.ok(admin, 'An active administrator is required');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [admin.id]);
    await db.query('SET LOCAL ROLE authenticated');
    const added = (await db.query("INSERT INTO public.advertising_sources(name,is_active,channel,sort_order) VALUES('Ensayo temporal procedencias',true,'minorista',999999) RETURNING id")).rows[0].id;
    const ids = [...sources.map(source => source.id), added].reverse();
    await db.query('SELECT public.reorder_advertising_sources($1::uuid[])', [ids]);
    assert.equal((await db.query('SELECT id FROM public.advertising_sources ORDER BY sort_order LIMIT 1')).rows[0].id, added);
    await db.query("UPDATE public.advertising_sources SET name='Ensayo renombrado',channel='ambos',is_active=false WHERE id=$1", [added]);
    assert.equal((await db.query('SELECT channel,is_active FROM public.advertising_sources WHERE id=$1', [added])).rows[0].channel, 'ambos');
    await db.query('SAVEPOINT invalid_order');
    await assert.rejects(() => db.query('SELECT public.reorder_advertising_sources($1::uuid[])', [ids.slice(1)]), /La lista cambió/);
    await db.query('ROLLBACK TO SAVEPOINT invalid_order');
    await db.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true)");
    await db.query('SAVEPOINT permission_test');
    await assert.rejects(() => db.query('SELECT public.reorder_advertising_sources($1::uuid[])', [ids]), /Solo los administradores/);
    await db.query('ROLLBACK TO SAVEPOINT permission_test');
    await db.query('ROLLBACK TO SAVEPOINT settings_test');
    await db.query('RESET ROLE');
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'validated and rolled back', migrations, settingsChecks: 'add, reorder, rename, channel, deactivate, invalid list and permissions passed', retailSources: retail.map(source => source.name), correctedProducts: backup.products.filter(product => product.category !== 'MEPS').length }));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
