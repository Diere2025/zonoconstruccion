import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, type, legacyCode } = body;

    const botToken = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN || '8729986754:AAEHUc4WWKG2Bq-U0D8NKrrwVPm3QSzDe1c';
    const chatId = process.env.LOGISTICS_TELEGRAM_CHAT_ID || '-1002086594506';

    if (!botToken || !chatId) {
      console.warn('[Telegram Notify] Missing botToken or chatId in environment');
      return NextResponse.json(
        { ok: false, error: 'Telegram credentials not configured' },
        { status: 400 }
      );
    }

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
