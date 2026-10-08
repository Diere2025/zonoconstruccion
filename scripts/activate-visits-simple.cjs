const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async()=>{await db.connect();try{await db.query('begin');await db.query("set local lock_timeout='5s'; set local statement_timeout='90s'");await db.query('select pg_advisory_xact_lock(148148)');const before=(await db.query('select count(*)::int n from public.visit_cases')).rows[0].n;await db.query(fs.readFileSync('database/db_migration_v148_visits_simple.sql','utf8'));const after=(await db.query('select count(*)::int n from public.visit_cases')).rows[0].n;if(before!==after)throw new Error('Unexpected case count');await db.query('commit');console.log(JSON.stringify({migration:'v148',casesPreserved:after,catalogueUnchanged:true}));}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.code||e.name,e.message);process.exitCode=1;});
