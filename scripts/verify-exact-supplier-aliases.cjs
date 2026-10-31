// Verify exact, unambiguous supplier names in the source vendor column; classify only explicit Cuenta1/2 labels.
// Does not approve any monetary import row or infer the currency of a sheet amount.
const {Client}=require('pg'),{randomUUID}=require('crypto');process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply'),norm=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();try{
 await db.query(apply?'begin':'begin read only');await db.query("set local lock_timeout='4s';set local statement_timeout='30s'");
 const suppliers=(await db.query('select id,name from suppliers')).rows,aliases=(await db.query("select * from supplier_source_aliases where status='proposed' and source_book='1BJwQ0oCWad57oeeUFLZirmCugsDWa7PQWW6XBPOwbes' order by id")).rows;
 const sources=(await db.query('select r.id,r.version,r.status,r.component,r.amount,r.currency,r.effective_date::text,r.original_values,r.supplier_id,b.source_book from supplier_import_rows r join supplier_import_batches b on b.id=r.batch_id')).rows;
 const eligible=[];
 for(const a of aliases){
  const unused=/cuenta\s*3/i.test(a.source_alias);const match=/[.\s_-]*cuenta\s*([12])\s*$/i.exec(a.source_alias);
  const same=suppliers.filter(s=>s.id===a.supplier_id);if(same.length!==1)continue;
  const evidence=sources.filter(r=>r.source_book===a.source_book&&r.original_values?.[2]===a.source_alias),named=evidence.filter(r=>String(r.original_values?.[9]||'').trim());
  if(!named.length||suppliers.filter(s=>norm(s.name)===norm(same[0].name)).length!==1||named.some(r=>norm(r.original_values[9])!==norm(same[0].name))||evidence.some(r=>r.supplier_id&&r.supplier_id!==a.supplier_id))continue;
  if(unused&&evidence.some(r=>r.component!=='opening'||Number(r.amount)!==0||!['pending_evidence','excluded'].includes(r.status)))continue;
  eligible.push({alias:a,condition:unused?'historico':match?(match[1]==='1'?'facturado':'por_remito'):null,status:unused?'rejected':'verified',supplierName:same[0].name,sourceRows:evidence.length,excluded:unused?evidence.filter(r=>r.status!=='excluded'):[]});
 }
 if(apply){const actorEmail=String(process.env.SUPPLIER_REVIEW_ACTOR_EMAIL||'').trim().toLowerCase();if(!actorEmail)throw Error('Configurá SUPPLIER_REVIEW_ACTOR_EMAIL con el usuario responsable de la revisión.');const actor=(await db.query('select id from auth.users where lower(email)=$1',[actorEmail])).rows[0]?.id;if(!actor)throw Error('No se encontró al usuario autorizado.');
  for(const c of eligible){const a=c.alias;await db.query('select review_supplier_alias($1,$2,$3::jsonb)',[actor,randomUUID(),JSON.stringify({sourceBook:a.source_book,sourceAlias:a.source_alias,supplierId:a.supplier_id,condition:c.condition,businessLabel:a.business_label||'',status:c.status,version:a.version,reason:c.status==='rejected'?'Cuenta 3 fuera de uso según instrucción explícita de Dirección; la fuente contiene únicamente apertura cero. Se conserva la evidencia.':'Identidad exacta y única entre nombre de proveedor ERP, etiqueta de cuenta y proveedor original de las filas capturadas. Cuenta 1/2 según criterio confirmado por Dirección; las etiquetas sin cuenta explícita conservan condición sin clasificar. No aprueba importes ni moneda.'})]);for(const row of c.excluded)await db.query('select review_supplier_import($1,$2,$3::jsonb)',[actor,randomUUID(),JSON.stringify({rowId:row.id,version:row.version,status:'excluded',reason:'Cuenta 3 no se usa según instrucción explícita de Dirección; apertura original cero conservada como evidencia.',supplierId:row.supplier_id,currency:row.currency,effectiveDate:row.effective_date,amount:row.amount,purchaseId:null,paymentId:null})]);}
  await db.query('commit');
 }else await db.query('rollback');
 console.log(JSON.stringify({mode:apply?'verified_exact_identities':'READ ONLY',financialRowsApproved:0,identities:eligible.map(c=>({alias:c.alias.source_alias,supplier:c.supplierName,condition:c.condition,status:c.status,sourceRows:c.sourceRows,sourceRowsExcluded:c.excluded.length}))}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error([e.code,e.message].filter(Boolean).join(': '));process.exitCode=1;});
