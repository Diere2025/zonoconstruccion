export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getTelegramConfig, saveTelegramConfig, sendTelegramMessage, getArgentinaDateTime, checkAndDispatchTelegramAlert, type TelegramConfig } from '@/lib/mpTelegramAlert';

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
      was_offline: config.was_offline,
      accounts_state: config.accounts_state || {}
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
        bot_token: body.bot_token && !body.bot_token.includes('...') 
          ? body.bot_token.trim() 
          : currentConfig.bot_token,
        accounts_state: currentConfig.accounts_state || {}
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
