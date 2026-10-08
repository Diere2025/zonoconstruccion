const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
async function actor(id) {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await db.query('set local role authenticated');
}
async function command(name, ticket, version, data = {}) {
    return (await db.query('select public.support_command($1,$2,$3,$4,$5) r', [name, ticket, randomUUID(), version, data])).rows[0].r;
}
(async () => {
    await db.connect();
    await db.query('begin');
    try {
        await db.query("set local lock_timeout='5s'");
        const sql = fs.readFileSync('database/db_migration_v145_support_notification_scope.sql', 'utf8');
        await db.query(sql);
        await db.query(sql);
        const [owner, member, colleague, admin, outsider] = Array.from({ length: 5 }, randomUUID);
        const area = randomUUID();
        for (const id of [owner, member, colleague, admin, outsider]) {
            await db.query('insert into auth.users(id,email) values($1,$2)', [id, `notification-${id}@example.invalid`]);
            await db.query("insert into public.sellers(id,email,full_name,is_active) values($1,$2,'Ensayo avisos',true)", [id, `notification-${id}@example.invalid`]);
            await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)', [id]);
        }
        await db.query('insert into public.support_sectors(id,name) values($1,$2)', [area, `Ensayo avisos ${area}`]);
        await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2),($1,$3)', [area, member, colleague]);
        await db.query('insert into public.support_admins(user_id) values($1)', [admin]);
        const data = { sector_id: area, title: 'Verificación de destinatarios', description: 'Reporte ficticio para verificar notificaciones.', type: 'error', responsibility_kind: 'area' };
        await actor(owner);
        const team = await command('create', null, null, data);
        await actor(admin);
        assert.equal((await db.query('select id from public.support_tickets where id=$1', [team.id])).rowCount, 1);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rowCount, 0);
        await actor(member);
        const memberNotice = (await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rows[0].id;
        await actor(colleague);
        const otherNotice = (await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rows[0].id;
        await actor(member);
        const result = (await db.query('select public.support_read_notifications($1,null) r', [[memberNotice, otherNotice]])).rows[0].r;
        assert.equal(result.updated, 1);
        assert.equal((await db.query('select read_at from public.support_notifications where id=$1', [memberNotice])).rows[0].read_at !== null, true);
        assert.equal((await db.query('select public.support_read_notifications($1,null) r', [[memberNotice]])).rows[0].r.updated, 0);
        await actor(colleague);
        assert.equal((await db.query('select read_at from public.support_notifications where id=$1', [otherNotice])).rows[0].read_at, null);
        await actor(owner);
        const personal = await command('create', null, null, { ...data, responsibility_kind: 'person', assignee_id: member });
        await actor(colleague);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [personal.id])).rowCount, 0);
        await actor(member);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [personal.id])).rowCount, 1);
        await command('message', team.id, 1, { body: 'Respuesta para el solicitante.' });
        await actor(owner);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rowCount, 1);
        await command('read', team.id, null);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1 and read_at is null', [team.id])).rowCount, 0);
        // Existing admin notices from the old rule are hidden, not deleted.
        await db.query('reset role');
        const event = (await db.query("select id from public.support_events where ticket_id=$1 and kind='create'", [team.id])).rows[0].id;
        await db.query("insert into public.support_notifications(user_id,ticket_id,event_id,kind) values($1,$2,$3,'create')", [admin, team.id, event]);
        await actor(admin);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rowCount, 0);
        await db.query('reset role');
        await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2)', [area, admin]);
        await actor(admin);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1', [team.id])).rowCount, 1);
        await actor(outsider);
        assert.equal((await db.query('select public.support_read_notifications($1,null) r', [[otherNotice]])).rows[0].r.updated, 0);
        await actor(colleague);
        const cutoff = (await db.query('select clock_timestamp() t')).rows[0].t;
        await command('message', team.id, 2, { body: 'Actividad posterior al corte.' });
        // Fixtures share one transaction; emulate a later request's creation time.
        await db.query('reset role');
        await db.query("update public.support_notifications set created_at=clock_timestamp() where user_id=$1 and ticket_id=$2 and read_at is null", [member, team.id]);
        await actor(member);
        await db.query('select public.support_read_notifications(null,$1)', [cutoff]);
        assert.equal((await db.query('select id from public.support_notifications where ticket_id=$1 and read_at is null', [team.id])).rowCount, 1);
        await db.query('rollback');
        console.log('Passed: recipient scope, admin visibility, legacy notices, own reads, idempotence, requester/detail reads, cutoff. All changes rolled back.');
    } catch (error) {
        await db.query('rollback');
        throw error;
    } finally { await db.end(); }
})().catch(error => { console.error(error.stack || error.code || error.name); process.exitCode = 1; });
