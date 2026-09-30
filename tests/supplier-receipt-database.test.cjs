// npm install --no-save --package-lock=false --prefix .codex-tmp/supplier-account-check @electric-sql/pglite
// node tests/supplier-receipt-database.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [path.resolve('.codex-tmp/supplier-account-check')] }));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const read = name => fs.readFileSync(name, 'utf8');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.suppliers(id uuid primary key, name text);
      create table public.products(id uuid primary key,name text,sku text,is_discontinued boolean default false,stock_physical numeric default 0,stock_current numeric default 0,stock_reserved numeric default 0);
      create table public.inventory_transactions(id uuid default gen_random_uuid() primary key,product_id uuid references public.products,quantity numeric,type text,reference_id uuid,user_id uuid,created_at timestamptz default now());
      create table public.cash_transactions(id uuid primary key,concept text,created_at timestamptz);
      insert into auth.users values('${id(1)}');
      insert into public.suppliers values('${id(2)}','Proveedor'),('${id(3)}','Otro');
      insert into public.products(id,name) values('${id(4)}','Producto');
    `);
    await db.exec(read('database/db_migration_v60_purchase_orders_schema.sql'));
    await db.exec(read('database/db_migration_v63_purchase_orders_status_recalculate.sql'));
    // Execute the existing inventory function and its INSERT/DELETE trigger.
    const stock = read('database/db_migration_v57_delivery_tracking.sql');
    const stockStart = stock.indexOf('CREATE OR REPLACE FUNCTION public.update_product_stock_levels');
    await db.exec(stock.slice(stockStart, stock.indexOf('-- 3.', stockStart)));
    await db.exec(`
      create table public.supplier_purchases(id uuid primary key default gen_random_uuid(),supplier_id uuid references suppliers,invoice_number text not null,purchase_date timestamptz,created_at timestamptz default now(),total_amount numeric not null check(total_amount>=0),paid_amount numeric default 0,currency text,status text,document_type text,purchase_order_id uuid references purchase_orders,purchase_reception_id uuid references purchase_receptions,notes text,created_by uuid references auth.users);
      create table public.supplier_payments(id uuid primary key default gen_random_uuid(),supplier_id uuid references suppliers,amount numeric,currency text,cash_transaction_id uuid references cash_transactions,notes text,created_at timestamptz default now());
      insert into purchase_orders(id,oc_code,supplier_id) values('${id(5)}','OC-TEST','${id(2)}');
      insert into purchase_order_items(id,purchase_order_id,product_id,raw_product_name,quantity_ordered,quantity_received,unit_cost,subtotal) values('${id(6)}','${id(5)}','${id(4)}','Producto',10,0,12,120);
      insert into purchase_orders(id,oc_code,supplier_id) values('${id(7)}','OC-LEGACY','${id(2)}');
      insert into purchase_order_items(id,purchase_order_id,product_id,raw_product_name,quantity_ordered,quantity_received,unit_cost,subtotal) values('${id(8)}','${id(7)}','${id(4)}','Producto',10,4,12,120);
    `);
    await db.exec(read('database/db_migration_v112_supplier_account_start.sql'));
    await db.exec(read('database/db_migration_v113_supplier_receipt_debt.sql'));
    await db.exec(read('database/db_migration_v114_supplier_circuit_guard.sql'));
    async function receipt(n, quantity, stock = false, extras = {}) {
      const options = { po: id(5), line: id(6), supplier: id(2), product: id(4), close: false, slip: `R-${n}`, ...extras };
      return db.query('select register_supplier_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)', [id(n), options.supplier, options.po, options.slip, '2026-09-29', 'ARS', stock, options.close, 'Prueba', JSON.stringify([{ poItemId: options.line, productId: options.product, productName: 'Producto', quantity, unitCost: 12 }]), id(1)]);
    }
    const row = async sql => (await db.query(sql)).rows[0];
    await receipt(10, 4);
    assert.equal((await row(`select count(*)::int n from purchase_reception_items where purchase_reception_id='${id(10)}'`)).n, 1);
    assert.equal(Number((await row(`select stock_physical from products where id='${id(4)}'`)).stock_physical), 0);
    await receipt(11, 6, true);
    assert.equal(Number((await row(`select quantity_received from purchase_order_items where id='${id(6)}'`)).quantity_received), 10);
    assert.equal((await row(`select status from purchase_orders where id='${id(5)}'`)).status, 'Cumplido');
    assert.equal(Number((await row(`select stock_physical from products where id='${id(4)}'`)).stock_physical), 6);
    assert.equal(Number((await row(`select sum(total_amount) total from supplier_purchases`)).total), 120);
    await receipt(11, 6, true);
    assert.equal((await row('select count(*)::int n from supplier_purchases')).n, 2, 'Retry cannot duplicate debt');
    await assert.rejects(receipt(11, 5, true), /otros datos/);
    await assert.rejects(db.exec(`insert into supplier_purchases(supplier_id,invoice_number,purchase_date,total_amount,currency,status,document_type,purchase_reception_id,created_by) values('${id(2)}','DUP','2026-09-29',48,'ARS','Pendiente','Factura','${id(10)}','${id(1)}')`), /ya generó deuda/);
    await assert.rejects(receipt(12, 1, false, { slip: 'R-10' }), /ya está registrado/);
    await assert.rejects(receipt(13, 1, false, { supplier: id(3), po: id(7), line: id(8) }), /OC no disponible/);
    await assert.rejects(receipt(14, 7, true, { po: id(7), line: id(8) }), /supera la cantidad pendiente/);
    assert.equal((await row(`select count(*)::int n from purchase_receptions where id='${id(14)}'`)).n, 0, 'Failed receipt rolls back its header');
    await receipt(15, 6, true, { po: id(7), line: id(8) });
    assert.equal(Number((await row(`select quantity_received from purchase_order_items where id='${id(8)}'`)).quantity_received), 10, 'Legacy administrative quantities survive later receipts');
    await receipt(16, 2, false, { po: null, line: null, product: null });
    await assert.rejects(receipt(17, 2, true, { po: null, line: null, product: null }), /Vinculá el artículo/);
    await db.exec(`
      insert into purchase_orders(id,oc_code,supplier_id) values('${id(20)}','OC-CLOSE','${id(2)}');
      insert into purchase_order_items(id,purchase_order_id,product_id,raw_product_name,quantity_ordered,unit_cost,subtotal) values('${id(21)}','${id(20)}','${id(4)}','Producto',10,12,120);
    `);
    await receipt(22, 3, false, { po: id(20), line: id(21), close: true });
    const closed = await row(`select quantity_ordered,quantity_received,shortfall_closed,status from purchase_order_items where id='${id(21)}'`);
    assert.equal(Number(closed.quantity_ordered), 10);
    assert.equal(Number(closed.quantity_received), 3);
    assert.equal(closed.shortfall_closed, true);
    assert.equal((await row(`select status from purchase_orders where id='${id(20)}'`)).status, 'Cumplido');
    // Opening date ignores old debt and uses cash movement date for reconciled payments.
    await db.exec(`
      insert into supplier_account_starts values('${id(2)}','2026-09-29',25,-10,'Inicio','${id(1)}',now());
      insert into supplier_purchases(id,supplier_id,invoice_number,purchase_date,total_amount,currency,status,document_type,created_by) values('${id(30)}','${id(2)}','OLD','2026-09-28 12:00:00-03',100,'ARS','Pendiente','Factura','${id(1)}');
      insert into cash_transactions values('${id(31)}','Pago anterior','2026-09-28 12:00:00-03');
      insert into supplier_payments(id,supplier_id,amount,currency,cash_transaction_id,created_at) values('${id(32)}','${id(2)}',40,'ARS','${id(31)}','2026-09-30 12:00:00-03');
    `);
    let balance = await row(`select * from get_supplier_account_balances() where id='${id(2)}'`);
    assert.equal(Number(balance.balance_ars), 277);
    assert.equal(Number(balance.balance_usd), -10);
    assert.equal((await row(`select entry_date::text from supplier_account_entries where source_id='${id(32)}'`)).entry_date, '2026-09-28');
    await db.exec(`insert into supplier_account_history values('${id(2)}','purchase','${id(30)}',true,'Agregar deuda previa','${id(1)}',now());`);
    balance = await row(`select * from get_supplier_account_balances() where id='${id(2)}'`);
    assert.equal(Number(balance.balance_ars), 377);
    await db.exec(`update supplier_account_history set included=false where source_id='${id(30)}';`);
    assert.equal(Number((await row(`select * from get_supplier_account_balances() where id='${id(2)}'`)).balance_ars), 277);
    assert.equal((await row('select count(*)::int n from supplier_account_audit')).n, 3);
    assert.equal(Number((await row(`select * from get_supplier_account_balances() where id='${id(3)}'`)).balance_ars), 0);
    const permissions = await row(`select has_function_privilege('authenticated','register_supplier_receipt(uuid,uuid,uuid,text,date,text,boolean,boolean,text,jsonb,uuid)','execute') allowed`);
    assert.equal(permissions.allowed, false);
    await db.exec('grant insert on public.supplier_purchases, public.purchase_receptions to authenticated; grant update, select on public.supplier_purchases to authenticated; set role authenticated;');
    try {
      await assert.rejects(db.exec(`insert into public.supplier_purchases(supplier_id,invoice_number,purchase_date,total_amount,currency,status,document_type,created_by)
        values('${id(2)}','NEW-DIRECT','2026-09-29',100,'ARS','Pendiente','Factura','${id(1)}')`), /registrá la recepción/);
      await assert.rejects(db.exec(`insert into public.purchase_receptions(supplier_id,reception_date,created_by)
        values('${id(2)}','2026-09-29','${id(1)}')`), /formulario actualizado/);
      await assert.rejects(db.exec(`update public.supplier_purchases set status='Anulado' where purchase_reception_id='${id(10)}'`), /no se puede desvincular/);
      await db.exec(`insert into public.supplier_purchases(supplier_id,invoice_number,purchase_date,total_amount,currency,status,document_type,created_by)
        values('${id(2)}','OLD-RECONCILE','2026-09-28',15,'ARS','Pendiente','Factura','${id(1)}')`);
    } finally { await db.exec('reset role'); }
    console.log('PostgreSQL migrations, atomic debt/receipt, mixed stock, legacy quantities, closure, cutover, reconciliation, audit and permissions: OK');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
