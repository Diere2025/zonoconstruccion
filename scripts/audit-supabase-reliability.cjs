// Production diagnostics: one connection, read-only transaction, bounded queries.
// No credentials, customer records, or SQL literal values are included in output.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 12000 });
const queries = {
  health: "select now(), pg_postmaster_start_time(), current_setting('max_connections') as max_connections, pg_size_pretty(pg_database_size(current_database())) as db_size",
  connections: 'select backend_type,usename,state,wait_event_type,wait_event,count(*) from pg_stat_activity group by 1,2,3,4,5',
  stats: 'select stats_reset,numbackends,xact_commit,xact_rollback,deadlocks,temp_bytes,blk_read_time,blk_write_time from pg_stat_database where datname=current_database()',
  extensions: "select extname,extnamespace::regnamespace::text as schema from pg_extension where extname in ('pg_stat_statements','pg_cron','pg_trgm')",
  tables: "select relname,n_live_tup,n_dead_tup,seq_scan,seq_tup_read,idx_scan,last_autovacuum,last_autoanalyze from pg_stat_user_tables order by seq_tup_read desc limit 20",
  indexes: "select i.indrelid::regclass::text as tablename,c.relname as indexname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) as indexdef from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid = any(array[to_regclass('public.orders'),to_regclass('public.order_items'),to_regclass('public.sellers'),to_regclass('public.mp_payments'),to_regclass('public.order_sync_jobs'),to_regclass('public.cash_transactions'),to_regclass('public.delivery_attempts')])",
  blocking: "select state,wait_event_type,wait_event,count(*) as connections,max(extract(epoch from now()-query_start)) as longest_seconds from pg_stat_activity where cardinality(pg_blocking_pids(pid))>0 group by 1,2,3",
  slow_queries: "select queryid::text,calls,round(total_exec_time::numeric,1) as total_ms,round(mean_exec_time::numeric,1) as mean_ms,round(max_exec_time::numeric,1) as max_ms,rows,shared_blks_read,temp_blks_written,regexp_replace(left(query,2400), E'''[^'']*''', '?', 'g') as query_shape from extensions.pg_stat_statements where query not ilike '%pg_stat_statements%' order by total_exec_time desc limit 15",
  policies: "select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('orders','order_items','sellers','mp_payments','order_sync_jobs')",
  settings: "select name,setting,unit from pg_settings where name in ('shared_buffers','work_mem','effective_cache_size','statement_timeout','max_worker_processes')",
  cron_jobs: 'select jobid,jobname,schedule,active from cron.job',
  cron_results: "select jobid,status,count(*) as runs,min(start_time) as first_start,max(start_time) as last_start from cron.job_run_details where start_time>now()-interval '24 hours' group by 1,2",
  cron_recent: "select jobid,status,start_time,end_time,case when status='succeeded' then 'ok' when return_message ilike '%statement timeout%' then 'statement_timeout' when return_message ilike '%server closed%' or return_message ilike '%connection%' then 'connection_error' when return_message ilike '%does not exist%' then 'missing_object' when return_message ilike '%permission%' then 'permission_error' else 'other' end as result_category from cron.job_run_details order by runid desc limit 30",
  cron_failure_messages: "with recent as (select jobid,status,return_message from cron.job_run_details order by runid desc limit 30) select jobid,regexp_replace(left(split_part(return_message,E'\\n',1),400), E'''[^'']*''', '?', 'g') as message,count(*) as runs from recent where status='failed' group by 1,2",
  replication: 'select slot_name,slot_type,active,wal_status,pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::text as retained_wal_bytes from pg_replication_slots',
  balances_definition: "select pg_get_functiondef(to_regprocedure('public.get_account_balances_prior_to(timestamp with time zone)')) as definition",
  balances_plan: "explain (analyze, buffers, format json) select * from public.get_account_balances_prior_to(current_date::timestamptz)",
  import_plan: "explain (analyze, buffers, format json) select id from public.orders where legacy_code ilike '%JS25619%' or legacy_code ilike '%LK1695%'",
  sync_queue: 'select status,count(*) as jobs,min(created_at) as oldest,max(created_at) as newest from public.order_sync_jobs group by status',
  client_columns: "select attname from pg_attribute where attrelid='public.clients'::regclass and attnum>0 and not attisdropped order by attnum",
};
const requested = process.argv.find(arg => arg.startsWith('--sections='))?.slice('--sections='.length).split(',');
(async () => {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout='8s'");
  for (const [name, sql] of Object.entries(queries)) {
    if (requested && !requested.includes(name)) continue;
    await db.query('SAVEPOINT diagnostic');
    try {
      console.log(JSON.stringify({ section: name, rows: (await db.query(sql)).rows }));
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT diagnostic');
      console.log(JSON.stringify({ section: name, error: error.code || 'query_failed' }));
    }
    await db.query('RELEASE SAVEPOINT diagnostic');
  }
  await db.query('ROLLBACK');
})().catch(error => { console.error('Diagnostic failed:', error.code || 'connection_failed'); process.exitCode = 1; }).finally(() => db.end());
