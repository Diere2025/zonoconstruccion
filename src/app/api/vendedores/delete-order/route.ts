import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type TelegramReceiptReference = { telegram_message_id?: number; telegram_chat_id?: string };

async function deleteTelegramReceipts(totals: any) {
  const references = (totals?.payments_breakdown || []) as TelegramReceiptReference[];
  const uniqueReferences = Array.from(new Map(
    references
      .filter(reference => reference.telegram_message_id && reference.telegram_chat_id)
      .map(reference => [
        `${reference.telegram_chat_id}:${reference.telegram_message_id}`,
        reference
      ])
  ).values());
  if (uniqueReferences.length === 0) return { attempted: 0, deleted: 0, failures: [] as string[] };

  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return { attempted: uniqueReferences.length, deleted: 0, failures: ['Falta LOGISTICS_TELEGRAM_BOT_TOKEN'] };
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const reference of uniqueReferences) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: reference.telegram_chat_id,
        message_id: reference.telegram_message_id
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) deleted++;
    else failures.push(payload.description || `No se pudo borrar ${reference.telegram_message_id}`);
  }
  return { attempted: uniqueReferences.length, deleted, failures };
}

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
      .select('id, customer_name, client_id, shipping_address_id, totals')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const clientId = order.client_id;
    const addressId = order.shipping_address_id;
    const telegramDeletion = await deleteTelegramReceipts(order.totals);

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
      clientWasDeleted,
      telegramDeletion
    });
  } catch (err: any) {
    console.error('[delete-order] Error:', err);
    return NextResponse.json({ error: err.message || 'Error al eliminar pedido' }, { status: 500 });
  }
}
