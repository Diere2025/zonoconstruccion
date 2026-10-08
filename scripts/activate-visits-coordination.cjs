const fs=require('node:fs');
const {Client}=require('pg');
process.loadEnvFile('.env.local');
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{await db.connect();await db.query('begin');try{
 await db.query("set local lock_timeout='5s';set local statement_timeout='30s'");
 const before=(await db.query('select count(*)::int n from public.visit_cases')).rows[0].n;
 await db.query(fs.readFileSync('database/db_migration_v153_visits_coordination.sql','utf8'));
 const after=(await db.query('select count(*)::int n from public.visit_cases')).rows[0].n;
 if(before!==after)throw new Error('Unexpected case count');
 await db.query('commit');console.log(JSON.stringify({migration:'v153',casesPreserved:after}));
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
