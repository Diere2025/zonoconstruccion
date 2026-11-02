import type { SupabaseClient } from '@supabase/supabase-js';

const sources = [
  ['Jazmín Sánchez', '13430e05-b61a-4a3f-9fc3-152d377c4b0c', 'web_organica', false],
  ['Diego Bóveda', '381df0d1-183f-4ccb-aaf2-8147c76159a9', 'mostrador_minorista', false],
  ['Ludmila Krenz', '54b2d319-8f6f-47ff-b794-b7731978410a', 'mostrador_minorista', false],
  ['Facundo Paz', '3820a0fe-bb0a-4a84-ad85-79e49868cad7', 'mostrador_minorista', false],
  ['Central/Ruteo', '381df0d1-183f-4ccb-aaf2-8147c76159a9', 'mostrador_minorista', true],
] as const;

/** A narrow alternative to an admin session, valid only during a claimed run. */
export async function authenticateScheduledSheetImport(request: Request, client: SupabaseClient): Promise<boolean> {
  const token = request.headers.get('x-scheduled-sheet-sync-token');
  const runId = request.headers.get('x-scheduled-sheet-sync-run');
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !runId || !/^[a-f0-9-]{36}$/.test(runId)) return false;
  let body;
  try { body = await request.clone().json(); } catch { return false; }
  const source = sources.find(([name]) => body.sheetName === `${name} (Automático)`);
  if (!source || body.defaultSellerId !== source[1] || body.defaultChannel !== source[2] || body.isCentralSheet !== source[3]
    || body.skipENC !== true || body.skipCAMB !== false || body.syncPaymentMethods !== false || body.importRunId !== runId
    || !Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 20
    || body.rows.some((row: unknown) => !Array.isArray(row) || row.length < 30 || row.length > 300 || row.some(cell => typeof cell !== 'string'))) return false;
  const { data, error } = await client.rpc('authorize_scheduled_sheet_import', { p_token: token, p_id: runId, p_source: source[0] });
  return !error && data === true;
}
