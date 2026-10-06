const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
if (!process.argv.includes('--apply')) throw Error('Use --apply to activate v145');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
    await db.connect();
    await db.query('begin');
    try {
        await db.query("set local lock_timeout='5s'");
        await db.query('select pg_advisory_xact_lock(106106)');
        const counts = async () => (await db.query('select (select count(*) from public.support_tickets)::int tickets,(select count(*) from public.support_notifications)::int notifications')).rows[0];
        const before = await counts();
        const core = (await db.query("select pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure) definition")).rows[0].definition;
        const policy = (await db.query("select pg_get_expr(polqual,polrelid) expression from pg_policy where polrelid='public.support_notifications'::regclass and polname='support_notification_read'")).rows[0];
        const directory = path.join('scratch', 'support-notification-v145', new Date().toISOString().replace(/[:.]/g, '-'));
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'before.json'), JSON.stringify({ counts: before, core, policy }, null, 2));
        await db.query(fs.readFileSync('database/db_migration_v145_support_notification_scope.sql', 'utf8'));
        const after = await counts();
        assert.deepEqual(after, before);
        const verified = (await db.query("select strpos(pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure),'support_user_in_area(p.user_id,t.sector_id)')>0 scoped, has_function_privilege('authenticated','public.support_read_notifications(uuid[],timestamptz)','execute') readable")).rows[0];
        assert.equal(verified.scoped, true);
        assert.equal(verified.readable, true);
        await db.query('commit');
        const report = { migration: 'v145', applied: true, historyPreserved: true, before, after, backup: directory };
        fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
    } catch (error) { await db.query('rollback'); throw error; }
    finally { await db.end(); }
})().catch(error => { console.error(error.message || error.code || error.name); process.exitCode = 1; });
