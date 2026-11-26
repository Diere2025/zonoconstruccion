export const zonoAccounts = [
  { id: 'act_2361501517627802', name: '1-ZONO' },
  { id: 'act_942497128185607', name: '2-ZONO' },
];

export const activityFields = 'activities.limit(100){event_time,event_type,extra_data}';
export const metaHistoryLimit = 10;
export const metaActivityDateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const pesoFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', currencyDisplay: 'code' });

/** @param {Array<{event_time?: string, event_type?: string, extra_data?: string | Record<string, unknown>}>} activities */
function creditedPayments(activities) {
  const payments = [];
  for (const activity of activities) {
    if (activity.event_type !== 'funding_event_successful') continue;
    try {
      const details = typeof activity.extra_data === 'string' ? JSON.parse(activity.extra_data) : activity.extra_data;
      const timestamp = Date.parse(activity.event_time || '');
      const amount = Number(details?.amount);
      if (details?.currency === 'ARS' && Number.isSafeInteger(amount) && amount > 0 && Number.isFinite(timestamp)) {
        payments.push({ timestamp, amount: amount / 100 });
      }
    } catch {
      continue;
    }
  }
  return payments.sort((a, b) => b.timestamp - a.timestamp);
}

/** @param {{timestamp: number, amount: number}} payment */
function formatPayment(payment) {
  return `${metaActivityDateFormat.format(new Date(payment.timestamp))} — +${pesoFormat.format(payment.amount)}`;
}

/**
 * @param {{id: string, name: string}} accountConfig
 * @param {{token: string, showHistory?: boolean, fetcher?: typeof fetch}} options
 */
export async function getZonoAccountReply({ id, name }, { token, showHistory = false, fetcher = fetch }) {
  const url = new URL(`https://graph.facebook.com/v24.0/${id}`);
  url.searchParams.set('fields', `id,currency,balance,amount_spent,spend_cap,is_prepay_account,${activityFields}`);
  const response = await fetcher(url, {
    cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  const account = await response.json();
  if (!response.ok || account.error || account.id !== id || account.currency !== 'ARS' || typeof account.is_prepay_account !== 'boolean') {
    throw new Error(`No se pudo verificar la cuenta publicitaria ${name} en Meta.`);
  }

  const heading = `Cuenta Meta ${name} · ARS`;
  const payments = creditedPayments(account.activities?.data || []);
  if (showHistory) {
    const rows = payments.slice(0, metaHistoryLimit).map(payment => `• ${formatPayment(payment)}`);
    const history = rows.length ? rows.join('\n') : 'Sin acreditaciones en la actividad reciente de Meta.';
    return `${heading}\nPagos acreditados recientes\n${history}`;
  }

  const lines = [heading];
  if (!account.is_prepay_account && /^\d+$/.test(String(account.balance))) {
    lines.push(`Importe pendiente de pago: ${pesoFormat.format(Number(account.balance) / 100)}.`);
  }
  if (/^\d+$/.test(String(account.spend_cap)) && Number(account.spend_cap) > 0 && /^\d+$/.test(String(account.amount_spent))) {
    const remaining = Math.max(0, Number(account.spend_cap) - Number(account.amount_spent)) / 100;
    lines.push(`Disponible hasta el límite de gasto: ${pesoFormat.format(remaining)}.`);
  }
  if (lines.length === 1) lines.push('Saldo sin confirmar.');
  if (payments[0]) lines.push(`Último pago acreditado: ${formatPayment(payments[0])}.`);
  return lines.join('\n');
}
