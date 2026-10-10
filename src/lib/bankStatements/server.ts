import {statementActivityContexts,type ActivityReference} from './activityContext';
import { statementOrderContext, statementOrderLinks } from './orderServer';
import type { StatementFileAccount } from './fileAccounts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { allRows } from '@/lib/paymentPlanning/server';
import type { FinancialConcept } from '@/lib/financialConcepts';
import { isMercadoPagoAccount, suggestStatementConcept, type StatementAccount, type StatementBatch, type StatementRule, type StatementSnapshot } from './model';
export async function statementDeletionAvailable(db: SupabaseClient) {
  const { error } = await db.from('bank_import_batches').select('deleted_at').limit(0);
  if (!error) return true;
  if (['42703', 'PGRST204'].includes(error.code) && error.message.includes('deleted_at')) return false;
  throw error;
}
export async function statementCatalog(db: SupabaseClient) {
  const [accounts, concepts, settings, fileAccounts, rules, deletionAvailable, orderLinking] = await Promise.all([
    allRows<Omit<StatementAccount, 'direct_from'>>(db.from('financial_accounts').select('id,name,currency,type,is_active').order('name').order('id')),
    allRows<FinancialConcept>(db.from('financial_concepts').select('id,concept,category,sub_category,movement_type,efe_category,is_active,source_row').eq('is_active', true).order('concept').order('id')),
    allRows<{financial_account_id: string; direct_from: string}>(db.from('bank_account_import_settings').select('financial_account_id,direct_from').order('financial_account_id')),
    allRows<StatementFileAccount>(db.from('bank_statement_file_accounts').select('external_account_id,financial_account_id,version').order('external_account_id')),
    allRows<StatementRule>(db.from('bank_classification_rules').select('id,description,direction,financial_concept_id,financial_account_id,version').eq('is_active', true).order('id')),
    statementDeletionAvailable(db),
    statementOrderContext(db),
  ]);
  return { accounts: accounts.filter(isMercadoPagoAccount).map(account => ({ ...account, direct_from: settings.find(setting => setting.financial_account_id === account.id)?.direct_from || null })), concepts, rules, fileAccounts, deletionAvailable, orderLinking };
}
export async function statementSnapshot(db: SupabaseClient, actor: string, batchId: string) {
  const [review, catalog, rows] = await Promise.all([
    db.rpc('review_bank_statement', { p_actor: actor, p_batch: batchId }),
    statementCatalog(db),
    allRows<StatementSnapshot['rows'][number]>(db.from('bank_import_batch_rows').select('sheet_row,source,result,entry_id').eq('batch_id', batchId).order('sheet_row')),
  ]);
  if (review.error) throw review.error;
  const value = review.data as Pick<StatementSnapshot, 'batch' | 'entries' | 'checkpoint'>;
  const account = catalog.accounts.find(account => account.id === value.batch.financial_account_id);
  if (!account) throw Error('La cuenta del lote está inactiva o no está disponible');
  const orderLinks=catalog.orderLinking.available?await statementOrderLinks(db,value.entries.map(entry=>entry.id)):new Map();
  const mp=catalog.orderLinking.mappings.find(mapping=>mapping.financial_account_id===account.id)?.mp_account_id;
  const activityRows:ActivityReference[]=[];
  if(mp&&value.entries.length){const ids=value.entries.map(entry=>entry.id);for(let i=0;i<ids.length;i+=50){const list=ids.slice(i,i+50).join(',');try{activityRows.push(...await allRows<ActivityReference>(db.from('mp_bank_web_rows').select('id,prepared_entry_id,statement_entry_id,counterparty_name,activity_type,operation_kind').eq('mp_account_id',mp).or('prepared_entry_id.in.('+list+'),statement_entry_id.in.('+list+')').order('id')));}catch(error){if(!['42P01','42703','PGRST204','PGRST205'].includes((error as {code?:string}).code||''))throw error;}}}
  const activityContexts=statementActivityContexts(activityRows);
  return { ...value, rows, account, concepts: catalog.concepts, rules: catalog.rules, orderLinking:catalog.orderLinking,
    entries: value.entries.map(entry => ({ ...entry, activity_context:activityContexts.get(entry.id),order_link:orderLinks.get(entry.id)?.link||null,order_link_version:orderLinks.get(entry.id)?.version||0, suggested_concept_id: suggestStatementConcept(entry, catalog.concepts, catalog.rules, account.id) })) } satisfies StatementSnapshot;
}
export async function recentStatementBatches(db: SupabaseClient, accountId?: string) {
  const deletionAvailable = await statementDeletionAvailable(db);
  let query = db.from('bank_import_batches').select('id,financial_account_id,filename,created_at,version,totals,financial_accounts(name)').order('created_at', { ascending: false }).order('id').limit(50);
  if (deletionAvailable) query = query.is('deleted_at', null);
  if (accountId) query = query.eq('financial_account_id', accountId);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as StatementBatch[];
}
