import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildMarketingPrompt, DEFAULT_PARAMETERS, type PromptParameters } from '@/lib/marketingPromptBuilder';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const ownerEmail = 'diego.boveda@gmail.com';

async function access(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Iniciá sesión para continuar.', status: 401 } as const;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return { error: 'No se pudo conectar a la base de datos.', status: 503 } as const;
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0))
    return { error: 'El servidor no pudo conectarse con Supabase para verificar tu sesión. Revisá la conexión y volvé a intentar.', status: 503 } as const;
  if (error || !user) return { error: 'La sesión venció. Volvé a ingresar.', status: 401 } as const;
  if (user.email?.trim().toLowerCase() !== ownerEmail)
    return { error: 'Esta herramienta es privada de Diego.', status: 403 } as const;
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: seller, error: sellerError } = await db.from('sellers').select('is_active').eq('id', user.id).maybeSingle();
  if (sellerError) return { error: 'No se pudo verificar el usuario del ERP.', status: 503 } as const;
  if (seller?.is_active === false) return { error: 'El usuario del ERP está inactivo.', status: 403 } as const;
  return { db, user } as const;
}

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: privateHeaders });
}

function validateParameters(input: unknown): PromptParameters | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const arrays = ['campaigns', 'accounts', 'sources', 'focus', 'comparisons'];
  const strings = ['campaignsExtra', 'objective', 'fromDate', 'toDate', 'maxAdditionalUsd', 'marginGoal', 'usdArsRule', 'costRule', 'freightRule', 'debtRule', 'recentChanges', 'operationalLimits', 'previousReport', 'extraInstructions'];
  if (arrays.some(key => !Array.isArray(data[key]) || (data[key] as unknown[]).length > 40 || !(data[key] as unknown[]).every(value => typeof value === 'string' && value.length <= 180))) return null;
  if (strings.some(key => typeof data[key] !== 'string' || (data[key] as string).length > 4000)) return null;
  if (typeof data.periodDays !== 'number' || !Number.isInteger(data.periodDays) || data.periodDays < 3 || data.periodDays > 365) return null;
  if (typeof data.recentDays !== 'number' || !Number.isInteger(data.recentDays) || data.recentDays < 1 || data.recentDays > data.periodDays) return null;
  if (Boolean(data.fromDate) !== Boolean(data.toDate)) return null;
  if ((data.fromDate || data.toDate) && (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.fromDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.toDate)) || String(data.fromDate) > String(data.toDate))) return null;
  if (data.maxAdditionalUsd && (!/^\d+(?:[.,]\d{1,2})?$/.test(String(data.maxAdditionalUsd)) || Number(String(data.maxAdditionalUsd).replace(',', '.')) > 1000000)) return null;
  if (typeof data.includeToday !== 'boolean') return null;
  return { ...DEFAULT_PARAMETERS, ...data } as PromptParameters;
}

export async function GET(request: Request) {
  const result = await access(request);
  if ('error' in result) return failure(result.error || 'Acceso denegado.', result.status || 403);
  const { data, error } = await result.db.from('private_marketing_prompts')
    .select('id,name,template_key,parameters,prompt_text,created_at,updated_at')
    .eq('owner_id', result.user.id).order('updated_at', { ascending: false }).limit(500);
  if (error) return failure('No se pudieron leer los prompts guardados. Verificá la migración de la base de datos.', 503);
  return NextResponse.json({ prompts: data || [] }, { headers: privateHeaders });
}

export async function POST(request: Request) {
  const result = await access(request);
  if ('error' in result) return failure(result.error || 'Acceso denegado.', result.status || 403);
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const parameters = validateParameters(body?.parameters);
  if (!name || name.length > 120 || !parameters) return failure('Revisá el nombre y los parámetros del prompt.', 400);
  const templateKey = typeof body.templateKey === 'string' ? body.templateKey.slice(0, 80) : 'general';
  const promptText = buildMarketingPrompt(parameters);
  if (promptText.length > 40000) return failure('El prompt excede el máximo permitido.', 400);
  const id = typeof body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(body.id) ? body.id : null;
  const values = { name, template_key: templateKey, parameters, prompt_text: promptText, updated_at: new Date().toISOString() };
  const query = id
    ? result.db.from('private_marketing_prompts').update(values).eq('id', id).eq('owner_id', result.user.id)
    : result.db.from('private_marketing_prompts').insert({ ...values, owner_id: result.user.id });
  const { data, error } = await query.select('id,name,template_key,parameters,prompt_text,created_at,updated_at').maybeSingle();
  if (error) return failure('No se pudo guardar el prompt en la base de datos.', 503);
  if (!data) return failure('No se encontró el prompt para actualizar.', 404);
  return NextResponse.json({ prompt: data }, { headers: privateHeaders });
}

export async function DELETE(request: Request) {
  const result = await access(request);
  if ('error' in result) return failure(result.error || 'Acceso denegado.', result.status || 403);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) return failure('Prompt inválido.', 400);
  const { data, error } = await result.db.from('private_marketing_prompts').delete()
    .eq('id', id).eq('owner_id', result.user.id).select('id').maybeSingle();
  if (error) return failure('No se pudo eliminar el prompt.', 503);
  if (!data) return failure('No se encontró el prompt.', 404);
  return NextResponse.json({ deleted: true }, { headers: privateHeaders });
}
