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
  orderId: string,
  code: string | null,
  submittedAt: string
): Promise<PersonalOrderAlert> {
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,order_date,customer_name,total_amount,status')
    .eq('id', orderId).single();
  if (orderError || !order) throw new Error('No se pudo consultar el pedido para el aviso personal.');
  if (order.status === 'Cancelado') return { attempted: false, sent: false };

  const date = String(order.order_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('El pedido no tiene una fecha válida para calcular el acumulado.');
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const laterOrderIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('order_sync_jobs')
      .select('order_id').eq('kind', 'create').gt('created_at', submittedAt)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`No se pudo ordenar el acumulado diario: ${error.message}`);
    for (const job of data || []) laterOrderIds.add(job.order_id);
    if (!data || data.length < 1000) break;
  }

  let count = 0;
  let revenue = 0;
  // PostgREST limita las respuestas; recorrer todas las páginas evita truncar el acumulado.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('orders')
      .select('id,total_amount')
      .gte('order_date', `${date}T00:00:00.000Z`)
      .lt('order_date', nextDate.toISOString())
      .neq('status', 'Cancelado')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`No se pudo calcular el acumulado diario: ${error.message}`);
    const included = (data || []).filter(row => !laterOrderIds.has(row.id));
    count += included.length;
    revenue += included.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    if (!data || data.length < 1000) break;
  }

  const { data: setting, error: settingError } = await db.from('site_settings')
    .select('value').eq('id', 'mp_telegram_config').maybeSingle();
  if (settingError) throw new Error(`No se pudo leer la configuración del Telegram personal: ${settingError.message}`);
  const config = typeof setting?.value === 'string' ? JSON.parse(setting.value) : setting?.value;
  const chatId = String(process.env.PERSONAL_ORDERS_TELEGRAM_CHAT_ID || config?.chat_id || '').trim();
  const botToken = String(process.env.PERSONAL_ORDERS_TELEGRAM_BOT_TOKEN || config?.bot_token || '').trim();
  if (!chatId || !botToken) {
    return { attempted: true, sent: false, message: 'Falta configurar el bot o chat personal de Telegram.' };
  }

  const label = code || order.id.slice(0, 8);
  const text = [
    '🛒 <b>Nuevo pedido cargado</b>',
    `📦 <b>Pedido:</b> <code>${escapeHtml(label)}</code>`,
    `👤 <b>Cliente:</b> ${escapeHtml(order.customer_name || 'Sin nombre')}`,
    `💰 <b>Importe:</b> ${money.format(Number(order.total_amount || 0))}`,
    '',
    `📅 <b>Acumulado del ${date.split('-').reverse().join('/')}</b>`,
    `📦 <b>Pedidos:</b> ${count}`,
    `💵 <b>Facturación:</b> ${money.format(revenue)}`
  ].join('\n');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    return { attempted: true, sent: false, message: payload.description || 'Telegram rechazó el aviso personal.' };
  }
  return { attempted: true, sent: true, messageId: payload.result?.message_id, chatId };
}
