import { CRONS, TIME_ZONE, runSync } from './runner.mjs';

export function createErpRequest(env, fetcher = fetch, runId = null) {
  const deadline = Date.now() + 12 * 60_000;
  return async (path, { body, text = false } = {}) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('La sincronización excedió los 12 minutos.');
    const response = await fetcher(new URL(path, env.ERP_ORIGIN), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache',
        ...(path === '/api/admin/import-sheet' && runId ? { 'X-Scheduled-Sheet-Sync-Token': env.CONTROL_TOKEN, 'X-Scheduled-Sheet-Sync-Run': runId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(remaining, 120_000)), redirect: 'manual',
    });
    if (!response.ok) throw Error(`${path.split('?')[0]}: HTTP ${response.status}.`);
    if (text) return response.text();
    const result = await response.json();
    if (result.error || result.success === false) throw Error(`${path.split('?')[0]}: la operación informó un error.`);
    return result;
  };
}

async function rpc(env, name, body) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, p_token: env.CONTROL_TOKEN }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`Registro de sincronización: ${name} HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

export async function execute(env, { key, dryRun = false }) {
  const id = await rpc(env, 'claim_scheduled_sheet_sync', { p_key: key, p_dry_run: dryRun });
  if (!id) return { skipped: true, reason: 'Hay otra ejecución en curso o este horario ya fue procesado.' };
  let latest = {};
  try {
    const summary = await runSync({ request: createErpRequest(env, fetch, id), dryRun, runId: id,
      progress: async (step, value) => {
        latest = structuredClone(value);
        await rpc(env, 'update_scheduled_sheet_sync', { p_id: id, p_step: step, p_summary: latest });
      },
    });
    await rpc(env, 'finish_scheduled_sheet_sync', { p_id: id, p_success: true, p_summary: summary, p_error: null });
    return { id, success: true, summary };
  } catch (error) {
    await rpc(env, 'finish_scheduled_sheet_sync', { p_id: id, p_success: false, p_summary: latest, p_error: String(error.message).slice(0, 1000) });
    console.error(JSON.stringify({ runId: id, failed: true, error: error.message }));
    return { id, success: false, error: error.message };
  }
}

export default {
  async scheduled(event, env) {
    if (!CRONS.includes(event.cron)) throw Error('Horario no autorizado.');
    const result = await execute(env, { key: `cron:${event.scheduledTime}` });
    if (result.success === false) throw Error(`Sincronización fallida: ${result.id}`);
  },
  async fetch(request, env) {
    if (!env.CONTROL_TOKEN || request.headers.get('authorization') !== `Bearer ${env.CONTROL_TOKEN}`) return new Response('Unauthorized', { status: 401 });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({ timezone: TIME_ZONE, schedules: ['07:00', '14:00', '23:30'], runs: await rpc(env, 'get_scheduled_sheet_sync_status', {}) });
    }
    // For verification, keep the HTTP request open; no short-lived waitUntil job.
    if (request.method === 'POST' && ['/preview', '/run'].includes(url.pathname)) {
      const result = await execute(env, { key: `manual:${crypto.randomUUID()}`, dryRun: url.pathname === '/preview' });
      return Response.json(result, { status: result.success === false ? 500 : result.skipped ? 409 : 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};
