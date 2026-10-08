const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../output/whaticket-assistant-2026-09-30');
const token=process.env.WHATICKET_AUDIT_TOKEN;
const get=async endpoint=>{const r=await fetch('https://api.whaticket.com'+endpoint,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();};
const save=(name,d)=>{fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name),JSON.stringify(d,null,2));};
const config=x=>x?{keys:Object.keys(x),isEnabled:x.isEnabled,model:x.model,hasApiKey:!!x.openAiToken,allowOutsideKnowledgeBase:x.allowOutsideKnowledgeBase}:null;
(async()=>{
 const sessionUser=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).id;
 const results=await Promise.allSettled([get('/queue'),get('/knowledgebase?pageNumber=1'),get('/users/'+encodeURIComponent(sessionUser)),get('/fastresponse')]);
 const out={checkedAt:new Date().toISOString(),requests:results.map((r,i)=>({endpoint:['/queue','/knowledgebase','/users/{session-user}','/fastresponse'][i],status:r.status,error:r.status==='rejected'?r.reason.message:undefined}))};
 if(results[0].status==='fulfilled')out.queues=results[0].value.map(q=>({name:q.name,keys:Object.keys(q),metadataKeys:Object.keys(q.metadata||{}),aiConfig:config(q.metadata?.aiConfig),workingHours:q.workingHours,delegateToAiAfterAssign:q.metadata?.delegateToAiAfterAssign}));
 if(results[1].status==='fulfilled'){const d=results[1].value;out.knowledgeBase={keys:Object.keys(d),count:d.count,hasMore:d.hasMore,articleCount:(d.knowledgeBaseArticles||d.articles||[]).length,articleKeys:Object.keys((d.knowledgeBaseArticles||d.articles||[])[0]||{})};save('base-nativa-primer-pagina.json',d);}
 if(results[2].status==='fulfilled'){const d=results[2].value;const company=d.company||d.user?.company;out.profile={keys:Object.keys(d),companyAvailable:!!company,companyKeys:Object.keys(company||{}),settingsKeys:Object.keys(company?.metadata?.settings||{}),aiConfig:config(company?.metadata?.settings?.aiConfig),workingHours:company?.workingHours};}
 if(results[3].status==='fulfilled')save('materiales-respuestas.json',results[3].value.fastResponses.map(q=>({shortcut:q.shortcut,updatedAt:q.updatedAt,mediaId:q.mediaId,media:q.media?{keys:Object.keys(q.media),name:q.media.name,fileName:q.media.fileName,url:q.media.url,contentType:q.media.contentType}:null,queues:(q.queues||[]).map(x=>x.name)})));
 save('verificacion-tecnica.json',out);console.log(JSON.stringify(out));
 try{
 process.loadEnvFile(path.resolve(__dirname,'../.env.local'));
 const {Client}=require('pg');const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
 try{await db.connect();await db.query('begin read only');
 const cols=await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('products','site_settings','scheduled_price_updates','orders','order_items') order by table_name,ordinal_position");
 save('esquema-erp.json',cols.rows);
 const products=await db.query("select id,sku,name,price,fixed_price from products where name ~* 'escaler|latex|látex|cooper|biodigest|tanque|membrana|impermeabili|enduido|enduído|fijador|rodillo|guante' order by name");
 save('productos-erp.json',products.rows);console.log(JSON.stringify({erpProducts:products.rowCount}));
 await db.query('rollback');}finally{await db.end();}
 }catch(e){save('erp-error.json',{error:e.code||e.message});console.log(JSON.stringify({erpError:e.code||e.message}));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
