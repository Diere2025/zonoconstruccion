import {movementCode} from '@/lib/financialOperations/references';
import {supplierReferenceData} from '@/lib/financialOperations/referenceServer';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requirePurchaseOperator } from '@/lib/purchaseAccess';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { isAccountDate, isUuid, openingAmount, supplierLedger, type AccountEntry, type AccountStart, type HistoryChoice } from '@/lib/supplierAccount';
import { processSupplierSheetJob } from '@/lib/supplierAccounts/sheetSync';
import type { SupplierAccountSummary } from '@/lib/supplierAccounts/report';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function access(request: Request, receipt = false) {
  const denied = receipt ? await requirePurchaseOperator(request) : await requireFinanceAdmin(request, 'supplier-accounts');
  if (denied) return { response: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: NextResponse.json({ error: 'La sesión venció.' }, { status: 401 }) };
  return { db, user };
}

// Supabase limits each response. Read every page so historical selection and balances never truncate.
async function allRows<T>(query: { range: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
const failure = (error: unknown, status = 500) => {
  const code = (error as { code?: string })?.code;
  const message = ['42P01', '42703', 'PGRST202', 'PGRST205'].includes(code || '')
    ? 'Falta habilitar cuentas corrientes de proveedores en la base de datos (migraciones 112, 113 y 168).'
    : error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo actualizar la cuenta corriente.';
  return NextResponse.json({ error: message }, { status });
};

const invalidAccountRequest = (message:string) => Object.assign(new Error(message),{status:400});

async function readAccounts(db: SupabaseClient, params: URLSearchParams) {
    const supplierId = params.get('supplierId');
    const from = params.get('from') || undefined, to = params.get('to') || undefined;
    if ((from && !isAccountDate(from)) || (to && !isAccountDate(to)) || (from && to && from > to)) throw invalidAccountRequest('Período de cuenta corriente inválido.');
    if (!supplierId) {
      if(params.get('view')==='dashboard'){
        const [suppliers,settings]=await Promise.all([
          allRows<SupplierAccountSummary>(db.rpc('get_supplier_account_dashboard',{p_to:to??null})),
          db.from('supplier_account_visibility_settings').select('inactivity_months').eq('singleton',true).single(),
        ]);
        if(settings.error)throw settings.error;
        return {suppliers,inactivityMonths:settings.data.inactivity_months as number};
      }
      const data = await allRows<SupplierAccountSummary>(to ? db.rpc('get_supplier_account_balances_at',{p_to:to}) : db.rpc('get_supplier_account_balances'));
      return { suppliers: data };
    }
    if (!isUuid(supplierId)) throw invalidAccountRequest('Proveedor inválido.');
    const view=params.get('view');
    if(view==='documents'){
      const documents=await allRows<{source_id:string;reference:string;currency:string}>(db.from('supplier_account_entries')
        .select('source_id,reference,currency').eq('supplier_id',supplierId).eq('source','purchase')
        .eq('voided',false).neq('kind','Nota de Crédito').order('entry_date').order('source_id'));
      return {documents:documents.map(({source_id,reference,currency})=>({id:source_id,reference,currency}))};
    }
    const currency=params.get('currency'), page=Number(params.get('page')??0), query=(params.get('q')||'').toLowerCase();
    if(view!==null&&(!['current','history'].includes(view)||!['ARS','USD'].includes(currency||'')
      ||!Number.isSafeInteger(page)||page<0||page>1_000_000)){
      throw invalidAccountRequest('Selección de extracto inválida.');
    }
    const [config, entries, history] = await Promise.all([
      db.from('supplier_account_starts').select('*').eq('supplier_id', supplierId).maybeSingle(),
      allRows(db.from('supplier_account_entries').select('*').eq('supplier_id', supplierId).order('entry_date').order('source').order('source_id')),
      allRows(db.from('supplier_account_history').select('*').eq('supplier_id', supplierId).order('source').order('source_id'))
    ]);
    if (config.error) throw config.error;
    const references=await supplierReferenceData(db,supplierId);
    const movements=new Map(references.movements.map(t=>[t.id,t]));
    for(const entry of entries as AccountEntry[]){
      entry.applications=(entry.source==='purchase'?references.byPurchase:references.byPayment).get(entry.source_id)||[];
      if(entry.source==='payment'){
        const movement=entry.cash_transaction_id?movements.get(entry.cash_transaction_id):undefined;
        entry.reference=movement?movementCode(movement):`PAG-${entry.source_id.toUpperCase()}`;
      }
    }
    const start = config.data as AccountStart | null;
    const ledger=supplierLedger(start,entries as AccountEntry[],history as HistoryChoice[],{from,to});
    if(view===null)return {start,...ledger};
    const rows=ledger.rows.filter(row=>row.currency===currency
      && (view==='current'?row.included:!row.included||row.historical||row.reconciled)
      && (!query||`${row.reference} ${row.kind} ${row.notes||''} ${(row.applications||[]).map(a=>a.code).join(' ')}`.toLowerCase().includes(query)));
    // Reverse the display only, after computing balances and before taking the page.
    rows.reverse();
    const pageSize=50, currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/pageSize)-1));
    return {...ledger,start,total:rows.length,page:currentPage,pageSize,
      rows:params.get('all')==='1'?rows:rows.slice(currentPage*pageSize,(currentPage+1)*pageSize)};
}

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (context.response) return context.response;
    return NextResponse.json(await readAccounts(context.db,new URL(request.url).searchParams));
  } catch (error) { return failure(error,(error as {status?:number})?.status===400?400:500); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const context = await access(request, body?.action === 'receipt');
    if (context.response) return context.response;
    const { db, user } = context;
    if(body?.action==='exportSheets'){
      const {exportSupplierReportToSheets,parseSupplierSpreadsheetUrl}=await import('@/lib/supplierAccounts/googleExport');
      const {buildSupplierAccountReport,defaultSupplierDashboardView,supplierDashboardViewFromParams}=await import('@/lib/supplierAccounts/report');
      const spreadsheetId=parseSupplierSpreadsheetUrl(body.spreadsheetUrl);
      if(!spreadsheetId)throw invalidAccountRequest('Ingresá un enlace válido de Google Sheets.');
      const params=new URLSearchParams();
      const dashboardKeys=Object.keys(defaultSupplierDashboardView).map(key=>'dashboard.'+key);
      for(const key of ['supplierId','view','currency','from','to','q','showHidden',...dashboardKeys]){
        const value=body.filters?.[key];
        if(typeof value==='string'&&value)params.set(key,value);
      }
      const supplierId=params.get('supplierId');
      if(supplierId&&!['current','history'].includes(params.get('view')||''))throw invalidAccountRequest('Elegí un extracto para exportar.');
      params.set('all','1');
      const data=await readAccounts(db,params);
      const supplier=supplierId?await db.from('suppliers').select('name').eq('id',supplierId).single():null;
      if(supplier?.error)throw supplier.error;
      const report=buildSupplierAccountReport(data,{supplier:supplier?.data?.name,from:params.get('from')||'',to:params.get('to')||'',
        currency:params.get('currency')||'ARS',view:params.get('view')||'current',query:params.get('q')||'',
        showHidden:params.get('showHidden')==='1',dashboard:supplierDashboardViewFromParams(params)});
      return NextResponse.json({url:await exportSupplierReportToSheets(spreadsheetId,report)});
    }
    const audit = { updated_by: user.id, updated_at: new Date().toISOString() };
    if(body?.action==='setVisibilityMonths'){
      if(!Number.isInteger(body.months)||body.months<1||body.months>120)throw invalidAccountRequest('Ingresá una cantidad de meses entre 1 y 120.');
      const {error}=await db.from('supplier_account_visibility_settings')
        .upsert({singleton:true,inactivity_months:body.months,...audit});
      if(error)throw error;
      return NextResponse.json({ok:true});
    }
    if (!isUuid(body.supplierId)) return failure(new Error('Proveedor inválido.'), 400);
    if(body.action==='setSupplierVisibility'){
      if(!['automatic','visible','hidden'].includes(body.visibility))throw invalidAccountRequest('Elegí una opción de visibilidad.');
      const {error}=await db.from('supplier_account_visibility_overrides')
        .upsert({supplier_id:body.supplierId,visibility:body.visibility,...audit});
      if(error)throw error;
    } else if (body.action === 'start') {
      if (!isAccountDate(body.startDate)) return failure(new Error('Fecha de inicio inválida.'), 400);
      let ars: number; let usd: number;
      try { ars = openingAmount(body.openingArs); usd = openingAmount(body.openingUsd); } catch (error) { return failure(error, 400); }
      if (typeof body.notes !== 'string' || !body.notes.trim()) return failure(new Error('Anotá el criterio del punto de partida.'), 400);
      const { error } = await db.from('supplier_account_starts').upsert({ supplier_id: body.supplierId, start_date: body.startDate,
        opening_ars: ars, opening_usd: usd, notes: body.notes.trim(), ...audit });
      if (error) throw error;
    } else if (body.action === 'history') {
      if (!['purchase', 'payment'].includes(body.source) || !isUuid(body.sourceId) || typeof body.included !== 'boolean'
        || typeof body.notes !== 'string' || !body.notes.trim()) return failure(new Error('Seleccioná el documento y anotá el motivo de conciliación.'), 400);
      const [entry, start] = await Promise.all([
        db.from('supplier_account_entries').select('source_id,voided').eq('supplier_id', body.supplierId).eq('source', body.source).eq('source_id', body.sourceId).maybeSingle(),
        db.from('supplier_account_starts').select('supplier_id').eq('supplier_id', body.supplierId).maybeSingle()
      ]);
      if (entry.error) throw entry.error;
      if (start.error) throw start.error;
      if (!start.data || !entry.data || entry.data.voided) return failure(new Error('Configurá el punto de partida y elegí un documento vigente del proveedor.'), 400);
      const { error } = await db.from('supplier_account_history').upsert({ supplier_id: body.supplierId, source: body.source, source_id: body.sourceId,
        included: body.included, notes: body.notes.trim(), ...audit });
      if (error) throw error;
    } else if (body.action === 'receipt') {
      if (!isUuid(body.id) || (body.poId && !isUuid(body.poId)) || !isAccountDate(body.date) || !['ARS','USD'].includes(body.currency)
        || typeof body.stock !== 'boolean' || typeof body.close !== 'boolean' || !Array.isArray(body.items) || body.items.length === 0) return failure(new Error('Datos de recepción incompletos.'), 400);
      for (const item of body.items) {
        if (!item || (item.poItemId && !isUuid(item.poItemId)) || (item.productId && !isUuid(item.productId))
          || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0) return failure(new Error('Cantidad, costo o artículo inválidos.'), 400);
      }
      if (body.poIds !== undefined && (!Array.isArray(body.poIds) || body.poIds.length > 20 || body.poIds.some((id: unknown) => !isUuid(id)) || new Set(body.poIds).size !== body.poIds.length))
        return failure(new Error('Seleccioná hasta 20 OCs válidas sin repetir.'), 400);
      const multi = body.poIds !== undefined;
      const { data, error } = await db.rpc(multi ? 'register_supplier_receipt_multi' : 'register_supplier_receipt', {
        p_id: body.id, p_supplier: body.supplierId, ...(multi ? {p_pos: body.poIds} : {p_po: body.poId || null}), p_slip: String(body.slip || ''),
        p_date: body.date, p_currency: body.currency, p_stock: body.stock, p_close: body.close,
        p_notes: String(body.notes || ''), p_items: body.items, p_user: user.id
      });
      if (error) throw error;

      let sheetSynced = false;
      let sheetSyncWarning: string | null = null;
      try {
        const result=await processSupplierSheetJob(db,String(data||body.id));
        sheetSynced=result.synced;
        if(!result.synced)sheetSyncWarning=result.error||'La recepción se guardó. Su copia en planilla quedó en la cola de sincronización.';
      } catch (syncErr: any) {
        console.error('[supplier-accounts][receipt] Error al reflejar recepción en Google Sheets:', syncErr);
        sheetSyncWarning = syncErr?.message || 'La recepción se guardó en el ERP pero no pudo reflejarse automáticamente en la planilla.';
      }

      return NextResponse.json({ id: data, sheetSynced, sheetSyncWarning });
    } else return failure(new Error('Operación inválida.'), 400);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error,(error as {status?:number})?.status===400?400:500); }
}
