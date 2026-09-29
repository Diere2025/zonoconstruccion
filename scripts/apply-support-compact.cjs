const fs=require('node:fs');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {Client}=require('pg');
process.loadEnvFile('.env.local');const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{await db.connect();await db.query('begin');try{
 await db.query("set local lock_timeout='5s'");
 await db.query(fs.readFileSync('database/db_migration_v109_support_compact_workflow.sql','utf8'));
 if(!process.argv.includes('--apply')){
  const owner=randomUUID(),manager=randomUUID(),other=randomUUID(),sector=randomUUID();
  for(const id of [owner,manager,other]){await db.query('insert into auth.users(id,email) values($1,$2)',[id,`compact-${id}@example.invalid`]);await db.query("insert into public.sellers(id,email,full_name,is_active) values($1,$2,'Ensayo compacto',true)",[id,`compact-${id}@example.invalid`]);await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)',[id]);}
  await db.query("insert into public.support_sectors(id,name) values($1,$2)",[sector,`Ensayo ${sector}`]);await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2)',[sector,manager]);
  const actor=async id=>{await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('set local role authenticated');};
  await actor(owner);
  const ticket=(await db.query('select public.support_command($1,null,$2,null,$3) as ticket',['create',randomUUID(),{sector_id:sector,title:'Ensayo revisión desde Nuevo',description:'Reporte ficticio del ensayo compacto.',type:'error'}])).rows[0].ticket;
  await actor(manager);
  await db.query('select public.support_command($1,$2,$3,$4,$5)',['request_validation',ticket.id,randomUUID(),1,{solution:'Solución de ensayo.',body:'Probá la solución de ensayo.'}]);
  const reviewed=(await db.query('select status,assignee_id from public.support_tickets where id=$1',[ticket.id])).rows[0];assert.equal(reviewed.status,'waiting_validation');assert.equal(reviewed.assignee_id,manager);
  assert.equal((await db.query('select * from public.support_ticket_people($1)',[[ticket.id]])).rowCount,2);
  await actor(other);assert.equal((await db.query('select * from public.support_ticket_people($1)',[[ticket.id]])).rowCount,0);
  await actor(owner);assert.equal((await db.query('select * from public.support_ticket_people($1)',[[ticket.id]])).rowCount,2);
  await db.query('select public.support_command($1,$2,$3,$4,$5)',['validate',ticket.id,randomUUID(),2,{confirmed:true}]);assert.equal((await db.query('select status from public.support_tickets where id=$1',[ticket.id])).rows[0].status,'closed');
  await db.query('rollback');console.log(JSON.stringify({test:'passed',newToReview:true,scopedNames:true,requesterClosure:true,changes:'rolled back'}));
 }else{await db.query("notify pgrst,'reload schema'");await db.query('commit');console.log(JSON.stringify({migration:'v109 applied'}));}
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
