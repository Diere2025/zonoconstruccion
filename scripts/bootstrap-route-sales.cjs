const fs=require('node:fs');const {Client}=require('pg');process.loadEnvFile('.env.local');
// Explicit correspondence reviewed in this conversation, not fuzzy product matching.
const mapping=[
[35329,'5491158163417','kit bio 500','Laferrere','05/11 al 09/11 (cliente pidió la semana próxima)','2026-11-05',true],
[35330,'Roxana','2 membranas blancas 20 kg + 2 vendas 1x50','Munro','05/11','2026-11-05'],
[35331,'Serguiobustos','Termotanque 50 L','Garín','05/11 al 07/11','2026-11-05'],
[35332,'Gustavo','Termotanque 50 L','Bernal Oeste','05/11 al 07/11','2026-11-05'],
[35333,'Cristina Gonzalez','Termotanque 50 L','Florencio Varela','05/11 al 07/11','2026-11-05'],
[35335,'Braian','Tricapa 500 L + base y flotante','José León Suárez','05/11 al 09/11 desde las 15:00 (sábado cualquier horario)','2026-11-05'],
[35336,'monica cecilia cuesta','Cuatricapa 600 L','Matheu','Cliente desde 06/11; presupuesto desde 05/11, después de las 14:00','2026-11-05',true],
[35337,'Ariel','Tricapa 750 L + flotante','Esteban Echeverría','05/11 al 09/11','2026-11-05'],
[35338,'Dypom Tactics','Termotanque 80 L','González Catán','05/11 al 07/11 desde las 18:00','2026-11-05'],
[35339,'Johana','Kit bio autolimpiable 700 L','José C. Paz','05/11 al 09/11','2026-11-05'],
[35340,'5491164011386','Termotanque 50 L conexión superior','William Morris','05/11 al 07/11','2026-11-05'],
[35341,'Gaston Cirone','Tricapa beige 500 L + bomba presurizadora','General Rodríguez','Sábado 07/11','2026-11-07'],
[35342,'Almacen Favela','Kit bio 500 L + caños y accesorios','Tigre centro','09/11 o 11/11','2026-11-09'],
[35343,'Noee sanchez','Kit bio autolimpiable 700 L + caños y accesorios','Rincón de Milberg','06/11 o 07/11 por la mañana','2026-11-06'],
[35344,'Andy','Termotanque 80 L conexión superior','Bernal Oeste','Cliente desde 09/11; presupuesto 05/11 al 07/11','2026-11-05',true],
[35345,'Nadia Sastre','Tricapa 500 L + flotante','La Plata','Sábado 07/11','2026-11-07'],
[35346,'mikaa','Tricapa 300 L + flotante','Lomas de Zamora','11/11 al 14/11','2026-11-11'],
[35348,'5491155055256','Tricapa 1000 L + flotante','Florencio Varela','12/11 o 13/11 de 13:00 a 16:00','2026-11-12'],
[35349,'cris','Tricapa 500 L + flotante','Berisso','Sábado 14/11','2026-11-14'],
[35350,'Ali','Termotanque 50 L conexión inferior','La Plata (José Hernández)','Figura miércoles 10/11, pero el miércoles es 11/11','2026-11-10',true],
[35351,'Maria Escobar','Tricapa 500 L + base y flotante','Maquinista Savio','16/11 al 18/11 después de las 15:30','2026-11-16'],
[35352,'Aldana Figueroa','Tricapa 600 L + base y flotante','Longchamps','16/11 al 18/11','2026-11-16'],
[35353,'Roberto','Termotanque 25 L','Solano','Martes 10/11 (preferencia del cliente)','2026-11-10'],
[35356,'Manu','Termotanque 50 L','Cañuelas','04/11 al 06/11','2026-11-04'],
[35357,'Freddy','2 tricapa 500 L + flotantes y escalera','Laferrere','Lo antes posible; coordinar entrega','2026-11-04'],
[35358,'Emilia Del Veliz❤️','Tricapa 500 L + flotante','Monte Grande (El Jagüel)','Lo antes posible; coordinar entrega','2026-11-04'],
[35359,'Adrián','Kit bio 500 L + desengrasadora','Libertad','Sábado 07/11','2026-11-07'],
[35360,'Soni','Tricapa 750 L + base y flotante','Morón','Viernes 06/11 por la mañana desde las 08:00/09:00','2026-11-06']
];
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
