// Read-only release/pilot gate. Does not mark a supplier reconciled.
const fs=require('fs'),crypto=require('crypto'),{Client}=require('pg');process.loadEnvFile('.env.local');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();try{
 await db.query('begin read only');await db.query("set local statement_timeout='30s'");
 const checks={};checks.partitionMismatches=(await db.query("select count(*)::int n from supplier_purchases p left join(select purchase_id,sum(amount) amount from supplier_payable_items group by purchase_id)i on i.purchase_id=p.id where p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' and p.total_amount>0 and coalesce(i.amount,0)<>round(p.total_amount,2)")).rows[0].n;
 checks.openingOverapplied=(await db.query('select count(*)::int n from supplier_opening_positions where (amount>0 and pending_amount<0) or (amount<0 and pending_amount>0)')).rows[0].n;
 checks.sourceOverapplied=(await db.query('select count(*)::int n from supplier_opening_sources where document_applied+opening_applied+supplier_reserved_amount(source_key)>amount')).rows[0].n;
 checks.orphanOpeningTargets=(await db.query("select count(*)::int n from supplier_opening_applications a where (target_key like 'opening:%' and not exists(select 1 from supplier_opening_parts p where p.item_key=a.target_key)) or (source_key like 'opening:%' and not exists(select 1 from supplier_opening_parts p where p.item_key=a.source_key))")).rows[0].n;
 checks.purchaseOverapplied=(await db.query("select count(*)::int n from supplier_purchases p where p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' and supplier_purchase_cash_applied(p.id)+supplier_purchase_credit_applied(p.id)>round(p.total_amount,2)")).rows[0].n;
 const balances=(await db.query('select * from get_supplier_account_balances()')).rows,positions=[];
 for(const b of balances.filter(b=>b.start_date)){
  const w=(await db.query('select get_supplier_opening_workspace($1) w',[b.id])).rows[0].w;
  const cents=n=>Math.round(Number(n)*100),totals={ARS:0,USD:0};
  for(const p of w.positions)totals[p.currency]+=cents(p.pending_amount);
  for(const p of w.documents)if(p.included)totals[p.currency]+=cents(p.pending_amount);
  for(const s of w.sources)if(s.included&&s.kind!=='opening')totals[s.currency]-=cents(s.amount)-cents(s.document_applied)-cents(s.opening_applied);
  positions.push({supplierId:b.id,name:b.name,ARS:{ledger:Number(b.balance_ars),position:totals.ARS/100,difference:(totals.ARS-cents(b.balance_ars))/100},USD:{ledger:Number(b.balance_usd),position:totals.USD/100,difference:(totals.USD-cents(b.balance_usd))/100}});
 }
 const pending=(await db.query("select status,count(*)::int rows from supplier_import_rows group by status order by status")).rows;
 const aliases=(await db.query("select status,count(*)::int rows from supplier_source_aliases group by status order by status")).rows;
 const metadata=(await db.query("select (select count(*) from supplier_purchases) purchases,(select count(*) from supplier_payments) payments,(select count(*) from cash_transactions) cash,(select count(*) from inventory_transactions) inventory,(select count(*) from supplier_account_timeline) timeline_events")).rows[0];
 const moneyProof=(await db.query("select md5(coalesce((select jsonb_agg(jsonb_build_array(id,supplier_id,total_amount,paid_amount,currency,status) order by id)::text from supplier_purchases),'')) purchases,md5(coalesce((select jsonb_agg(jsonb_build_array(id,supplier_id,amount,currency,reversed_at) order by id)::text from supplier_payments),'')) payments,md5(coalesce((select jsonb_agg(jsonb_build_array(id,type,amount,currency,created_at,operation_id) order by id)::text from cash_transactions),'')) cash")).rows[0];
 const report={mode:'READ ONLY',capturedAt:new Date().toISOString(),checks,positions,pending,aliases,counts:metadata,moneyProof,structuralChecksPass:Object.values(checks).every(v=>v===0),positionsMatch:positions.every(p=>p.ARS.difference===0&&p.USD.difference===0),migrationClosed:false};report.reportHash=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
 await db.query('rollback');fs.mkdirSync('output/cc-planning',{recursive:true});fs.writeFileSync('output/cc-planning/readiness.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.end();}})().catch(e=>{console.error([e.code,e.message].filter(Boolean).join(': '));process.exitCode=1;});
