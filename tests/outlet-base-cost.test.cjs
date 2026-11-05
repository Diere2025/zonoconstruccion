const fs=require('fs'),assert=require('assert/strict'),ts=require('typescript');
const {PGlite}=require(process.env.OUTLET_PGLITE_MODULE||'../tmp/customer-advance-test-runtime/node_modules/@electric-sql/pglite');
const {fixture,id}=require('./outlet-sales.test.cjs');
(async()=>{const db=new PGlite();try{
 await fixture(db); await db.exec('GRANT SELECT ON order_items TO authenticated');
 for(const name of ['stock_origin','order_guards','orphan_guard','base_cost'])await db.exec(fs.readFileSync(`database/db_migration_20261104_outlet_${name}.sql`,'utf8'));
 await db.exec(`INSERT INTO products(id,name,category,price,cost_price,unified_cost,is_active)VALUES('${id(10)}','AquaFort - TRIC 500L Gris','Tanques',100000,60000,70000,true);INSERT INTO storage.objects(bucket_id,name)VALUES('outlet-images','${id(1)}/${id(9)}.webp');`);
 const data={code:'O045',condition:'segunda',name:'AquaFort - TRIC 500L Gris',category:'Tanques',base_product_id:id(10),list_price:100000,discount:20,cost_price:1,reason:'Falla leve',defect:'Marca',photos:[`${id(1)}/${id(9)}.webp`],state:'available'};
 const uid=(await db.query('select outlet_save_unit(null,null,$1::jsonb) id',[JSON.stringify(data)])).rows[0].id;
 const u=(await db.query('select * from outlet_units where id=$1',[uid])).rows[0];
 const product=()=>db.query('select name,cost_price,unified_cost,stock_current,stock_reserved from products where id=$1',[u.product_id]);
 assert.equal((await product()).rows[0].name,'AquaFort - TRIC 500L Gris · O045');
 assert.equal(Number((await product()).rows[0].cost_price),70000); // Ignores manual unit cost and selling discount.
 await db.query('update products set unified_cost=90000 where id=$1',[id(10)]);
 assert.equal(Number((await product()).rows[0].unified_cost),90000);
 const order={seller_id:id(2),initial_delivery_date:'2026-11-05',max_delivery_date:'2026-11-06',customer_name:'Fixture',locality:'Retiro',address:'Retiro',freight_type:'Retiro',status:'Pendiente',total_amount:80000,totals:{freight:0,tax:0,payment_surcharges:0},order_discount_amount:0};
 const items=[{product_id:u.product_id,product_name:'Wrong name',quantity:1,unit_price:80000,historical_unit_cost:1}];
 await db.exec(`SELECT set_config('test.uid','${id(2)}',false);SET ROLE authenticated;`);
 const save=async(op,oid=null)=>(await db.query('select outlet_save_order($1,$2,$3,$4) result',[id(op),oid,JSON.stringify(order),JSON.stringify(items)])).rows[0].result.order.id;
 const oid=await save(20);
 const line=async()=>(await db.query('select product_name,historical_unit_cost,outlet_snapshot from order_items where order_id=$1',[oid])).rows[0];
 assert.equal((await line()).product_name,'AquaFort - TRIC 500L Gris · O045');
 assert.equal(Number((await line()).historical_unit_cost),90000);
 assert.equal((await line()).outlet_snapshot.base_product_id,id(10));
 await db.exec('RESET ROLE');await db.query('update products set unified_cost=95000 where id=$1',[id(10)]);
 assert.equal(Number((await product()).rows[0].cost_price),95000);
 assert.equal(Number((await line()).historical_unit_cost),90000);
 await db.exec('SET ROLE authenticated');await save(21,oid);
 assert.equal(Number((await line()).historical_unit_cost),90000); // Retained reservation keeps original cost.
 await db.exec('RESET ROLE');
 await db.query('update products set unified_cost=null,cost_price=65000 where id=$1',[id(10)]);
 assert.equal(Number((await product()).rows[0].cost_price),65000);
 assert.equal(Number((await product()).rows[0].stock_reserved),1);
 console.log('PASS: base cost priority, automatic propagation, no selling discount on costs, authoritative name, historical reservation cost and unchanged stock');
}finally{await db.close();}
 const e={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/outletProductIdentity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e);
 assert.equal(e.outletOrderName({name:'Tanque · Segunda [O045] · Falla',sku:'O045'}),'Tanque · O045');
 assert.equal(e.outletOrderName({name:'Tanque · O045',sku:'O045'}),'Tanque · O045');
 const result=e.withOutletCostLinks([{id:'base',name:'Base',material:100,total:120},{id:'outlet',name:'Outlet',material:1,total:1}],[{product_id:'outlet',base_product_id:'base'}]);
 assert.equal(result.length,1);assert.equal(result[0].material,100);assert.deepEqual(result[0].equivalentIds,['outlet']);
 const sheet={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/sheetProducts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(sheet);
 assert.equal(sheet.normalizeProductNameForSheet('AquaFort - TRIC 500L Gris · O045','O045'),'AquaFort - TRIC 500L Gris · O045');
 assert.equal(sheet.normalizeProductNameForSheet('AquaFort - TRIC 500L Gris · OUT-ABC12345'),'AquaFort - TRIC 500L Gris · OUT-ABC12345');
 console.log('PASS: clean names, spreadsheet identity and shared base cost calculations without duplicate recipes');
})().catch(e=>{console.error(e);process.exitCode=1});
