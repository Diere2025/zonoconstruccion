// Run only after explicit authorization to activate movement codes in production.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {Client}=require('pg');
process.loadEnvFile('.env.local');
if(process.argv[2]!=='--activate-production-v164')throw Error('Explicit activation flag required');
const ref='ckvbyfgsbjbfaqotmeld',connection=new URL(process.env.DATABASE_URL);
if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${ref}.supabase.co`||!(connection.username.endsWith(`.${ref}`)||connection.hostname===`db.${ref}.supabase.co`))throw Error('Unexpected production project');
(async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();
 try{
  await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='60s'");
  await db.query('lock table public.cash_transactions,public.supplier_payments,public.client_payments in share row exclusive mode');
  const snapshot=async()=>({
   ledger:(await db.query("select count(*)::int movements,md5(string_agg(md5((to_jsonb(t)-'movement_code')::text),'' order by id)) fingerprint from public.cash_transactions t")).rows[0],
   balances:(await db.query("select financial_account_id,currency,sum(case when type='ingreso' then amount else -amount end)::text net from public.cash_transactions group by 1,2 order by 1,2")).rows,
   payments:(await db.query('select (select count(*) from public.supplier_payments)::int supplier_payments,(select count(*) from public.client_payments)::int client_payments')).rows[0]
  });
  const before=await snapshot();
  const sql=fs.readFileSync('database/db_migration_v164_movement_codes.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');
  await db.query(sql);const after=await snapshot();assert.deepEqual(after,before,'Existing ledger data changed; activation reverted');
  const codes=(await db.query("select count(*)::int movements,count(distinct movement_code)::int unique_codes,count(*) filter(where movement_code is null or movement_code !~ '^(PAG|COB)-[0-9]{10,}$')::int invalid_codes from public.cash_transactions")).rows[0];
  assert.equal(codes.invalid_codes,0);assert.equal(codes.movements,codes.unique_codes);
  const prerequisites=(await db.query("select to_regclass('public.operation_vouchers') is not null vouchers,to_regclass('public.supplier_payment_allocations') is not null allocations")).rows[0];assert.ok(prerequisites.vouchers&&prerequisites.allocations,'Application relationships are not enabled');
  await db.query('commit');
  fs.mkdirSync('output/movement-codes',{recursive:true});fs.writeFileSync('output/movement-codes/activation.json',JSON.stringify({activatedAt:new Date().toISOString(),project:ref,existingDataPreserved:true,movements:codes.movements,uniqueCodes:codes.unique_codes},null,2));
  console.log(JSON.stringify({activated:true,existingDataPreserved:true,movements:codes.movements,uniqueCodes:codes.unique_codes}));
 }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});