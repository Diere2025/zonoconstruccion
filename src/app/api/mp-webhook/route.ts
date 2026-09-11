export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Comprehensive Mercado Pago Parser
function parseMpNotification(title: string, text: string, bigText?: string) {
  const cleanTitle = (title || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
  const cleanText = (text || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
  const cleanBigText = (bigText || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();

  const fullContent = `${cleanTitle} ${cleanText} ${cleanBigText}`.trim();

  // Only if 100% empty
  if (!fullContent) {
    return {
      isIncomingPayment: true,
      amount: 100,
      formattedAmount: '$ 100',
      payerName: 'Prueba de Conexión Tasker',
      paymentType: 'TRANSFERENCIA'
    };
  }

  const lower = fullContent.toLowerCase();

  // Rejection filter: unconditionally discard bills, loans, services, and outgoing payments
  const isExplicitOutgoingOrService =
    lower.includes('factura') ||
    lower.includes('vence hoy') ||
    lower.includes('vencimiento') ||
    lower.includes('a pagar') ||
    lower.includes('pagá ahora') ||
    lower.includes('pagaste') ||
    lower.includes('tu compra') ||
    lower.includes('pago de servicios') ||
    lower.includes('recarga') ||
    lower.includes('te prestamos') ||
    lower.includes('préstamo') ||
    lower.includes('débito automático');

  if (isExplicitOutgoingOrService) {
    return {
      isIncomingPayment: false,
      reason: 'Notificación descartada (corresponde a factura, servicio o gasto saliente)'
    };
  }

  // Incoming validation: MUST explicitly be an incoming payment / cobro
  const isExplicitIncoming = 
    lower.includes('recibiste') || 
    lower.includes('te transfiri') || 
    lower.includes('te envió') || 
    lower.includes('te enviaron') || 
    lower.includes('ingresó') ||
    lower.includes('ingresaron') ||
    lower.includes('cobro') ||
    lower.includes('cobraste') ||
    lower.includes('te pagaron') ||
    lower.includes('transferencia recibida') ||
    lower.includes('transferencia de') ||
    lower.includes('transferencia') ||
    lower.includes('acredit') ||
    lower.includes('aprobado');

  if (!isExplicitIncoming) {
    return {
      isIncomingPayment: false,
      reason: 'Notificación descartada (no contiene palabras de acreditación/cobro entrante)'
    };
  }

  // 1. Amount extraction: Look anywhere in fullContent
  const amountMatch = fullContent.match(/\$\s*([\d\.,]+)/) || fullContent.match(/([\d\.,]+)\s*pesos/i);
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
  if (lower.includes('código qr') || lower.includes('qr')) {
    paymentType = 'QR';
  } else if (lower.includes('point') || lower.includes('tarjeta de débito') || lower.includes('tarjeta de crédito')) {
    paymentType = 'POINT';
  }

  // 3. Payer Name extraction
  let payerName = 'Cliente';

  const m1 = fullContent.match(/Recibiste\s+\$[\s\d\.,]+\s*(?:de\s+)?(.+?)\s+te envió dinero/i);
  const m2 = fullContent.match(/Recibiste\s+\$[\s\d\.,]+\s+De\s+([^.]+?)(?:\s+desde su cuenta|\s+y ya está|\.|$)/i);
  const m3 = fullContent.match(/(?:transferencia recibida|mercado pago|^|[.\n])\s*(.+?)\s+te transfirió/i);
  const m4 = fullContent.match(/(?:transferencia recibida|mercado pago|^|[.\n])\s*(.+?)\s+te envió/i);
  const m5 = fullContent.match(/(?:transferencia recibida|transferencia de|recibiste de|de)\s+([^.$]+?)(?:\s+desde su cuenta|\s+por transferencia|\s+y ya está|\s+por\s+\$|\.|$)/i);
  const m6 = fullContent.match(/\$\s*[\d\.,]+\s+(?:de\s+)?([a-záéíóúñ\s]+?)(?:\s+desde|\s+y ya está|\s+por transferencia|\.|$)/i);

  let rawCandidate = '';
  if (m1 && m1[1]) rawCandidate = m1[1];
  else if (m2 && m2[1]) rawCandidate = m2[1];
  else if (m3 && m3[1] && !m3[1].toLowerCase().includes('recibiste')) rawCandidate = m3[1];
  else if (m4 && m4[1] && !m4[1].toLowerCase().includes('recibiste')) rawCandidate = m4[1];
  else if (m5 && m5[1]) rawCandidate = m5[1];
  else if (m6 && m6[1]) rawCandidate = m6[1];

  if (rawCandidate) {
    let cleaned = rawCandidate
      .replace(/^(?:transferencia recibida(?:\s*de)?|mercado pago|de|recibiste de)\s+/i, '')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+(desde su cuenta|y ya está|te envió dinero|en tu cuenta|por transferencia|transferencia recibida|transferencia|con mercado pago|desde mercado pago).*$/i, '')
      .trim();

    if (!cleaned.startsWith('$') && !cleaned.toLowerCase().startsWith('recibiste') && cleaned.length <= 50 && cleaned.length > 1) {
      payerName = cleaned;
    }
  }

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
  account: string,
  extraData?: {
    id?: string;
    received_at?: string;
    time?: string;
  }
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

  const paymentId = extraData?.id || `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Calculate receivedAt timestamp
  let receivedAt = extraData?.received_at || new Date().toISOString();
  if (isNaN(new Date(receivedAt).getTime())) {
    receivedAt = new Date().toISOString();
  }

  // Check for duplicate:
  // 1. By exact ID
  if (extraData?.id) {
    const { data: existingId } = await supabaseAdmin
      .from('mp_payments')
      .select('id, amount, payer_name, received_at')
      .eq('id', extraData.id)
      .maybeSingle();

    if (existingId) {
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        message: 'Cobro ya registrado previamente (mismo ID)',
        payment: existingId
      });
    }
  }

  // 2. Check for duplicate payment by amount, payer and received_at within 10 minutes
  try {
    const targetTime = new Date(receivedAt).getTime();
    const tenMinBefore = new Date(targetTime - 10 * 60 * 1000).toISOString();
    const tenMinAfter = new Date(targetTime + 10 * 60 * 1000).toISOString();

    const { data: existingFuzzy } = await supabaseAdmin
      .from('mp_payments')
      .select('id, amount, payer_name, received_at')
      .eq('amount', parsed.amount)
      .ilike('payer_name', parsed.payerName)
      .gte('received_at', tenMinBefore)
      .lte('received_at', tenMinAfter)
      .limit(1)
      .maybeSingle();

    if (existingFuzzy) {
      console.log('[MP Webhook] Duplicate payment avoided:', existingFuzzy);
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        message: 'Cobro ya registrado previamente (mismo monto, pagador y horario)',
        payment: existingFuzzy
      });
    }
  } catch (dupErr) {
    console.warn('[MP Webhook] Error checking duplicate:', dupErr);
  }

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
    received_at: receivedAt,
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

    let rawJsonBody: any = null;
    if (contentType.includes('application/json')) {
      const body: any = await request.json().catch(() => ({}));
      rawJsonBody = body;
      title = body.antitle || body.title || body.android_title || body.header || body.evtprm2 || '';
      text = body.antext || body.text || body.android_text || body.message || body.body || body.evtprm3 || '';
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

    // Clean any unexpanded Tasker variable tags (%antitle, %antext, %evtprm2, etc.)
    title = (title || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
    text = (text || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
    bigText = (bigText || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();

    if (!text && !title) {
      text = (url.searchParams.get('text') || url.searchParams.get('antext') || url.searchParams.get('evtprm3') || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
      title = (url.searchParams.get('title') || url.searchParams.get('antitle') || url.searchParams.get('evtprm2') || '').replace(/%(?:an[a-z]+|evtprm[0-9]+)/gi, '').trim();
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

    return handleProcessNotification(request, title, text, bigText, account, {
      id: rawJsonBody?.id || rawJsonBody?.external_id,
      received_at: rawJsonBody?.received_at || rawJsonBody?.date,
      time: rawJsonBody?.time
    });
  } catch (err: any) {
    console.error('[MP Webhook Error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-webhook-token, authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
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
      methods: ['GET', 'POST', 'OPTIONS']
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

