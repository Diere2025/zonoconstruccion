export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { emptyViaCargoDispatch, validMapUrl, VIA_CARGO_SETTING_ID, type ViaCargoDispatch } from '@/lib/viaCargo';

function response(data: unknown, status = 200) {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

async function access(request: NextRequest) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { client, user: null, canEdit: false };
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { client, user: null, canEdit: false };
  if (user.email && ['diego.boveda@gmail.com', 'caroibarra.93@gmail.com'].includes(user.email.toLowerCase())) return { client, user, canEdit: true };
  const { data: seller, error: sellerError } = await client.from('sellers').select('role, roles').eq('id', user.id).maybeSingle();
  if (sellerError) throw sellerError;
  const roles = [seller?.role, ...(Array.isArray(seller?.roles) ? seller.roles : [])];
  return { client, user, canEdit: roles.includes('admin') || roles.includes('logistica') };
}

export async function GET(request: NextRequest) {
  try {
    const { client, user, canEdit } = await access(request);
    if (!user) return response({ error: 'Iniciá sesión para consultar Vía Cargo.' }, 401);
    const { data, error } = await client.from('site_settings').select('value').eq('id', VIA_CARGO_SETTING_ID).maybeSingle();
    if (error) throw error;
    const stored = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : {};
    return response({ dispatch: { ...emptyViaCargoDispatch(), ...stored }, canEdit });
  } catch {
    return response({ error: 'No se pudo consultar el punto de despacho de Vía Cargo.' }, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { client, user, canEdit } = await access(request);
    if (!user) return response({ error: 'Iniciá sesión para configurar Vía Cargo.' }, 401);
    if (!canEdit) return response({ error: 'Solo logística o administración pueden configurar el despacho.' }, 403);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: 'Revisá los datos del punto de despacho.' }, 400);
    const dispatch = emptyViaCargoDispatch();
    for (const key of Object.keys(dispatch) as (keyof ViaCargoDispatch)[]) {
      if (typeof body[key] !== 'string' || body[key].length > 2000) return response({ error: 'Revisá los datos del punto de despacho.' }, 400);
      dispatch[key] = body[key].trim();
    }
    if (!dispatch.branch || !dispatch.address || !dispatch.locality_id || !validMapUrl(dispatch.maps_url)) return response({ error: 'Completá sucursal, dirección y localidad; revisá el enlace de Maps.' }, 400);
    const { data: locality, error: localityError } = await client.from('localities').select('name').eq('id', dispatch.locality_id).single();
    if (localityError || !locality) return response({ error: 'Seleccioná una localidad válida del ERP.' }, 400);
    dispatch.locality = locality.name;
    const { error } = await client.from('site_settings').upsert({ id: VIA_CARGO_SETTING_ID, value: JSON.stringify(dispatch), updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    return response({ dispatch, canEdit: true });
  } catch {
    return response({ error: 'No se pudo guardar el punto de despacho de Vía Cargo.' }, 500);
  }
}
