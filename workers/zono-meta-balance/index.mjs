import { activityFields, getZonoAccountReply, zonoAccounts } from '../../src/lib/metaZonoBalance.mjs';

function dollars(cents) {
  if (!/^\d+$/.test(String(cents ?? ''))) throw new Error('Meta no devolvió un importe válido.');
  return Number(cents) / 100;
}

function latestSpendLimitIncrease(activities = [], currentSpendCap) {
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
        return { timestamp, amount: (newValue - oldValue) / 100, newValue };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!candidates.length) return null;
  const latest = candidates[0];
  if (currentSpendCap !== undefined && latest.newValue !== Number(currentSpendCap)) {
    return 'El historial de Meta todavía no refleja el límite actual; no se puede confirmar el último aumento.';
  }
  const date = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
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
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  const urgent = remaining < 500;
  const limitIncrease = latestSpendLimitIncrease(account.activities?.data || [], account.spend_cap);
  const limitLine = limitIncrease ? `\n${limitIncrease}` : '';
  const text = urgent
    ? `🚨🚨 SALDO PUBLICITARIO BAJO 🚨🚨\n\nCuenta Meta S731.04\nDisponible hasta el límite de gasto: ${display}${limitLine}\n\n⚠️ CARGAR SALDO O AUMENTAR EL LÍMITE DE INMEDIATO PARA EVITAR CORTES.\n\nActualizado: ${date} (Argentina)`
    : `📊 Saldo publicitario Meta\n\nCuenta S731.04\nDisponible hasta el límite de gasto: ${display}${limitLine}\n\nActualizado: ${date} (Argentina)`;
  return { text, remaining, urgent };
}

const chatId = '-5169896257';
const timezone = 'America/Argentina/Buenos_Aires';

async function requestJson(url, service, options = {}) {
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (response.ok && !body.error && body.ok !== false) return body;
    throw new Error(String(response.status));
  } catch {
    // URLs and upstream error text can contain credentials.
    throw new Error(`No se pudo completar la operación en ${service}.`);
  }
}

async function getPrimaryNotice(env) {
  const accountId = 'act_1077861488005193';
  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${accountId}`);
  url.searchParams.set('fields', `id,name,currency,amount_spent,spend_cap,is_prepay_account,${activityFields}`);
  const account = await requestJson(url, 'Meta', { headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } });
  if (account.id !== accountId || account.is_prepay_account !== false) throw new Error('Meta devolvió otra cuenta o modalidad de pago.');
  return formatMessage(account);
}

export async function getNotice(env) {
  if (!env.META_ACCESS_TOKEN || !env.LOGISTICS_TELEGRAM_BOT_TOKEN) throw new Error('Faltan secretos del Worker.');
  if (!env.META_ZONO_ACCESS_TOKEN) return getPrimaryNotice(env);

  const [primary, ...accounts] = await Promise.allSettled([
    getPrimaryNotice(env),
    ...zonoAccounts.map(account => getZonoAccountReply(account, { token: env.META_ZONO_ACCESS_TOKEN })),
  ]);
  if (primary.status === 'rejected' && accounts.every(account => account.status === 'rejected')) throw primary.reason;
  const notice = primary.status === 'fulfilled'
    ? primary.value
    : { text: 'Cuenta Meta S731.04 · USD\nSaldo sin confirmar.', urgent: false };
  const balances = accounts.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : `Cuenta Meta ${zonoAccounts[index].name} · ARS\nSaldo sin confirmar.`);
  return { ...notice, text: [notice.text, ...balances].join('\n\n') };
}

export class DailyDelivery {
  constructor(ctx, env) { this.storage = ctx.storage; this.env = env; }

  async fetch() {
    if (await this.storage.get('delivery')) return Response.json({ skipped: true });
    const notice = await getNotice(this.env);
    const claimed = await this.storage.transaction(async tx => {
      if (await tx.get('delivery')) return false;
      await tx.put('delivery', { state: 'attempted' });
      return true;
    });
    if (!claimed) return Response.json({ skipped: true });
    const result = await requestJson(`https://api.telegram.org/bot${this.env.LOGISTICS_TELEGRAM_BOT_TOKEN}/sendMessage`, 'Telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: notice.text, disable_notification: false }),
    });
    if (!result.ok || !Number.isInteger(result.result?.message_id)) throw new Error('Telegram no confirmó el envío.');
    await this.storage.put('delivery', { state: 'sent', messageId: result.result.message_id });
    return Response.json({ sent: true, urgent: notice.urgent });
  }
}

export default {
  async scheduled(controller, env) {
    const scheduled = new Date(controller.scheduledTime);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(scheduled);
    const part = type => parts.find(p => p.type === type).value;
    if (part('hour') !== '10' || part('minute') !== '00') throw new Error('El aviso debe programarse a las 10:00 de Buenos Aires.');
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    const delivery = env.DAILY_DELIVERY.get(env.DAILY_DELIVERY.idFromName(day));
    const response = await delivery.fetch('https://daily-delivery.internal/');
    if (!response.ok) throw new Error('Falló el aviso de saldo diario.');
    console.log('Aviso de saldo:', await response.json());
  },
};
