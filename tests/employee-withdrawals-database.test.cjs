const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { PGlite } = require(process.env.OUTLET_PGLITE_MODULE || '../tmp/customer-advance-test-runtime/node_modules/@electric-sql/pglite');
const { columns, triggers } = require('./fixtures/outlet-schema.json');

const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const [admin, seller, logistics, reviewer, employee, otherEmployee, product, order, weeklyOrder] =
  Array.from({ length: 9 }, (_, index) => id(index + 1));

test('employee withdrawals use payroll periods, require authorization, and reconcile delivered value', async () => {
  const db = new PGlite();
  async function as(user) {
    await db.query("select set_config('test.uid',$1,false)", [user]);
  }
  async function save(action, orderId, version, payload) {
    await db.query('select employee_withdrawal_save($1,$2,$3,$4)', [action, orderId, version, JSON.stringify(payload)]);
  }
  async function read(period = null) {
    return (await db.query('select employee_withdrawal_read($1) as data', [period])).rows[0].data;
  }
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      CREATE TABLE public.deliveries(id uuid DEFAULT gen_random_uuid(),order_id uuid UNIQUE,delivery_date date,status text,
        route_sheet_id uuid,real_delivery_date date);
      CREATE TABLE public.employees(id uuid PRIMARY KEY,full_name text,is_active boolean);
    `);
    for (const table of ['products', 'sellers', 'orders', 'order_items', 'inventory_transactions']) {
      const definitions = columns.filter(column => column.table_name === table).map(column => {
        const type = column.data_type === 'ARRAY' ? 'text[]' : column.data_type;
        return `"${column.column_name}" ${type}${column.column_default ? ' DEFAULT ' + column.column_default : ''}${column.is_nullable === 'NO' ? ' NOT NULL' : ''}${column.column_name === 'id' ? ' PRIMARY KEY' : ''}`;
      });
      await db.exec(`CREATE TABLE public.${table}(${definitions.join(',')});`);
    }
    await db.exec(`
      ALTER TABLE public.products ADD COLUMN is_outlet_unit boolean DEFAULT false;
      INSERT INTO public.sellers(id,email,full_name,role,roles,is_active) VALUES
        ('${admin}','admin@example.invalid','Admin','admin','{}',true),
        ('${seller}','sales@example.invalid','Ventas','seller','{}',true),
        ('${logistics}','logistics@example.invalid','Logística','logistica','{}',true),
        ('${reviewer}','people@example.invalid','RR. HH.','administracion','{}',true);
      INSERT INTO public.employees VALUES ('${employee}','Empleado',true),('${otherEmployee}','Otro',true);
      INSERT INTO public.products(id,name,price,category,is_active,stock_current,stock_physical)
        VALUES ('${product}','Escalera',100,'ESCALERAS',true,4,4);
      CREATE FUNCTION public.test_create_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO public.deliveries(order_id,delivery_date,status) VALUES(NEW.id,NEW.initial_delivery_date,'pendiente_ruteo');
        RETURN NEW;
      END; $$;
      CREATE TRIGGER test_create_delivery AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.test_create_delivery();
    `);
    await db.exec(triggers.find(trigger => trigger.proname === 'update_product_stock_levels').body);
    await db.exec('CREATE TRIGGER stock AFTER INSERT OR DELETE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_product_stock_levels();');
    await db.exec(fs.readFileSync('db_migration_v43_sync_order_delivery_status.sql', 'utf8'));
    await db.exec(fs.readFileSync('database/db_migration_20261106_employee_withdrawals.sql', 'utf8'));
    await db.exec(fs.readFileSync('database/db_migration_20261106_employee_withdrawals_operations.sql', 'utf8'));

    await as(admin);
    await save('access', seller, null, { employee_id: employee });
    await save('access', reviewer, null, { can_review: true });
    await as(seller);
    const items = [{ product_id: product, price: 100, quantity: 2 }];
    await assert.rejects(save('create', order, null, { employee_id: otherEmployee, items }), /vinculada/);
    await save('create', order, null, { employee_id: employee, items, category: 'ESCALERAS' });
    await save('create', order, null, { employee_id: employee, items, category: 'ESCALERAS' });
    const loaded = (await read()).orders[0];
    assert.equal(loaded.state, 'pending');
    assert.equal(loaded.amount, 190);
    assert.equal(loaded.discount_rate, 5);
    assert.equal(loaded.discount_amount, 10);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.installments, null);
    await assert.rejects(save('approve', order, 2, {}), /revisión/);
    await assert.rejects(db.query("update orders set status='Entregado' where id=$1", [order]), /Retiros de empleados/);
    await assert.rejects(db.query("update deliveries set status='entregado' where order_id=$1", [order]), /Retiros de empleados/);
    await as(logistics);
    await assert.rejects(save('deliver', order, 2, { item_id: loaded.items[0].id, quantity: 1 }), /autorizado/);

    await as(reviewer);
    const monthly = [
      { cadence: 'monthly', period_start: '2026-10-01', expected_on: '2026-11-06', amount: 95 },
      { cadence: 'monthly', period_start: '2026-11-01', expected_on: '2026-12-06', amount: 95 },
    ];
    await assert.rejects(save('approve', order, 2, { note: 'Acuerdo', installments: monthly }), /Confirmá/);
    await assert.rejects(save('approve', order, 2, { note: 'Acuerdo', installments: monthly.slice(0, 1), period_checked: true }), /sumar/);
    await save('approve', order, 2, { note: 'Acuerdo', installments: monthly, period_checked: true });
    assert.equal((await read('2026-10-01')).orders[0].installments[0].period_end, '2026-10-31');
    const applied = { note: 'Recibo', number: 1, applied_on: '2026-11-06' };
    await assert.rejects(save('apply', order, 3, applied), /efectivamente entregado/);
    const snapshot = (await db.query('select employee_withdrawal_claim_sheet($1) as data', [order])).rows[0].data;
    assert.equal(snapshot.state, 'approved');
    assert.equal(snapshot.agreement, undefined);
    assert.equal(snapshot.installments, undefined);
    assert.equal((await db.query('select employee_withdrawal_finish_sheet($1,$2,$3,true) as synced',
      [order, snapshot.lease, snapshot.version])).rows[0].synced, true);

    await as(logistics);
    await save('deliver', order, 3, { item_id: loaded.items[0].id, quantity: 1 });
    assert.equal((await read()).orders[0].installments, null);
    await as(reviewer);
    await save('apply', order, 4, applied);
    await assert.rejects(save('apply', order, 5, applied), /ya fue aplicada/);
    await save('reschedule', order, 5, { note: 'Cambio de fecha', period_checked: true, installments: [{
      cadence: 'weekly', period_start: '2026-11-04', period_end: '2026-11-10', expected_on: '2026-11-13', amount: 95,
    }] });
    let result = (await read()).orders[0];
    assert.equal(result.installments[0].payroll_reference, 'Recibo');
    assert.equal(result.installments[1].period_end, '2026-11-10');
    await as(logistics);
    await save('refund', order, 6, { item_id: loaded.items[0].id, quantity: 1 });
    await as(reviewer);
    await save('credit', order, 7, { amount: 95, note: 'Reintegro confirmado' });
    await save('cancel', order, 8, { note: 'Devuelto' });
    result = (await read()).orders[0];
    assert.equal(result.state, 'cancelled');
    assert.equal(result.credited_amount, 95);
    assert.equal((await db.query('select stock_current from products where id=$1', [product])).rows[0].stock_current, '4');

    await as(logistics);
    const home = { employee_id: otherEmployee, items, mode: 'home', address: 'Av. Ejemplo 100', locality: 'Morón',
      phone: '1100000000', delivery_date: '2026-11-09' };
    await assert.rejects(save('create', weeklyOrder, null, { ...home, address: '' }), /Completá domicilio/);
    await save('create', weeklyOrder, null, home);
    const route = () => db.query("update deliveries set status='ruteado' where order_id=$1", [weeklyOrder]);
    await assert.rejects(route(), /Retiros de empleados/);
    await as(reviewer);
    await save('approve', weeklyOrder, 2, { note: 'Acuerdo', installments: monthly, period_checked: true });
    assert.deepEqual((await db.query("select address,status,employee_review_status from orders where id=$1", [weeklyOrder])).rows[0],
      { address: home.address, status: 'Pendiente', employee_review_status: 'approved' });
    await as(seller);
    await assert.rejects(route(), /Retiros de empleados/);
    await as(logistics);
    await route();
    await db.query("update orders set status='Entregando' where id=$1", [weeklyOrder]);
    await db.query("update deliveries set status='en_recorrido' where order_id=$1", [weeklyOrder]);
    await assert.rejects(db.query("update deliveries set status='entregado' where order_id=$1", [weeklyOrder]), /Retiros de empleados/);
    await assert.rejects(save('edit', weeklyOrder, 3, home), /Quitá primero/);
    await db.query("update deliveries set status='pendiente_ruteo' where order_id=$1", [weeklyOrder]);
    await db.query("update orders set status='Pendiente' where id=$1", [weeklyOrder]);
    await assert.rejects(save('edit', weeklyOrder, 3, { ...home, discount_rate: 101 }), /entre 0 y 100/);
    await save('edit', weeklyOrder, 3, { ...home, discount_rate: 7.5 });
    assert.equal((await read()).orders[0].state, 'pending');
    assert.equal((await read()).orders[0].amount, 185);
    assert.equal((await read()).orders[0].discount_rate, 7.5);
    const shippedItem = (await read()).orders[0].items[0].id;
    await as(reviewer);
    await save('approve', weeklyOrder, 4, {
      note: 'Acuerdo', installments: monthly.map(quota => ({...quota, amount: 92.5})), period_checked: true,
    });
    await as(logistics);
    await save('deliver', weeklyOrder, 5, { item_id: shippedItem, quantity: 2 });
    const delivered = await db.query('select status,real_delivery_date from deliveries where order_id=$1', [weeklyOrder]);
    assert.equal(delivered.rows[0].status, 'entregado');
    assert.ok(delivered.rows[0].real_delivery_date);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('select * from employee_withdrawal_installments'), /permission denied/);
    await assert.rejects(db.query('select employee_withdrawal_finish_sheet($1,$2,$3,true)',
      [order, snapshot.lease, snapshot.version]), /permission denied/);
    assert.equal((await read()).orders[0].installments, null);
  } finally { await db.close(); }
});
