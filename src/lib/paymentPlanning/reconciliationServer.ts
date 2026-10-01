import { allRows, planningContext, PlanningError } from './server';
import { cents, money, nextDate, validDate, type Item, type Realization } from './model';
import type { ReconciliationMovement, ReconciliationData } from './reconciliationTypes';

export async function reconciliationOptions(request: Request, url: URL): Promise<ReconciliationData> {
  const itemId = url.searchParams.get('itemId') || '';
  const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
  const page = Number(url.searchParams.get('page') || '0');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(itemId) || !validDate(from) || !validDate(to)
    || from > to || Date.parse(to)-Date.parse(from)>93*86400000 || !Number.isInteger(page) || page<0 || page>100) {
    throw new PlanningError('Elegí un pago y un rango de hasta 93 días.');
  }
  const { db } = await planningContext(request);
  const found = await db.from('payment_planning_items').select('*').eq('id',itemId).single();
  if (found.error) throw found.error;
  const item = found.data as Item;
  const [realizations, accounts, used, funds] = await Promise.all([
    allRows<Realization>(db.from('payment_planning_realizations').select('*').eq('item_id',itemId).is('reversed_at',null).order('effective_date').order('created_at').order('id')),
    allRows<{id: string; name: string; currency: string; type: string}>(db.from('financial_accounts').select('id,name,currency,type').order('name').order('id')),
    allRows<{cash_transaction_id: string}>(db.from('payment_planning_realizations').select('cash_transaction_id').not('cash_transaction_id','is',null).order('id')),
    db.from('payment_planning_funds').select('currency').eq('id',item.fund_id).single()
  ]);
  if (funds.error) throw funds.error;
  const realized = realizations.reduce((sum,row) => sum+cents(row.amount),0);
  const reconciled = realizations.filter(row=>row.cash_transaction_id).reduce((sum,row)=>sum+cents(row.amount),0);
  const capacity = item.status !== 'active' || item.amount === null ? 0 : Math.max(0,cents(item.amount)-cents(item.closed_amount || 0)-reconciled);
  const probe=await db.from('cash_transactions').select('operation_id').limit(1);
  const operationsAvailable=!probe.error;
  if(probe.error && !( ['42703','PGRST204'].includes(probe.error.code) && /operation_id/.test(probe.error.message)))throw probe.error;
  const movementFields = `id,amount,currency,type,created_at,financial_account_id,concept,category${operationsAvailable?',financial_operations(operation_type,status)':''}`;
  let query = db.from('cash_transactions').select(movementFields)
    .eq('type',item.kind === 'expense' ? 'egreso' : 'ingreso').eq('currency',funds.data.currency)
    .gt('amount',0).not('financial_account_id','is',null)
    .gte('created_at',`${from}T00:00:00-03:00`).lt('created_at',`${nextDate(to)}T00:00:00-03:00`);
  if(operationsAvailable)query=query.is('reversal_of_transaction_id',null);
  let accountIds = url.searchParams.getAll('accounts');
  const fundId = url.searchParams.get('initializeFundId') || '';
  if(fundId){
    const selectedFund=await db.from('payment_planning_funds').select('kind,currency').eq('id',fundId).single();
    if(selectedFund.error || selectedFund.data.currency!==funds.data.currency)throw new PlanningError('Fondo inválido.');
    const compatible=accounts.filter(row=>{
      const kind=row.type==='efectivo'?'cash':/^cuenta mp[345]/i.test(row.name)?'personal':'company';
      return row.currency===selectedFund.data.currency && kind===selectedFund.data.kind;
    });
    accountIds=compatible.map(row=>row.id);
  }
  if (accountIds.some(id=>!accounts.some(row=>row.id===id && row.currency===funds.data.currency)))throw new PlanningError('Caja inválida.');
  query=query.in('financial_account_id',accountIds);
  const search = (url.searchParams.get('search') || '').trim().slice(0,120);
  if (search) query = query.ilike('concept',`%${search.replace(/[\\%_]/g,character=>`\\${character}`)}%`);
  const candidates = await query.order('created_at',{ascending:false}).order('id').range(page*200,page*200+199);
  if (candidates.error) throw candidates.error;
  const usedIds = new Set(used.map(row=>row.cash_transaction_id));
  const linkedIds = realizations.flatMap(row=>row.cash_transaction_id ? [row.cash_transaction_id] : []);
  const linked = linkedIds.length ? await db.from('cash_transactions').select(movementFields).in('id',linkedIds) : {data:[],error:null};
  if (linked.error) throw linked.error;
  return {item,realizations,accounts,accountIds,realized:money(realized),reconciled:money(reconciled),unlinked:money(realized-reconciled),capacity:money(capacity),
    movements:((candidates.data || []) as unknown as (ReconciliationMovement & {financial_operations?:{operation_type:string;status:string}|Array<{operation_type:string;status:string}>|null})[]).filter(row=>{
      const relation=row.financial_operations;
      const operation=Array.isArray(relation)?relation[0]:relation;
      return !usedIds.has(row.id) && operation?.status!=='cancelled' && !['internal_transfer','custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count'].includes(operation?.operation_type || '');
    }) as ReconciliationMovement[],
    linkedMovements:(linked.data || []) as ReconciliationMovement[],hasMore:candidates.data?.length===200};
}
