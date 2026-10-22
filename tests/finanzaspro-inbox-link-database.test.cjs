const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
test('linking existing income and expense is atomic, idempotent and leaves movements unchanged', {skip:!process.env.FINANZASPRO_TEST_DATABASE_URL}, async()=>{
 const db=new Client({connectionString:process.env.FINANZASPRO_TEST_DATABASE_URL,...(process.env.FINANZASPRO_TEST_CA?{ssl:{rejectUnauthorized:true,ca:fs.readFileSync(process.env.FINANZASPRO_TEST_CA,'utf8')}}:{})});await db.connect();
 try {await db.query('begin');await db.query(fs.readFileSync('database/finanzaspro/002_fix_zono_link_movement_id.sql','utf8').replace(/^begin;/i,'').replace(/commit;\s*$/i,''));
 const ids=(await db.query("select m.id from movimientos m join cajas c on c.nombre=m.caja where c.moneda='ARS' order by m.id limit 2")).rows.map(m=>m.id);assert.equal(ids.length,2);
 const snapshot=async()=>(await db.query("select count(*)::text n,md5(coalesce(string_agg(to_jsonb(m)::text,'' order by id),'')) hash from movimientos m")).rows[0];const before=await snapshot(),source=randomUUID();
 await db.query('select receive_zono_extraction($1,1,$2)',[source,{transaction_id:source,person:'Diego Bóveda',active:true,kind:'extraction',date:'2026-10-22',amount:1,currency:'ARS'}]);
 const review=async()=>(await db.query('select review_zono_extraction($1,1,$2,$3,$4) r',[source,'link',{movement_ids:ids},'automated-rollback-test'])).rows[0].r;
 const result=await review();assert.equal(result.state,'linked');assert.deepEqual(result.movement_ids,ids);assert.equal((await review()).repeated,true);assert.deepEqual(await snapshot(),before);
 assert.equal((await db.query('select count(*)::integer n from zono_extraction_inbox_events where source_id=$1 and action=$2',[source,'link'])).rows[0].n,1);
 }finally{await db.query('rollback');await db.end();}
});
