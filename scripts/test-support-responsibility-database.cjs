const fs=require('node:fs');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {Client}=require('pg');
process.loadEnvFile('.env.local');
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function actor(id){await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('set local role authenticated');}
async function command(action,id,version,data={},key=randomUUID()){return(await db.query('select public.support_command($1,$2,$3,$4,$5) r',[action,id,key,version,data])).rows[0].r;}
async function denied(fn,pattern){await db.query('savepoint denied');try{await fn();assert.fail('Unexpected permission');}catch(e){assert.match(e.message,pattern);checks++;}finally{await db.query('rollback to savepoint denied');}}
async function ticket(id){return(await db.query('select * from public.support_tickets where id=$1',[id])).rows[0];}
(async()=>{
 await db.connect();await db.query('begin');
 try{
  await db.query("set local lock_timeout='5s'");
  const sql=fs.readFileSync('database/db_migration_v124_support_responsibility.sql','utf8');
  await db.query(sql);await db.query(sql);checks++;
  const editSql=fs.readFileSync('database/db_migration_v125_support_edit_ticket.sql','utf8');await db.query(editSql);await db.query(editSql);checks++;
  await db.query('savepoint fixtures');
  const [owner,first,second,other,admin]=Array.from({length:5},()=>randomUUID());
  const area=randomUUID(),otherArea=randomUUID();
  for(const id of [owner,first,second,other,admin]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,`responsibility-${id}@example.invalid`]);
   await db.query("insert into public.sellers(id,email,full_name,is_active) values($1,$2,'Ensayo de responsable',true)",[id,`responsibility-${id}@example.invalid`]);
   await db.query('insert into public.support_profiles(user_id,seller_id) values($1,$1)',[id]);
  }
  await db.query("insert into public.support_sectors(id,name) values($1,'Área de ensayo responsable'),($2,'Otra área de ensayo responsable')",[area,otherArea]);
  await db.query('insert into public.support_sector_members(sector_id,user_id) values($1,$2),($1,$3),($4,$5)',[area,first,second,otherArea,other]);
  await db.query('insert into public.support_admins(user_id) values($1)',[admin]);
  await actor(owner);
  const data={sector_id:area,title:'Ensayo de asignación obligatoria',description:'Descripción ficticia para verificar persona y equipo.',type:'error'};
  await denied(()=>command('create',null,null,data),/SUPPORT_RESPONSIBLE_REQUIRED/);
  await denied(()=>command('create',null,null,{...data,responsibility_kind:'person'}),/SUPPORT_RESPONSIBLE_INVALID/);
  await denied(()=>command('create',null,null,{...data,responsibility_kind:'person',assignee_id:other}),/SUPPORT_RESPONSIBLE_INVALID/);
  await denied(()=>command('create',null,null,{...data,responsibility_kind:'area',assignee_id:first}),/SUPPORT_RESPONSIBLE_INVALID/);
  const options=(await db.query('select public.support_responsibility_options() r')).rows[0].r;
  assert.ok(options.people.find(p=>p.id===first).sector_ids.includes(area));checks++;
  assert.ok(!options.people.some(p=>p.id===owner));checks++;
  const key=randomUUID(),areaData={...data,responsibility_kind:'area'};
  const group=await command('create',null,null,areaData,key);equal(await command('create',null,null,areaData,key),group);
  let t=await ticket(group.id);equal(t.assignee_id,null);equal(t.sector_id,area);
  await actor(first);await command('message',t.id,t.version,{body:'Mensaje para el equipo.'});
  await actor(second);
  equal((await db.query("select count(*)::int n from public.support_notifications where ticket_id=$1 and kind='message' and read_at is null",[t.id])).rows[0].n,1);
  equal((await db.query('select id from public.support_tickets where id=$1 and assignee_id is null and status in (\'new\',\'in_progress\')',[t.id])).rowCount,1);
  await actor(other);equal((await db.query('select id from public.support_tickets where id=$1',[t.id])).rowCount,0);
  await actor(owner);const individual=await command('create',null,null,{...data,responsibility_kind:'person',assignee_id:first});
  t=await ticket(individual.id);equal(t.assignee_id,first);
  // Poner en atención reuses assign for named responsibility, preserving the person.
  await actor(admin);const startVersion=t.version,startKey=randomUUID(),startData={responsibility_kind:'person',assignee_id:first};
  const started=await command('assign',t.id,startVersion,startData,startKey);
  equal(await command('assign',t.id,startVersion,startData,startKey),started);
  t=await ticket(t.id);equal(t.status,'in_progress');equal(t.assignee_id,first);equal(t.version,startVersion+1);
  await denied(()=>command('assign',t.id,startVersion,startData),/SUPPORT_CONFLICT/);
  await actor(owner);await denied(()=>command('assign',t.id,t.version,startData),/SUPPORT_FORBIDDEN/);
  await actor(first);await command('assign',t.id,t.version,{responsibility_kind:'area',assignee_id:null});t=await ticket(t.id);equal(t.assignee_id,null);
  await denied(()=>command('assign',t.id,t.version,{assignee_id:null}),/SUPPORT_RESPONSIBLE_REQUIRED/);
  await command('take',t.id,t.version);t=await ticket(t.id);equal(t.assignee_id,first);equal(t.status,'in_progress');
  const edit=async(id,version,data,key=randomUUID())=>(await db.query('select public.support_edit_ticket($1,$2,$3,$4) r',[id,key,version,data])).rows[0].r;
  const editData={sector_id:area,responsibility_kind:'person',assignee_id:second,priority:'high',type:'feature'};
  const beforeVersion=t.version,editKey=randomUUID();
  const edited=await edit(t.id,t.version,editData,editKey);equal(await edit(t.id,beforeVersion,editData,editKey),edited);
  await denied(()=>edit(t.id,beforeVersion,{...editData,priority:'low'},editKey),/SUPPORT_CONFLICT/);
  t=await ticket(t.id);equal(t.assignee_id,second);equal(t.priority,'high');equal(t.type,'feature');equal(t.version,beforeVersion+2);
  await denied(()=>edit(t.id,beforeVersion,editData),/SUPPORT_CONFLICT/);
  await actor(owner);await denied(()=>edit(t.id,t.version,editData),/SUPPORT_FORBIDDEN/);
  await actor(admin);
  const transferData={sector_id:otherArea,responsibility_kind:'person',assignee_id:other,priority:'medium',type:'question',body:'El área de destino debe atender.'};
  const before={sector:t.sector_id,assignee:t.assignee_id,version:t.version};
  await denied(()=>edit(t.id,t.version,{...transferData,type:'invalid'}),/SUPPORT_INVALID/);
  t=await ticket(t.id);equal({sector:t.sector_id,assignee:t.assignee_id,version:t.version},before);
  await edit(t.id,t.version,transferData);t=await ticket(t.id);equal(t.sector_id,otherArea);equal(t.assignee_id,other);equal(t.priority,'medium');
  await actor(first);await denied(()=>edit(t.id,t.version,transferData),/SUPPORT_NOT_FOUND/);
  await actor(admin);
  await edit(t.id,t.version,{...transferData,responsibility_kind:'area',assignee_id:null});t=await ticket(t.id);equal(t.assignee_id,null);
  await denied(()=>edit(t.id,t.version,{...transferData,responsibility_kind:undefined}),/SUPPORT_RESPONSIBLE_REQUIRED/);
  // Existing quote requests still assign the Logistics team without requiring a new form field.
  await actor(owner);const shipping=await command('create',null,null,{workflow:'shipping',shipping_request:{locality:'Viedma',province:'Río Negro',postal_code:'8500',products:'1 tanque de ensayo'}});
  t=await ticket(shipping.id);equal(t.workflow,'shipping');equal(t.assignee_id,null);
  await db.query('reset role');await db.query('rollback to savepoint fixtures');
  await db.query(process.argv.includes('--apply')?'commit':'rollback');
  console.log(JSON.stringify({checks,migration:process.argv.includes('--apply')?'v124/v125 verified and applied':'v124/v125 verified and rolled back',syntheticData:'rolled back'}));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message||e.code||'Database connection failed');process.exitCode=1;});
