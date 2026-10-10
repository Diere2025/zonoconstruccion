import type { SupabaseClient } from '@supabase/supabase-js';
export async function directBankAccountIds(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from('bank_account_import_settings').select('financial_account_id');
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code) && /bank_account_import_settings/.test(error.message)) return new Set();
    throw error;
  }
  return new Set((data || []).map(row => row.financial_account_id));
}
