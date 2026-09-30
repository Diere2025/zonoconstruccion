import { NextResponse } from 'next/server';
import { planningContext, planningSnapshot, PlanningError } from '@/lib/paymentPlanning/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof PlanningError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (['42P01','42703','PGRST202','PGRST205'].includes(code || '')) {
    return NextResponse.json({ error: 'Planificación todavía no está habilitada en la base de datos (migración 115).' }, { status: 503 });
  }
  if (code === '40001') return NextResponse.json({ error: 'El registro cambió en otra sesión. Actualizá la vista y revisá los datos.' }, { status: 409 });
  if (code === '23505') return NextResponse.json({ error: 'Ese registro ya existe. Actualizá la vista.' }, { status: 409 });
  if (code === '42501') return NextResponse.json({ error: 'No tenés permiso para esta operación.' }, { status: 403 });
  return NextResponse.json({ error: (error as { message?: string })?.message || 'No se pudo completar la operación.' }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('action') === 'movement_options') {
      const { db } = await planningContext(request);
      const accounts = await db.from('financial_accounts').select('id,name,type,currency,is_active').eq('is_active',true).order('name');
      if (accounts.error) throw accounts.error;
      const concepts = [];
      for (let offset = 0; ; offset += 500) {
        const page = await db.from('financial_concepts')
          .select('id,concept,category,sub_category,movement_type,efe_category,is_active')
          .eq('is_active',true).order('concept').order('id').range(offset,offset+499);
        if (page.error) throw page.error;
        concepts.push(...(page.data || []));
        if (!page.data || page.data.length < 500) break;
      }
      return NextResponse.json({ accounts: accounts.data || [], concepts }, { headers: { 'Cache-Control':'no-store' } });
    }
    const itemId = url.searchParams.get('itemId');
    if (itemId) {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(itemId)) throw new PlanningError('Ítem inválido.');
      const { db } = await planningContext(request);
      const [events, realizations, sourceRows] = await Promise.all([
        db.from('payment_planning_events').select('id,action,before_value,after_value,reason,created_at').eq('entity_type','item').eq('entity_id',itemId).order('id',{ascending:false}).limit(50),
        db.from('payment_planning_realizations').select('id,item_id,fund_id,amount,effective_date,notes,reversed_at,reversal_reason,cash_transaction_id').eq('item_id',itemId).order('created_at',{ascending:false}).limit(100),
        db.from('payment_planning_source_rows').select('sheet_row,source_date,match_status,candidate_count,notes').eq('item_id',itemId).limit(5)
      ]);
      if (events.error) throw events.error;
      if (realizations.error) throw realizations.error;
      if (sourceRows.error) throw sourceRows.error;
      return NextResponse.json({ events: events.data || [], realizations: realizations.data || [], sourceRows: sourceRows.data || [] }, { headers: { 'Cache-Control':'no-store' } });
    }
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const result = await planningSnapshot(request, from, to);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

const actions = new Set(['create_item','update_item','move_item','cancel_item','realize','realize_with_movement','reverse_realization','close_remaining','reopen_remaining','create_installments','observe_balance','reservation','scenario','create_rate','transfer','create_recurrence','generate_recurrence','import_rows']);
export async function POST(request: Request) {
  try {
    const { db, actor } = await planningContext(request);
    const body = await request.json();
    if (!body || typeof body !== 'object' || !actions.has(body.action) || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.key) || !body.payload || typeof body.payload !== 'object') {
      throw new PlanningError('Solicitud inválida.');
    }
    const { data, error } = body.action === 'move_item'
      ? await db.rpc('payment_planning_move_item', { p_actor: actor, p_key: body.key, p_payload: body.payload })
      : body.action === 'realize_with_movement'
      ? await db.rpc('payment_planning_realize_with_movement', { p_actor: actor, p_key: body.key, p_payload: body.payload })
      : await db.rpc('payment_planning_mutate', {
        p_actor: actor, p_key: body.key, p_action: body.action, p_payload: body.payload
      });
    if (error) throw error;
    return NextResponse.json({ result: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
