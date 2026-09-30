// Read-only candidates between September sheet rows and registered treasury movements.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const file = process.argv[2];
if (!file) throw new Error('Indicá la captura privada.');
const snapshot = JSON.parse(fs.readFileSync(file,'utf8'));
const rows = snapshot.ranges.find(range=>range.range.startsWith('Actual!')).values;
const blocks=[{fund:'cash',date:1,title:3,effect:5},{fund:'personal',date:9,title:11,effect:13},{fund:'company',date:17,title:19,effect:21}];
const iso = value => typeof value==='number'?new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10):'';
const norm = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const sheet=[];
for(let i=2;i<rows.length;i++)for(const b of blocks){const r=rows[i]||[];const date=iso(r[b.date]),title=String(r[b.title]||'').trim(),effect=r[b.effect];
  if(date<'2026-09-01'||date>'2026-09-30'||!title||typeof effect!=='number'||effect===0)continue;
  const label=norm(title);
  if(/saldo inicial|ingresos estimados|rendiciones y ventas depo|reserva de sueldos|reingreso sueldos|ajuste/.test(label))continue;
  sheet.push({row:i+1,fund:b.fund,date,title,kind:effect>0?'ingreso':'egreso',cents:Math.round(Math.abs(effect)*100)});
}
const isCashAccount = name => /caja efectivo pesos/i.test(name);
const tokens = value => new Set(norm(value).split(/[^a-z0-9]+/).filter(word=>word.length>=4 && !['pago','transferencia','efectivo','pesos','cuenta'].includes(word)));
(async()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'payment_planning_match_movements'});
  await db.connect();
  try{
    const {rows:movements}=await db.query(`select t.id,(coalesce(t.registered_at,t.created_at) at time zone 'America/Argentina/Buenos_Aires')::date::text as date,
      t.type,t.amount,t.concept,t.notes,t.category,t.sub_category,coalesce(a.name,'Sin cuenta') as account
      from public.cash_transactions t left join public.financial_accounts a on a.id=t.financial_account_id
      where t.currency='ARS' and coalesce(t.registered_at,t.created_at)>='2026-09-01'::timestamptz
        and coalesce(t.registered_at,t.created_at)<'2026-10-02'::timestamptz`);
    const byKey=new Map();
    for(const move of movements){const key=`${move.date}:${move.type}:${Math.round(Number(move.amount)*100)}`;const arr=byKey.get(key)||[];arr.push(move);byKey.set(key,arr)}
    const results=sheet.map(row=>{
      const candidates=(byKey.get(`${row.date}:${row.kind}:${row.cents}`)||[]).map(move=>{
        const text=[move.concept,move.notes,move.category,move.sub_category].join(' '), words=tokens(row.title), other=tokens(text);
        const matching=[...words].filter(word=>other.has(word));
        const accountFit=row.fund==='cash'?isCashAccount(move.account):row.fund==='company'?/galicia|santander|icbc|banco/i.test(move.account):/mp|visa/i.test(move.account);
        return {id:move.id,account:move.account,matching,accountFit};
      });
      return {...row,candidates};
    });
    const use=new Map();for(const row of results)for(const candidate of row.candidates)use.set(candidate.id,(use.get(candidate.id)||0)+1);
    for(const row of results){row.classification=row.candidates.length===0?'none':row.candidates.length>1?'multiple':use.get(row.candidates[0].id)>1?'shared':row.candidates[0].accountFit && row.candidates[0].matching.length>0?'strong':row.candidates[0].accountFit?'account_amount_date':'amount_date_only'}
    const summary=Object.fromEntries(Object.entries(Object.groupBy(results,row=>row.classification)).map(([type,group])=>[type,group.length]));
    const out=path.join(path.dirname(file),'movement-matches-september.json');
    fs.writeFileSync(out,JSON.stringify({capturedAt:snapshot.capturedAt,examined:sheet.length,movements:movements.length,summary,rows:results},null,2));
    console.log(JSON.stringify({examined:sheet.length,movements:movements.length,summary,output:out}));
  }finally{await db.end()}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1});
