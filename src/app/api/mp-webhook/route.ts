export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Comprehensive Mercado Pago Parser
function parseMpNotification(title: string, text: string, bigText?: string) {
  let content = `${text || ''} ${bigText || ''}`.replace(/%an[a-z]+/gi, '').trim();

  // Only if 100% empty
  if (!content) {
    return {
      isIncomingPayment: true,
      amount: 100,
      formattedAmount: '$ 100',
      payerName: 'Prueba de Conexión Tasker',
      paymentType: 'TRANSFERENCIA'
    };
  }

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

  const hasDecimals = amount % 1 !== 0;
  const formattedAmount = `$ ${amount.toLocaleString('es-AR', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  })}`;

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
  
  // Resolve account_id from mp_accounts (or auto-ensure to prevent FK failure)
  let resolvedAccountId = 'acc_principal';
  try {
    const cleanAccount = (account || 'Cuenta MP3').trim();
    const { data: matchedAcc } = await supabaseAdmin
      .from('mp_accounts')
      .select('id')
      .or(`name.ilike.%${cleanAccount}%,alias.ilike.%${cleanAccount}%,id.ilike.%${cleanAccount.replace(/\s+/g, '_')}%`)
      .maybeSingle();

    if (matchedAcc?.id) {
      resolvedAccountId = matchedAcc.id;
    } else {
      const fallbackId = cleanAccount.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await supabaseAdmin.from('mp_accounts').upsert({
        id: fallbackId,
        name: cleanAccount,
        alias: cleanAccount,
        color: '#0069ff',
        is_active: true
      }, { onConflict: 'id' });
      resolvedAccountId = fallbackId;
    }
  } catch (e) {
    console.warn('[MP Webhook] Error resolving account_id:', e);
  }

  // Check if payer is an internal user
  let isInternal = false;
  try {
    const { data: internalPayers } = await supabaseAdmin.from('mp_internal_payers').select('name, normalized_name');
    const normPayer = (parsed.payerName || '').toLowerCase().trim();
    if (normPayer && internalPayers && internalPayers.some(ip => normPayer.includes(ip.normalized_name) || ip.normalized_name.includes(normPayer))) {
      isInternal = true;
    }
  } catch (e) {
    console.warn('[MP Webhook] Error checking internal payers:', e);
  }

  const paymentRecord = {
    id: paymentId,
    account_id: resolvedAccountId,
    account_name: account || 'Cuenta MP3',
    amount: parsed.amount,
    formatted_amount: parsed.formattedAmount,
    payer_name: parsed.payerName,
    payment_type: parsed.paymentType,
    source: 'NOTIFICATION',
    received_at: new Date().toISOString(),
    raw_title: title,
    raw_body: `${text} ${bigText}`.trim(),
    is_verified: true,
    is_internal: isInternal
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
    let tokenQuery = url.searchParams.get('token') || url.searchParams.get('secret') || url.searchParams.get('key');
    const expectedSecret = process.env.MP_WEBHOOK_SECRET || 'mpchecker_secret_key_123';

    // Allow if token matches OR if valid MP notification structure is present
    let title = '';
    let text = '';
    let bigText = '';
    let account = url.searchParams.get('account') || 'Cuenta MP3';

    const contentType = (request.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const body: any = await request.json().catch(() => ({}));
      title = body.antitle || body.title || body.android_title || body.header || '';
      text = body.antext || body.text || body.android_text || body.message || body.body || '';
      bigText = body.anbigtext || body.bigText || body.android_big_text || '';
      if (body.account) account = body.account;
      if (body.token) tokenQuery = body.token;
      if (!title && !text) {
        const keys = Object.keys(body);
        if (keys.length > 0) text = keys.join(' ');
      }
    } else {
      const rawBody = await request.text().catch(() => '');
      text = rawBody;
    }

    // Clean any unexpanded Tasker variable tags (%antitle, %antext, %anbigtext, etc.)
    title = (title || '').replace(/%an[a-z]+/gi, '').trim();
    text = (text || '').replace(/%an[a-z]+/gi, '').trim();
    bigText = (bigText || '').replace(/%an[a-z]+/gi, '').trim();

    if (!text && !title) {
      text = (url.searchParams.get('text') || url.searchParams.get('antext') || '').replace(/%an[a-z]+/gi, '').trim();
      title = (url.searchParams.get('title') || url.searchParams.get('antitle') || '').replace(/%an[a-z]+/gi, '').trim();
    }

    const hasValidToken = 
      tokenHeader === expectedSecret || 
      tokenQuery === expectedSecret || 
      (tokenHeader && tokenHeader.includes(expectedSecret));

    // Only if completely empty and valid token, provide a dummy test response
    if (!text && !title && hasValidToken) {
      title = 'Mercado Pago';
      text = 'Recibiste $ 100 de Prueba de Conexión Tasker';
      bigText = 'Recibiste $ 100 de Prueba de Conexión Tasker desde su cuenta de Mercado Pago.';
    }

    const fullContent = `${title} ${text} ${bigText}`.toLowerCase();

    const hasValidPayload = 
      fullContent.includes('mercado') || 
      fullContent.includes('$') || 
      fullContent.includes('transfir') ||
      fullContent.includes('recibiste') ||
      fullContent.includes('cobro');

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
    const account = url.searchParams.get('account') || 'Cuenta MP3';

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
