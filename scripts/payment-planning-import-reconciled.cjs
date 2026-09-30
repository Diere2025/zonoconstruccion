// Rehearse by default; --apply imports one reviewed snapshot to payment planning.
// Never writes to the source Google Sheet or existing treasury movements.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { Client } = require('pg');
process.loadEnvFile('.env.local');

const sourceFile = process.argv[2];
if (!sourceFile) throw new Error('Indicá una captura privada de la planilla.');
const apply = process.argv.includes('--apply');
const snapshot = JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const sourceHash = crypto.createHash('sha256').update(JSON.stringify(snapshot.ranges)).digest('hex');
const matches = JSON.parse(fs.readFileSync(path.join(path.dirname(sourceFile),'movement-matches-september.json'),'utf8'));
const matchesByRow = new Map(matches.rows.map(row=>[`${row.fund}:${row.row}`,row]));
const actual = snapshot.ranges.find(range=>range.range.startsWith('Actual!')).values;
const scenarioRows = snapshot.ranges.find(range=>range.range.startsWith('Escenarios!')).values;
const actor = '381df0d1-183f-4ccb-aaf2-8147c76159a9';
const blocks = [
  {kind:'cash',date:1,title:3,effect:5,balance:6,notes:7,scenarioColumn:1,scenario:'intermedio'},
  {kind:'personal',date:9,title:11,effect:13,balance:14,notes:15,scenarioColumn:3,scenario:'intermedio'},
  {kind:'company',date:17,title:19,effect:21,balance:22,notes:23,scenarioColumn:2,scenario:'pesimista'}
];
const iso = value => typeof value==='number'?new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10):'';
const normalized = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const amount = value => Number(value).toFixed(2);
const uuid = key => {const hex=crypto.createHash('sha256').update(`${sourceHash}:${key}`).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`};
const exportsValue={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paymentPlanning/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsValue});

function prepare(funds) {
  const fundByKind=new Map(funds.map(fund=>[fund.kind,fund]));
  const out={balances:[],rates:[],items:[],realizations:[],reservations:[],sourceRows:[]};
  for(const block of blocks){
    const fund=fundByKind.get(block.kind);
    if(!fund||fund.currency!=='ARS')throw new Error(`Falta fondo ARS ${block.kind}.`);
    const previousBalance=date=>{let last;for(const row of actual)if(iso(row?.[block.date])===date&&typeof row[block.balance]==='number')last=row[block.balance];return last};
    let initial=previousBalance('2026-08-31');
    if(block.kind==='personal'){
      const opening=actual.find(row=>iso(row?.[block.date])==='2026-09-01'&&/saldo inicial/i.test(String(row?.[block.title]||'')));
      if(typeof opening?.[block.effect]==='number')initial=opening[block.effect];
    }
    const checkpoint=previousBalance('2026-09-29');
    if(typeof initial!=='number'||typeof checkpoint!=='number')throw new Error(`Faltan saldos de apertura para ${block.kind}.`);
    for(const [date,value,label] of [['2026-09-01',initial,'Apertura de la hoja al 01/09'],['2026-09-30',checkpoint,'Cierre de la hoja al 29/09 para proyección']])
      out.balances.push({id:uuid(`balance:${block.kind}:${date}`),fund_id:fund.id,effective_date:date,amount:amount(value),reserved_amount:'0.00',notes:`${label}; disponible libre de origen, reservas anteriores al corte pendientes de verificar`});
    const scenarioValue=name=>{const row=scenarioRows.find(row=>normalized(row[0])===name);if(!row||typeof row[block.scenarioColumn]!=='number')throw new Error(`Escenario ${name} faltante.`);return amount(row[block.scenarioColumn])};
    out.rates.push({id:uuid(`scenario:${block.kind}`),fund_id:fund.id,title:block.kind==='cash'?'Rendiciones y Ventas Depo Zono':'Ingresos estimados',valid_from:'2026-09-30',valid_until:'2026-10-31',weekdays:[1,2,3,4,5,6],optimistic:scenarioValue('optimista'),intermediate:scenarioValue('intermedio'),pessimistic:scenarioValue('pesimista'),active:true});
  }
  for(let index=2;index<actual.length;index++)for(const block of blocks){
    const row=actual[index]||[],date=iso(row[block.date]);
    if(date<'2026-09-01'||date>'2026-10-31')continue;
    const title=String(row[block.title]||'').trim();
    if(!title)continue;
    const label=normalized(title),effect=row[block.effect],fund=fundByKind.get(block.kind),future=date>='2026-09-30';
    const source_key=`${sourceHash}:Actual:${block.kind}:${index+1}`;
    const sourceRow={id:uuid(`source:${block.kind}:${index+1}`),source_hash:sourceHash,source_key,sheet_row:index+1,fund_id:fund.id,source_date:date,title,
      source_effect:typeof effect==='number'?amount(effect):null,source_balance:typeof row[block.balance]==='number'?amount(row[block.balance]):null,
      classification:'control',match_status:'control',item_id:null,realization_id:null,cash_transaction_id:null,candidate_count:0,notes:''};
    const notes=String(row[block.notes]??'').slice(0,1800);
    if(/saldo inicial/.test(label))sourceRow.classification='opening';
    else if(/ingresos estimados|rendiciones y ventas depo/.test(label)){sourceRow.classification='scenario';sourceRow.notes=future?'Generado por regla de escenario':'Valor histórico de hoja; no se declara cobro confirmado';}
    else if(/reserva de sueldos/.test(label)&&typeof effect==='number'&&effect<0){
      sourceRow.classification='reserve';sourceRow.match_status=future?'forecast':'review';
      if(future)out.reservations.push({id:uuid(`reservation:${block.kind}:${index+1}`),fund_id:fund.id,kind:'reserve',amount:amount(-effect),effective_date:date,notes:`Importado de Actual fila ${index+1}. ${notes}`.trim(),import_source_key:source_key});
      else sourceRow.notes='Reserva histórica pendiente de reconstruir contra el saldo inicial';
    }else if(/reingreso sueldos/.test(label)&&typeof effect==='number'&&effect>0){
      sourceRow.classification='release';sourceRow.match_status=future?'forecast':'review';
      if(future)out.reservations.push({id:uuid(`reservation:${block.kind}:${index+1}`),fund_id:fund.id,kind:'release',amount:amount(effect),effective_date:date,notes:`Importado de Actual fila ${index+1}. ${notes}`.trim(),import_source_key:source_key});
      else sourceRow.notes='Liberación histórica pendiente de reconstruir contra el saldo inicial';
    }else if(typeof effect==='number'&&effect!==0){
      const special=/ajuste|reserva|reintegro|transferencia/.test(label);
      sourceRow.classification=/ajuste/.test(label)?'adjustment':'item';
      const match=matchesByRow.get(`${block.kind}:${index+1}`);
      const confirmed=!future&&!special&&match?.classification==='strong'&&match.candidates.length===1;
      const status=future||confirmed?'active':'draft';
      const item_id=uuid(`item:${block.kind}:${index+1}`);
      const item={id:item_id,fund_id:fund.id,kind:effect>0?'income':'expense',title,amount:amount(Math.abs(effect)),scheduled_date:date,due_date:date,status,priority:'normal',
        notes:`Actual fila ${index+1}. ${confirmed?'Conciliado con Movimiento.':future?'Previsión de la hoja.':'Histórico sin coincidencia inequívoca; revisar.'} ${notes}`.trim(),source:'import',is_adjustment:sourceRow.classification==='adjustment',import_source_key:source_key};
      out.items.push(item);sourceRow.item_id=item_id;sourceRow.match_status=confirmed?'confirmed':future?'forecast':'review';sourceRow.candidate_count=match?.candidates.length||0;
      if(confirmed){
        const cash_transaction_id=match.candidates[0].id,realization_id=uuid(`realization:${block.kind}:${index+1}`);
        out.realizations.push({id:realization_id,item_id,fund_id:fund.id,amount:item.amount,effective_date:date,notes:`Conciliado por fecha, importe, cuenta y concepto; Actual fila ${index+1}`,cash_transaction_id});
        sourceRow.realization_id=realization_id;sourceRow.cash_transaction_id=cash_transaction_id;
      }else if(!future)sourceRow.notes=match?.classification||'Sin candidato';
    }else if(typeof effect!=='number'){
      sourceRow.notes='Importe a confirmar; no se proyecta';
    }
    out.sourceRows.push(sourceRow);
  }
  const modelFunds=funds.map(fund=>({...fund,scenario:blocks.find(block=>block.kind===fund.kind)?.scenario||fund.scenario}));
  const projection=exportsValue.project({funds:modelFunds,balances:out.balances,items:out.items,realizations:out.realizations.map(row=>({...row,reversed_at:null})),reservations:out.reservations.map(row=>({...row,target_item_id:null,reversed_at:null})),rates:out.rates,transfers:[],from:'2026-09-30',to:'2026-10-31',today:'2026-09-30'});
  const differences=[];
  for(const row of projection){
    const block=blocks.find(block=>fundByKind.get(block.kind).id===row.fund_id);
    let source;
    for(const cells of actual)if(iso(cells?.[block.date])===row.date&&typeof cells[block.balance]==='number')source=cells[block.balance];
    if(typeof source!=='number'||Math.abs(row.free-source)>0.011)differences.push({fund:block.kind,date:row.date,source,projected:row.free});
  }
  if(differences.length)throw new Error(`La proyección futura difiere de la hoja en ${differences.length} fondo-días.`);
  const summary={sourceHash,items:out.items.length,historicalDrafts:out.items.filter(item=>item.status==='draft').length,confirmed:out.realizations.length,
    futureItems:out.items.filter(item=>item.scheduled_date>='2026-09-30'&&item.status==='active').length,reservations:out.reservations.length,sourceRows:out.sourceRows.length,balances:out.balances.length,rates:out.rates.length,verifiedFutureDays:projection.length};
  return {out,summary};
}

async function insertJson(db,table,columns,types,rows){
  if(!rows.length)return;
  const definition=columns.map((column,index)=>`${column} ${types[index]}`).join(',');
  const fields=columns.join(',');
  await db.query(`insert into public.${table}(${fields}) select ${fields} from jsonb_to_recordset($1::jsonb) as x(${definition})`,[JSON.stringify(rows)]);
}

(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:apply?'payment_planning_import_apply':'payment_planning_import_rehearsal'});
  await db.connect();
  try{
    const funds=(await db.query("select id,name,kind,currency,scenario,active from public.payment_planning_funds where currency='ARS' order by kind")).rows;
    const {out,summary}=prepare(funds);
    const prior=(await db.query('select id from public.payment_planning_import_batches where source_hash=$1',[sourceHash])).rows;
    if(prior.length){console.log(JSON.stringify({status:'already_imported',...summary}));return;}
    const counts=(await db.query(`select
      (select count(*)::integer from public.payment_planning_items) as items,
      (select count(*)::integer from public.payment_planning_balances) as balances,
      (select count(*)::integer from public.payment_planning_scenario_rates) as rates,
      (select count(*)::integer from public.payment_planning_source_rows) as source_rows`)).rows[0];
    if(Object.values(counts).some(value=>value!==0))throw new Error('Planificación ya contiene datos; reconciliar antes de importar esta captura.');
    const admin=(await db.query("select id from public.sellers where id=$1 and is_active is distinct from false and (role='admin' or 'admin'=any(roles))",[actor])).rows;
    if(admin.length!==1)throw new Error('No se encontró el administrador autor de la importación.');
    await db.query('begin');
    try{
      await db.query("set local lock_timeout='5s'");await db.query("set local statement_timeout='120s'");
      const itemById=new Map(out.items.map(item=>[item.id,item]));
      const expectedLedger=out.realizations.map(row=>({id:row.cash_transaction_id,amount:row.amount,date:row.effective_date,type:itemById.get(row.item_id).kind==='income'?'ingreso':'egreso'}));
      const ledgerCheck=(await db.query(`select count(*)::integer as matched from jsonb_to_recordset($1::jsonb)
        as expected(id uuid,amount numeric,date date,type text)
        join public.cash_transactions t on t.id=expected.id
        where t.currency='ARS' and t.type=expected.type and t.amount=expected.amount
          and (coalesce(t.registered_at,t.created_at) at time zone 'America/Argentina/Buenos_Aires')::date=expected.date`,[JSON.stringify(expectedLedger)])).rows[0].matched;
      if(ledgerCheck!==expectedLedger.length)throw new Error('Cambió un movimiento conciliado desde el cotejo.');
      await db.query('insert into public.payment_planning_import_batches(source_hash,source_name,created_by) values($1,$2,$3)',[sourceHash,`Actual y Escenarios, captura ${snapshot.capturedAt}`,actor]);
      await insertJson(db,'payment_planning_balances',['id','fund_id','effective_date','amount','reserved_amount','notes','created_by'],['uuid','uuid','date','numeric','numeric','text','uuid'],out.balances.map(row=>({...row,created_by:actor})));
      await insertJson(db,'payment_planning_scenario_rates',['id','fund_id','title','valid_from','valid_until','weekdays','optimistic','intermediate','pessimistic','active','created_by'],['uuid','uuid','text','date','date','integer[]','numeric','numeric','numeric','boolean','uuid'],out.rates.map(row=>({...row,created_by:actor})));
      await insertJson(db,'payment_planning_items',['id','fund_id','kind','title','amount','scheduled_date','due_date','status','priority','notes','source','is_adjustment','import_source_key','created_by'],['uuid','uuid','text','text','numeric','date','date','text','text','text','text','boolean','text','uuid'],out.items.map(row=>({...row,created_by:actor})));
      await insertJson(db,'payment_planning_realizations',['id','item_id','fund_id','amount','effective_date','notes','cash_transaction_id','created_by'],['uuid','uuid','uuid','numeric','date','text','uuid','uuid'],out.realizations.map(row=>({...row,created_by:actor})));
      await insertJson(db,'payment_planning_reservations',['id','fund_id','kind','amount','effective_date','notes','import_source_key','created_by'],['uuid','uuid','text','numeric','date','text','text','uuid'],out.reservations.map(row=>({...row,created_by:actor})));
      await insertJson(db,'payment_planning_source_rows',['id','source_hash','source_key','sheet_row','fund_id','source_date','title','source_effect','source_balance','classification','match_status','item_id','realization_id','cash_transaction_id','candidate_count','notes'],['uuid','text','text','integer','uuid','date','text','numeric','numeric','text','text','uuid','uuid','uuid','integer','text'],out.sourceRows);
      await db.query(`insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
        select 'item',id,'import',to_jsonb(i),$1 from public.payment_planning_items i where import_source_key like $2`,[actor,`${sourceHash}:%`]);
      await db.query(`insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
        select 'realization',id,'ledger_match',to_jsonb(r),$1 from public.payment_planning_realizations r where cash_transaction_id is not null`,[actor]);
      const verified=(await db.query(`select
        (select count(*)::integer from public.payment_planning_items) as items,
        (select count(*)::integer from public.payment_planning_realizations) as confirmed,
        (select count(*)::integer from public.payment_planning_source_rows) as source_rows`)).rows[0];
      if(verified.items!==summary.items||verified.confirmed!==summary.confirmed||verified.source_rows!==summary.sourceRows)throw new Error('Conteos finales distintos del ensayo.');
      if(apply){await db.query('commit');console.log(JSON.stringify({status:'applied',...summary}));}
      else{await db.query('rollback');console.log(JSON.stringify({status:'rehearsed',changes:'rolled_back',...summary}));}
    }catch(error){await db.query('rollback');throw error;}
  }finally{await db.end()}
})().catch(error=>{console.error(`Importación: ${error.code||error.message}`);process.exitCode=1});
