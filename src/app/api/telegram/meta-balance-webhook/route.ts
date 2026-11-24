import { NextResponse } from 'next/server';
import {captureSupportTelegramGroup} from '@/lib/support/telegram';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number | string;title?:string;type?:string }; message_id?: number };
  edited_message?: { text?: string; chat?: { id?: number | string }; message_id?: number };
};

type MetaActivity = { event_time?: string; event_type?: string; extra_data?: string | Record<string, unknown> };
type SpendLimitIncrease = { timestamp: number; amount: number; newValue: number };

const historyLimit = 10;
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const dollarFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' });

function spendLimitIncreases(activities: MetaActivity[]) {
  return activities
    .filter(activity => activity.event_type === 'ad_account_update_spend_limit')
    .map(activity => {
      try {
        const details = typeof activity.extra_data === 'string' ? JSON.parse(activity.extra_data) : activity.extra_data;
        const oldValue = Number(details?.old_value);
        const newValue = Number(details?.new_value);
        const timestamp = Date.parse(activity.event_time || '');
        if (details?.type !== 'payment_amount' || !Number.isFinite(oldValue) || !Number.isFinite(newValue) || newValue <= oldValue || !Number.isFinite(timestamp)) return null;
        return { timestamp, amount: (newValue - oldValue) / 100, newValue };
      } catch {
        return null;
      }
    })
    .filter((value): value is SpendLimitIncrease => value !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function formatIncrease(increase: SpendLimitIncrease) {
  return `${dateFormat.format(new Date(increase.timestamp))} — +${dollarFormat.format(increase.amount)}`;
}

function latestSpendLimitIncrease(activities: MetaActivity[] = [], currentSpendCap?: string | number) {
  const [latest] = spendLimitIncreases(activities);
  if (!latest) return '';
  if (currentSpendCap !== undefined && latest.newValue !== Number(currentSpendCap)) {
    return '\nEl historial de Meta todavía no refleja el límite actual; no se puede confirmar el último aumento.';
  }
  return `\nÚltimo aumento del límite: ${formatIncrease(latest)}.`;
}

function formatHistory(activities: MetaActivity[]) {
  const increases = spendLimitIncreases(activities).slice(0, historyLimit);
  const heading = '📋 Aumentos recientes del límite de gasto\nCuenta Meta S731.04 · USD';
  if (!increases.length) return `${heading}\n\nSin aumentos registrados en la actividad reciente de Meta.`;
  return `${heading}\n\n${increases.map(increase => `• ${formatIncrease(increase)}`).join('\n')}`;
}

function isBalanceRequest(text: string): boolean {
  return /^(?:saldo|\/saldo(?:@ModificacionesZono_Bot)?)\s*$/i.test(text.trim());
}

function isHistoryRequest(text: string): boolean {
  return /^\/cargas(?:@ModificacionesZono_Bot)?$/i.test(text.trim());
}

async function sendAccountReply(chatId: string, showHistory: boolean, replyToMessageId?: number) {
  const token = process.env.META_ACCESS_TOKEN;
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN;
  if (!token || !botToken) throw new Error('Faltan credenciales de Meta o Telegram.');

  const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  const version = process.env.META_API_VERSION || 'v21.0';
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}`);
  url.searchParams.set('fields', 'id,name,currency,amount_spent,spend_cap,is_prepay_account,activities.limit(100){event_time,event_type,extra_data}');
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
  const activities = account.activities?.data || [];
  const message = showHistory ? formatHistory(activities) : formatBalance(account, activities);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, reply_to_message_id: replyToMessageId }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram rechazó la respuesta.');
}

function formatBalance(account: { spend_cap: string | number; amount_spent: string | number }, activities: MetaActivity[]) {
  const cap = Number(account.spend_cap);
  if (cap <= 0) throw new Error('La cuenta no tiene un límite de gasto definido.');
  const remaining = Math.max(0, cap - Number(account.amount_spent)) / 100;
  const display = dollarFormat.format(remaining);
  const limitIncrease = latestSpendLimitIncrease(activities, account.spend_cap);
  const historyHint = '\n\nHistorial reciente con /cargas.';
  return remaining < 500
    ? `🚨🚨 SALDO PUBLICITARIO BAJO 🚨🚨\n\nCuenta Meta S731.04\nDisponible hasta el límite de gasto: ${display}${limitIncrease}\n\n⚠️ CARGAR SALDO O AUMENTAR EL LÍMITE DE INMEDIATO PARA EVITAR CORTES.${historyHint}`
    : `📊 Saldo publicitario Meta\n\nCuenta S731.04\nDisponible hasta el límite de gasto: ${display}${limitIncrease}${historyHint}`;
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

  try {
    if(await captureSupportTelegramGroup(update))return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:'No se pudo registrar el grupo de incidencias.'},{status:503});
  }

  const message = update.message || update.edited_message;
  const chatId = String(message?.chat?.id || '');
  const targetChatId = process.env.META_BALANCE_TELEGRAM_CHAT_ID;
  const targetChat = Boolean(targetChatId && chatId === targetChatId);
  const balanceRequest = targetChat && isBalanceRequest(message?.text || '');
  const historyRequest = targetChat && isHistoryRequest(message?.text || '');
  console.log('[Telegram webhook update]', {
    kind: update.message ? 'message' : update.edited_message ? 'edited_message' : 'other',
    targetChat,
    balanceRequest,
    historyRequest,
    configured: Boolean(targetChatId)
  });
  if (balanceRequest || historyRequest) {
    try {
      await sendAccountReply(chatId, historyRequest, message?.message_id);
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
