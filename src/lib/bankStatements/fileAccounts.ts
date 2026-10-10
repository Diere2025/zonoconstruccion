import type { StatementAccount } from './model';
export type StatementFileAccount = { external_account_id: string; financial_account_id: string; version: number };
export function statementFilenameAccount(filename: string): string | null {
  return /^(\d+)_movements_.*\.xlsx$/i.exec(filename)?.[1] || null;
}
export function resolveStatementFileAccount(filename: string, mappings: StatementFileAccount[], accounts: StatementAccount[]) {
  const identifier = statementFilenameAccount(filename);
  const matches = identifier ? mappings.filter(mapping => mapping.external_account_id === identifier) : [];
  if (matches.length > 1) return { identifier, account: null, error: 'El identificador tiene asociaciones ambiguas. Revisá la configuración.' };
  if (!matches.length) return { identifier, account: null, error: null };
  const account = accounts.find(account => account.id === matches[0].financial_account_id);
  return { identifier, account: account || null, error: account ? null : 'La cuenta asociada no está activa o disponible.' };
}
