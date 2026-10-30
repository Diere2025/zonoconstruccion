const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

test('migration is additive and idempotent; updating a reusable destination preserves historical snapshots', async () => {
  const { PGlite } = require(process.env.PGLITE_MODULE || require.resolve('@electric-sql/pglite', {
    paths: [path.resolve('.codex-tmp/supplier-account-check'), path.resolve('tmp/customer-advance-test-runtime')]
  }));
  const db = new PGlite();
  try {
    await db.exec(`create table addresses(id uuid primary key, client_id uuid, alias text not null, full_address text not null, locality_id uuid, is_default boolean default false);
      create table orders(id uuid primary key, shipping_address_snapshot jsonb, delivery_detail text);`);
    const home = randomUUID(), saved = randomUUID(), client = randomUUID(), order = randomUUID();
    await db.query('insert into addresses(id, client_id, alias, full_address, is_default) values($1,$2,$3,$4,true)', [home, client, 'Principal', 'Mitre 540']);
    const sql = fs.readFileSync('database/db_migration_20261029_via_cargo.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const destination = { name: 'Ana Pérez', postal_code: '5000', locality: 'Córdoba', mode: 'pending' };
    await db.query('insert into addresses(id,client_id,alias,full_address,postal_code,via_cargo) values($1,$2,$3,$4,$5,$6)', [saved, client, 'Vía Cargo', 'A definir', '5000', destination]);
    await db.query('insert into orders values($1,$2,$3)', [order, { via_cargo: destination, via_destination_id: saved }, 'VÍA CARGO — A DEFINIR']);
    await db.query('update addresses set via_cargo=$1,postal_code=$2 where id=$3 and client_id=$4', [{ ...destination, name: 'Otro destinatario', postal_code: '5100' }, '5100', saved, client]);
    const historical = (await db.query('select shipping_address_snapshot from orders where id=$1', [order])).rows[0].shipping_address_snapshot;
    assert.equal(historical.via_cargo.name, 'Ana Pérez');
    assert.equal(historical.via_cargo.postal_code, '5000');
    const normal = (await db.query('select * from addresses where client_id=$1 and via_cargo is null', [client])).rows;
    assert.equal(normal.length, 1);
    assert.equal(normal[0].full_address, 'Mitre 540');
    assert.equal(normal[0].is_default, true);
    assert.equal(normal[0].postal_code, null);
  } finally { await db.close(); }
});
