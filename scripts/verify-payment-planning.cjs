const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
process.loadEnvFile('.env.local');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    const { rows: [grants] } = await db.query(`select
      has_table_privilege('anon','public.payment_planning_items','SELECT') as anon_items,
      has_table_privilege('authenticated','public.payment_planning_items','SELECT') as authenticated_items,
      has_function_privilege('anon','public.payment_planning_mutate(uuid,uuid,text,jsonb)','EXECUTE') as anon_mutate,
      has_function_privilege('service_role','public.payment_planning_mutate(uuid,uuid,text,jsonb)','EXECUTE') as service_mutate,
      (select count(*)::integer from public.payment_planning_balances) as opening_balances`);
    if (grants.anon_items || grants.authenticated_items || grants.anon_mutate || !grants.service_mutate) throw new Error('Permisos inesperados.');
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await service.from('payment_planning_funds').select('name,kind,currency');
    if (error) throw error;
    if (data.length !== 3) throw new Error('Los tres fondos no están disponibles por la API.');
    console.log(JSON.stringify({ status: 'verified', funds: data.length, opening_balances: grants.opening_balances, direct_client_access: false }));
  } finally { await db.end(); }
})().catch(error => { console.error(`Verificación v115: ${error.code || error.message}`); process.exitCode = 1; });
