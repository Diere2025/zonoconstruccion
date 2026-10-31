// Defaults to review export. --apply requires a concrete ready manifest with approved:true.
const fs=require('fs'),{Client}=require('pg'),{randomUUID}=require('crypto');process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply'),arg=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1),manifestPath=arg('--manifest');
const normalize=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();try{
 await db.query(apply?'begin':'begin read only');await db.query("set local lock_timeout='4s';set local statement_timeout='30s'");
 if(apply){
  if(!manifestPath)throw Error('Indicá --manifest con una revisión concreta.');const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(m.approved!==true||!m.ready||typeof m.reason!=='string'||m.reason.trim().length<10)throw Error('El manifiesto debe estar listo y aprobado, con criterio de corte explícito.');
  const actorEmail=String(process.env.SUPPLIER_REVIEW_ACTOR_EMAIL||'').trim().toLowerCase();if(!actorEmail)throw Error('Configurá SUPPLIER_REVIEW_ACTOR_EMAIL con el usuario responsable de la revisión.');const actor=(await db.query('select id from auth.users where lower(email)=$1',[actorEmail])).rows[0]?.id;if(!actor)throw Error('No se encontró el usuario autorizado.');
  const proof=async()=>(await db.query("select md5((select jsonb_agg(jsonb_build_array(id,total_amount,paid_amount,currency,status) order by id)::text from supplier_purchases)) purchases,md5((select jsonb_agg(jsonb_build_array(id,amount,currency,reversed_at) order by id)::text from supplier_payments)) payments,md5((select jsonb_agg(to_jsonb(c) order by id)::text from cash_transactions c)) cash,(select count(*) from inventory_transactions) inventory")).rows[0];
  const before=await proof(),payload={supplierId:m.supplierId,batchId:m.batchId,signature:m.signature,openingArs:m.openingArs,openingUsd:m.openingUsd,approved:true,reason:m.reason,differenceEvidence:m.differenceEvidence||''};
  const r=(await db.query('select apply_supplier_reviewed_cutover($1,$2,$3::jsonb) r',[actor,m.requestId||randomUUID(),JSON.stringify(payload)])).rows[0].r;
  const after=await proof();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('El corte alteró documentos, dinero o inventario: operación revertida.');await db.query('commit');console.log(JSON.stringify({mode:'applied_reviewed_cutover',result:r,financialProof:after}));
 }else{
  const batch=arg('--batch')||(await db.query('select id from supplier_import_batches order by created_at desc limit 1')).rows[0]?.id;if(!batch)throw Error('Falta una captura de planilla.');
  const names=(arg('--suppliers')||'Cooper,Mundileno,Sirena,Garden Life').split(','),suppliers=(await db.query('select id,name from suppliers')).rows,reviews=[];
  fs.mkdirSync('output/cc-planning/cutovers',{recursive:true});
  for(const name of names){const supplier=suppliers.find(s=>normalize(s.name)===normalize(name));if(!supplier){reviews.push({supplier:name,ready:false,error:'Proveedor sin equivalencia exacta'});continue;}
   const r=(await db.query('select get_supplier_cutover_review($1,$2) r',[supplier.id,batch])).rows[0].r;
   const manifest={mode:'review',supplierName:supplier.name,...r,approved:false,reason:'',differenceEvidence:'',requestId:randomUUID()};fs.writeFileSync('output/cc-planning/cutovers/'+normalize(name)+'.json',JSON.stringify(manifest,null,2));reviews.push({supplier:name,ready:r.ready,rows:r.rows,pending:r.pending,invalid:r.invalid,unverifiedAliases:r.unverifiedAliases});
  }await db.query('rollback');console.log(JSON.stringify({mode:'review_only',financialWrites:0,reviews}));
 }
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error([e.code,e.message].filter(Boolean).join(': '));process.exitCode=1;});
