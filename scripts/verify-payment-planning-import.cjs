// Read-only post-import check against the saved private source snapshot.
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const sourceFile=process.argv[2];
if(!sourceFile)throw new Error('Indicá la captura privada.');
const snapshot=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const actual=snapshot.ranges.find(range=>range.range.startsWith('Actual!')).values;
const blocks=[{kind:'cash',date:1,balance:6},{kind:'personal',date:9,balance:14},{kind:'company',date:17,balance:22}];
const iso=value=>typeof value==='number'?new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10):'';
const exportsValue={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paymentPlanning/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsValue});
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'payment_planning_import_verify'});
  await db.connect();
  try{
    const results=[];
    for(const sql of [
      'select * from public.payment_planning_funds',
      'select *,effective_date::text as effective_date from public.payment_planning_balances',
      'select *,scheduled_date::text as scheduled_date,due_date::text as due_date from public.payment_planning_items',
      'select *,effective_date::text as effective_date from public.payment_planning_realizations',
      'select *,effective_date::text as effective_date from public.payment_planning_reservations',
      'select *,valid_from::text as valid_from,valid_until::text as valid_until from public.payment_planning_scenario_rates',
      'select match_status,count(*)::integer as n from public.payment_planning_source_rows group by match_status',
      'select count(*)::integer as n from public.cash_transactions'
    ])results.push(await db.query(sql));
    const [funds,balances,items,realizations,reservations,rates,sourceRows,ledger]=results;
    const rows=exportsValue.project({funds:funds.rows,balances:balances.rows,items:items.rows,realizations:realizations.rows,reservations:reservations.rows,rates:rates.rows,transfers:[],from:'2026-09-30',to:'2026-10-31',today:'2026-09-30'});
    const errors=[];
    for(const projected of rows){const fund=funds.rows.find(row=>row.id===projected.fund_id),block=blocks.find(row=>row.kind===fund.kind);let source;
      for(const line of actual)if(iso(line?.[block.date])===projected.date&&typeof line[block.balance]==='number')source=line[block.balance];
      if(typeof source!=='number'||Math.abs(projected.free-source)>0.011)errors.push({fund:fund.kind,date:projected.date,source,projected:projected.free});
    }
    const summary={items:items.rows.length,confirmed:realizations.rows.filter(row=>row.cash_transaction_id).length,
      drafts:items.rows.filter(row=>row.status==='draft').length,activeFuture:items.rows.filter(row=>row.status==='active'&&row.scheduled_date>='2026-09-30').length,
      manualHistorical:realizations.rows.filter(row=>!row.cash_transaction_id&&row.notes?.includes('Realizado manualmente por instrucción del usuario')).length,
      reservations:reservations.rows.length,balances:balances.rows.length,rates:rates.rows.length,sourceStatuses:Object.fromEntries(sourceRows.rows.map(row=>[row.match_status,row.n])),
      sourceDaysChecked:rows.length,differences:errors.length,treasuryMovements:ledger.rows[0].n};
    if(errors.length||summary.items!==471||summary.confirmed!==119||!((summary.drafts===197&&summary.manualHistorical===0)||(summary.drafts===0&&summary.manualHistorical===197))||summary.activeFuture!==155)throw new Error(`Verificación incompleta: ${JSON.stringify(summary)}`);
    console.log(JSON.stringify({status:'verified',...summary}));
  }finally{await db.end()}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1});
