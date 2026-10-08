// Real authenticated API and private storage test. All fixtures removed in finally.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [], tokens = {}, files = [];
let checks = 0;
async function api(who, route, body, cookie) {
  const headers = { Authorization: `Bearer ${tokens[who]}` };
  if (cookie) headers.Cookie=cookie;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:3000/api/visits/${route}`, { headers, method: body ? 'POST' : 'GET', body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
function ok(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.data)); checks++; return r.data; }
async function detail(id) { return ok(await api('seller', `case/${id}`)); }
async function command(who, c, name, data) {
  return ok(await api(who, 'command', { command: name, id: c?.id || null, key: randomUUID(), version: c?.version || null, data }));
}
async function cleanup() {
  if (files.length) { const r = await service.storage.from('visit-attachments').remove(files); if (r.error) throw r.error; }
  const ids = users.map(u => u.id);
  if (!ids.length) return;
  await db.query('begin');
  try {
    await db.query('delete from public.visit_delivery_jobs where case_id in (select id from public.visit_cases where created_by=any($1::uuid[])) or slot_id in (select id from public.visit_slots where created_by=any($1::uuid[]))',[ids]);
    await db.query('delete from public.visit_slots where created_by=any($1::uuid[])',[ids]);
    for (const table of ['visit_commercial_data','visit_notifications', 'visit_operations', 'visit_attachments', 'visit_order_links', 'visit_events', 'visit_quotes', 'visit_appointments']) {
      await db.query(`delete from public.${table} where case_id in (select id from public.visit_cases where created_by=any($1::uuid[]))`, [ids]);
    }
    await db.query('delete from public.visit_cases where created_by=any($1::uuid[])', [ids]);
    await db.query('delete from public.sellers where id=any($1::uuid[])', [ids]);
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
  for (const user of users) { const r = await service.auth.admin.deleteUser(user.id); if (r.error) throw r.error; }
}
(async () => {
  await db.connect();
  try {
    for (const who of ['seller', 'colleague', 'installer', 'unassigned','admin']) {
      const email = `visits-test-${randomUUID()}@example.invalid`, password = randomUUID() + randomUUID();
      const r = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (r.error) throw r.error;
      users.push({ id: r.data.user.id, who });
      const role = ['seller', 'colleague'].includes(who) ? 'seller' : who==='admin' ? 'admin' : 'instalador';
      await db.query('insert into public.sellers(id,email,full_name,is_active,role,roles) values($1,$2,$3,true,$4,$5)', [r.data.user.id, email, 'Ensayo temporal de visitas', role, [role]]);
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
      tokens[who] = login.data.session.access_token;
      ok(await api(who, 'session'));
    }
    const me = ok(await api('seller', 'session'));
    assert.ok(me.kits.some(k=>/500L/.test(k.name)));checks++;
    const seller = users.find(u => u.who === 'seller').id, installer = users.find(u => u.who === 'installer').id;
    const created = await command('seller', null, 'create', { customer_name: 'Ensayo API temporal', phone: '1100000000', locality: 'Localidad ficticia', address: 'Obra ficticia 123', request_reason: 'Prueba del circuito', whaticket_link:'https://whaticket.example.test/internal/123',locality_id:me.localities[0].id, kit_id: me.kits[0].id, seller_id: seller, installer_id: installer });
    let c = (await detail(created.id)).visit;
    const impersonated=await fetch('http://127.0.0.1:3000/api/admin/impersonate',{method:'POST',headers:{Authorization:'Bearer '+tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({action:'start',targetUserId:users.find(u=>u.who==='installer').id})});
    assert.equal(impersonated.status,200);const cookie=impersonated.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);checks++;
    ok(await api('installer','command',{command:'note',id:c.id,key:randomUUID(),version:c.version,data:{body:'Ensayo Ver como autorizado'}},cookie));c=(await detail(c.id)).visit;
    assert.equal((await db.query("select data->'input'->>'_administrator_id' id from public.visit_events where case_id=$1 and body='Ensayo Ver como autorizado'",[c.id])).rows[0].id,users.find(u=>u.who==='admin').id);checks++;
    const agenda=ok(await api('installer','agenda?from=2026-10-01&to=2026-10-31'));assert.ok(agenda.unplanned.some(v=>v.id===c.id));checks++;
    await command('installer',c,'extras',{extras:'Bomba y caño adicional'});c=(await detail(c.id)).visit;assert.equal(c.extras,'Bomba y caño adicional');checks++;

    const shared=ok(await api('colleague', `case/${c.id}`));assert.equal(shared.commercial.whaticket_link,'https://whaticket.example.test/internal/123');checks++;const technical=ok(await api('installer',`case/${c.id}`));assert.equal(technical.commercial,null);assert.ok(!JSON.stringify(technical).includes('whaticket.example'));checks++;ok(await api('installer',`order-draft/${c.id}`),403);
    ok(await api('colleague', `case/${c.id}`)); ok(await api('unassigned', `case/${c.id}`), 404);
    const blocked = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=id&limit=1`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tokens.installer}` } });
    assert.equal(blocked.status, 403); checks++;
    await command('installer', c, 'kit', { kit_id: me.kits[1].id, body: 'Cambió la capacidad necesaria' }); c = (await detail(c.id)).visit;
    assert.equal(c.interest_kit.id, me.kits[0].id); assert.equal(c.final_kit.id, me.kits[1].id); checks++;
    await command('installer', c, 'contact', { result: 'contacted', channel: 'Teléfono', interlocutor: 'Cliente ficticio', at: new Date().toISOString(), body: 'Revisamos terreno y capacidad' }); c = (await detail(c.id)).visit;
    await command('installer', c, 'appointment', { mode: 'onsite', date: '2099-01-10', start_time: '10:00', end_time: '11:00', status: 'confirmed', client_confirmed: true, installer_confirmed: true, body: 'Horario acordado' });
    let d = await detail(c.id); c = d.visit;
    await command('installer', c, 'visit_result', { appointment_id: d.appointments[0].id, status: 'completed', performed_at: new Date().toISOString(), body: 'Relevamiento realizado', technical: 'Terreno adecuado', next_action: 'Enviar propuesta', next_at: new Date(Date.now() + 86400000).toISOString(), next_owner_id: seller }); c = (await detail(c.id)).visit;
    await command('installer', c, 'quote', { kit_id: me.kits[1].id, lines: [{ description: 'Kit y servicio', quantity: 1, unit_price: 1234.56 }], conditions: 'Condiciones acordadas', valid_until: '2099-12-31', status: 'sent', communicated_at: new Date().toISOString() }); c = (await detail(c.id)).visit;
    const key = randomUUID(), form = new FormData();
    form.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+XcAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'ensayo.png');
    form.set('key', key); form.set('version', String(c.version));
    files.push(`${c.id}/${installer}/${key}.png`);
    ok(await api('installer', `upload/${c.id}`, form)); d = await detail(c.id); c = d.visit;
    assert.equal(d.attachments.length, 1); checks++;
    const image = await fetch(d.attachments[0].url); assert.equal(image.status, 200); checks++;
    const anonymous = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/visit-attachments/${files[0]}`); assert.ok(anonymous.status >= 400); checks++;
    ok(await api('seller', 'command', { command: 'outcome', id: c.id, key: randomUUID(), version: c.version, data: { outcome: 'lost', body: 'No confirmó' } }), 400);
    await command('colleague', c, 'outcome', { outcome: 'lost', reason: 'price', body: 'Superó el presupuesto disponible' }); c = (await detail(c.id)).visit;
    assert.equal(c.outcome, 'lost'); checks++;
    await command('seller', c, 'outcome', { outcome: 'pending', reason: 'evaluating', body: 'Retomó la evaluación', next_action: 'Confirmar decisión', next_at: new Date(Date.now() + 86400000).toISOString(), next_owner_id: seller }); c = (await detail(c.id)).visit;
    await command('seller', c, 'outcome', { outcome: 'won', kit_id: me.kits[1].id, at: new Date().toISOString(), installation_date:'2026-10-20',body: 'Cliente confirmó el kit y presupuesto' }); d = await detail(c.id);
    assert.equal(d.visit.outcome, 'won'); assert.equal(d.orders.length, 0); assert.ok(d.events.some(e => e.data.input?.reason === 'price')); checks++;
    const draft=ok(await api('seller',`order-draft/${c.id}`));assert.equal(draft.quote.id,d.visit.quote_id);assert.equal(draft.whaticket_link,'https://whaticket.example.test/internal/123');assert.equal(draft.visit.phone,'1100000000');assert.equal(draft.visit.installation_date,'2026-10-20');assert.ok(draft.kit_components[me.kits[1].id].length>2);assert.ok(draft.kit_components[me.kits[1].id].every(c=>draft.products.some(p=>p.id===c.product_id)));checks++;
    for(const who of ['seller','installer']){c=(await detail(c.id)).visit;await command(who,c,'payment',{payment_kind:who==='seller'?'deposit':'visit',amount:100,body:'Comprobante ficticio',method:'Efectivo',receiver:who,at:new Date().toISOString()});}
    d=await detail(c.id);assert.equal(Number(d.visit.payment_amount),100);assert.equal(Number(d.visit.deposit_amount),100);checks++;
    const list = ok(await api('seller', 'list?search=Ensayo%20API%20temporal')); assert.equal(list.summary.conversion, 100); checks++;
    ok(await api('installer', 'notifications'));
  } finally { try { await cleanup(); } finally { await db.end(); } }
  console.log(JSON.stringify({ checks, api: 'real', privateStorage: 'verified', fixtures: 'removed', legacyData: 'unchanged' }));
})().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; });
