export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Comprehensive Mercado Pago Parser
function parseMpNotification(title: string, text: string, bigText?: string) {
  const content = `${text || ''} ${bigText || ''}`.trim();
  const lowerContent = content.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // Safety filter: Discard non-payment notifications ONLY if NOT an incoming payment
  const isExplicitIncoming = 
    lowerContent.includes('recibiste') || 
    lowerContent.includes('te transfirió') || 
    lowerContent.includes('te envió dinero') || 
    lowerContent.includes('ingresó') ||
    lowerContent.includes('cobro') ||
    lowerTitle.includes('recibiste') ||
    lowerTitle.includes('cobro');

  if (!isExplicitIncoming) {
    if (
      lowerContent.includes('te prestamos') ||
      lowerContent.includes('pedí tu préstamo') ||
      lowerContent.includes('pagaste') ||
      lowerContent.includes('tu compra de') ||
      lowerContent.includes('pago de servicios') ||
      lowerContent.includes('recarga de') ||
      (!lowerContent.includes('$') && !lowerTitle.includes('$'))
    ) {
      return {
        isIncomingPayment: false,
        reason: 'Notificación descartada (no corresponde a un cobro entrante)'
      };
    }
  }

  // 1. Amount extraction
  const amountMatch = content.match(/\$\s*([\d\.,]+)/);
  if (!amountMatch) {
    return {
      isIncomingPayment: false,
      reason: 'No se detectó un monto monetario en la notificación'
    };
  }

  const rawAmountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
  const amount = parseFloat(rawAmountStr);
  if (isNaN(amount) || amount <= 0) {
    return {
      isIncomingPayment: false,
      reason: 'El monto detectado no es un número válido mayor a 0'
    };
  }

  const formattedAmount = `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  // 2. Payment Type detection
  let paymentType = 'TRANSFERENCIA';
  if (lowerContent.includes('código qr') || lowerTitle.includes('código qr') || lowerContent.includes('qr')) {
    paymentType = 'QR';
  } else if (lowerContent.includes('point') || lowerTitle.includes('point') || lowerContent.includes('tarjeta de débito') || lowerContent.includes('tarjeta de crédito')) {
    paymentType = 'POINT';
  }

  // 3. Payer Name extraction
  let payerName = 'Cliente';

  // Pattern 1: "Recibiste $ 100 [Nombre] te envió dinero..."
  const matchEnvio = content.match(/Recibiste\s+\$[\s\d\.,]+\s*(?:de\s+)?(.+?)\s+te envió dinero/i);
  // Pattern 2: "Recibiste $ 100 De [Nombre] desde su cuenta..."
  const matchDe = content.match(/Recibiste\s+\$[\s\d\.,]+\s+De\s+([^.]+?)(?:\s+desde su cuenta|\s+y ya está|\.|$)/i);
  // Pattern 3: generic "de [Nombre]" or "te transfirió [Nombre]"
  const matchGen = content.match(/(?:de|recibiste de|te transfirió)\s+([^.]+?)(?:\s+desde su cuenta|\s+y ya está|\s+por transferencia|\.|$)/i);

  if (matchEnvio && matchEnvio[1]) {
    payerName = matchEnvio[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  } else if (matchDe && matchDe[1]) {
    payerName = matchDe[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  } else if (matchGen && matchGen[1]) {
    payerName = matchGen[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Clean up any trailing text
  payerName = payerName
    .replace(/\s+(desde su cuenta|y ya está|te envió dinero|en tu cuenta|por transferencia|transferencia recibida|transferencia|con mercado pago|desde mercado pago).*$/i, '')
    .trim();

  return {
    isIncomingPayment: true,
    amount,
    formattedAmount,
    payerName: payerName || 'Cliente',
    paymentType
  };
}

async function handleProcessNotification(
  request: Request,
  title: string,
  text: string,
  bigText: string,
  account: string
) {
  const parsed = parseMpNotification(title, text, bigText);

  if (!parsed.isIncomingPayment) {
    return NextResponse.json({
      success: false,
      isIncoming: false,
      message: parsed.reason,
      receivedText: `${title} ${text} ${bigText}`.trim()
    });
  }

  const paymentId = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const accountId = account.toLowerCase().replace(/\s+/g, '_');

  const paymentRecord = {
    id: paymentId,
    account_id: accountId,
    account_name: account,
    amount: parsed.amount,
    formatted_amount: parsed.formattedAmount,
    payer_name: parsed.payerName,
    payment_type: parsed.paymentType,
    source: 'NOTIFICATION',
    received_at: new Date().toISOString(),
    raw_title: title,
    raw_body: `${text} ${bigText}`.trim(),
    is_verified: true
  };

  const { data, error } = await supabaseAdmin
    .from('mp_payments')
    .insert(paymentRecord)
    .select()
    .single();

  if (error) {
    console.error('[MP Webhook] Supabase Insert Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Cobro registrado y transmitido con éxito',
    payment: data
  });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const tokenHeader = request.headers.get('x-webhook-token') || request.headers.get('authorization');
    const tokenQuery = url.searchParams.get('token') || url.searchParams.get('secret') || url.searchParams.get('key');
    const expectedSecret = process.env.MP_WEBHOOK_SECRET || 'mpchecker_secret_key_123';

    // Allow if token matches OR if valid MP notification structure is present
    let title = '';
    let text = '';
    let bigText = '';
    let account = url.searchParams.get('account') || 'Cuenta Principal';

    const contentType = (request.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const body: any = await request.json().catch(() => ({}));
      title = body.antitle || body.title || body.android_title || body.header || '';
      text = body.antext || body.text || body.android_text || body.message || body.body || '';
      bigText = body.anbigtext || body.bigText || body.android_big_text || '';
      if (body.account) account = body.account;
      if (body.token) tokenQuery ? null : body.token;
      if (!title && !text) {
        const keys = Object.keys(body);
        if (keys.length > 0) text = keys.join(' ');
      }
    } else {
      const rawBody = await request.text().catch(() => '');
      text = rawBody;
    }

    if (!text && !title) {
      text = url.searchParams.get('text') || url.searchParams.get('antext') || '';
      title = url.searchParams.get('title') || url.searchParams.get('antitle') || '';
    }

    const hasValidToken = tokenHeader === expectedSecret || tokenQuery === expectedSecret || (tokenHeader && tokenHeader.includes(expectedSecret));
    const hasValidPayload = (title || text).toLowerCase().includes('mercado') || (title || text).includes('$') || (title || text).toLowerCase().includes('transfir');

    if (!hasValidToken && !hasValidPayload) {
      return NextResponse.json(
        { success: false, error: 'Token de autenticación de webhook inválido' },
        { status: 401 }
      );
    }

    return handleProcessNotification(request, title, text, bigText, account);
  } catch (err: any) {
    console.error('[MP Webhook Error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const text = url.searchParams.get('text') || url.searchParams.get('antext');
    const title = url.searchParams.get('title') || url.searchParams.get('antitle');
    const bigText = url.searchParams.get('bigText') || url.searchParams.get('anbigtext') || '';
    const account = url.searchParams.get('account') || 'Cuenta Principal';

    if (text || title) {
      return handleProcessNotification(request, title || 'Mercado Pago', text || '', bigText, account);
    }

    return NextResponse.json({
      status: 'online',
      service: 'Zono Construcción MP Tasker Webhook',
      timestamp: new Date().toISOString(),
      endpoint: '/api/mp-webhook',
      methods: ['GET', 'POST']
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
