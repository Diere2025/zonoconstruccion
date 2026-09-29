// Exercises actual Postgres roles/RLS/functions. ALL changes are rolled back.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const ids = { a: randomUUID(), b: randomUUID(), ti: randomUUID(), log: randomUUID(), admin: randomUUID(), disabled: randomUUID() };
let checks = 0;
async function actor(id) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
  await db.query('set local role authenticated');
}
async function command(kind, ticket = null, data = {}, version = null, key = randomUUID()) {
  return (await db.query('select public.support_command($1,$2,$3,$4,$5) as result', [kind, ticket, key, version, data])).rows[0].result;
}
async function deny(fn, expected) {
  await db.query('savepoint denied');
  try { await fn(); throw new Error('Expected denial'); } catch (e) {
    if (e.message === 'Expected denial') throw e;
    if (expected) assert.ok(e.message.includes(expected), `${e.code}: expected ${expected}, received ${e.message}`);
    checks++;
  } finally { await db.query('rollback to savepoint denied'); }
}
async function ticket(id) { return (await db.query('select * from public.support_tickets where id=$1', [id])).rows[0]; }
(async () => {
  await db.connect();
  await db.query('begin');
  await db.query("set local lock_timeout='4s'");
  await db.query("set local statement_timeout='30s'");
  if (!(await db.query("select to_regclass('public.support_tickets') as existing")).rows[0].existing) {
    await db.query(fs.readFileSync('database/db_migration_v106_support_tickets.sql', 'utf8'));
  }
  for (const [name, id] of Object.entries(ids)) {
    const email = `support-${id}@example.invalid`;
    await db.query("insert into auth.users(id,email) values($1,$2)", [id, email]);
    await db.query("insert into public.sellers(id,email,full_name,is_active) values($1,$2,$3,$4) on conflict(id) do update set is_active=excluded.is_active", [id, email, `Prueba ${name}`, name !== 'disabled']);
    await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1) on conflict(user_id) do nothing', [id]);
  }
  const ti = (await db.query("select id from public.support_sectors where name='TI / Sistemas'")).rows[0].id;
  const log = (await db.query("select id from public.support_sectors where name='Logística'")).rows[0].id;
  await db.query('insert into public.support_admins(user_id) values($1)', [ids.admin]);
  await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2),($3,$4)', [ti, ids.ti, log, ids.log]);
  await actor(ids.a);
  const createKey = randomUUID();
  const data = { title: 'No puedo eliminar una rendición', description: 'La opción de eliminar no aparece en la pantalla.', type: 'error', sector_id: ti };
  const created = await command('create', null, data, null, createKey);
  assert.deepEqual(await command('create', null, data, null, createKey), created); checks++;
  await deny(() => command('create', null, { ...data, title: 'Otro título diferente' }, null, createKey), 'SUPPORT_CONFLICT');
  await deny(() => command('create', null, { ...data, suggested_priority: 'critical' }), 'SUPPORT_IMPACT_REQUIRED');
  let t = await ticket(created.id); assert.equal(t.created_by, ids.a); checks++;
  await actor(ids.b);
  assert.equal(await ticket(t.id), undefined); checks++;
  await deny(() => command('take', t.id, {}, 1), 'SUPPORT_NOT_FOUND');
  await deny(() => db.query('update public.support_tickets set created_by=$1 where id=$2', [ids.b, t.id]));
  assert.equal((await db.query('select * from public.support_events where ticket_id=$1', [t.id])).rowCount, 0); checks++;
  await actor(ids.log); assert.equal(await ticket(t.id), undefined); checks++;
  await actor(ids.ti);
  t = await ticket(t.id); assert.ok(t); checks++;
  await command('take', t.id, {}, t.version); t = await ticket(t.id);
  await deny(() => command('take', t.id, {}, 1), 'SUPPORT_CONFLICT');
  const publicVersion = t.version;
  await command('message', t.id, { body: 'Nota privada: revisar registros internos.', visibility: 'internal' }, t.version);
  assert.equal((await ticket(t.id)).version, publicVersion); checks++;
  await actor(ids.a);
  assert.equal((await db.query("select * from public.support_messages where ticket_id=$1 and visibility='internal'", [t.id])).rowCount, 0); checks++;
  await deny(() => command('message', t.id, { body: 'Soy admin', visibility: 'internal' }, t.version), 'SUPPORT_FORBIDDEN');
  await deny(() => command('classify', t.id, { priority: 'critical', type: 'error' }, t.version), 'SUPPORT_FORBIDDEN');
  await actor(ids.ti);
  await command('request_info', t.id, { body: 'Pegá una captura de la pantalla donde ocurre.' }, t.version);
  t = await ticket(t.id); assert.equal(t.status, 'waiting_requester'); checks++;
  await actor(ids.a);
  await command('message', t.id, { body: 'Ahora voy a probar.' }, t.version); t = await ticket(t.id);
  assert.equal(t.status, 'waiting_requester'); checks++;
  await command('respond', t.id, { body: 'La opción no aparece al entrar a Rendiciones.' }, t.version); t = await ticket(t.id);
  assert.equal(t.status, 'in_progress'); checks++;
  await actor(ids.ti);
  await command('request_validation', t.id, { body: 'Entrá a Rendiciones e intentá eliminar una de prueba.', solution: 'Se agregó la opción de eliminar.' }, t.version); t = await ticket(t.id);
  await actor(ids.a);
  await command('reject', t.id, { body: 'Todavía no aparece la opción.' }, t.version); t = await ticket(t.id);
  assert.equal(t.status, 'in_progress'); checks++;
  await actor(ids.ti);
  await command('request_validation', t.id, { body: 'Volvé a probar con una rendición nueva.', solution: 'Se corrigió el permiso.' }, t.version); t = await ticket(t.id);
  await actor(ids.a);
  await deny(() => command('validate', t.id, {}, t.version), 'SUPPORT_INVALID');
  await command('validate', t.id, { confirmed: true }, t.version); t = await ticket(t.id);
  assert.equal(t.status, 'closed'); assert.equal(t.closure_kind, 'validated'); checks++;
  await command('reopen', t.id, { body: 'Vuelve a fallar con otra rendición.' }, t.version); t = await ticket(t.id);
  assert.equal(t.reopen_count, 1); checks++;
  const upload = await command('upload_reserve', t.id, { name: 'captura.png', mime: 'image/png', bytes: 300, visibility: 'public' });
  await deny(() => db.query('select public.support_finish_upload($1,$2,10,10)', [upload.id, ids.a]));
  await db.query('reset role');
  await db.query('select public.support_finish_upload($1,$2,10,10)', [upload.id, ids.a]);
  await actor(ids.b);
  assert.equal((await db.query('select * from public.support_attachments where id=$1', [upload.id])).rowCount, 0); checks++;
  await actor(ids.a);
  await command('message', t.id, { body: 'Captura adjunta.', attachments: [upload.id] }, t.version); t = await ticket(t.id);
  await actor(ids.ti);
  const privateUpload = await command('upload_reserve', t.id, { name: 'interno.png', mime: 'image/png', bytes: 300, visibility: 'internal' });
  await db.query('reset role');await db.query('select public.support_finish_upload($1,$2,10,10)', [privateUpload.id,ids.ti]);
  await actor(ids.ti);await command('message',t.id,{body:'Captura interna',visibility:'internal',attachments:[privateUpload.id]},t.version);
  await actor(ids.a);
  assert.equal((await db.query('select id from public.support_attachments where id=$1',[privateUpload.id])).rowCount,0);checks++;
  await db.query('reset role');
  await db.query("insert into storage.objects(bucket_id,name) values('support-attachments',$1)",[privateUpload.path]);
  await actor(ids.a);
  assert.equal((await db.query("select id from storage.objects where bucket_id='support-attachments'")).rowCount,0);checks++;
  await actor(ids.admin);
  await command('transfer', t.id, { body: 'Revisión operativa de Logística.', sector_id: log }, t.version); t = await ticket(t.id);
  await actor(ids.ti);
  assert.equal(await ticket(t.id), undefined); checks++;
  assert.equal((await db.query('select * from public.support_notifications where ticket_id=$1', [t.id])).rowCount, 0); checks++;
  assert.equal((await db.query('select * from public.support_attachments where id=$1', [upload.id])).rowCount, 0); checks++;
  await actor(ids.log); assert.ok(await ticket(t.id)); checks++;
  await command('take',t.id,{},t.version);t=await ticket(t.id);
  await actor(ids.admin);
  await command('member_save',null,{sector_id:log,user_id:ids.log,active:false});t=await ticket(t.id);
  assert.equal(t.assignee_id,null);assert.equal(t.status,'new');checks++;
  await actor(ids.log);assert.equal(await ticket(t.id),undefined);checks++;
  await db.query('reset role');
  await db.query("update auth.users set raw_user_meta_data='{"+'"role":"admin"'+"}'::jsonb where id=$1",[ids.b]);
  await actor(ids.b);assert.equal((await db.query('select public.support_is_admin() as allowed')).rows[0].allowed,false);checks++;
  await db.query('reset role');await db.query('update public.support_admins set active=false where user_id<>$1',[ids.admin]);
  await actor(ids.admin);await deny(()=>command('admin_save',null,{user_id:ids.admin,active:false}),'SUPPORT_LAST_ADMIN');
  await command('cancel',t.id,{body:'Incidencia de ensayo cancelada.'},t.version);t=await ticket(t.id);assert.equal(t.status,'cancelled');checks++;
  await command('restore',t.id,{body:'Restaurar para verificar el flujo.'},t.version);t=await ticket(t.id);assert.equal(t.status,'new');checks++;
  await actor(ids.disabled);
  assert.equal((await db.query('select * from public.support_tickets')).rowCount, 0); checks++;
  await deny(() => command('create', null, data), 'SUPPORT_FORBIDDEN');
  await db.query('reset role');await db.query('set local role anon');
  await deny(() => db.query('select * from public.support_tickets'));
  await db.query('reset role');
  const grants = await db.query("select has_function_privilege('authenticated','public.support_finish_upload(uuid,uuid,integer,integer)','execute') as upload,has_function_privilege('authenticated','public.support_user_manages(uuid,uuid)','execute') as helper");
  assert.equal(grants.rows[0].upload, false);assert.equal(grants.rows[0].helper, false);checks++;
  // Real scoped-list measurement on synthetic volume, still rolled back.
  await db.query("insert into public.support_tickets(created_by,sector_id,title,description,type) select $1,$2,'Incidencia de carga '||g,'Descripción sintética de un ensayo de rendimiento.','error' from generate_series(1,5000) g",[ids.a,ti]);
  await db.query("insert into public.support_messages(ticket_id,author_id,body,visibility) select t.id,$1,'Mensaje sintético de rendimiento','public' from public.support_tickets t cross join generate_series(1,10) g where t.created_by=$1",[ids.a]);
  await actor(ids.a);
  const benchmark=await db.query('explain (analyze,format json) select id,title from public.support_tickets where created_by=$1 order by updated_at desc,id desc limit 25',[ids.a]);
  const executionMs=benchmark.rows[0]['QUERY PLAN'][0]['Execution Time'];assert.ok(executionMs<1500,`Scoped list exceeded target: ${executionMs}ms`);checks++;
  await db.query('rollback');
  console.log(JSON.stringify({ result: 'passed', checks, databaseChanges: 'rolled_back', roles: 'authenticated, anon', syntheticTickets:5000,syntheticMessages:50000,scopedListMs:executionMs,workflow: 'create → request → respond → test → reject → retest → close → reopen → transfer' }));
})().catch(async e => { await db.query('rollback').catch(() => {}); console.error('Support database test failed:', e.code || '', e.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; }).finally(() => db.end());
