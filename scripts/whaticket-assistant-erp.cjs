const fs=require('node:fs'),path=require('node:path');const {Client}=require('pg');
const root=path.resolve(__dirname,'../output/whaticket-assistant-2026-09-30');
process.loadEnvFile(path.resolve(__dirname,'../.env.local'));
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{await db.connect();await db.query('begin read only');
 const result=await db.query("select id,sku,name,price,fixed_price,is_active,is_discontinued,is_generic,mapped_real_product_id,image_url,dimensions,production_type,stock_physical,stock_reserved,stock_current from products where name ~* 'descuento|bonific|GardenLife.*16|Zono Látex Pro Lavable|Equilibrio Enduído.*4L|Equilibrio Fijador.*4L|Rodillo Simil Lana 22x40|Guante Moteado' order by name");
 fs.writeFileSync(path.join(root,'validacion-erp-piloto.json'),JSON.stringify({checkedAt:new Date().toISOString(),products:result.rows},null,2));
 console.log(JSON.stringify(result.rows.map(({name,price,is_active,is_discontinued,is_generic,dimensions})=>({name,price,is_active,is_discontinued,is_generic,dimensions}))));await db.query('rollback');
})().catch(e=>{console.error(e.code||'query_failed');process.exitCode=1;}).finally(()=>db.end());
