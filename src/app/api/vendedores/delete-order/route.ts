import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { removeTestOrderFromSheets } from '@/lib/googleSheets';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type TelegramReference = {
  type?: string;
  telegram_message_id?: number;
  telegram_chat_id?: string;
  messageId?: number;
  chatId?: string;
};

async function verifyAdmin(req: NextRequest): Promise<{ id: string; email?: string } | null> {
  const authorization = req.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  if (String(user.user_metadata?.role || '').toLowerCase() === 'admin') {
    return { id: user.id, email: user.email };
  }

  const { data: seller } = await supabaseAdmin
    .from('sellers')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return seller?.role === 'admin' ? { id: user.id, email: user.email } : null;
}

function getTelegramReferences(totals: any): Array<{ messageId: number; chatId: string; type?: string }> {
  const rawReferences: TelegramReference[] = [
    ...(Array.isArray(totals?.payments_breakdown) ? totals.payments_breakdown : []),
    ...(Array.isArray(totals?.telegram_notifications) ? totals.telegram_notifications : [])
  ];
  const unique = new Map<string, { messageId: number; chatId: string; type?: string }>();
  for (const reference of rawReferences) {
    const messageId = Number(reference.telegram_message_id || reference.messageId || 0);
    const chatId = String(reference.telegram_chat_id || reference.chatId || '').trim();
    if (messageId && chatId) unique.set(`${chatId}:${messageId}`, { messageId, chatId, type: reference.type });
  }
  return Array.from(unique.values());
}

async function deleteTelegramMessages(totals: any) {
  const references = getTelegramReferences(totals);
  if (references.length === 0) return { attempted: 0, deleted: 0, failures: [] as string[] };

  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();
  let personalBotToken = process.env.PERSONAL_ORDERS_TELEGRAM_BOT_TOKEN?.trim();
  if (references.some(reference => reference.type === 'personalAlert') && !personalBotToken) {
    try {
      const { data } = await supabaseAdmin.from('site_settings').select('value')
        .eq('id', 'mp_telegram_config').maybeSingle();
      const config = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
      personalBotToken = String(config?.bot_token || '').trim();
    } catch (error) {
      console.warn('[Delete order] No se pudo leer el bot personal:', error);
    }
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const reference of references) {
    try {
      const token = reference.type === 'personalAlert' ? personalBotToken : botToken;
      if (!token) {
        failures.push(`Falta el bot de Telegram para borrar ${reference.messageId}`);
        continue;
      }
      const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: reference.chatId, message_id: reference.messageId })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) deleted++;
      else failures.push(payload.description || `No se pudo borrar ${reference.messageId}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `No se pudo borrar ${reference.messageId}`);
    }
  }
  return { attempted: references.length, deleted, failures };
}

async function deleteRows(table: string, column: string, value: string) {
  const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Acceso denegado: sólo un administrador puede eliminar pedidos de prueba.' }, { status: 403 });
    }

    const body = await req.json();
    const orderId = String(body.orderId || '').trim();
    const confirmationCode = String(body.confirmationCode || '').trim().toUpperCase();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId es requerido' }, { status: 400 });
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, legacy_code, customer_name, client_id, seller_id, channel, totals')
      .eq('id', orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const legacyCode = String(order.legacy_code || '').trim().toUpperCase();
    if (!legacyCode || confirmationCode !== legacyCode) {
      return NextResponse.json({ error: `Para confirmar, ingresá exactamente el código ${legacyCode || 'del pedido'}.` }, { status: 400 });
    }

    const { data: syncJobs, error: syncJobsError } = await supabaseAdmin
      .from('order_sync_jobs')
      .select('id, status, result')
      .eq('order_id', orderId);
    if (syncJobsError) throw syncJobsError;
    if ((syncJobs || []).some(job => job.status === 'processing')) {
      return NextResponse.json({
        error: 'La sincronización de este pedido está en curso. Esperá unos segundos y volvé a intentar.'
      }, { status: 409 });
    }

    const jobNotifications = (syncJobs || []).flatMap(job =>
      ['formationAlert', 'expressAlert'].flatMap(type => {
        const alert = job.result?.[type];
        return alert?.messageId && alert?.chatId
          ? [{ type, messageId: alert.messageId, chatId: alert.chatId }]
          : [];
      })
    );
    const totalsWithJobNotifications = {
      ...(order.totals || {}),
      telegram_notifications: [
        ...(Array.isArray(order.totals?.telegram_notifications) ? order.totals.telegram_notifications : []),
        ...jobNotifications
      ]
    };
    await deleteRows('order_sync_jobs', 'order_id', orderId);

    const sheetCleanup = order.channel === 'mayorista'
      ? { success: true, skipped: true }
      : await removeTestOrderFromSheets(order.seller_id, legacyCode);
    if (!sheetCleanup.success) {
      return NextResponse.json({
        error: 'No se pudo revertir el pedido en todas las planillas. No se borró del ERP para evitar una limpieza parcial.',
        sheetCleanup
      }, { status: 502 });
    }

    const telegramDeletion = await deleteTelegramMessages(totalsWithJobNotifications);

    await deleteRows('inventory_transactions', 'reference_id', orderId);
    await deleteRows('order_history', 'order_id', orderId);
    await deleteRows('order_items', 'order_id', orderId);
    await deleteRows('deliveries', 'order_id', orderId);
    const { error: deleteOrderError } = await supabaseAdmin.from('orders').delete().eq('id', orderId);
    if (deleteOrderError) throw deleteOrderError;

    console.info('[delete-order] Pedido de prueba eliminado', {
      orderId,
      legacyCode,
      customerName: order.customer_name,
      deletedBy: admin.id,
      deletedByEmail: admin.email,
      telegramDeletion
    });

    return NextResponse.json({
      success: true,
      orderId,
      legacyCode,
      clientWasDeleted: false,
      sheetCleanup,
      telegramDeletion
    });
  } catch (err: any) {
    console.error('[delete-order] Error:', err);
    return NextResponse.json({ error: err.message || 'Error al eliminar pedido' }, { status: 500 });
  }
}
