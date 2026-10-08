const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
let checks = 0;
function equal(a, b) { assert.deepEqual(a, b); checks++; }
async function actor(id) { await db.query('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); await db.query('set local role authenticated'); }
async function command(command, c, data, key = randomUUID(), version = c?.version) { return (await db.query('select public.visits_command($1,$2,$3,$4,$5) r', [command, c?.id || null, key, version || null, data])).rows[0].r; }
async function get(id) { return (await db.query('select * from public.visit_cases where id=$1', [id])).rows[0]; }
async function denied(fn, pattern) { await db.query('savepoint rejected'); let rejected = false; try { await fn(); } catch (e) { assert.match(e.message, pattern); rejected = true; checks++; } finally { await db.query('rollback to savepoint rejected'); } assert.ok(rejected, 'Unexpected permission or invalid write accepted'); }
(async () => {
  await db.connect(); await db.query('begin');
  try {
    await db.query("set local lock_timeout='5s'");
    const sql = fs.readFileSync('database/db_migration_v147_visits.sql', 'utf8');
    await db.query(sql); await db.query(sql); const extension=fs.readFileSync('database/db_migration_v148_visits_simple.sql','utf8'); await db.query(extension); await db.query(extension);await db.query(fs.readFileSync('database/db_migration_v149_visits_defaults.sql','utf8'));await db.query(fs.readFileSync('database/db_migration_v150_visits_order.sql','utf8'));await db.query(fs.readFileSync('database/db_migration_v151_visits_extras.sql','utf8'));await db.query(fs.readFileSync('database/db_migration_v153_visits_coordination.sql','utf8'));await db.query(fs.readFileSync('database/db_migration_v154_visits_installation_date.sql','utf8'));await db.query(fs.readFileSync('database/db_migration_v155_visits_deposits.sql','utf8'));checks++;
    const ids = Array.from({ length: 6 }, () => randomUUID());
    const [seller, colleague, installer, otherInstaller, outsider, admin] = ids;
    for (let i = 0; i < ids.length; i++) {
      const role = ['seller', 'seller', 'instalador', 'instalador', 'compras', 'admin'][i];
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [ids[i], `visits-${ids[i]}@example.invalid`]);
      await db.query('insert into public.sellers(id,email,full_name,role,roles,is_active) values($1,$2,$3,$4,$5,true)', [ids[i], `visits-${ids[i]}@example.invalid`, 'Ensayo de visitas', role, [role]]);
    }
    const kits = (await db.query("select id from public.products where is_active is distinct from false and lower(name) like '%kit instalaci%' and lower(name) not like '%adicional%' limit 2")).rows;
    assert.equal(kits.length, 2); checks++;
    const payload = { whaticket_link:'https://whaticket.example.test/tickets/private',customer_name: 'Cliente de ensayo', phone: '1100000000', locality: 'Localidad de ensayo', address: 'Obra ficticia 123', request_reason: 'Instalación de prueba', kit_id: kits[0].id, seller_id: seller, installer_id: installer };
    await actor(seller);
    await denied(() => command('create', null, { ...payload, kit_id: null }), /VISITS_KIT_REQUIRED/);
    await denied(() => command('create', null, { ...payload, installer_id: outsider }), /VISITS_PERSON_INVALID/);
    await db.query('savepoint scheduling');
    for(const scheduling of [{scheduled_date:'',scheduled_time:''},{scheduled_date:'2026-10-15',scheduled_time:''},{scheduled_date:'',scheduled_time:'15:00'},{scheduled_date:'2026-10-15',scheduled_time:'15:00'}]){
      const r=await command('create',null,{...payload,...scheduling});const visit=await get(r.id);equal(visit.requested_date?new Date(visit.requested_date).toISOString().slice(0,10):null,scheduling.scheduled_date || null);equal(visit.requested_time?.slice(0,5) || null,scheduling.scheduled_time || null);equal((await db.query('select count(*)::int n from visit_appointments where case_id=$1',[r.id])).rows[0].n,scheduling.scheduled_date && scheduling.scheduled_time?1:0);
    }
    await db.query('rollback to savepoint scheduling');
    const key = randomUUID(); let created = await command('create', null, payload, key); equal(await command('create', null, payload, key), created);
    await denied(() => command('create', null, { ...payload, phone: 'other' }, key), /VISITS_CONFLICT/);
    let c = await get(created.id); equal(Number(c.visit_fee),50000); equal(c.final_kit, null); equal(c.visit_count, 0);
    const created2 = await command('create', null, { ...payload, customer_name: 'Segundo cliente ficticio' });
    await actor(colleague); equal((await get(c.id)).id, c.id);
    await actor(otherInstaller); equal(await get(c.id), undefined);
    await denied(() => command('note', c, { body: 'No debería entrar' }), /VISITS_NOT_FOUND/);
    await actor(outsider); await denied(() => db.query('select public.visits_session()'), /VISITS_FORBIDDEN/);
    await actor(installer); equal((await get(c.id)).id, c.id); equal((await db.query('select count(*)::int n from public.visit_commercial_data where case_id=$1',[c.id])).rows[0].n,0);equal((await db.query('select count(*)::int n from public.visit_events where case_id=$1 and data::text like $2',[c.id,'%whaticket.example%'])).rows[0].n,0);
    await db.query("select set_config('request.path','/rpc/visits_session',true)"); await db.query('select public.visits_rest_guard()'); checks++;
    for (const path of ['/rpc/process_order','/cash_transactions','/clients','/orders','/rpc/financial_operations_command']) {
      await db.query("select set_config('request.path',$1,true)", [path]);
      await denied(() => db.query('select public.visits_rest_guard()'), /VISITS_FORBIDDEN/);
    }
    await denied(() => command('create', null, payload), /VISITS_FORBIDDEN/);
    await denied(() => command('outcome', c, { outcome: 'won' }), /VISITS_FORBIDDEN/);
    for (const table of ['clients', 'orders', 'cash_transactions']) equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n, 0);
    await denied(() => db.query("insert into public.cash_transactions(type,amount) values('income',1)"), /row-level security|not-null constraint/);
    await denied(() => db.query("update public.visit_cases set outcome='won' where id=$1", [c.id]), /permission denied/);
    await denied(() => command('kit', c, { kit_id: kits[1].id }), /VISITS_KIT_REASON/);
    await command('kit', c, { kit_id: kits[1].id, body: 'Se necesita otra capacidad' });
    const stale = c; c = await get(c.id); equal(c.interest_kit.id, kits[0].id); equal(c.final_kit.id, kits[1].id); equal(c.outcome, 'pending');
    await denied(() => command('note', stale, { body: 'Versión anterior' }), /VISITS_CONFLICT/);
    await command('contact', c, { result: 'contacted', channel: 'Teléfono', interlocutor: 'Cliente', at: new Date().toISOString(), body: 'Hablamos del kit y del acceso' }); c = await get(c.id);
    await command('contact', c, { result: 'attempted', channel: 'Teléfono', interlocutor: 'Cliente', at: new Date().toISOString(), body: 'Segundo intento sin respuesta' }); c = await get(c.id); equal(c.contact_status, 'contacted');
    const appointment = { mode: 'onsite', date: '2026-10-10', start_time: '10:00', end_time: '11:00', status: 'confirmed', client_confirmed: true, installer_confirmed: true, body: 'Acuerdo registrado' };
    await denied(() => command('appointment', c, { ...appointment, client_confirmed: false }), /VISITS_CONFIRM_REQUIRED/);
    await command('appointment', c, appointment); c = await get(c.id);
    const ap = (await db.query('select * from public.visit_appointments where case_id=$1', [c.id])).rows[0];
    let second = await get(created2.id); await denied(() => command('appointment', second, appointment), /VISITS_SCHEDULE_CONFLICT/);
    await command('appointment', c, { ...appointment, appointment_id: ap.id, start_time: '11:00', end_time: '12:00', body: 'Cliente pidió cambio de hora' }); c = await get(c.id);
    equal((await db.query("select data->'input'->'previous'->>'start_time' previous from public.visit_events where case_id=$1 and kind='appointment' order by created_at desc,id desc limit 1", [c.id])).rows[0].previous, '10:00:00');
    await actor(seller); await denied(() => command('assign', c, { seller_id: seller, installer_id: otherInstaller }), /VISITS_REASSIGN_SCHEDULE/);
    await actor(installer);
    await denied(() => command('visit_result', c, { appointment_id: ap.id, status: 'completed', body: 'Visitado', performed_at: new Date().toISOString(), next_action: 'Enviar presupuesto', next_at: new Date(Date.now() + 86400000).toISOString(), next_owner_id: outsider }), /VISITS_FOLLOWUP_REQUIRED/);
    await command('visit_result', c, { appointment_id: ap.id, status: 'completed', body: 'Visitado, cliente evalúa el kit', performed_at: new Date().toISOString(), technical: 'Terreno adecuado, un caño extra', next_action: 'Enviar presupuesto', next_at: new Date(Date.now() + 86400000).toISOString(), next_owner_id: seller }); c = await get(c.id); equal(c.visit_count, 1);
    await denied(() => command('visit_result', c, { appointment_id: ap.id, status: 'completed', body: 'Duplicado' }), /VISITS_INVALID/);
    const quote = { kit_id: kits[1].id, lines: [{ description: 'Kit y servicio', quantity: 1, unit_price: 1000 }, { description: 'Adicional', quantity: 1.5, unit_price: 100.15 }], conditions: 'Pago acordado', exclusions: 'Extras aparte', valid_until: '2099-12-31', status: 'sent', communicated_at: new Date().toISOString() };
    await denied(() => command('quote', c, { ...quote, lines: [{ description: 'Mal', quantity: 1, unit_price: -1 }] }), /VISITS_INVALID/);
    await command('quote', c, quote); c = await get(c.id); equal(Number(c.quote_amount), 1150.23);
    const oldQuote = c.quote_id;
    await command('quote', c, { ...quote, lines: [{ description: 'Revisión', quantity: 1, unit_price: 1200 }] }); c = await get(c.id);
    equal((await db.query('select total::float8 total,status from public.visit_quotes where id=$1', [oldQuote])).rows[0], { total: 1150.23, status: 'replaced' });
    await actor(seller);
    const syntheticOrder=randomUUID();
    await denied(()=>db.query("insert into public.orders(id,seller_id,created_by_id,initial_delivery_date,max_delivery_date,customer_name,locality,address,freight_type,source_visit_id,source_visit_quote_id) values($1,$2,$2,current_date,current_date,'Cliente ficticio','Lugar ficticio','Obra ficticia','Regular',$3,$4)",[syntheticOrder,seller,c.id,c.quote_id]),/VISITS_QUOTE_ACCEPTED_REQUIRED/);
    await command('quote_status',c,{quote_id:c.quote_id,status:'accepted',body:'Aceptación de ensayo'});c=await get(c.id);
    await db.query('reset role');await db.query('set local role service_role');
    await db.query("insert into public.orders(id,seller_id,created_by_id,initial_delivery_date,max_delivery_date,customer_name,locality,address,freight_type,source_visit_id,source_visit_quote_id) values($1,$2,$2,current_date,current_date,'Cliente ficticio','Lugar ficticio','Obra ficticia','Regular',$3,$4)",[syntheticOrder,seller,c.id,c.quote_id]);
    await actor(seller);
    equal((await db.query('select order_id from public.visit_order_links where case_id=$1',[c.id])).rows[0].order_id,syntheticOrder);c=await get(c.id);
    await denied(()=>db.query("insert into public.orders(seller_id,created_by_id,initial_delivery_date,max_delivery_date,customer_name,locality,address,freight_type,source_visit_id,source_visit_quote_id) values($1,$1,current_date,current_date,'Duplicado','Lugar','Obra','Regular',$2,$3)",[seller,c.id,c.quote_id]),/VISITS_ORDER_EXISTS/);
    await db.query('reset role');await db.query('delete from public.orders where id=$1',[syntheticOrder]);
    await actor(colleague); await denied(() => command('outcome', c, { outcome: 'lost', body: 'No cerró' }), /VISITS_LOSS_REQUIRED/);
    await denied(() => command('outcome', c, { outcome: 'pending', reason: 'response', body: 'Pendiente' }), /VISITS_FOLLOWUP_REQUIRED/);
    await command('outcome', c, { outcome: 'lost', reason: 'price', body: 'Cliente indicó que excede su presupuesto' }); c = await get(c.id); equal(c.outcome, 'lost');
    await denied(() => command('kit', c, { kit_id: kits[0].id, body: 'Cambiar sin reabrir' }), /VISITS_REOPEN_REQUIRED/);
    await command('outcome', c, { outcome: 'pending', reason: 'evaluating', body: 'Retoma evaluación', next_action: 'Contactar', next_at: new Date().toISOString(), next_owner_id: seller }); c = await get(c.id);
    await denied(() => command('outcome', c, { outcome: 'won', kit_id: kits[0].id, at: new Date().toISOString(), body: 'Confirma' }), /VISITS_QUOTE_REVIEW/);
    await command('outcome', c, { outcome: 'won', kit_id: kits[1].id, at: new Date().toISOString(), installation_date:'2026-10-20',body: 'Cliente confirmó por WhatsApp el kit y presupuesto' }); c = await get(c.id); equal(c.outcome, 'won'); equal(c.quote_status, 'accepted');equal(new Date(c.installation_date).toISOString().slice(0,10),'2026-10-20');
    const stats = (await db.query("select public.visits_list($1,0) r", [{ search: 'Cliente de ensayo' }])).rows[0].r;
    equal(stats.summary.won, 1); equal(stats.summary.opportunities, 1); equal(stats.summary.conversion, 100);
    equal((await db.query("select count(*)::int n from public.visit_events where case_id=$1 and kind='outcome' and data->'input'->>'outcome'='lost'", [c.id])).rows[0].n, 1);
    await actor(installer); const notifications = (await db.query('select public.visits_read_notifications() r')).rows[0].r; assert.ok(notifications.some(n => n.case_id === c.id)); checks++;
    await actor(installer);
    await command('extras', c, {extras:'Caño adicional y bomba'}); c=await get(c.id); equal(c.extras,'Caño adicional y bomba');await command('extras',c,{extras:'',extras_products:[{code:'additional',quantity:4},{code:'termination',quantity:1}]});c=await get(c.id);equal(c.extras_products[0].quantity,4);equal(Number(c.extras_products[0].unit_price),30000);await denied(()=>command('extras',c,{extras_products:[{code:'arbitrary',quantity:1}]}),/VISITS_INVALID/);await denied(()=>command('extras',c,{extras_products:[{quantity:1}]}),/VISITS_INVALID/);
    const customCase=await get(created2.id);
    await command('quote',customCase,{...quote,kit_id:'other',custom_kit:'Kit especial de ensayo'}); const customQuoted=await get(customCase.id);
    equal((await db.query('select kit from public.visit_quotes where id=$1',[customQuoted.quote_id])).rows[0].kit.custom,true);
    await actor(colleague); await command('outcome',customQuoted,{outcome:'won',kit_id:'other',custom_kit:'Kit especial de ensayo',at:new Date().toISOString(),body:'Confirma kit especial'}); equal((await get(customCase.id)).final_kit.name,'Kit especial de ensayo');
    await actor(seller); const scheduled=await command('create',null,{...payload,scheduled_date:'2099-01-02',scheduled_time:'10:00',initial_installation_amount:1650000,visit_fee:50000,discount_visit_fee:true});
    equal(Number((await get(scheduled.id)).visit_fee),50000);equal((await db.query('select status from public.visit_appointments where case_id=$1',[scheduled.id])).rows[0].status,'proposed');
    const session=(await db.query('select public.visits_session() r')).rows[0].r;equal(session.kits.some(k=>/500L/.test(k.name)),true);
    await denied(()=>command('create',null,{...payload,seller_id:colleague}),/VISITS_PERSON_INVALID/);
    await actor(installer); const slotKey=randomUUID();const slot={installer_id:installer,kind:'available',date:'2099-01-03',start_time:'09:00',end_time:'18:00',title:'Disponible'};
    equal((await db.query('select public.visits_save_slot($1,$2) id',[slotKey,slot])).rows[0].id,slotKey);equal((await db.query('select public.visits_save_slot($1,$2) id',[slotKey,slot])).rows[0].id,slotKey);
    await denied(()=>db.query('select public.visits_save_slot($1,$2)',[randomUUID(),{...slot,installer_id:otherInstaller}]),/VISITS_FORBIDDEN/);
    await db.query('select public.visits_save_slot($1,$2)',[randomUUID(),{...slot,kind:'installation',date:'2099-01-04',title:'Instalación de ensayo'}]);
    await denied(()=>db.query('select public.visits_save_slot($1,$2)',[randomUUID(),{...slot,kind:'blocked',date:'2099-01-04'}]),/VISITS_SCHEDULE_CONFLICT/);
    await actor(otherInstaller); equal((await db.query('select count(*)::int n from public.visit_slots where id=$1',[slotKey])).rows[0].n,0);
    await denied(()=>command('payment',c,{amount:1,body:'Sin acceso',method:'Efectivo',receiver:'Ensayo',at:new Date().toISOString()}),/VISITS_NOT_FOUND/);
    for(const role of [seller,installer]){await actor(role);c=await get(c.id);for(const payment_kind of ['visit','deposit']){const old=await get(c.id);await command('payment',c,{payment_kind,amount:100,body:'Ensayo reversible',method:'Efectivo',receiver:'Ensayo',at:new Date().toISOString()});c=await get(c.id);equal(Number(c.payment_amount),Number(old.payment_amount)+(payment_kind==='visit'?100:0));equal(Number(c.deposit_amount),Number(old.deposit_amount)+(payment_kind==='deposit'?100:0));}}
    await actor(admin); equal((await get(c.id)).id, c.id);
    await db.query("select set_config('request.path','/cash_transactions',true)"); await db.query('select public.visits_rest_guard()'); checks++;
    await db.query('reset role'); await db.query('update public.sellers set is_active=false where id=$1', [installer]); await actor(installer); await denied(() => db.query('select public.visits_session()'), /VISITS_FORBIDDEN/);
    await db.query('reset role');
    // No fixtures or migration changes are committed. --apply is intentionally unsupported.
    await db.query('rollback');
    console.log(JSON.stringify({ checks, migration: 'v147-v155 tested and rolled back', syntheticData: 'rolled back', productionData: 'unchanged' }));
  } catch (error) { await db.query('rollback'); throw error; } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; });
