const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm'),ts=require('typescript'),{Client}=require('pg'),assert=require('node:assert/strict');
process.loadEnvFile('.env.local');
const model={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsDispatch/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:model,Date,Intl,Map,Set,Number,String,JSON});
const from=process.argv.find(x=>x.startsWith('--from='))?.slice(7)||'2026-09-01',to=process.argv.find(x=>x.startsWith('--to='))?.slice(5)||'2026-10-12';
const apply=process.argv.includes('--apply');
async function token(){
 const raw=process.env.GOOGLE_SERVICE_ACCOUNT_KEY||process.env.GOOGLE_CREDENTIALS_JSON;
 const creds=raw?JSON.parse(raw):{client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,private_key:process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')};
 if(!creds.client_email||!creds.private_key)throw Error('Faltan credenciales de Google.');
 const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const message=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:creds.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=message+'.'+crypto.sign('RSA-SHA256',Buffer.from(message),creds.private_key).toString('base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000)}),body=await r.json();
 if(!r.ok||!body.access_token)throw Error('Falló la autenticación de Google.');return body.access_token;
}
async function sourceRead(access,id,range){const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMATTED_VALUE',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('No se pudo leer la fuente '+r.status);return(await r.json()).values||[];}
async function main(){
 const access=await token(),ids=model.SOURCE_IDS;
 const [logistics,summary,follow,settlements,cash]=await Promise.all([
 sourceRead(access,ids.logistics,"'🔴 Entregados'!A3:CO12000"),sourceRead(access,ids.logistics,"'ResumenCostoPorEntregas'!A2:J10000"),
 sourceRead(access,ids.follow,"'Seguimiento'!A2:AA10000"),sourceRead(access,ids.settlements,"'Entregas'!A2:AU10000"),sourceRead(access,ids.cash,"'Caja'!A2:Q12000")]);
 const source=model.buildDispatchSource({logistics,summary,follow,settlements,cash},from,to);
 const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
 await db.connect();try{
 await db.query('begin isolation level repeatable read');
 await db.query("create temporary table dispatch_original_ids(table_name text,id uuid) on commit drop");
 for(const table of ['cash_transactions','client_payments','treasury_settlements','deliveries','route_sheets'])await db.query("insert into dispatch_original_ids select $1,id from public."+table,[table]);await db.query("set local lock_timeout='5s';set local statement_timeout='60s'");
 const before=async()=>{const result={};for(const table of ['cash_transactions','client_payments','treasury_settlements','deliveries','route_sheets'])result[table]=(await db.query('select count(*)::int n, md5(string_agg(to_jsonb(t)::text, $$|$$ order by id)) digest from public.'+table+' t where id in(select id from dispatch_original_ids where table_name=$1)',[table])).rows[0];return result;};
 const beforeState=await before();
 const sql=fs.readFileSync('database/db_migration_v199_logistics_dispatch_links.sql','utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');
 await db.query(sql);await db.query(sql);
 const ledger=(await db.query("select t.id,t.type,t.amount,t.concept,t.financial_account_id,t.is_imported,t.reversal_of_transaction_id,to_char(t.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD') date,a.name account from cash_transactions t join financial_accounts a on a.id=t.financial_account_id where t.currency='ARS' and t.created_at >= ($1::date::timestamp at time zone 'America/Argentina/Buenos_Aires') and t.created_at < (($2::date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')",[from,to])).rows;
 const matched=model.matchMovements(source.movements,ledger,new Map(source.settlements.map(s=>[s.code,s.dispatchCode])));
 const payload={...source,movementLinks:matched.links,issues:[...new Map([...source.issues,...matched.issues].map(x=>[x.key,x])).values()]};
 const actor=(await db.query("select id from auth.users where lower(email)='diego.boveda@gmail.com' and public.is_treasury_settlement_admin(id)")).rows[0]?.id;if(!actor)throw Error('No se encontró administrador autorizado.');
 const first=(await db.query('select public.sync_logistics_dispatch_links($1,$2) result',[actor,JSON.stringify(payload)])).rows[0].result;
 const second=(await db.query('select public.sync_logistics_dispatch_links($1,$2) result',[actor,JSON.stringify(payload)])).rows[0].result;
 assert.deepEqual(second,first,'Idempotencia');
 assert.deepEqual(await before(),beforeState,'Los registros originales deben quedar intactos');
 const gyv=(await db.query("select d.code,d.carrier_name,count(*) filter(where a.executed)::int executed,count(*) filter(where not a.executed)::int excluded from logistics_dispatches d join logistics_dispatch_attempts a on a.dispatch_id=d.id where d.code='LOG_REC_05344' group by d.code,d.carrier_name")).rows[0];
 assert.equal(gyv.executed,14);assert.equal(gyv.excluded,13);
 const salcedo=(await db.query("select count(*)::int n from logistics_dispatch_settlements l join treasury_settlements s on s.id=l.settlement_id where s.code='REND07051'")).rows[0];assert.equal(salcedo.n,0);
 const security=(await db.query("select has_function_privilege('authenticated','public.sync_logistics_dispatch_links(uuid,jsonb)','execute') allowed")).rows[0];assert.equal(security.allowed,false);
 const missing=(await db.query("select kind,count(*)::int count from logistics_link_issues where source_from=$1 and source_to=$2 group by kind order by kind",[from,to])).rows;
 fs.mkdirSync('output/logistics-dispatch-links',{recursive:true});
 fs.writeFileSync('output/logistics-dispatch-links/latest-preview.json',JSON.stringify({capturedAt:new Date().toISOString(),from,to,hash:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),summary:first,issues:payload.issues,gyv,missing},null,2));
 await db.query(apply?'commit':'rollback');
 console.log(JSON.stringify({mode:apply?'applied':'rehearsed-and-rolled-back',summary:first,gyv,missing,originalDataUnchanged:true,idempotent:true}));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});

