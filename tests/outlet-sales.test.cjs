const fs=require('node:fs'),assert=require('node:assert/strict');const {PGlite}=require(process.env.OUTLET_PGLITE_MODULE||'../tmp/customer-advance-test-runtime/node_modules/@electric-sql/pglite');
const schema=JSON.parse(fs.readFileSync('tests/fixtures/outlet-schema.json','utf8'));const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(db){await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text,name text);`);
for(const table of ['products','sellers','orders','order_items','inventory_transactions']){const cols=schema.columns.filter(c=>c.table_name===table);await db.exec('CREATE TABLE public.'+table+'('+cols.map(c=>`"${c.column_name}" ${c.data_type==='ARRAY'?'text[]':c.data_type}${c.column_default?' DEFAULT '+c.column_default:''}${c.is_nullable==='NO'?' NOT NULL':''}${c.column_name==='id'?' PRIMARY KEY':''}`).join(',')+')');}
await db.exec(`CREATE TABLE public.deliveries(id uuid default gen_random_uuid(),order_id uuid unique,delivery_date date,status text);GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT ON public.orders TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');INSERT INTO sellers(id,email,full_name,role,roles,is_active) VALUES('${id(1)}','admin@example.invalid','Admin','admin','{}',true),('${id(2)}','seller@example.invalid','Seller','seller','{}',true);SELECT set_config('test.uid','${id(1)}',false);`);
await db.exec(schema.triggers.find(t=>t.proname==='update_product_stock_levels').body);await db.exec(`CREATE TRIGGER stock AFTER INSERT OR DELETE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_product_stock_levels();`);
await db.exec(fs.readFileSync('database/db_migration_20261104_outlet_drafts.sql','utf8'));await db.exec(fs.readFileSync('database/db_migration_20261104_outlet_sales.sql','utf8'));await db.exec(fs.readFileSync('database/db_migration_20261104_outlet_dynamic_list.sql','utf8'));}
async function main(){const db=new PGlite();try{await fixture(db);console.log('schema PASS');const base=id(10);await db.exec(`INSERT INTO products(id,name,category,price,is_active)VALUES('${base}','Tanque','Tanques',200000,true);INSERT INTO storage.objects(bucket_id,name)VALUES('outlet-images','${id(1)}/${id(9)}.webp');`);
const data={code:'O038',condition:'segunda',name:'Tanque 500',category:'Tanques',reason:'Segunda',defect:'Rotura superior',base_product_id:base,list_price:200000,discount:30,photos:[`${id(1)}/${id(9)}.webp`],state:'available'};
const unit=(await db.query('SELECT outlet_save_unit(NULL,NULL,$1::jsonb) id',[JSON.stringify(data)])).rows[0].id;
const u=(await db.query('SELECT * FROM outlet_units WHERE id=$1',[unit])).rows[0];assert.ok(u.product_id);assert.equal((await db.query('SELECT is_active FROM products WHERE id=$1',[u.product_id])).rows[0].is_active,false);
const order={seller_id:id(2),initial_delivery_date:'2026-11-05',max_delivery_date:'2026-11-06',customer_name:'Fixture',locality:'Depósito',address:'Retiro',freight_type:'Retiro',status:'Pendiente',total_amount:140000,totals:{freight:0,tax:0,payment_surcharges:0},order_discount_amount:0};
const items=[{product_id:u.product_id,product_name:'Tanque',quantity:1,unit_price:140000}];await db.exec(`SELECT set_config('test.uid','${id(2)}',false);SET ROLE authenticated;`);
const save=async(op=id(20),o=order,it=items,oid=null)=>(await db.query('SELECT outlet_save_order($1,$2,$3,$4) result',[op,oid,JSON.stringify(o),JSON.stringify(it)])).rows[0].result;
const result=await save();assert.equal((await save()).order.id,result.order.id);assert.equal((await db.query('SELECT count(*)::int n FROM outlet_assignments')).rows[0].n,1);
await assert.rejects(()=>save(id(21)));await assert.rejects(()=>save(id(22),order,[{...items[0],quantity:2}]));
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT state FROM outlet_units WHERE id=$1',[unit])).rows[0].state,'reserved');const stock=(await db.query('SELECT stock_current,stock_reserved,stock_physical FROM products WHERE id=$1',[u.product_id])).rows[0];assert.deepEqual(Object.values(stock).map(Number),[0,1,1]);
await assert.rejects(()=>db.query('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price)VALUES($1,$2,\'bypass\',1,1)',[result.order.id,u.product_id]));
await db.query("UPDATE orders SET legacy_code='FIX-ONLY',payment_status='Seniado',totals=jsonb_set(totals,'{pending_balance}','100') WHERE id=$1",[result.order.id]);
await assert.rejects(()=>db.query('UPDATE orders SET total_amount=1 WHERE id=$1',[result.order.id]));
await db.query('UPDATE orders SET status=\'Entregado\' WHERE id=$1',[result.order.id]);assert.equal((await db.query('SELECT state FROM outlet_units WHERE id=$1',[unit])).rows[0].state,'sold');
await db.query('UPDATE orders SET status=\'Cancelado\' WHERE id=$1',[result.order.id]);assert.equal((await db.query('SELECT state FROM outlet_units WHERE id=$1',[unit])).rows[0].state,'review');await assert.rejects(()=>db.query('UPDATE orders SET status=\'Pendiente\' WHERE id=$1',[result.order.id]));
await db.exec(`SELECT set_config('test.uid','${id(1)}',false);INSERT INTO products(id,name,category,price,stock_current,stock_physical)VALUES('${id(50)}','Normal','Accesorios',1000,10,10);`);
const second=(await db.query('SELECT outlet_save_unit(NULL,NULL,$1::jsonb) id',[JSON.stringify({...data,code:'O045',price_mode:'base'})])).rows[0].id;
const secondProduct=(await db.query('SELECT product_id FROM outlet_units WHERE id=$1',[second])).rows[0].product_id;
const mixedItems=[{...items[0],product_id:secondProduct},{product_id:id(50),product_name:'Normal',quantity:2,unit_price:1000}];
const mixedOrder={...order,total_amount:141800,order_discount_amount:200};await db.exec(`SELECT set_config('test.uid','${id(2)}',false);`);
const mixed=await save(id(51),mixedOrder,mixedItems);
assert.equal(Number((await db.query('SELECT stock_current FROM products WHERE id=$1',[id(50)])).rows[0].stock_current),8);
await db.query('UPDATE products SET price=250000 WHERE id=$1',[base]);
await save(id(52),mixedOrder,mixedItems,mixed.order.id);
assert.equal((await db.query('SELECT outlet_snapshot FROM order_items WHERE order_id=$1 AND product_id=$2',[mixed.order.id,secondProduct])).rows[0].outlet_snapshot.final_price,140000);
const beforeCount=(await db.query('SELECT count(*)::int n FROM orders')).rows[0].n;
await assert.rejects(()=>save(id(53),mixedOrder,[mixedItems[0],mixedItems[0]]));
await assert.rejects(()=>save(id(54),{...order,total_amount:1},[{...mixedItems[0],unit_price:1}]));
assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,beforeCount);
await save(id(55),{...mixedOrder,total_amount:1800},[mixedItems[1]],mixed.order.id);
assert.equal((await db.query('SELECT state FROM outlet_units WHERE id=$1',[second])).rows[0].state,'available');
assert.equal(Number((await db.query('SELECT stock_current FROM products WHERE id=$1',[id(50)])).rows[0].stock_current),8);
await db.exec(`SELECT set_config('test.uid','${id(1)}',false);`);
const tool=(await db.query('SELECT outlet_save_unit(NULL,NULL,$1::jsonb) id',[JSON.stringify({...data,code:'TOOL-1',condition:'outlet',name:'Herramienta de exhibición',category:'Herramientas',base_product_id:id(50),price_mode:'base',discount:60,take_from_base_stock:true})])).rows[0].id;
assert.equal(Number((await db.query('SELECT stock_current FROM products WHERE id=$1',[id(50)])).rows[0].stock_current),7);
assert.equal((await db.query('SELECT base_stock_transferred FROM outlet_units WHERE id=$1',[tool])).rows[0].base_stock_transferred,true);
await db.exec(`CREATE TABLE suppliers(id uuid,base_discount_percentage numeric);CREATE TABLE product_supplier_relations(product_id uuid,supplier_id uuid,is_primary boolean);CREATE TABLE price_lists(id uuid,supplier_id uuid,is_active boolean,currency text);CREATE TABLE price_list_items(price_list_id uuid,sku text,final_cost numeric);CREATE TABLE site_settings(id text,value text);INSERT INTO suppliers VALUES('${id(70)}',10);INSERT INTO product_supplier_relations VALUES('${id(50)}','${id(70)}',true);INSERT INTO price_lists VALUES('${id(71)}','${id(70)}',true,'USD');INSERT INTO price_list_items VALUES('${id(71)}','DYNAMIC',100);INSERT INTO site_settings VALUES('usd_exchange_rate','1000');`);
await db.query('UPDATE products SET fixed_price=false,sku=\'DYNAMIC\',markup_percentage=25 WHERE id=$1',[id(50)]);
assert.equal(Number((await db.query('SELECT outlet_effective_list(u) price FROM outlet_units u WHERE id=$1',[tool])).rows[0].price),112500);
await db.exec(`CREATE FUNCTION price_changes_during_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.products SET price=300000 WHERE id='${base}';RETURN NEW;END;$$;CREATE TRIGGER price_changes_during_save BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION price_changes_during_save();SELECT set_config('test.uid','${id(2)}',false);`);
const stable=await save(id(80),{...order,total_amount:175000},[{...mixedItems[0],unit_price:175000}]);
assert.equal((await db.query('SELECT outlet_snapshot FROM order_items WHERE order_id=$1',[stable.order.id])).rows[0].outlet_snapshot.final_price,175000);
assert.equal(Number((await db.query('SELECT price FROM products WHERE id=$1',[secondProduct])).rows[0].price),175000);
console.log('PASS: price change during save cannot alter the accepted price or its snapshot');
console.log('PASS: dynamic retail list, supplier discount, USD conversion and markup');
console.log('PASS: non-tank outlet, 60% discount, explicit base-stock reclassification without duplicate inventory');
console.log('PASS: mixed orders, normal stock, retained snapshot after list change, duplicate line/price rejection, failed operation rollback, removed unit released');
console.log('PASS: publish, private product, exclusive sale, idempotence, stock 0/1, bypass rejection, delivery, return review and reactivation guard');}finally{await db.close();}}
module.exports={fixture,id};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});


