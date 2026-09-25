import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
}

function canLoadOrders(seller: { role?: string | null; roles?: string[] | null; is_active?: boolean | null }) {
  const allowedRoles = new Set(['seller', 'vendedor', 'admin']);
  return seller.is_active === true && (
    allowedRoles.has((seller.role || '').toLowerCase())
    || (seller.roles || []).some(role => allowedRoles.has(role.toLowerCase()))
  );
}

export async function POST(request: NextRequest) {
  let insertedOrderId: string | null = null;
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Sesión requerida' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json();
    const order = body?.order;
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!order?.seller_id || items.length === 0) {
      return NextResponse.json({ error: 'Pedido, vendedora e ítems son requeridos' }, { status: 400 });
    }

    const [{ data: loader }, { data: assignedSeller }] = await Promise.all([
      supabaseAdmin
        .from('sellers')
        .select('id, role, roles, is_active')
        .eq('id', authData.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('sellers')
        .select('id, role, roles, is_active')
        .eq('id', order.seller_id)
        .maybeSingle(),
    ]);

    if (!loader || !canLoadOrders(loader)) {
      return NextResponse.json({ error: 'El usuario no está habilitado para cargar pedidos' }, { status: 403 });
    }
    if (!assignedSeller || !canLoadOrders(assignedSeller)) {
      return NextResponse.json({ error: 'La vendedora seleccionada no está activa' }, { status: 400 });
    }

    const { id: ignoredId, created_by_id: ignoredCreator, ...safeOrder } = order;
    void ignoredId;
    void ignoredCreator;

    const { data: insertedOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        ...safeOrder,
        seller_id: assignedSeller.id,
        created_by_id: authData.user.id,
      })
      .select()
      .single();
    if (orderError) throw orderError;
    insertedOrderId = insertedOrder.id;

    const safeItems = items.map((item: Record<string, unknown>) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      historical_unit_cost: item.historical_unit_cost || 0,
      discount_percentage: item.discount_percentage || 0,
      order_id: insertedOrder.id,
    }));
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(safeItems);
    if (itemsError) throw itemsError;

    return NextResponse.json({ order: insertedOrder });
  } catch (error: any) {
    if (insertedOrderId) {
      await supabaseAdmin.from('orders').delete().eq('id', insertedOrderId);
    }
    console.error('[create-assigned-order] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'No se pudo crear el pedido asignado' },
      { status: 500 },
    );
  }
}
