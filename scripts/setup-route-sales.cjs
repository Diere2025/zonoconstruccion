// Additive database setup; all schedules remain OFF until live preview passes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
process.loadEnvFile('.env.local');
const dir='output/route-sales',worker='zono-route-sales',account='b6174428e949acf36731604b99f1a5a1';
fs.mkdirSync(dir,{recursive:true});
async function cf(endpoint,method='GET',body){
 const config=fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
 const token=config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];if(!token)throw Error('Falta sesión Cloudflare');
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${endpoint}`,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const d=await r.json();if(!d.success)throw Error('Cloudflare HTTP '+r.status);return d.result;
}
function control(){const f=dir+'/control-token';if(!fs.existsSync(f))fs.writeFileSync(f,crypto.randomBytes(32).toString('hex'));return fs.readFileSync(f,'utf8').trim();}
async function database(apply){
 const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();
 try{
  await db.query('begin');await db.query("set local lock_timeout='3s'");
  const sql=fs.readFileSync('database/db_migration_20261104_route_sales.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
  await db.query(sql);
  if(apply){await db.query('commit');console.log('Registro de avisos instalado; desactivado.');return;}
  const assert=require('node:assert/strict');
  const key='test:'+crypto.randomUUID();const claim=async k=>(await db.query('select claim_route_sales_run($1) id',[k])).rows[0].id;
  const id=await claim(key);assert.ok(id);assert.equal(await claim(key+':other'),null);await db.query("update route_sales_runs set status='completed' where id=$1",[id]);assert.equal(await claim(key),null);
  const row=(await db.query("insert into route_sales(source,source_key,seller_name,summary,locality,date_label,status) values('manual',$1,'Prueba','Termo 50','Cañuelas','05/11','pending') returning id",[key])).rows[0];
  assert.equal((await db.query('select * from claim_route_sale_notice($1)',[row.id])).rows.length,1);
  assert.equal((await db.query('select * from claim_route_sale_notice($1)',[row.id])).rows.length,0);
  await db.query("update route_sales set delivery_started_at=now()-interval '11 minutes' where id=$1",[row.id]);
  assert.equal((await db.query('select * from claim_route_sale_notice($1)',[row.id])).rows.length,0);
  assert.equal((await db.query('select delivery_state from route_sales where id=$1',[row.id])).rows[0].delivery_state,'uncertain');
  assert.equal((await db.query("select has_table_privilege('anon','route_sales','select') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','claim_route_sales_run(text)','execute') allowed")).rows[0].allowed,false);
  await db.query('rollback');console.log('PASS SQL: ejecución única, exclusión, envío incierto sin duplicación y permisos; rollback completo.');
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
}
async function main(){
 const mode=process.argv[2];if(['check-db','apply-db'].includes(mode))return database(mode==='apply-db');
 if(mode==='verify-repository'){
  const p=await cf('/pages/projects/zono-erp');
  console.log(JSON.stringify({project:p.name,productionBranch:p.production_branch,source:p.source?.config&&{owner:p.source.config.owner,repo_name:p.source.config.repo_name,production_branch:p.source.config.production_branch}}));return;
 }
 const {CRONS}=await import('../workers/route-sales/core.mjs');
 if(mode==='preflight'){
  const w=await fetch('https://api.whaticket.com/api/v1/tickets/64ff5485-7ad2-4dac-a412-1c2077731b28',{headers:{Authorization:'Bearer '+process.env.WHATICKET_AUDIT_TOKEN}});
  const o=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1',store:false,input:'Return only OK.',max_output_tokens:16})});
  const result={checkedAt:new Date().toISOString(),whaticket:w.status,openai:o.status,ready:w.ok&&o.ok};
  fs.writeFileSync(dir+'/preflight.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(!result.ready)throw Error('No activar: APIs sin acceso');
  const ticket=await w.json();if(!ticket.userId)throw Error('Se debe seleccionar la cuenta de Jazmín');
  const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{await db.query("update route_sales_config set whaticket_user_id=$1,model='gpt-4.1' where id=true",[ticket.userId]);}finally{await db.end();}return;
 }
 const endpoint='/workers/scripts/'+worker;
 if(mode==='deploy'){
  const preflight=JSON.parse(fs.readFileSync(dir+'/preflight.json'));if(!preflight.ready||Date.now()-Date.parse(preflight.checkedAt)>3600000)throw Error('Falta preflight vigente');
  const code=require('esbuild').buildSync({entryPoints:['workers/route-sales/index.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false}).outputFiles[0].text;
  const bindings=[{name:'CONTROL_TOKEN',type:'secret_text',text:control()},...['OPENAI_API_KEY','WHATICKET_AUDIT_TOKEN','LOGISTICS_TELEGRAM_BOT_TOKEN','SUPABASE_SERVICE_ROLE_KEY'].map(name=>({name,type:'secret_text',text:process.env[name]})),{name:'SUPABASE_URL',type:'plain_text',text:process.env.NEXT_PUBLIC_SUPABASE_URL}];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-04',observability:{enabled:true},limits:{cpu_ms:300000},bindings})],{type:'application/json'}));form.set('worker.mjs',new Blob([code],{type:'application/javascript+module'}),'worker.mjs');
  await cf(endpoint,'PUT',form);const sub=await cf('/workers/subdomain');await cf(endpoint+'/subdomain','POST',{enabled:true,previews_enabled:false});
  const deployment={url:`https://${worker}.${sub.subdomain}.workers.dev`,at:new Date().toISOString()};fs.writeFileSync(dir+'/deployment.json',JSON.stringify(deployment,null,2));console.log(JSON.stringify(deployment));return;
 }
 if(mode==='activate'){
  const preview=JSON.parse(fs.readFileSync(dir+'/preview.json'));
  if(!preview.success)throw Error('Falta vista previa real exitosa');
  if(!fs.existsSync(dir+'/bootstrap.json')||!fs.existsSync(dir+'/erp-release-verified.json'))throw Error('Falta importar avisos históricos y verificar despliegue ERP');
  const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{await db.query('update route_sales_config set enabled=true where id=true');await cf(endpoint+'/schedules','PUT',CRONS.map(cron=>({cron})));}catch(e){await db.query('update route_sales_config set enabled=false where id=true');throw e;}finally{await db.end();}console.log('Horarios activados');return;
 }
 if(!['status','preview','run'].includes(mode))throw Error('Modo inválido');
 const deployment=JSON.parse(fs.readFileSync(dir+'/deployment.json'));const response=await fetch(deployment.url+'/'+mode,{method:mode==='status'?'GET':'POST',headers:{Authorization:'Bearer '+control()},signal:AbortSignal.timeout(13*60000)});
 const result=await response.json();fs.writeFileSync(dir+'/'+mode+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!response.ok)throw Error('Worker HTTP '+response.status);
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
