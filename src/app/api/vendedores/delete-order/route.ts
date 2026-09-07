import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, deleteClient } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId es requerido' }, { status: 400 });
    }

    // 1. Obtener datos del pedido
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, customer_name, client_id, shipping_address_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const clientId = order.client_id;
    const addressId = order.shipping_address_id;

    // 2. Eliminar transacciones de inventario (reservas)
    await supabaseAdmin
      .from('inventory_transactions')
      .delete()
      .eq('reference_id', orderId);

    // 3. Eliminar ítems del pedido
    await supabaseAdmin
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    // 4. Eliminar entregas asociadas
    await supabaseAdmin
      .from('deliveries')
      .delete()
      .eq('order_id', orderId);

    // 5. Eliminar pedido
    const { error: delErr } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (delErr) throw delErr;

    let clientWasDeleted = false;

    // 6. Si se solicitó borrar el cliente y no tiene otros pedidos
    if (deleteClient && clientId) {
      // Verificar que no tenga otros pedidos
      const { data: otherOrders } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);

      if (!otherOrders || otherOrders.length === 0) {
        // Eliminar cobros registrados del cliente para evitar violación de FK
        await supabaseAdmin
          .from('client_payments')
          .delete()
          .eq('client_id', clientId);

        // Eliminar direcciones
        if (addressId) {
          await supabaseAdmin
            .from('addresses')
            .delete()
            .eq('id', addressId);
        }
        await supabaseAdmin
          .from('addresses')
          .delete()
          .eq('client_id', clientId);

        // Eliminar cliente
        const { error: delClientErr } = await supabaseAdmin
          .from('clients')
          .delete()
          .eq('id', clientId);

        if (!delClientErr) {
          clientWasDeleted = true;
        } else {
          console.warn('Error deleting client:', delClientErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      clientId,
      clientWasDeleted
    });
  } catch (err: any) {
    console.error('[delete-order] Error:', err);
    return NextResponse.json({ error: err.message || 'Error al eliminar pedido' }, { status: 500 });
  }
}
