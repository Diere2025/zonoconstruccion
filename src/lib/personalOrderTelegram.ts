import { SupabaseClient } from '@supabase/supabase-js';

type PersonalOrderAlert = {
  attempted: boolean;
  sent: boolean;
  message?: string;
  messageId?: number;
  chatId?: string;
};

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 2
});

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendPersonalOrderAlert(
  db: SupabaseClient,
  orderId: string
): Promise<PersonalOrderAlert> {
  const { data: order, error: orderError } = await db.from('orders')
    .select('order_date,status')
    .eq('id', orderId).single();
  if (orderError || !order) throw new Error('No se pudo consultar el pedido para el aviso personal.');
  if (order.status === 'Cancelado' || order.status === 'Anulado') return { attempted: false, sent: false };

  const date = String(order.order_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('El pedido no tiene una fecha válida para calcular el acumulado.');
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const categories = new Map<string, { count: number; revenue: number }>();
  let count = 0;
  let revenue = 0;
  // PostgREST limita las respuestas; recorrer todas las páginas evita truncar el acumulado.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('orders')
      .select('category,total_amount')
      .gte('order_date', `${date}T00:00:00.000Z`)
      .lt('order_date', nextDate.toISOString())
      .not('status', 'in', '(Cancelado,Anulado)')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`No se pudo calcular el acumulado diario: ${error.message}`);
    for (const row of data || []) {
      const category = row.category?.trim().toUpperCase() || 'OTRO';
      const amount = Number(row.total_amount || 0);
      const totals = categories.get(category) ?? { count: 0, revenue: 0 };
      totals.count++;
      totals.revenue += amount;
      categories.set(category, totals);
      count++;
      revenue += amount;
    }
    if (!data || data.length < 1000) break;
  }

  const chatId = '-5320088914';
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return { attempted: true, sent: false, message: 'Falta configurar el bot de Telegram.' };
  }

  const [year, month, day] = date.split('-');
  const breakdown = [...categories].sort(([a, totalsA], [b, totalsB]) =>
    totalsB.revenue - totalsA.revenue || a.localeCompare(b, 'es-AR')
  );
  const text = [
    `📦 <b>Pedidos del ${day}/${month}/${year}</b>`,
    `<b>Cantidad de pedidos:</b> ${count}`,
    '',
    '🏷️ <b>Pedidos por tipo</b>',
    ...breakdown.map(([category, totals]) =>
      `• ${escapeHtml(category)}: ${totals.count} ${totals.count === 1 ? 'pedido' : 'pedidos'} · ${money.format(totals.revenue)}`
    ),
    '',
    `💵 <b>Acumulado:</b> ${money.format(revenue)}`
  ].join('\n');

  const key = { chat_id: chatId, order_date: date };
  const table = 'daily_order_telegram_messages';
  const { data: existing, error: lookupError } = await db.from(table)
    .select('message_id').match(key).maybeSingle();
  if (lookupError) throw new Error('No se pudo consultar el mensaje del resumen diario.');
  if (existing && existing.message_id === null) {
    throw new Error('El primer envío del resumen quedó sin confirmar. Revisá el grupo de Telegram.');
  }

  const messageId = existing?.message_id;
  if (!messageId) {
    // Reservar la fecha antes del envío evita duplicados ante una respuesta incierta.
    const { error } = await db.from(table).insert(key);
    if (error) throw new Error('No se pudo reservar el resumen diario de Telegram.');
  }

  const method = messageId ? 'editMessageText' : 'sendMessage';
  let response: Response;
  let payload;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10000)
    });
    payload = await response.json();
  } catch {
    throw new Error('Telegram no confirmó la publicación del resumen diario.');
  }
  if (!response.ok || !payload.ok) {
    const description = payload.description || 'Telegram rechazó el resumen diario.';
    if (messageId && response.status === 400 && description.includes('message is not modified')) {
      return { attempted: true, sent: true, messageId, chatId };
    }
    if (!messageId && response.status >= 400 && response.status < 500 && payload.ok === false) {
      const { error } = await db.from(table).delete().match(key).is('message_id', null);
      if (error) throw new Error('Telegram rechazó el resumen y no se pudo liberar la reserva.');
    }
    return { attempted: true, sent: false, message: description };
  }
  if (messageId) return { attempted: true, sent: true, messageId, chatId };

  const sentId = payload.result?.message_id;
  if (!Number.isSafeInteger(sentId) || sentId <= 0) {
    throw new Error('Telegram no devolvió el identificador del resumen diario.');
  }
  const { error: saveError } = await db.from(table).update({ message_id: sentId }).match(key);
  if (saveError) throw new Error('Telegram publicó el resumen diario, pero no se pudo guardar su identificador.');
  return { attempted: true, sent: true, messageId: sentId, chatId };
}
