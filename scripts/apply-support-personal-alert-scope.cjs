const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const owner='381df0d1-183f-4ccb-aaf2-8147c76159a9',it='b5da36c8-e964-4db9-9a71-dd11066bdc7a';
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{await db.connect();try{
 await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='90s'");
 const digest=async()=>{const out={};for(const table of ['support_tickets','support_messages','support_notifications','support_telegram_jobs','support_sector_members'])out[table]=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(md5(row_to_json(r)::text),'' order by row_to_json(r)::text),'')) hash from public.${table} r`)).rows[0];return out};
 const before=await digest();
 const sql=fs.readFileSync('database/db_migration_v236_support_personal_alert_scope.sql','utf8');
 await db.query(sql);await db.query(sql);
 assert.deepEqual(await digest(),before);
 const other=(await db.query('select user_id from public.support_profiles where user_id<>$1 limit 1',[owner])).rows[0].user_id;
 const logistics=(await db.query("select id from public.support_sectors where name='Logística'")).rows[0].id;
 const core=(await db.query("select pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure) source")).rows[0].source;
 assert(core.includes('public.support_notification_subscribed(p.user_id,t.created_by,t.assignee_id,t.sector_id)'));
 await db.query('savepoint fixtures');
 const cases=[
  {name:'logistics team excluded',creator:other,assignee:null,sector:logistics,expected:false},
  {name:'logistics assigned elsewhere excluded',creator:other,assignee:other,sector:logistics,expected:false},
  {name:'own created incident',creator:owner,assignee:other,sector:logistics,expected:true},
  {name:'own assignment',creator:other,assignee:owner,sector:logistics,expected:true},
  {name:'IT team',creator:other,assignee:null,sector:it,expected:true},
  {name:'IT assigned to colleague',creator:other,assignee:other,sector:it,expected:true},
  {name:'shipping excluded from Telegram',creator:other,assignee:owner,sector:it,workflow:'shipping',expected:true},
 ];
 const results=[];
 for(const c of cases){
  const ticket=randomUUID(),event=randomUUID(),notice=randomUUID();
  assert.equal((await db.query('select public.support_notification_subscribed($1,$2,$3,$4) ok',[owner,c.creator,c.assignee,c.sector])).rows[0].ok,c.expected,c.name);
  await db.query("insert into public.support_tickets(id,created_by,assignee_id,sector_id,title,description,type,workflow) values($1,$2,$3,$4,'Verificación del filtro de avisos','Ensayo transaccional con reversión automática.','error',$5)",[ticket,c.creator,c.assignee,c.sector,c.workflow||'incident']);
  const expectedJob=c.expected&&c.workflow!=='shipping';
  assert.equal((await db.query('select count(*)::int n from public.support_telegram_jobs where ticket_id=$1',[ticket])).rows[0].n,expectedJob?1:0,c.name);
  // Simulate an old queued notification: claim must recheck the live ticket.
  if(!expectedJob)await db.query("insert into public.support_telegram_jobs(ticket_id,ticket_number,title,creator_name,priority,chat_id) values($1,0,'Ensayo','Ensayo','medium','-123')",[ticket]);
  assert.equal((await db.query('select * from public.support_claim_telegram_jobs($1,1)',[ticket])).rowCount,expectedJob?1:0,c.name);
  await db.query("insert into public.support_events(id,ticket_id,actor_id,kind) values($1,$2,$3,'create')",[event,ticket,other]);
  await db.query("insert into public.support_notifications(id,user_id,ticket_id,event_id,kind) values($1,$2,$3,$4,'create')",[notice,owner,ticket,event]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await db.query('set local role authenticated');
  assert.equal((await db.query('select id from public.support_notifications where id=$1',[notice])).rowCount,c.expected?1:0,c.name);
  await db.query('reset role');results.push(c.name);
 }
 // The other users retain the same subscription rules.
 assert.equal((await db.query('select public.support_notification_subscribed($1,$1,null,$2) ok',[other,logistics])).rows[0].ok,true);
 await db.query('rollback to savepoint fixtures');
 assert.deepEqual(await digest(),before);
 const apply=process.argv.includes('--apply');await db.query(apply?'commit':'rollback');
 const report={applied:apply,idempotent:true,historyAndMembershipsUnchanged:true,checks:results};
 fs.mkdirSync('output/support-alert-scope',{recursive:true});fs.writeFileSync('output/support-alert-scope/'+(apply?'applied':'rehearsed')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await db.query('rollback').catch(()=>{});throw e}finally{await db.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
