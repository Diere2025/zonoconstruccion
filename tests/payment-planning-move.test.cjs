const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('a payment moves across dates and funds atomically while keeping its due date', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create table public.sellers(id uuid primary key,email text,role text,roles text[],is_active boolean);
      create table public.suppliers(id uuid primary key);
      create table public.employees(id uuid primary key);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111','admin@example.com');
      insert into public.sellers values ('11111111-1111-4111-8111-111111111111','admin@example.com','admin',array['admin'],true);`);
    await db.exec(fs.readFileSync('database/db_migration_v115_payment_planning.sql', 'utf8'));
    await db.exec(fs.readFileSync('database/db_migration_v117_payment_planning_move.sql', 'utf8'));
    await db.exec(fs.readFileSync('database/db_migration_v118_payment_planning_move_income.sql', 'utf8'));
    await db.exec(fs.readFileSync('database/db_migration_v119_payment_planning_rpc_permissions.sql', 'utf8'));
    const actor = '11111111-1111-4111-8111-111111111111';
    const funds = (await db.query("select id,kind from public.payment_planning_funds order by kind")).rows;
    const cash = funds.find(row => row.kind === 'cash').id;
    const personal = funds.find(row => row.kind === 'personal').id;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const create = (await db.query('select public.payment_planning_mutate($1,$2,$3,$4) as result', [actor,
      '22222222-2222-4222-8222-222222222222','create_item',JSON.stringify({ fund_id:cash,
        kind:'expense',title:'Pago programado',amount:'100.00',scheduled_date:today,due_date:today })])).rows[0].result;
    const move = (payload, key) => db.query('select public.payment_planning_move_item($1,$2,$3) as result', [actor,key,JSON.stringify(payload)]);
    const payload = { id:create.id,version:create.version,scheduled_date:next,fund_id:personal,reason:'Cambio de escenario' };
    const key = '33333333-3333-4333-8333-333333333333';
    const moved = (await move(payload,key)).rows[0].result;
    assert.equal(moved.fund_id,personal);
    assert.equal(moved.scheduled_date,next);
    assert.equal(moved.due_date,today);
    assert.equal(moved.version,create.version+1);
    assert.deepEqual((await move(payload,key)).rows[0].result,moved);
    await assert.rejects(move({ ...payload, scheduled_date:today },key));
    await assert.rejects(move({ ...payload, version:create.version },'44444444-4444-4444-8444-444444444444'));
    assert.equal((await db.query("select count(*)::integer as n from public.payment_planning_events where action='move_item'")).rows[0].n,1);

    await db.query(`insert into public.payment_planning_reservations(fund_id,kind,amount,effective_date,target_item_id,created_by)
      values ($1,'reserve',10,$2,$3,$4)`,[personal,today,create.id,actor]);
    await assert.rejects(move({ id:create.id,version:moved.version,scheduled_date:next,fund_id:cash },'55555555-5555-4555-8555-555555555555'));

    const income = (await db.query('select public.payment_planning_mutate($1,$2,$3,$4) as result', [actor,
      '66666666-6666-4666-8666-666666666666','create_item',JSON.stringify({ fund_id:cash,
        kind:'income',title:'Cobro programado',amount:'75.00',scheduled_date:today,due_date:today })])).rows[0].result;
    const movedIncome = (await move({ id:income.id,version:income.version,scheduled_date:next,fund_id:personal },
      '77777777-7777-4777-8777-777777777777')).rows[0].result;
    assert.equal(movedIncome.fund_id,personal);
    assert.equal(movedIncome.scheduled_date,next);

    await db.query('set role service_role');
    try {
      const noChange = (await move({ id:income.id,version:movedIncome.version,scheduled_date:next,fund_id:personal },
        '88888888-8888-4888-8888-888888888888')).rows[0].result;
      assert.equal(noChange.version,movedIncome.version);
    } finally { await db.query('reset role'); }
  } finally { await db.close(); }
});
