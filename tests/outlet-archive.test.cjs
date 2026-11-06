const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { PGlite } = require(process.env.OUTLET_PGLITE_MODULE || '../tmp/customer-advance-test-runtime/node_modules/@electric-sql/pglite');
const { fixture, id } = require('./outlet-sales.test.cjs');

test('Outlet managers can remove a duplicate and reuse its code while preserving its audit and source', async () => {
    const db = new PGlite();
    try {
        await fixture(db);
        await db.exec('CREATE ROLE service_role');
        for (const migration of ['20261104_outlet_managers', '20261106_outlet_archive']) {
            await db.exec(readFileSync(`database/db_migration_${migration}.sql`, 'utf8'));
        }
        await db.query(`INSERT INTO outlet_units (id, code, condition, source_key, base_stock_transferred)
            VALUES ($1, '0038', 'segunda', 'sheet:0038', false),
                   ($2, 'O038', 'segunda', null, false),
                   ($3, '0039', 'segunda', null, true)`, [id(11), id(12), id(13)]);
        await db.exec(`SELECT set_config('test.uid','${id(2)}',false); SET ROLE authenticated`);
        const remove = (unit, version) => db.query('SELECT outlet_archive_unit($1,$2)', [unit, version]);
        await assert.rejects(remove(id(11), 1), /no puede administrar/);
        await db.exec(`RESET ROLE; INSERT INTO outlet_managers(user_id) VALUES ('${id(2)}'); SET ROLE authenticated`);
        await assert.rejects(remove(id(11), 2), /ficha cambió/);
        await assert.rejects(remove(id(13), 1), /stock del producto base/);
        await remove(id(11), 1);
        await remove(id(11), 1);
        const result = await db.query('SELECT code FROM outlet_units WHERE archived_at IS NULL ORDER BY code');
        assert.deepEqual(result.rows.map(row => row.code), ['0039', 'O038']);
        const audit = await db.query("SELECT after_data->>'source_key' source FROM outlet_audit WHERE unit_id=$1 AND after_data->>'archived_at' IS NOT NULL", [id(11)]);
        assert.deepEqual(audit.rows, [{ source: 'sheet:0038' }]);
        await db.exec('RESET ROLE');
        await db.exec("INSERT INTO outlet_units(code,condition) VALUES ('0038','segunda')");
        await assert.rejects(db.exec("UPDATE outlet_units SET state='available' WHERE source_key='sheet:0038'"), /outlet_archived_withdrawn/);
    } finally {
        await db.close();
    }
});
