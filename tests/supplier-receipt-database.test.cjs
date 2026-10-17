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
    await db.exec(read('database/db_migration_v168_multi_order_receipts.sql'));
    await db.exec(`
      insert into purchase_orders(id,oc_code,supplier_id) values ('${id(40)}','OC-MULTI-A','${id(2)}'),('${id(42)}','OC-MULTI-B','${id(2)}'),('${id(44)}','OC-OTHER','${id(3)}'),('${id(46)}','OC-CLOSE-A','${id(2)}'),('${id(48)}','OC-CLOSE-B','${id(2)}');
      insert into purchase_order_items(id,purchase_order_id,product_id,raw_product_name,quantity_ordered,unit_cost,subtotal) values
        ('${id(41)}','${id(40)}','${id(4)}','SKU-COMPARTIDO',4,12,48),('${id(43)}','${id(42)}','${id(4)}','SKU-COMPARTIDO',6,12,72),
        ('${id(45)}','${id(44)}','${id(4)}','SKU-COMPARTIDO',4,12,48),('${id(47)}','${id(46)}','${id(4)}','SKU-COMPARTIDO',4,12,48),('${id(49)}','${id(48)}','${id(4)}','SKU-COMPARTIDO',4,12,48);
    `);
    const multi = (number, pos, items, stock=false, close=false) => db.query('select register_supplier_receipt_multi($1,$2,$3::uuid[],$4,$5,$6,$7,$8,$9,$10::jsonb,$11)',
      [id(number),id(2),pos.map(id),'MULTI-'+number,'2026-10-09','ARS',stock,close,'Un envío',JSON.stringify(items.map(([line,quantity])=>({poItemId:id(line),productId:id(4),productName:'SKU-COMPARTIDO',quantity,unitCost:12}))),id(1)]);
    const beforeStock = Number((await row(`select stock_physical from products where id='${id(4)}'`)).stock_physical);
    await multi(50,[40,42],[[41,2],[43,6]]);
    assert.equal((await row(`select count(*)::int n from supplier_purchases where purchase_reception_id='${id(50)}'`)).n,1,'Two orders produce one payable');
    assert.equal(Number((await row(`select total_amount from supplier_purchases where purchase_reception_id='${id(50)}'`)).total_amount),96);
    assert.equal((await row(`select purchase_order_id from purchase_receptions where id='${id(50)}'`)).purchase_order_id,null);
    assert.equal((await row(`select count(*)::int n from purchase_reception_orders where purchase_reception_id='${id(50)}'`)).n,2);
    assert.equal((await row(`select status from purchase_orders where id='${id(40)}'`)).status,'Parcial');
    assert.equal((await row(`select status from purchase_orders where id='${id(42)}'`)).status,'Cumplido');
    assert.equal(Number((await row(`select stock_physical from products where id='${id(4)}'`)).stock_physical),beforeStock);
    await multi(50,[42,40],[[41,2],[43,6]]);
    assert.equal((await row(`select count(*)::int n from purchase_reception_items where purchase_reception_id='${id(50)}'`)).n,2,'Retry keeps exactly two source lines');
    await assert.rejects(multi(51,[40,44],[[41,1],[45,1]]),/otro proveedor/);
    await assert.rejects(multi(52,[40],[[43,1]]),/Artículo ajeno/);
    await assert.rejects(multi(53,[40],[[41,3]]),/supera la cantidad pendiente/);
    assert.equal((await row(`select count(*)::int n from purchase_receptions where id in ('${id(51)}','${id(52)}','${id(53)}')`)).n,0,'Rejected multi-order receipts leave no header/debt');
    await multi(54,[46,48],[[47,2],[49,3]],true,true);
    assert.equal(Number((await row(`select stock_physical from products where id='${id(4)}'`)).stock_physical),beforeStock+5,'Shared SKU sums stock only once');
    assert.equal((await row(`select count(*)::int n from inventory_transactions where reference_id='${id(54)}'`)).n,1);
    assert.equal((await row(`select count(*)::int n from purchase_orders where id in ('${id(46)}','${id(48)}') and status='Cumplido'`)).n,2);
    assert.equal((await row(`select shortfall_closed from purchase_order_items where id='${id(41)}'`)).shortfall_closed,false,'Closing affects selected orders only');
    assert.equal((await row(`select has_function_privilege('authenticated','register_supplier_receipt_multi(uuid,uuid,uuid[],text,date,text,boolean,boolean,text,jsonb,uuid)','execute') allowed`)).allowed,false);
    await db.exec(read('database/db_migration_v219_supplier_bill_reconciliation.sql'));
    const receiptLine = async n => (await row(`select id from purchase_reception_items where purchase_reception_id='${id(n)}' order by id limit 1`)).id;
    const item10=await receiptLine(10),item11=await receiptLine(11);
    const billPayload=(n,lines,extra={})=>({id:id(n),requestId:id(n+1000),version:0,supplierId:id(2),number:`FC-${n}`,date:'2026-10-17',dueDate:'2026-10-30',type:'Factura',currency:'ARS',perceptionsBa:0,perceptionsCaba:0,perceptionsOther:0,declaredTotal:lines.reduce((s,l)=>s+l.quantity*l.unitPrice,0),notes:'Prueba',resolution:'',confirm:false,lines,...extra});
    const line=(receiptItemId,quantity,unitPrice=12,vat=0)=>({receiptItemId,quantity,unitPrice,discount:0,vat});
    const saveBill=payload=>db.query('select save_supplier_bill($1::jsonb,$2)',[JSON.stringify(payload),id(1)]);
    const debt10=async()=>Number((await row(`select total_amount from supplier_purchases where purchase_reception_id='${id(10)}'`)).total_amount);
    const inventoryBefore=await row(`select count(*)::int n from inventory_transactions`);
    const purchaseCount=await row(`select count(*)::int n from supplier_purchases`);
    const draft=billPayload(100,[line(item10,2,13,21)],{declaredTotal:33.46,perceptionsBa:2});
    await saveBill(draft);
    assert.equal((await row(`select status from supplier_bills where id='${id(100)}'`)).status,'Con diferencias');
    assert.equal(await debt10(),48,'Draft must not change the receipt debt');
    const confirm={...draft,requestId:id(1101),version:1,confirm:true};
    await assert.rejects(saveBill(confirm),/Anotá cómo se resolvieron/);
    assert.equal((await row(`select version from supplier_bills where id='${id(100)}'`)).version,1,'Rejected confirmation rolls back all changes');
    confirm.resolution='Precio nuevo aceptado por Compras';await saveBill(confirm);
    assert.equal(await debt10(),57.46,'Only the confirmed difference regularizes existing debt');
    await saveBill(confirm);assert.equal(await debt10(),57.46,'Retry does not add another adjustment');
    await assert.rejects(saveBill({...confirm,declaredTotal:40}),/otros datos/);
    await assert.rejects(saveBill({...confirm,requestId:id(1102)}),/cambió/);
    assert.equal((await row('select count(*)::int n from supplier_purchases')).n,purchaseCount.n,'Invoice never adds a second payable');
    assert.equal((await row('select count(*)::int n from inventory_transactions')).n,inventoryBefore.n,'Invoice never changes inventory');
    assert.equal(Number((await row(`select unit_cost from purchase_order_items where id='${id(6)}'`)).unit_cost),12,'Agreed price stays unchanged');
    const combined=billPayload(102,[line(item10,2),line(item11,3)],{confirm:true});await saveBill(combined);
    assert.equal((await row(`select count(distinct i.purchase_reception_id)::int n from supplier_bill_lines l join purchase_reception_items i on i.id=l.receipt_item_id where bill_id='${id(102)}'`)).n,2,'One invoice groups several receipts');
    await assert.rejects(saveBill(billPayload(103,[line(item10,1)])),/supera lo recibido/);
    await assert.rejects(saveBill(billPayload(104,[line(item11,1)],{supplierId:id(3)})),/ajeno al proveedor/);
    await assert.rejects(saveBill(billPayload(105,[line(item11,1)],{currency:'USD'})),/moneda/);
    await assert.rejects(saveBill(billPayload(106,[line(item11,1)],{number:'FC-102'})),/duplicate key/);
    await assert.rejects(saveBill(billPayload(107,[line(item11,1),line(item11,1)])),/repetida/);
    const voidBill={id:id(100),supplierId:id(2),requestId:id(1200),version:2,void:true,resolution:'Proveedor rectificó el comprobante'};
    await db.exec(`update supplier_purchases set paid_amount=55 where purchase_reception_id='${id(10)}'`);
    await assert.rejects(saveBill(voidBill),/pago excedente/);
    assert.equal((await row(`select status from supplier_bills where id='${id(100)}'`)).status,'Conciliado','Failed reversal preserves invoice and debt');
    await db.exec(`update supplier_purchases set paid_amount=0 where purchase_reception_id='${id(10)}'`);
    await saveBill(voidBill);assert.equal(await debt10(),48,'Voiding restores the original receipt value');
    await saveBill(voidBill);assert.equal(await debt10(),48);
    await saveBill(billPayload(108,[line(item10,2)],{confirm:true}));
    await db.query('select register_supplier_receipt($1,$2,null,$3,$4,$5,false,false,$6,$7::jsonb,$8)',[id(150),id(2),'R-FRACTION','2026-10-17','ARS','Redondeo',JSON.stringify([{productName:'Fracción',quantity:.2,unitCost:.05}]),id(1)]);
    const fraction=await receiptLine(150);
    await saveBill(billPayload(151,[line(fraction,.1,.05)],{confirm:true,declaredTotal:.01}));
    await saveBill(billPayload(152,[line(fraction,.1,.05)],{confirm:true,declaredTotal:.01}));
    assert.equal(Number((await row(`select total_amount from supplier_purchases where purchase_reception_id='${id(150)}'`)).total_amount),.02,'Fully billed receipt equals exact invoice allocations even across fractional rounding');
    assert.equal((await row(`select count(*)::int n from supplier_bill_events where bill_id='${id(100)}'`)).n,3,'Draft, confirmation and reversal retain audit evidence');
    assert.equal((await row(`select has_function_privilege('authenticated','save_supplier_bill(jsonb,uuid)','execute') allowed`)).allowed,false);
    assert.equal((await row(`select has_table_privilege('authenticated','supplier_bills','insert') allowed`)).allowed,false);
    await db.exec('set role authenticated');
    try{await assert.rejects(db.exec(`update supplier_purchases set total_amount=1 where purchase_reception_id='${id(10)}'`),/conciliá desde la recepción/);}finally{await db.exec('reset role');}
    console.log('Bill reconciliation: partial/multiple receipts, taxes, atomic debt adjustment, approval, retries, duplicate/foreign/overbilling rejection, reversal, audit and permissions: OK');
    console.log('Multi-order receipts: one debt, per-order quantities, same SKU, safe retries, supplier boundaries, rollback, stock and selected closures: OK');
    console.log('PostgreSQL migrations, atomic debt/receipt, mixed stock, legacy quantities, closure, cutover, reconciliation, audit and permissions: OK');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
