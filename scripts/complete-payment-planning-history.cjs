// Mark imported draft items through 29/09/2026 as manually realized.
// Rehearses and rolls back by default; --apply commits the same transaction.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const cutoff = '2026-09-29';
const note = 'Realizado manualmente por instrucción del usuario; sin vínculo confirmado a Movimientos.';

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    application_name: apply ? 'payment_planning_history_complete_apply' : 'payment_planning_history_complete_rehearsal' });
  await db.connect();
  try {
    await db.query('begin');
    try {
      await db.query("set local lock_timeout='5s'");
      await db.query("set local statement_timeout='120s'");
      const actor = (await db.query(`
        select b.created_by from public.payment_planning_import_batches b
        join public.sellers s on s.id = b.created_by
        where s.is_active is distinct from false and (s.role = 'admin' or 'admin' = any(s.roles))
        order by b.created_at desc limit 1
      `)).rows[0]?.created_by;
      if (!actor) throw new Error('No se encontró el administrador que importó la planilla.');

      const items = (await db.query(`
        select * from public.payment_planning_items
        where status = 'draft' and scheduled_date <= $1::date
        order by scheduled_date, id for update
      `, [cutoff])).rows;
      if (items.length === 0) {
        await db.query('rollback');
        console.log(JSON.stringify({ status: 'already_completed', cutoff }));
        return;
      }
      if (items.length !== 197) throw new Error(`Se esperaban 197 borradores históricos; hay ${items.length}. Revisar antes de aplicar.`);
      const realized = new Map((await db.query(`
        select item_id, coalesce(sum(amount), 0)::numeric as amount
        from public.payment_planning_realizations
        where reversed_at is null and item_id = any($1::uuid[])
        group by item_id
      `, [items.map(item => item.id)])).rows.map(row => [row.item_id, Number(row.amount)]));
      let inserted = 0;
      for (const item of items) {
        const remaining = Number(item.amount) - Number(item.closed_amount || 0) - (realized.get(item.id) || 0);
        if (item.amount === null || !Number.isFinite(remaining) || remaining <= 0) {
          throw new Error(`El borrador ${item.id} no tiene importe pendiente positivo.`);
        }
        const before = { ...item };
        const after = (await db.query(`
          update public.payment_planning_items
          set status = 'active', version = version + 1, updated_at = now()
          where id = $1 and status = 'draft' returning *
        `, [item.id])).rows[0];
        if (!after) throw new Error(`No se pudo activar ${item.id}.`);
        await db.query(`
          insert into public.payment_planning_events(entity_type, entity_id, action, before_value, after_value, reason, actor_id)
          values ('item', $1, 'historical_manual_completion', $2::jsonb, $3::jsonb, $4, $5)
        `, [item.id, JSON.stringify(before), JSON.stringify(after), note, actor]);
        const realization = (await db.query(`
          insert into public.payment_planning_realizations(item_id, fund_id, amount, effective_date, notes, created_by)
          values ($1, $2, $3, $4, $5, $6) returning *
        `, [item.id, item.fund_id, remaining.toFixed(2), item.scheduled_date, note, actor])).rows[0];
        await db.query(`
          insert into public.payment_planning_events(entity_type, entity_id, action, after_value, reason, actor_id)
          values ('realization', $1, 'historical_manual_completion', $2::jsonb, $3, $4)
        `, [realization.id, JSON.stringify(realization), note, actor]);
        inserted++;
      }
      const check = (await db.query(`
        select count(*)::int as drafts_left from public.payment_planning_items
        where status = 'draft' and scheduled_date <= $1::date
      `, [cutoff])).rows[0];
      if (check.drafts_left !== 0 || inserted !== 197) throw new Error('La comprobación del lote histórico no coincide.');
      if (apply) await db.query('commit'); else await db.query('rollback');
      console.log(JSON.stringify({ status: apply ? 'applied' : 'rehearsed_and_rolled_back', cutoff, manuallyRealized: inserted }));
    } catch (error) { await db.query('rollback'); throw error; }
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
