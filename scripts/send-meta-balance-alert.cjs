// Daily Meta Ads balance notice for account S731.04.
// Required: META_ACCESS_TOKEN, LOGISTICS_TELEGRAM_BOT_TOKEN,
// META_BALANCE_TELEGRAM_CHAT_ID. The scheduler supplies the daily 10:00 run.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

function loadLocalEnv() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

function dollars(cents) {
  if (!/^\d+$/.test(String(cents ?? ''))) throw new Error('Meta no devolvió un importe válido.');
  return Number(cents) / 100;
}

function latestSpendLimitIncrease(activities = []) {
  const candidates = activities
    .filter(activity => activity.event_type === 'ad_account_update_spend_limit')
    .map(activity => {
      try {
        const details = typeof activity.extra_data === 'string' ? JSON.parse(activity.extra_data) : activity.extra_data;
        const oldValue = Number(details?.old_value);
        const newValue = Number(details?.new_value);
        if (details?.type !== 'payment_amount' || !Number.isFinite(oldValue) || !Number.isFinite(newValue) || newValue <= oldValue) return null;
        const timestamp = Date.parse(activity.event_time);
        if (!Number.isFinite(timestamp)) return null;
        return { timestamp, amount: (newValue - oldValue) / 100 };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!candidates.length) return null;
  const latest = candidates[0];
  const date = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short'
  }).format(new Date(latest.timestamp));
  const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(latest.amount);
  return `Último aumento del límite: ${date} — +${amount}.`;
}

function formatMessage(account, now = new Date()) {
  if (account.name !== 'S731.04' || account.currency !== 'USD') {
    throw new Error('La respuesta de Meta no corresponde a S731.04 en USD.');
  }
  const cap = dollars(account.spend_cap);
  const spent = dollars(account.amount_spent);
  if (cap <= 0) throw new Error('La cuenta no tiene un límite de gasto definido; no se puede calcular el disponible.');
  const remaining = Math.max(0, cap - spent);
  const display = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(remaining);
  const date = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short'
  }).format(now);
  const urgent = remaining < 500;
  const limitIncrease = latestSpendLimitIncrease(account.activities?.data || []);
  const limitLine = limitIncrease ? `\n${limitIncrease}` : '';
  const text = urgent
    ? `🚨🚨 SALDO PUBLICITARIO BAJO 🚨🚨\n\nCuenta Meta S731.04\nDisponible hasta el límite de gasto: ${display}${limitLine}\n\n⚠️ CARGAR SALDO O AUMENTAR EL LÍMITE DE INMEDIATO PARA EVITAR CORTES.\n\nActualizado: ${date} (Argentina)`
    : `📊 Saldo publicitario Meta\n\nCuenta S731.04\nDisponible hasta el límite de gasto: ${display}${limitLine}\n\nActualizado: ${date} (Argentina)`;
  return { text, remaining, urgent };
}

async function main() {
  loadLocalEnv();
  const token = process.env.META_ACCESS_TOKEN;
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.META_BALANCE_TELEGRAM_CHAT_ID;
  const missing = [
    !token && 'META_ACCESS_TOKEN',
    !botToken && 'LOGISTICS_TELEGRAM_BOT_TOKEN',
    !chatId && 'META_BALANCE_TELEGRAM_CHAT_ID'
  ].filter(Boolean);
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(', ')}.`);

  const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193';
  const version = process.env.META_API_VERSION || 'v21.0';
  const url = new URL(`https://graph.facebook.com/${version}/${accountId}`);
  url.searchParams.set('fields', 'id,name,currency,amount_spent,spend_cap,is_prepay_account,activities.limit(100){event_time,event_type,extra_data}');
  url.searchParams.set('access_token', token);
  const metaResponse = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const account = await metaResponse.json();
  if (!metaResponse.ok || account.error) {
    throw new Error(`Meta rechazó la consulta (${account.error?.code || metaResponse.status}).`);
  }
  if (account.id !== accountId || account.is_prepay_account !== false) {
    throw new Error('Cambió la cuenta o su modalidad de pago; revisar qué importe corresponde informar.');
  }
  const notice = formatMessage(account);
  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: notice.text, disable_notification: false }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await telegramResponse.json();
  if (!telegramResponse.ok || !result.ok) {
    throw new Error(`Telegram rechazó el aviso: ${result.description || telegramResponse.status}`);
  }
  console.log(`Aviso enviado a Avisos Saldo Meta: USD ${notice.remaining.toFixed(2)}${notice.urgent ? ' (urgente)' : ''}.`);
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { formatMessage, latestSpendLimitIncrease };
