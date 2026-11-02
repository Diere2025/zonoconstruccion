const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
test('reserve transfer matching accepts inclusive ±2 minutes, rejects ambiguity and ordinary payments',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table mp_reserve_accounts(mp_account_id text,reserve_id uuid,enabled boolean,history_from date);
 create table mp_reserve_web_rows(id uuid,mp_account_id text,reserve_id uuid,amount numeric,occurred_at timestamptz,kind text);
 create table mp_bank_web_rows(id uuid,mp_account_id text,operation_id text,amount numeric,occurred_at timestamptz);
 create role anon;create role authenticated;create role service_role;`);
 const migration=fs.readFileSync('database/db_migration_v268_mp_reserve_time_tolerance.sql','utf8');
 await db.exec(migration.slice(0,migration.indexOf('create or replace function public.mark_mp_bank_reserve_pairs'))+'commit;');
 const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 await db.query('insert into mp_reserve_accounts values($1,$2,true,$3)',['mp',uuid(1),'2026-10-01']);
 const seed=async(offset,options={})=>{
 await db.exec('truncate mp_reserve_web_rows,mp_bank_web_rows');
 await db.query('insert into mp_reserve_web_rows values($1,$2,$3,-35000,$4,$5)',[uuid(2),'mp',uuid(1),'2026-10-31T13:46:00Z','withdrawal']);
 const time=new Date(Date.parse('2026-10-31T13:46:00Z')+offset*1000).toISOString();
 await db.query('insert into mp_bank_web_rows values($1,$2,$3,-35000,$4)',[uuid(3),'mp','185983265693',time]);
 if(!options.single)await db.query('insert into mp_bank_web_rows values($1,$2,$3,35000,$4)',[uuid(4),'mp','185983265693',time]);
 // The real payment has the same amount and clock, but no opposite side.
 await db.query('insert into mp_bank_web_rows values($1,$2,$3,-35000,$4)',[uuid(5),'mp','185983560161',time]);
 };
 const matches=async()=>(await db.query("select * from mp_reserve_transfer_candidates('mp')")).rows;
 for(const offset of [-120,-60,0,60,120]){await seed(offset);assert.deepEqual(await matches(),[{reserve_row_id:uuid(2),bank_capture_id:uuid(3)}]);}
 for(const offset of [-121,121]){await seed(offset);assert.equal((await matches()).length,0);}
 await seed(60,{single:true});assert.equal((await matches()).length,0);
 await seed(60);await db.query('insert into mp_reserve_web_rows select $1,mp_account_id,reserve_id,amount,occurred_at,kind from mp_reserve_web_rows',[uuid(6)]);assert.equal((await matches()).length,0);
 await seed(60);await db.query('insert into mp_bank_web_rows select $1,mp_account_id,$2,amount,occurred_at from mp_bank_web_rows where id=$3',[uuid(7),'other-pair',uuid(3)]);await db.query('insert into mp_bank_web_rows select $1,mp_account_id,$2,amount,occurred_at from mp_bank_web_rows where id=$3',[uuid(8),'other-pair',uuid(4)]);assert.equal((await matches()).length,0);
 await seed(60);await db.exec("update mp_bank_web_rows set mp_account_id='other'");assert.equal((await matches()).length,0);
 await seed(60);await db.exec('update mp_reserve_accounts set enabled=false');assert.equal((await matches()).length,0);
 }finally{await db.close();}
});
