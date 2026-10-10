import {statementInbox} from '@/lib/bankStatements/inbox';
import { resolveStatementFileAccount } from '@/lib/bankStatements/fileAccounts';
import { NextResponse } from 'next/server';
import { financialContext } from '@/lib/financialOperations/server';
import { isUuid, OperationError } from '@/lib/financialOperations/validation';
import { MAX_STATEMENT_BYTES, STATEMENT_DATE_POLICY, STATEMENT_PARSER_VERSION, decimalAmount, normalizedStatementText, statementCents, statementTotals } from '@/lib/bankStatements/model';
import { readStatementWorkbook } from '@/lib/bankStatements/workbook';
import { recentStatementBatches, statementCatalog, statementSnapshot, statementDeletionAvailable } from '@/lib/bankStatements/server';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
const response = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  const code = (error as { code?: string })?.code;
  const status = error instanceof OperationError ? error.status : code === '42501' ? 403 : ['40001', '23505'].includes(code || '') ? 409 : ['42P01', '42703', 'PGRST202', 'PGRST205'].includes(code || '') ? 503 : 400;
  const message = status === 503 && !(error instanceof OperationError) ? 'Falta habilitar las migraciones de extractos bancarios (v166/v169/v170/v171).' : error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo procesar el extracto';
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
const uuid = (value: unknown) => { if (!isUuid(value)) throw new OperationError('Identificador inválido'); return value as string; };
const version = (value: unknown) => { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new OperationError('Versión inválida'); return value as number; };
export async function GET(request: Request) {
  try {
    const { db, actor } = await financialContext(request);
    const params = new URL(request.url).searchParams, batch = params.get('batch');
    if(params.get('action')==='inbox'){
      const account=uuid(params.get('account')),from=params.get('from')||'2026-10-01',to=params.get('to')||'2026-10-31';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from<'2026-09-30'||to<from)throw new OperationError('Período inválido');
      return response(await statementInbox(db,account,from,to));
    }
    if(params.get('action')==='activity-targets'){
      const search=params.get('q')||'';if(search.length>80)throw new OperationError('Búsqueda demasiado larga');
      const result=await db.rpc('bank_activity_targets',{p_actor:actor,p_activity:uuid(params.get('activity')),p_search:search});if(result.error)throw result.error;return response({targets:result.data});
    }
    if(params.get('action')==='inbox-open'){
      const row=await db.from('mp_bank_web_rows').select('prepared_batch_id,statement_entry_id,prepared_entry_id').eq('id',uuid(params.get('capture'))).single();if(row.error)throw row.error;
      let bid=row.data.prepared_batch_id;if(!bid){const r=await db.from('bank_import_batch_rows').select('batch_id').eq('entry_id',row.data.statement_entry_id||row.data.prepared_entry_id).eq('result','valid').limit(1).maybeSingle();if(r.error)throw r.error;bid=r.data?.batch_id;}
      if(!bid)throw new OperationError('El componente requiere revisión o respaldo de Excel');return response(await statementSnapshot(db,actor,bid));
    }
    if(params.get('action')==='web-capture'){
      const account=uuid(params.get('account')),from=params.get('from')||'2026-10-01',to=params.get('to')||'2026-10-31';if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from<'2026-09-30'||to<from)throw new OperationError('Período de captura inválido');
      const mapping=await db.from('bank_statement_mp_accounts').select('mp_account_id').eq('financial_account_id',account).maybeSingle();if(mapping.error)throw mapping.error;if(!mapping.data)return response({rows:[],scan:null});
      const mp=mapping.data.mp_account_id;const [rows,scan]=await Promise.all([db.from('mp_bank_web_rows').select('id,operation_id,occurred_at,amount,description,counterparty_name,activity_type,operation_kind,statement_entry_id,prepared_entry_id,mp_payments(payer_name,order_code)').eq('mp_account_id',mp).gte('occurred_at',from+'T00:00:00-03:00').lte('occurred_at',to+'T23:59:59-03:00').order('occurred_at',{ascending:false}).limit(1000),db.from('mp_bank_web_scans').select('scanned_at,row_count').eq('mp_account_id',mp).order('id',{ascending:false}).limit(1).maybeSingle()]);if(rows.error)throw rows.error;if(scan.error)throw scan.error;return response({rows:rows.data,scan:scan.data});
    }
    if (batch) {
      uuid(batch);
      if (params.get('action') === 'orders') {
        const entry=uuid(params.get('entry')),day=params.get('day'),search=params.get('q');
        if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new OperationError('Fecha inválida');
        if(search&&(search.trim().length<2||search.length>80))throw new OperationError('Ingresá de 2 a 80 caracteres del código');
        const {data,error}=await db.rpc('bank_statement_order_choices',{p_actor:actor,p_batch:batch,p_entry:entry,p_day:day||null,p_search:search||null});if(error)throw error;return response({orders:data});
      }
      if (params.get('action') === 'file') {
        let query = db.from('bank_import_batches').select('storage_path').eq('id', batch);
        if (await statementDeletionAvailable(db)) query = query.is('deleted_at', null);
        const { data, error } = await query.single();
        if (error) throw error;
        const signed = await db.storage.from('bank-statements').createSignedUrl(data.storage_path, 120, { download: true });
        if (signed.error) throw signed.error;
        return response({ url: signed.data.signedUrl });
      }
      if (params.get('action') === 'events') {
        const { data, error } = await db.from('bank_statement_events').select('id,entry_id,action,before_value,after_value,created_at').eq('batch_id', batch).order('id', { ascending: false }).limit(100);
        if (error) throw error;
        return response({ events: data });
      }
      return response(await statementSnapshot(db, actor, batch));
    }
    const accountId = params.get('account') || undefined;
    if (accountId) uuid(accountId);
    const [catalog, batches] = await Promise.all([statementCatalog(db), recentStatementBatches(db, accountId)]);
    return response({ ...catalog, batches });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { db, actor } = await financialContext(request, true);
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const length = Number(request.headers.get('content-length') || '0');
      if (length > MAX_STATEMENT_BYTES + 65536) throw new OperationError('El archivo debe pesar hasta 2 MB', 413);
      const form = await request.formData(), file = form.get('file'), accountId = uuid(form.get('accountId'));
      if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > MAX_STATEMENT_BYTES) throw new OperationError('Elegí el Excel original de hasta 2 MB');
      const catalog = await statementCatalog(db);
      if (!catalog.accounts.some(account => account.id === accountId)) throw new OperationError('Cuenta Mercado Pago no disponible');
      const detected = resolveStatementFileAccount(file.name, catalog.fileAccounts, catalog.accounts);
      if (detected.error) throw new OperationError(detected.error);
      if (detected.account && detected.account.id !== accountId) throw new OperationError('El archivo pertenece a ' + detected.account.name + '. Seleccioná esa cuenta.');
      const bytes = await file.arrayBuffer(), rows = readStatementWorkbook(bytes), totals = statementTotals(rows);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      const storagePath = `${accountId}/${hash}.xlsx`;
      const stored = await db.storage.from('bank-statements').upload(storagePath, bytes, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
      if (stored.error && !['Duplicate', '409'].includes(String((stored.error as { statusCode?: string }).statusCode)) && !/already exists/i.test(stored.error.message)) throw stored.error;
      const { data, error } = await db.rpc('ingest_bank_statement', { p_actor: actor, p_meta: { accountId, hash, filename: file.name.slice(0, 240), storagePath, parserVersion: STATEMENT_PARSER_VERSION, datePolicy: STATEMENT_DATE_POLICY, totals }, p_rows: rows });
      if (error) throw error;
      if(catalog.orderLinking?.available){const sync=await db.rpc('sync_bank_statement_orders',{p_actor:actor,p_batch:data});if(sync.error)throw sync.error;}
      const mpMapping=catalog.orderLinking?.mappings.find(mapping=>mapping.financial_account_id===accountId);if(mpMapping){const web=await db.rpc('reconcile_mp_bank_web',{p_mp:mpMapping.mp_account_id});if(web.error&&!['PGRST202','42883'].includes(web.error.code))throw web.error;}
      return response(await statementSnapshot(db, actor, data));
    }
    const body = await request.json();
    if(body.action==='activity-classify'){
      const r=await db.rpc('classify_bank_activity_reference',{p_actor:actor,p_activity:uuid(body.activity),p_concept:body.concept==null?null:uuid(body.concept),p_version:version(body.version)});if(r.error)throw r.error;return response({saved:true});
    }
    if(body.action==='inbox-classify'){
      const r=await db.rpc('classify_bank_inbox_capture',{p_actor:actor,p_capture:uuid(body.capture),p_concept:body.concept==null?null:uuid(body.concept),p_version:version(body.version)});if(r.error)throw r.error;return response({saved:true});
    }
    if(body.action==='inbox-sync'){
      const mapping=await db.from('bank_statement_mp_accounts').select('mp_account_id').eq('financial_account_id',uuid(body.account)).single();if(mapping.error)throw mapping.error;
      const r=await db.rpc('sync_mp_bank_inbox',{p_mp:mapping.data.mp_account_id,p_actor:actor});if(r.error)throw r.error;return response(r.data);
    }
    if(body.action==='activity-link'){
      if(!Number.isSafeInteger(body.version)||body.version<0)throw new OperationError('Versión inválida');
      const r=await db.rpc('link_bank_activity_reference',{p_actor:actor,p_activity:uuid(body.activity),p_transaction:body.transaction==null?null:uuid(body.transaction),p_version:body.version});if(r.error)throw r.error;return response({saved:true});
    }
    if(body.action==='web-prepare') {
      if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>1000||body.ids.some((id:unknown)=>!isUuid(id)))throw new OperationError('Seleccioná capturas válidas');
      const {data,error}=await db.rpc('create_bank_statement_from_web',{p_actor:actor,p_account:uuid(body.account),p_ids:body.ids});if(error)throw error;
      return response(await statementSnapshot(db,actor,data));
    }
    if(body.action==='orders-sync') {
      const batch=uuid(body.batch);const {error}=await db.rpc('sync_bank_statement_orders',{p_actor:actor,p_batch:batch});if(error)throw error;return response(await statementSnapshot(db,actor,batch));
    }
    if(body.action==='order-link') {
      if(!Number.isSafeInteger(body.version)||body.version<0)throw new OperationError('Versión inválida');
      if(body.payment!=null&&(typeof body.payment!=='string'||body.payment.length>200))throw new OperationError('Cobro inválido');
      const {error}=await db.rpc('link_bank_statement_order',{p_actor:actor,p_batch:uuid(body.batch),p_entry:uuid(body.entry),p_order:body.order==null?null:uuid(body.order),p_payment:body.payment||null,p_version:body.version});if(error)throw error;return response({saved:true});
    }
    if(body.action==='mp-account') {
      if(body.mp!=null&&(typeof body.mp!=='string'||!body.mp.length||body.mp.length>200))throw new OperationError('Cuenta de Chequeo inválida');
      const {error}=await db.rpc('save_bank_statement_mp_account',{p_actor:actor,p_account:uuid(body.account),p_mp:body.mp||null,p_version:body.version==null?null:version(body.version)});if(error)throw error;return response({saved:true});
    }
    if (body.action === 'file-account') {
      if (typeof body.identifier !== 'string' || !/^\d{1,30}$/.test(body.identifier)) throw new OperationError('El identificador debe contener de 1 a 30 dígitos');
      const { error } = await db.rpc('save_bank_statement_file_account', { p_actor: actor, p_identifier: body.identifier, p_account: uuid(body.account), p_version: body.version == null ? null : version(body.version), p_remove: body.remove === true });
      if (error) throw error;
      return response({ saved: true });
    }
    if (body.action === 'commit') {
      if (body.confirmAccount !== true || !Array.isArray(body.entries) || !body.entries.length || body.entries.length > 1000) throw new OperationError('Confirmá la cuenta y seleccioná movimientos');
      body.entries.forEach((entry: { id: unknown; version: unknown }) => { uuid(entry.id); version(entry.version); });
      if (new Set(body.entries.map((entry: { id: string }) => entry.id)).size !== body.entries.length) throw new OperationError('La selección contiene filas repetidas');
      const { data, error } = await db.rpc('commit_bank_statement', { p_actor: actor, p_key: uuid(body.key), p_batch: uuid(body.batch), p_version: version(body.version), p_entries: body.entries });
      if (error) throw error;
      return response(data);
    }
    if (body.action === 'cutover') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from) || body.confirmed !== true) throw new OperationError('Confirmá la fecha de corte');
      const { error } = await db.rpc('configure_bank_statement_account', { p_actor: actor, p_account: uuid(body.account), p_from: body.from });
      if (error) throw error;
      return response({ saved: true });
    }
    if (body.action === 'balance') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || typeof body.reference !== 'string' || body.reference.trim().length < 3) throw new OperationError('Indicá fecha y respaldo del saldo');
      const amount = decimalAmount(statementCents(body.amount));
      const { data, error } = await db.rpc('save_bank_balance_checkpoint', { p_actor: actor, p_account: uuid(body.account), p_date: body.date, p_amount: amount, p_reference: body.reference });
      if (error) throw error;
      return response({ id: data });
    }
    if (body.action === 'rule') {
      if (typeof body.description !== 'string' || !['ingreso', 'egreso'].includes(body.direction)) throw new OperationError('Regla inválida');
      const { data, error } = await db.rpc('save_bank_statement_rule', { p_actor: actor, p_account: uuid(body.account), p_description: normalizedStatementText(body.description), p_direction: body.direction, p_concept: uuid(body.conceptId), p_version: body.version ?? null });
      if (error) throw error;
      return response({ id: data });
    }
    throw new OperationError('Acción inválida');
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { db, actor } = await financialContext(request, true), body = await request.json();
    if (!Array.isArray(body.decisions) || !body.decisions.length || body.decisions.length > 1000) throw new OperationError('Seleccioná filas para guardar');
    body.decisions.forEach((decision: { id: unknown; version: unknown; conceptId?: unknown; targetId?: unknown; reason?: unknown }) => {
      uuid(decision.id); version(decision.version);
      if (decision.conceptId) uuid(decision.conceptId);
      if (decision.targetId) uuid(decision.targetId);
      if (decision.reason !== undefined && (typeof decision.reason !== 'string' || decision.reason.length > 1000)) throw new OperationError('Motivo inválido');
    });
    const { data, error } = await db.rpc('decide_bank_statement', { p_actor: actor, p_batch: uuid(body.batch), p_version: version(body.version), p_decisions: body.decisions });
    if (error) throw error;
    return response(data);
  } catch (error) { return failure(error); }
}


export async function DELETE(request: Request) {
  try {
    const { db, actor } = await financialContext(request, true), body = await request.json();
    const { data, error } = await db.rpc('delete_bank_statement', { p_actor: actor, p_batch: uuid(body.batch), p_version: version(body.version) });
    if (error) throw error;
    return response(data);
  } catch (error) { return failure(error); }
}
