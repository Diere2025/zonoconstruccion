export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
  last_alert_at: string | null;
  was_offline: boolean;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: '',
  chat_id: '',
  last_alert_at: null,
  was_offline: false
};

async function getTelegramConfig(): Promise<TelegramConfig> {
  try {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'mp_telegram_config')
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('[MP Telegram Alert] Error reading config:', e);
  }
  return DEFAULT_CONFIG;
}

async function saveTelegramConfig(config: TelegramConfig): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('site_settings')
      .upsert({
        id: 'mp_telegram_config',
        value: JSON.stringify(config),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    return !error;
  } catch (e) {
    console.error('[MP Telegram Alert] Error saving config:', e);
    return false;
  }
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: text,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    return { ok: data.ok, description: data.description };
  } catch (e: any) {
    return { ok: false, description: e.message };
  }
}

function getArgentinaDateTime(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date);

  let hour = 0;
  let minute = 0;
  let second = 0;
  let weekday = '';
  let day = '';
  let month = '';
  let year = '';

  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
    if (p.type === 'second') second = parseInt(p.value, 10);
    if (p.type === 'weekday') weekday = p.value.toLowerCase();
    if (p.type === 'day') day = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'year') year = p.value;
  }

  const isSunday = weekday.startsWith('do');
  const currentMinutes = hour * 60 + minute;
  const isOfficeHours = !isSunday && currentMinutes >= 360 && currentMinutes < 1260; // 06:00 to 21:00

  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const dateStr = `${day}/${month}/${year}`;

  return { hour, minute, isOfficeHours, timeStr, dateStr };
}

export async function GET() {
  const config = await getTelegramConfig();
  const maskedToken = config.bot_token 
    ? `${config.bot_token.slice(0, 7)}...${config.bot_token.slice(-5)}` 
    : '';

  return NextResponse.json({
    success: true,
    config: {
      enabled: config.enabled,
      chat_id: config.chat_id,
      bot_token_masked: maskedToken,
      has_token: Boolean(config.bot_token),
      last_alert_at: config.last_alert_at,
      was_offline: config.was_offline
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'check-and-alert';
    const currentConfig = await getTelegramConfig();

    // 1. Action: Save Config
    if (action === 'save-config') {
      const updatedConfig: TelegramConfig = {
        ...currentConfig,
        enabled: Boolean(body.enabled),
        chat_id: (body.chat_id || currentConfig.chat_id || '').trim(),
        // Keep existing token if not provided or only masked
        bot_token: body.bot_token && !body.bot_token.includes('...') 
          ? body.bot_token.trim() 
          : currentConfig.bot_token
      };

      const saved = await saveTelegramConfig(updatedConfig);
      return NextResponse.json({ success: saved, message: saved ? 'Configuración guardada' : 'Error al guardar' });
    }

    // 2. Action: Test Alert
    if (action === 'test-alert') {
      const tokenToUse = (body.bot_token && !body.bot_token.includes('...')) ? body.bot_token.trim() : currentConfig.bot_token;
      const chatToUse = (body.chat_id || currentConfig.chat_id || '').trim();

      if (!tokenToUse || !chatToUse) {
        return NextResponse.json({ success: false, error: 'Falta Token del Bot o Chat ID' }, { status: 400 });
      }

      const arg = getArgentinaDateTime();
      const testMsg = `⚡ *PRUEBA DE CONEXIÓN - ZONO ERP*\n\n¡Hola! Las alertas de Telegram para el *Monitor de Mercado Pago* están configuradas y funcionando correctamente.\n\n🕒 *Hora local:* ${arg.timeStr} hs\n📅 *Fecha:* ${arg.dateStr}\n🟢 *Estado:* CONECTADO`;

      const tgRes = await sendTelegramMessage(tokenToUse, chatToUse, testMsg);
      if (!tgRes.ok) {
        let errDesc = tgRes.description || 'Error de Telegram al enviar';
        if (errDesc.toLowerCase().includes('chat not found')) {
          errDesc = 'Debes buscar tu nuevo bot en Telegram y presionar el botón "Iniciar" (Start) o enviarle /start para que tenga permiso de enviarte mensajes.';
        }
        return NextResponse.json({ success: false, error: errDesc }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: '¡Mensaje de prueba enviado con éxito a tu celular!' });
    }

    // 3. Action: Check and Alert
    if (action === 'check-and-alert') {
      const result = await checkAndDispatchTelegramAlert(currentConfig);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Acción no reconocida' }, { status: 400 });
  } catch (err: any) {
    console.error('[MP Telegram Alert Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function checkAndDispatchTelegramAlert(passedConfig?: TelegramConfig) {
  const currentConfig = passedConfig || await getTelegramConfig();
  if (!currentConfig.enabled || !currentConfig.bot_token || !currentConfig.chat_id) {
    return { success: true, status: 'disabled_or_unconfigured' };
  }

  // Fetch main account last_seen_at
  const { data: acc } = await supabaseAdmin
    .from('mp_accounts')
    .select('id, name, last_seen_at, client_time')
    .eq('id', 'pagoszono_26')
    .maybeSingle();

  const lastSeenMs = acc?.last_seen_at ? new Date(acc.last_seen_at).getTime() : null;
  const arg = getArgentinaDateTime();
  const allowedTimeoutMs = arg.isOfficeHours ? 240000 : 900000; // 4m office, 15m outside
  const allowedMinutes = arg.isOfficeHours ? 4 : 15;
  const officeLabel = arg.isOfficeHours ? 'Horario de Oficina (06:00 a 21:00)' : 'Horario Nocturno / Reposo';

  const isOffline = lastSeenMs ? (Date.now() - lastSeenMs >= allowedTimeoutMs) : true;
  const minutesAgo = lastSeenMs ? Math.max(0, Math.floor((Date.now() - lastSeenMs) / 60000)) : 999;

  // CASE A: Monitor is OFFLINE
  if (isOffline) {
    // Anti-spam check: send at most once every 30 minutes
    const lastAlertMs = currentConfig.last_alert_at ? new Date(currentConfig.last_alert_at).getTime() : 0;
    const cooldownMs = 30 * 60 * 1000; // 30 min cooldown
    const canSendAlert = Date.now() - lastAlertMs >= cooldownMs;

    if (canSendAlert) {
      const alertMsg = 
`🚨 *ALERTA: MONITOR MERCADO PAGO DESCONECTADO*

La cuenta *${acc?.name || 'pagoszono.26'}* no envía señal al ERP hace *${minutesAgo} minutos*.

⏱️ *Tolerancia máxima:* ${allowedMinutes} min (${officeLabel})
🕒 *Hora actual:* ${arg.timeStr} hs
📅 *Fecha:* ${arg.dateStr}
${acc?.client_time ? `🕒 *Último reloj detectado:* ${acc.client_time} hs\n` : ''}
⚠️ _Por favor verifique que la PC de monitoreo esté encendida con la pestaña de Mercado Pago abierta y la sesión activa._`;

      const tgRes = await sendTelegramMessage(currentConfig.bot_token, currentConfig.chat_id, alertMsg);
      if (tgRes.ok) {
        currentConfig.last_alert_at = new Date().toISOString();
        currentConfig.was_offline = true;
        await saveTelegramConfig(currentConfig);
        return { success: true, status: 'alert_sent', minutesAgo };
      } else {
        return { success: false, error: tgRes.description };
      }
    }

    return { success: true, status: 'offline_cooldown_active', minutesAgo };
  }

  // CASE B: Monitor is ONLINE, but was previously offline and sent alert -> Send RECOVERY message!
  if (!isOffline && currentConfig.was_offline) {
    const recoveryMsg = 
`✅ *MONITOR MERCADO PAGO RESTABLECIDO*

La cuenta *${acc?.name || 'pagoszono.26'}* volvió a sincronizar correctamente.

🟢 *Estado:* ONLINE
🕒 *Hora de restablecimiento:* ${arg.timeStr} hs
${acc?.client_time ? `🕒 *Reloj de la extensión:* ${acc.client_time} hs` : ''}`;

    await sendTelegramMessage(currentConfig.bot_token, currentConfig.chat_id, recoveryMsg);
    currentConfig.was_offline = false;
    await saveTelegramConfig(currentConfig);
    return { success: true, status: 'recovery_sent' };
  }

  return { success: true, status: 'monitor_online_ok' };
}
