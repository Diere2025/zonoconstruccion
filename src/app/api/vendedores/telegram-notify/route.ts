import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Helper to format currency number in Argentine format (e.g. 525.980 or 50.000)
function formatArgAmount(amount: number): string {
  if (isNaN(amount)) return '0';
  return Math.round(amount).toLocaleString('es-AR');
}

// Helper to get Telegram chat ID for receipts
async function getReceiptsChatId(botToken: string): Promise<string> {
  // 1. Direct env variable
  if (process.env.RECEIPTS_TELEGRAM_CHAT_ID) {
    return process.env.RECEIPTS_TELEGRAM_CHAT_ID.trim();
  }

  // 2. Database site_settings
  try {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'receipts_telegram_config')
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (parsed.chat_id) {
        return parsed.chat_id.toString().trim();
      }
    }
  } catch (err) {
    console.warn('[Telegram Notify] Error querying receipts_telegram_config:', err);
  }

  // 3. Fallback to logistics chat ID
  return process.env.LOGISTICS_TELEGRAM_CHAT_ID || '-1002086594506';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN || '8729986754:AAEHUc4WWKG2Bq-U0D8NKrrwVPm3QSzDe1c';

    // Auto-detect groups where bot is added
    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getUpdates`);
    const data = await res.json();

    const groups: Array<{ id: number; title: string; type: string }> = [];
    if (data.ok && Array.isArray(data.result)) {
      const seen = new Set<number>();
      for (const update of data.result) {
        const chat = update.message?.chat || update.my_chat_member?.chat;
        if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
          if (!seen.has(chat.id)) {
            seen.add(chat.id);
            groups.push({ id: chat.id, title: chat.title || 'Sin Título', type: chat.type });
          }
        }
      }
    }

    // If detect action and found a group with Transferencia or MercadoPago, auto-save it
    const transferGroup = groups.find(g => 
      g.title.toLowerCase().includes('transferencia') || 
      g.title.toLowerCase().includes('mercadopago')
    );

    let savedChatId = null;
    if (transferGroup && action === 'auto_save') {
      await supabaseAdmin
        .from('site_settings')
        .upsert({
          id: 'receipts_telegram_config',
          value: JSON.stringify({ chat_id: transferGroup.id.toString(), title: transferGroup.title }),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      savedChatId = transferGroup.id;
    }

    const currentChatId = await getReceiptsChatId(botToken);

    return NextResponse.json({
      ok: true,
      currentReceiptsChatId: currentChatId,
      detectedGroups: groups,
      autoMatchedGroup: transferGroup || null,
      savedChatId
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      message, 
      type, 
      legacyCode, 
      photoUrl, 
      caption, 
      customerName, 
      taxId, 
      amount, 
      status, 
      reference 
    } = body;

    const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN || '8729986754:AAEHUc4WWKG2Bq-U0D8NKrrwVPm3QSzDe1c';

    // Handler for Comprobantes / Receipts (Single photo/doc or MediaGroup album)
    if (type === 'receipt' || photoUrl || (body.receipts && Array.isArray(body.receipts) && body.receipts.length > 0)) {
      const { 
        sellerName,
        pendingBalance,
        receipts
      } = body;

      const receiptsList: Array<{ url: string; amount?: number; notes?: string }> = Array.isArray(receipts) && receipts.length > 0
        ? receipts
        : (photoUrl ? [{ url: photoUrl, amount, notes: reference }] : []);

      if (receiptsList.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'photoUrl or receipts array is required' },
          { status: 400 }
        );
      }

      const targetChatId = await getReceiptsChatId(botToken);
      const isPaid = status?.toLowerCase().includes('abonado') || (pendingBalance !== undefined && Number(pendingBalance) <= 0);
      const statusEmoji = isPaid ? '🟢' : '🟡';
      const statusText = isPaid ? 'Abonado' : 'Señado';

      // Build caption
      let finalCaption = caption;
      if (!finalCaption) {
        if (receiptsList.length > 1) {
          const totalReceived = receiptsList.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
          const lines: string[] = [
            `🧾 <b>COMPROBANTE DE PAGO (${receiptsList.length} comprobantes)</b>`,
            '───────────────────────',
            `📦 <b>Pedido:</b> <code>${legacyCode || 'S/C'}</code>`,
            `👤 <b>Cliente:</b> ${customerName || 'Consumidor Final'}`
          ];

          if (taxId && taxId.trim()) {
            lines.push(`🪪 <b>DNI/CUIT:</b> ${taxId.trim()}`);
          }

          if (sellerName && sellerName.trim()) {
            lines.push(`💼 <b>Vendedor/a:</b> ${sellerName.trim()}`);
          }

          lines.push(`💵 <b>Total Recibido:</b> $${formatArgAmount(totalReceived)} (${statusEmoji} <b>${statusText}</b>)`);
          receiptsList.forEach((r, idx) => {
            lines.push(`  • Comprobante ${idx + 1}: $${formatArgAmount(Number(r.amount) || 0)}${r.notes ? ` (${r.notes})` : ''}`);
          });

          if (pendingBalance !== undefined && pendingBalance !== null) {
            const numBal = Number(pendingBalance);
            if (numBal > 0) {
              lines.push(`🏠 <b>Saldo en entrega:</b> $${formatArgAmount(numBal)}`);
            } else {
              lines.push(`🏠 <b>Saldo en entrega:</b> $0 (✓ Sin saldo pendiente)`);
            }
          }

          finalCaption = lines.join('\n');
        } else {
          // Single receipt
          const formattedAmount = formatArgAmount(Number(receiptsList[0]?.amount !== undefined ? receiptsList[0].amount : (amount || 0)));
          const lines: string[] = [
            '🧾 <b>COMPROBANTE DE PAGO</b>',
            '───────────────────────',
            `📦 <b>Pedido:</b> <code>${legacyCode || 'S/C'}</code>`,
            `👤 <b>Cliente:</b> ${customerName || 'Consumidor Final'}`
          ];

          if (taxId && taxId.trim()) {
            lines.push(`🪪 <b>DNI/CUIT:</b> ${taxId.trim()}`);
          }

          if (sellerName && sellerName.trim()) {
            lines.push(`💼 <b>Vendedor/a:</b> ${sellerName.trim()}`);
          }

          lines.push(`💵 <b>Monto Comprobante:</b> $${formattedAmount} (${statusEmoji} <b>${statusText}</b>)`);

          if (pendingBalance !== undefined && pendingBalance !== null) {
            const numBal = Number(pendingBalance);
            if (numBal > 0) {
              lines.push(`🏠 <b>Saldo en entrega:</b> $${formatArgAmount(numBal)}`);
            } else {
              lines.push(`🏠 <b>Saldo en entrega:</b> $0 (✓ Sin saldo pendiente)`);
            }
          }

          if (reference && reference.trim()) {
            lines.push(`📝 <b>Nota:</b> ${reference.trim()}`);
          }

          finalCaption = lines.join('\n');
        }
      }

      // If multiple receipts, send them together in one message via sendMediaGroup
      if (receiptsList.length > 1) {
        const hasPdf = receiptsList.some(r => r.url.toLowerCase().includes('.pdf'));
        const allPdf = receiptsList.every(r => r.url.toLowerCase().includes('.pdf'));

        // If not mixed (or all photos), use sendMediaGroup
        if (!hasPdf || allPdf) {
          const mediaType = allPdf ? 'document' : 'photo';
          const mediaPayload = receiptsList.map((r, i) => ({
            type: mediaType,
            media: r.url,
            caption: i === 0 ? finalCaption : undefined,
            parse_mode: i === 0 ? 'HTML' : undefined
          }));

          const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMediaGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              media: mediaPayload
            })
          });

          const data = await res.json();
          if (!data.ok) {
            console.warn('[Telegram Receipt] sendMediaGroup error:', data);
            return NextResponse.json({ ok: false, description: data.description }, { status: 502 });
          }

          return NextResponse.json({
            ok: true,
            chatId: targetChatId,
            caption: finalCaption,
            count: receiptsList.length
          });
        }
      }

      // Single receipt send (or fallback for mixed media types)
      const primaryReceipt = receiptsList[0];
      const isPdf = primaryReceipt.url.toLowerCase().includes('.pdf');
      const telegramMethod = isPdf ? 'sendDocument' : 'sendPhoto';
      const telegramPayload = isPdf 
        ? {
            chat_id: targetChatId,
            document: primaryReceipt.url,
            caption: finalCaption,
            parse_mode: 'HTML'
          }
        : {
            chat_id: targetChatId,
            photo: primaryReceipt.url,
            caption: finalCaption,
            parse_mode: 'HTML'
          };

      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/${telegramMethod}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramPayload)
      });

      const data = await res.json();
      if (!data.ok) {
        console.warn(`[Telegram Receipt] Telegram API error (${telegramMethod}):`, data);
        return NextResponse.json(
          { ok: false, description: data.description },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        messageId: data.result?.message_id,
        chatId: targetChatId,
        caption: finalCaption
      });
    }

    // Default handler for order modifications and cancellations
    const chatId = process.env.LOGISTICS_TELEGRAM_CHAT_ID || '-1002086594506';

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Convert double/single asterisks to HTML <b> tags for Telegram HTML parse mode
    const htmlMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<b>$1</b>');

    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: htmlMessage,
        parse_mode: 'HTML'
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('[Telegram Notify] Telegram API error:', data);
      return NextResponse.json(
        { ok: false, description: data.description },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: data.result?.message_id
    });
  } catch (error: any) {
    console.error('[Telegram Notify] Internal server error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
