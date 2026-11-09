import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { detectOrderCategory } from '@/lib/orderCategory';
import { withdrawalMapUrl } from '@/lib/employeeWithdrawals';
import { syncEmployeeWithdrawalSheets } from '@/lib/employeeWithdrawalSheets';

export const runtime = 'edge';

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function session(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (!bearer?.match(/^Bearer \S+$/i)) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  const db = session(request);
  if (!db) return respond({ error: 'Iniciá sesión.' }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== 'string' || typeof body.id !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.id)) {
    return respond({ error: 'Revisá los datos del retiro.' }, 400);
  }
  const { action, id, version } = body;
  if (body.data != null && (typeof body.data !== 'object' || Array.isArray(body.data))) {
    return respond({ error: 'Revisá los datos del retiro.' }, 400);
  }
  const data = body.data ?? {};

  if (action === 'sync') {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: snapshot, error } = await db.rpc('employee_withdrawal_claim_sheet', { p_id: id });
      if (error) return respond({ error: error.message }, 400);
      if (!snapshot.lease) return respond({ synced: snapshot.synced });
      let success = false;
      try {
        await syncEmployeeWithdrawalSheets(snapshot);
        success = true;
      } catch (error) {
        console.error('[employee-withdrawal-sheets]', error);
      }
      const { data: synced, error: finishError } = await admin.rpc('employee_withdrawal_finish_sheet', {
        p_id: id, p_lease: snapshot.lease, p_version: snapshot.version, p_success: success,
      });
      if (finishError) console.error('[employee-withdrawal-sheet-finish]', finishError);
      if (synced === true) return respond({ synced: true });
      if (!success || finishError) break;
      // The order changed during the write. Reconcile once with the current review state.
    }
    return respond({ synced: false });
  }

  if (action === 'create' || action === 'edit') {
    const { data: capabilities, error: accessError } = await db.rpc('employee_withdrawal_capabilities');
    if (accessError || !capabilities?.create) return respond({ error: 'No podés cargar retiros.' }, 403);
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100 ||
        data.items.some((item: unknown) => !item || typeof item !== 'object' || !('product_id' in item) || typeof item.product_id !== 'string')) {
      return respond({ error: 'Agregá entre 1 y 100 productos.' }, 400);
    }
    const { data: products, error } = await db.from('products').select('id,name,sku,category')
      .in('id', [...new Set(data.items.map((item: { product_id: string }) => item.product_id))]);
    if (error) return respond({ error: 'No se pudieron verificar los productos.' }, 400);
    if (data.maps_link != null && typeof data.maps_link !== 'string') {
      return respond({ error: 'Ingresá un enlace válido de Google Maps.' }, 400);
    }
    if (data.mode === 'home' && !data.maps_link?.trim() && typeof data.address === 'string' && typeof data.locality === 'string') {
      data.maps_link = withdrawalMapUrl(data.address, data.locality);
    }
    data.category = detectOrderCategory(data.items.map((item: { product_id: string; quantity: number; price: number }) => ({
      ...products?.find(product => product.id === item.product_id), quantity: item.quantity, unit_price: item.price,
    })));
  }

  const { data: savedId, error } = await db.rpc('employee_withdrawal_save', {
    p_action: action, p_id: id, p_version: version ?? null, p_data: data,
  });
  if (error) return respond({ error: error.message }, 400);
  return respond({ id: savedId });
}
