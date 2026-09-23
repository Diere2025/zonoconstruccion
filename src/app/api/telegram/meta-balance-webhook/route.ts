import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number | string }; message_id?: number };
  edited_message?: { text?: string; chat?: { id?: number | string }; message_id?: number };
};

function isBalanceRequest(text: string): boolean {
  return /^(?:saldo|\/saldo(?:@ModificacionesZono_Bot)?)\s*$/i.test(text.trim());
}

async function sendBalance(chatId: string, replyToMessageId?: number) {
  const token = process.env.META_ACCESS_TOKEN;
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN;
  if (!token || !botToken) throw new Error('Faltan credenciales de Meta o Telegram.');

  const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  const version = process.env.META_API_VERSION || 'v21.0';
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}`);
  url.searchParams.set('fields', 'id,name,currency,amount_spent,spend_cap,is_prepay_account');
  url.searchParams.set('access_token', token);
  const metaResponse = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const account = await metaResponse.json();
  if (!metaResponse.ok || account.error || account.id !== accountId ||
      account.name !== 'S731.04' || account.currency !== 'USD' || account.is_prepay_account !== false) {
    throw new Error('No se pudo verificar la cuenta publicitaria S731.04.');
  }
  if (!/^\d+$/.test(String(account.spend_cap)) || !/^\d+$/.test(String(account.amount_spent))) {
    throw new Error('Meta devolvió importes inválidos.');
  }
  const cap = Number(account.spend_cap);
  if (cap <= 0) throw new Error('La cuenta no tiene un límite de gasto definido.');
  const remaining = Math.max(0, cap - Number(account.amount_spent)) / 100;
  const display = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(remaining);
  const urgent = remaining < 500;
  const message = urgent
    ? `🚨🚨 SALDO PUBLICITARIO BAJO 🚨🚨\n\nCuenta Meta S731.04\nDisponible hasta el límite de gasto: ${display}\n\n⚠️ CARGAR SALDO O AUMENTAR EL LÍMITE DE INMEDIATO PARA EVITAR CORTES.`
    : `📊 Saldo publicitario Meta\n\nCuenta S731.04\nDisponible hasta el límite de gasto: ${display}`;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, reply_to_message_id: replyToMessageId }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram rechazó la respuesta.');
}

export async function POST(request: Request) {
  const secret = process.env.META_BALANCE_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const raw = await request.text();
  let update: TelegramUpdate;
  try { update = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }); }

  const message = update.message || update.edited_message;
  const chatId = String(message?.chat?.id || '');
  const targetChatId = process.env.META_BALANCE_TELEGRAM_CHAT_ID;
  const targetChat = Boolean(targetChatId && chatId === targetChatId);
  const balanceRequest = targetChat && isBalanceRequest(message?.text || '');
  console.log('[Telegram webhook update]', {
    kind: update.message ? 'message' : update.edited_message ? 'edited_message' : 'other',
    targetChat,
    balanceRequest,
    configured: Boolean(targetChatId)
  });
  if (balanceRequest) {
    try {
      await sendBalance(chatId, message?.message_id);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('[Meta balance webhook]', error);
      return NextResponse.json({ error: 'No se pudo responder' }, { status: 503 });
    }
  }

  // This group is dedicated to Meta balance notices; acknowledge its other messages.
  if (targetChat) return NextResponse.json({ ok: true, ignored: true });

  // Keep every existing bot workflow on its current webhook service.
  const existingWebhook = process.env.TELEGRAM_EXISTING_WEBHOOK_URL;
  if (!existingWebhook) return NextResponse.json({ error: 'Falta el webhook existente' }, { status: 503 });
  try {
    const response = await fetch(existingWebhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Webhook existente: HTTP ${response.status}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram webhook forwarding]', error);
    return NextResponse.json({ error: 'No se pudo entregar al webhook existente' }, { status: 503 });
  }
}

export { isBalanceRequest };
