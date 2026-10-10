import type {StatementActivityContext} from './activityContext';
import type { StatementOrderLink } from './orderLinks';
import type { StatementOrderContext } from './orderServer';
import type { FinancialConcept } from '@/lib/financialConcepts';

export const MAX_STATEMENT_ROWS = 1000;
export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;
export const STATEMENT_PARSER_VERSION = 'mp-movements-v1';
export const STATEMENT_DATE_POLICY = 'source-calendar-v1';
export type SourceCell = { value: unknown; formula?: string };
export type StatementSource = { sheet: string; row: number; raw: string[]; errors: string[]; movementId: string | null; operationId: string | null; sourceDate: string | null; occurredAt: string | null; date: string | null; description: string; amount: string | null; cents: number | null };
export type StatementTotals = { rows: number; valid: number; operations: number; incoming: number; outgoing: number; net: number; from: string | null; to: string | null };
export type StatementEntry = { id: string; version: number; external_movement_id: string; related_operation_id: string | null; source_date: string; occurred_at: string; effective_date: string; description: string; signed_amount: string; financial_concept_id: string | null; resolution: 'pending' | 'new' | 'link'; target_transaction_id: string | null; resolution_reason?: string | null; activity_context?:StatementActivityContext; source?: {origin?:string;originalOccurredAt?:string;counterpartyName?:string;webOriginalSource?:{originalOccurredAt?:string;counterpartyName?:string}}; order_link?: StatementOrderLink | null; order_link_version?: number; suggested_concept_id?: string | null; link?: { cash_transaction_id: string; kind: string; reversed: boolean; concept: string; movement_code: string | null } | null; candidates: StatementCandidate[]; netCandidates: StatementCandidate[] };
export type StatementCandidate = { id: string; concept: string; amount: string; created_at: string; movement_code: string | null; operation_id: string | null };
export type BatchRow = { sheet_row: number; source: StatementSource; result: 'valid' | 'error' | 'conflict' | 'duplicate'; entry_id: string | null };
export type StatementBatch = { id: string; financial_account_id: string; filename: string; created_at: string; version: number; totals: StatementTotals; financial_accounts?: { name: string } };
export type StatementSnapshot = { batch: StatementBatch; rows: BatchRow[]; entries: StatementEntry[]; concepts: FinancialConcept[]; account: StatementAccount; rules: StatementRule[]; orderLinking?: StatementOrderContext; checkpoint: { effective_date: string; reported_amount: string; reference: string; ledger_amount: string } | null };
export type StatementAccount = { id: string; name: string; currency: string; type: string; is_active: boolean; direct_from: string | null };
export type StatementRule = { id: string; description: string; direction: 'ingreso' | 'egreso'; financial_concept_id: string; financial_account_id: string | null; version: number };
export const normalizedStatementText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Source decimals use a dot, never locale-dependent thousands separators.
export function statementCents(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw Error('Importe inválido');
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw Error('El importe debe ser decimal con punto y hasta dos decimales');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (result >= BigInt(100000000000000)) throw Error('Importe fuera de rango');
  return Number(negative ? -result : result);
}
export function decimalAmount(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw Error('Importe fuera de rango');
  const absolute = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}
function identifier(value: unknown, required: boolean): string | null {
  if (value === null || value === undefined || value === '') { if (required) throw Error('Falta Número de Movimiento'); return null; }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw Error('El identificador numérico perdió precisión; exportá como texto');
  const text = String(value).trim();
  if (!/^\d{1,80}$/.test(text)) throw Error('Identificador inválido');
  return text;
}
function sourceTimestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw Error('Fecha inválida; se espera fecha y hora UTC del reporte');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== value.slice(0, 19)) throw Error('Fecha inválida');
  return { occurredAt: parsed.toISOString(), date: value.slice(0, 10) };
}
const headers = ['fecha de pago', 'tipo de operacion', 'numero de movimiento', 'operacion relacionada', 'importe'];
export function parseStatementGrid(sheet: string, grid: SourceCell[][]): StatementSource[] {
  const headerRow = grid.slice(0, 10).findIndex(row => headers.every(header => row.some(cell => normalizedStatementText(String(cell.value ?? '')) === header)));
  if (headerRow < 0) throw Error('El extracto necesita Fecha de Pago, Tipo de Operación, Número de Movimiento, Operación Relacionada e Importe');
  const names = grid[headerRow].map(cell => normalizedStatementText(String(cell.value ?? '')));
  const indexes = headers.map(header => { if (names.filter(name => name === header).length !== 1) throw Error(`Cabecera ambigua: ${header}`); return names.indexOf(header); });
  const rows: StatementSource[] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    if (grid[i].every(cell => cell.value === null || cell.value === undefined || cell.value === '')) continue;
    if (rows.length >= MAX_STATEMENT_ROWS) throw Error(`El archivo admite hasta ${MAX_STATEMENT_ROWS} movimientos; exportá un período menor`);
    const cells = indexes.map(index => grid[i][index] || { value: null });
    const errors: string[] = [];
    const read = <T,>(label: string, fn: () => T): T | null => { try { return fn(); } catch (error) { errors.push(`${label}: ${error instanceof Error ? error.message : 'dato inválido'}`); return null; } };
    if (cells.some(cell => cell.formula)) errors.push('El reporte contiene una fórmula; se necesitan valores originales');
    const movementId = read('Movimiento', () => identifier(cells[2].value, true));
    const operationId = read('Operación relacionada', () => identifier(cells[3].value, false));
    const time = read('Fecha', () => sourceTimestamp(cells[0].value));
    const cents = read('Importe', () => statementCents(cells[4].value));
    const description = String(cells[1].value ?? '').trim();
    if (!description || description.length > 1000) errors.push('Descripción vacía o demasiado larga');
    rows.push({ sheet, row: i + 1, raw: cells.map(cell => String(cell.value ?? '')), errors, movementId, operationId, sourceDate: typeof cells[0].value === 'string' ? cells[0].value : null, occurredAt: time?.occurredAt ?? null, date: time?.date ?? null, description, cents, amount: cents === null ? null : decimalAmount(cents) });
  }
  if (!rows.length) throw Error('El extracto no contiene movimientos');
  return rows;
}
export function statementTotals(rows: StatementSource[]): StatementTotals {
  const valid = rows.filter(row => !row.errors.length);
  let incoming = 0, outgoing = 0;
  for (const row of valid) { if (row.cents! > 0) incoming += row.cents!; else outgoing -= row.cents!; }
  if (!Number.isSafeInteger(incoming) || !Number.isSafeInteger(outgoing)) throw Error('El total del archivo supera el rango permitido');
  const dates = valid.map(row => row.date!).sort();
  return { rows: rows.length, valid: valid.length, operations: new Set(valid.map(row => row.operationId || `movement:${row.movementId}`)).size, incoming, outgoing, net: incoming - outgoing, from: dates[0] || null, to: dates.at(-1) || null };
}
export function groupStatementEntries(entries: StatementEntry[]) {
  const groups = new Map<string, { id: string; entries: StatementEntry[]; incoming: number; outgoing: number; net: number }>();
  for (const entry of entries) {
    const key = entry.related_operation_id || `movement:${entry.external_movement_id}`;
    const group = groups.get(key) || { id: key, entries: [], incoming: 0, outgoing: 0, net: 0 };
    const amount = statementCents(entry.signed_amount);
    group.entries.push(entry); group.incoming += Math.max(0, amount); group.outgoing += Math.max(0, -amount); group.net += amount;
    groups.set(key, group);
  }
  return [...groups.values()];
}
const knownConcepts: Record<string, string> = {
  'costo de mercado pago': 'Costo de Mercado Pago',
  'costo por intereses absorbidos': 'Costo por intereses absorbidos',
  'retencion impuesto ingresos brutos no inscripto buenos aires': 'Retenciones - IIBB',
  'rendimiento positivo de la inversion': 'MP - Intereses Ganados',
  'cobro': 'Cobro',
  'ingreso de dinero': 'Cobro',
  'dinero recibido': 'Cobro',
};
export function suggestStatementConcept(entry: Pick<StatementEntry, 'description' | 'signed_amount'>, concepts: FinancialConcept[], rules: StatementRule[], accountId: string): string | null {
  const cents = statementCents(entry.signed_amount), description = normalizedStatementText(entry.description);
  if (!cents) return null;
  const direction = cents > 0 ? 'ingreso' : 'egreso';
  const scoped = rules.filter(rule => rule.direction === direction && normalizedStatementText(rule.description) === description && (rule.financial_account_id === accountId || !rule.financial_account_id));
  const selected = scoped.some(rule => rule.financial_account_id === accountId) ? scoped.filter(rule => rule.financial_account_id === accountId) : scoped;
  const unique = [...new Set(selected.map(rule => rule.financial_concept_id))];
  if (unique.length) return unique.length === 1 && concepts.some(concept => concept.id === unique[0] && concept.is_active) ? unique[0] : null;
  const target = knownConcepts[description];
  if (!target || (direction === 'ingreso' && !['cobro', 'ingreso de dinero', 'dinero recibido', 'rendimiento positivo de la inversion'].includes(description)) || (direction === 'egreso' && ['cobro', 'ingreso de dinero', 'dinero recibido', 'rendimiento positivo de la inversion'].includes(description))) return null;
  const matches = concepts.filter(concept => concept.is_active && normalizedStatementText(concept.concept) === normalizedStatementText(target) && (target !== 'Cobro' || normalizedStatementText(concept.category) === 'recaudacion') && (target !== 'MP - Intereses Ganados' || normalizedStatementText(concept.category) === 'inversiones'));
  return matches.length === 1 ? matches[0].id : null;
}
export const isMercadoPagoAccount = (account: { name: string; currency: string; type: string; is_active: boolean }) => account.is_active && account.currency === 'ARS' && ['banco', 'virtual'].includes(account.type) && /^Cuenta[. ]MP(?:\d+|Caro)$/i.test(account.name);
