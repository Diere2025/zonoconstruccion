const fs=require('node:fs');const {Client}=require('pg');process.loadEnvFile('.env.local');
// Explicit correspondence reviewed in this conversation, not fuzzy product matching.
const mapping=JSON.parse(fs.readFileSync('output/route-sales/bootstrap-manifest.json','utf8'));
async function main(){
 const tickets=JSON.parse(fs.readFileSync('tmp/nuevo-cliente-review.json'));const sent=[...JSON.parse(fs.readFileSync('tmp/nuevo-cliente-sent.json')),...JSON.parse(fs.readFileSync('tmp/jazmin-recorridos-format-sent.json'))];
 const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();let loaded=0;
 try{await db.query('begin');
 for(const [messageId,name,summary,locality,date,from,uncertain=false] of mapping){
  const t=tickets.find(t=>t.name===name);if(!t||!sent.some(s=>s.id===messageId))throw Error('Falta referencia histórica '+messageId);
  const confirmed=t.messages.filter(m=>m.out&&/Todo listo/.test(m.body||'')).at(-1)?.at||'2026-11-04T03:00:00Z';
  // Imported orders carry a calendar-day created_at (15:00 UTC), not the
  // actual entry time. Match the day and exact chat; ambiguity stays pending.
  const matches=(await db.query("select id,legacy_code from orders where seller_id=$1 and whaticket_link like $2 and created_at::date >= ($3::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date and status not in ('Cancelado','Anulado')",['13430e05-b61a-4a3f-9fc3-152d377c4b0c','%'+t.id+'%',confirmed])).rows;
  const order=matches.length===1?matches[0]:null;if(order)loaded++;
  await db.query(`insert into route_sales(source,source_key,ticket_id,seller_id,seller_name,customer_name,summary,locality,date_label,available_from,availability_uncertain,whaticket_link,status,order_id,order_code,telegram_message_id)
   values('whaticket',$1,$2,$3,'Jazmín',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(source_key) do update set
   order_id=coalesce(route_sales.order_id,excluded.order_id),order_code=coalesce(route_sales.order_code,excluded.order_code),
   status=case when coalesce(route_sales.order_id,excluded.order_id) is not null then 'loaded' else route_sales.status end`,
   ['bootstrap:'+t.id,t.id,'13430e05-b61a-4a3f-9fc3-152d377c4b0c',t.name,summary,locality,date,from,uncertain,'https://app.whaticket.com/tickets/'+t.id,order?'loaded':'pending',order?.id||null,order?.legacy_code||null,messageId]);
 }
 if(process.argv.includes('--apply')){await db.query('commit');fs.writeFileSync('output/route-sales/bootstrap.json',JSON.stringify({total:mapping.length,loaded,at:new Date().toISOString()},null,2));console.log(JSON.stringify({imported:mapping.length,loaded}));}
 else {await db.query('rollback');console.log(JSON.stringify({preview:mapping.length,loaded,changed:false}));}
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
