import { NextRequest, NextResponse } from 'next/server';
import {
  appendNewOrderToOperationalSheets,
  appendOrderToSellerSheet,
  CENTRAL_ORDERS_SHEET,
  getCentralOrderDailySequence,
  getNextAvailableSheetCode,
  normalizeSellerNameForSheet,
  SELLER_SHEET_CONFIG,
  setOrderStatusInSheetRows,
  SheetOrderPayload
} from '@/lib/googleSheets';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

type ExpressAlertResult = { attempted: boolean; sent: boolean; message?: string };

// Respaldo operativo para que los avisos sigan funcionando aunque el entorno
// de despliegue todavía no tenga las variables configuradas. Las variables y
// site_settings, si existen, siempre tienen prioridad.
const FALLBACK_EXPRESS_CHAT_ID = '-1002433775204';
const FALLBACK_ROUTE_FORMATION_CHAT_ID = '-1002044363540';

function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isExpressFreight(freightType?: string): boolean {
  return (freightType || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('express');
}

async function getExpressChatId(botToken: string): Promise<string | null> {
  if (process.env.EXPRESS_TELEGRAM_CHAT_ID?.trim()) return process.env.EXPRESS_TELEGRAM_CHAT_ID.trim();

  try {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'express_telegram_config')
      .maybeSingle();
    const config = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
    if (config?.chat_id) return String(config.chat_id).trim();
  } catch (error) {
    console.warn('[Express Telegram] No se pudo leer la configuración:', error);
  }

  // Evita depender de un ID escrito en el código: si el bot ya recibió
  // actividad del grupo, se lo reconoce por el nombre mostrado por Telegram.
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const payload = await response.json();
    const match = payload.result?.find((update: any) => {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      const title = (chat?.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return (chat?.type === 'group' || chat?.type === 'supergroup') && title.includes('pedidos express aviso');
    });
    const chat = match?.message?.chat || match?.my_chat_member?.chat;
    if (chat?.id) return String(chat.id);
  } catch (error) {
    console.warn('[Express Telegram] No se pudo detectar el grupo:', error);
  }

  return FALLBACK_EXPRESS_CHAT_ID;
}

async function sendOperationalTelegramMessage(
  origin: string,
  chatId: string,
  html: string
): Promise<ExpressAlertResult> {
  const response = await fetch(`${origin}/api/vendedores/telegram-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'operational', chatId, message: html })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    return { attempted: true, sent: false, message: payload.error || payload.description || 'No se pudo enviar el aviso operativo' };
  }
  return { attempted: true, sent: true };
}

async function sendExpressOrderAlert(origin: string, code: string, order: SheetOrderPayload): Promise<ExpressAlertResult> {
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN;
  const chatId = await getExpressChatId(botToken?.trim() || '');
  if (!chatId) {
    return {
      attempted: true,
      sent: false,
      message: 'No se encontró el grupo PEDIDOS EXPRESS AVISO. Configurá EXPRESS_TELEGRAM_CHAT_ID o agregá actividad al grupo con el bot.'
    };
  }

  const items = (order.items || [])
    .map(item => `• ${item.quantity || 1} × ${escapeTelegramHtml(item.name)}`)
    .join('\n');
  const lines = [
    '🟢 <b>NUEVO PEDIDO EXPRESS</b>',
    '───────────────────────',
    `📦 <b>Pedido:</b> <code>${escapeTelegramHtml(code)}</code>`,
    `👤 <b>Cliente:</b> ${escapeTelegramHtml(order.clientName || 'Sin nombre')}`,
    order.phonePrimary ? `📱 <b>Teléfono:</b> ${escapeTelegramHtml(order.phonePrimary)}` : '',
    order.deliveryDate ? `📅 <b>Entrega:</b> ${escapeTelegramHtml(order.deliveryDate)}` : '',
    order.locality ? `📍 <b>Localidad:</b> ${escapeTelegramHtml(order.locality)}` : '',
    order.address ? `🏠 <b>Dirección:</b> ${escapeTelegramHtml(order.address)}` : '',
    order.sellerName ? `💼 <b>Vendedor/a:</b> ${escapeTelegramHtml(order.sellerName)}` : '',
    items ? `\n<b>Productos</b>\n${items}` : '',
    order.deliveryNotes ? `\n📝 <b>Indicaciones:</b> ${escapeTelegramHtml(order.deliveryNotes)}` : ''
  ].filter(Boolean);

  if (!botToken) return sendOperationalTelegramMessage(origin, chatId, lines.join('\n'));

  const response = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    return { attempted: true, sent: false, message: payload.description || 'Telegram rechazó el mensaje' };
  }
  return { attempted: true, sent: true };
}

async function getRouteFormationChatId(botToken: string): Promise<string | null> {
  if (process.env.ROUTE_FORMATION_TELEGRAM_CHAT_ID?.trim()) {
    return process.env.ROUTE_FORMATION_TELEGRAM_CHAT_ID.trim();
  }

  try {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'route_formation_telegram_config')
      .maybeSingle();
    const config = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
    if (config?.chat_id) return String(config.chat_id).trim();
  } catch (error) {
    console.warn('[Route formation Telegram] No se pudo leer la configuración:', error);
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const payload = await response.json();
    const match = payload.result?.find((update: any) => {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      const title = (chat?.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return (chat?.type === 'group' || chat?.type === 'supergroup') &&
        title.includes('pedidos') && title.includes('formacion de recorridos');
    });
    const chat = match?.message?.chat || match?.my_chat_member?.chat;
    if (chat?.id) return String(chat.id);
  } catch (error) {
    console.warn('[Route formation Telegram] No se pudo detectar el grupo:', error);
  }

  return FALLBACK_ROUTE_FORMATION_CHAT_ID;
}

async function sendRouteFormationAlert(origin: string, code: string, order: SheetOrderPayload): Promise<ExpressAlertResult> {
  const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN;
  const chatId = await getRouteFormationChatId(botToken?.trim() || '');
  if (!chatId) {
    return {
      attempted: true,
      sent: false,
      message: 'No se encontró el grupo Pedidos (formación de recorridos). Configurá ROUTE_FORMATION_TELEGRAM_CHAT_ID.'
    };
  }

  const dailySequence = await getCentralOrderDailySequence(order.orderDate);
  const icon = isExpressFreight(order.freightType) ? '🟢' : '📌';
  const items = (order.items || [])
    .map(item => `➖${item.quantity || 1} ${escapeTelegramHtml(item.name)}`)
    .join('\n');
  const text = [
    `<b>${icon} ${dailySequence}. ${escapeTelegramHtml(order.locality || 'Sin localidad')} (${escapeTelegramHtml(code)})</b>`,
    items,
    '──────────────────'
  ].filter(Boolean).join('\n');

  if (!botToken) return sendOperationalTelegramMessage(origin, chatId, text);

  const response = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    return { attempted: true, sent: false, message: payload.description || 'Telegram rechazó el mensaje' };
  }
  return { attempted: true, sent: true };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get('sellerId');

    if (!sellerId) {
      return NextResponse.json({ error: 'sellerId is required' }, { status: 400 });
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({ synced: false, message: 'No sheet sync configured for this seller' });
    }

    const result = await getNextAvailableSheetCode(config.spreadsheetId, config.sheetName);
    return NextResponse.json({
      synced: true,
      code: result.code,
      rowNumber: result.rowNumber
    });
  } catch (err: any) {
    console.error('[create-sheet-order GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Error checking next sheet code' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Las altas de pedidos siempre se reflejan en Central y Entregas Actual.
    // El valor por defecto mantiene la compatibilidad con navegadores que aún
    // tengan el bundle anterior en caché y no envíen el indicador.
    const { sellerId, order, syncOperational = true } = body as {
      sellerId: string;
      order: SheetOrderPayload;
      // Sólo el alta nueva debe crear filas nuevas en las planillas operativas.
      // La re-sincronización manual de un pedido histórico conserva su comportamiento previo.
      syncOperational?: boolean;
    };

    if (!sellerId || !order) {
      return NextResponse.json({ error: 'sellerId and order are required' }, { status: 400 });
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({
        synced: false,
        message: 'Sheet sync is not enabled for this seller'
      });
    }

    // Ensure sellerName is correctly set to the real seller name from the database
    if (!order.sellerName || order.sellerName === 'Vendedor' || (sellerId !== '381df0d1-183f-4ccb-aaf2-8147c76159a9' && order.sellerName === 'Diego Bóveda')) {
      try {
        const { data: sRow } = await supabaseAdmin
          .from('sellers')
          .select('full_name')
          .eq('id', sellerId)
          .maybeSingle();
        if (sRow?.full_name) {
          order.sellerName = sRow.full_name;
        }
      } catch (sErr) {
        console.warn('Could not lookup seller name in create-sheet-order:', sErr);
      }
    }

    order.sellerName = normalizeSellerNameForSheet(order.sellerName);

    // Asegurar que el estado en planilla siempre sea '🔸 Validado' salvo que esté 'En Espera'
    if (order.status !== 'En Espera') {
      order.status = '🔸 Validado';
    }

    // Procedencia por defecto si viene vacía
    if (!order.source || order.source.trim() === '') {
      order.source = 'Publicidad Meta';
    }

    const result = await appendOrderToSellerSheet(
      config.spreadsheetId,
      config.sheetName,
      order
    );

    // El código que genera la planilla de la vendedora es el identificador
    // compartido por Central (columna B) y Entregas Actual (columna A).
    const initialOperationalSync = syncOperational
      ? await appendNewOrderToOperationalSheets(result.codes, order)
      : undefined;
    const sellerStatusSync = initialOperationalSync?.central.success
      ? await setOrderStatusInSheetRows(
          config.spreadsheetId,
          config.sheetName,
          result.rowNumbers,
          0,
          '🔹 Pasado'
        )
      : undefined;
    const centralStatusSync = initialOperationalSync?.deliveriesCurrent.success && initialOperationalSync.central.rowNumbers
      ? await setOrderStatusInSheetRows(
          CENTRAL_ORDERS_SHEET.spreadsheetId,
          CENTRAL_ORDERS_SHEET.sheetName,
          initialOperationalSync.central.rowNumbers,
          CENTRAL_ORDERS_SHEET.columnOffset,
          '🔹 Pasado'
        )
      : undefined;
    const operationalSync = initialOperationalSync
      ? { ...initialOperationalSync, sellerStatusSync, centralStatusSync }
      : undefined;
    const operationalRowsCreated = initialOperationalSync
      ? initialOperationalSync.central.success && initialOperationalSync.deliveriesCurrent.success
      : undefined;
    const operationalSyncSucceeded = initialOperationalSync
      ? initialOperationalSync.central.success &&
        initialOperationalSync.deliveriesCurrent.success &&
        sellerStatusSync?.success === true &&
        centralStatusSync?.success === true
      : undefined;
    const origin = new URL(req.url).origin;
    const formationAlert = syncOperational && operationalRowsCreated
      ? await sendRouteFormationAlert(origin, result.code, order)
      : { attempted: false, sent: false };
    const expressAlert = syncOperational && isExpressFreight(order.freightType)
      ? await sendExpressOrderAlert(origin, result.code, order)
      : { attempted: false, sent: false };

    return NextResponse.json({
      synced: true,
      code: result.code,
      rowNumber: result.rowNumber,
      operationalSync,
      operationalSyncSucceeded,
      formationAlert,
      expressAlert
    });
  } catch (err: any) {
    console.error('[create-sheet-order POST] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Error writing order to Google Sheet' },
      { status: 500 }
    );
  }
}
