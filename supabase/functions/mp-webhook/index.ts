import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://ckvbyfgsbjbfaqotmeld.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  try {
    const url = new URL(req.url);
    const tokenHeader = req.headers.get('x-webhook-token') || req.headers.get('authorization');
    const tokenQuery = url.searchParams.get('token') || url.searchParams.get('secret') || url.searchParams.get('key');
    const expectedSecret = Deno.env.get('MP_WEBHOOK_SECRET') || 'mpchecker_secret_key_123';

    let title = '';
    let text = '';
    let bigText = '';
    let account = url.searchParams.get('account') || 'Cuenta MP3';

    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      title = body.antitle || body.title || body.android_title || body.header || '';
      text = body.antext || body.text || body.android_text || body.message || body.body || '';
      bigText = body.anbigtext || body.bigText || body.android_big_text || '';
      if (body.account) account = body.account;
      if (!title && !text) {
        const keys = Object.keys(body);
        if (keys.length > 0) text = keys.join(' ');
      }
    } else {
      text = await req.text().catch(() => '');
    }

    if (!text && !title) {
      text = url.searchParams.get('text') || url.searchParams.get('antext') || '';
      title = url.searchParams.get('title') || url.searchParams.get('antitle') || '';
    }

    const hasValidToken = tokenHeader === expectedSecret || tokenQuery === expectedSecret || (tokenHeader && tokenHeader.includes(expectedSecret));
    const hasValidPayload = (title || text).toLowerCase().includes('mercado') || (title || text).includes('$') || (title || text).toLowerCase().includes('transfir');

    if (!hasValidToken && !hasValidPayload) {
      return new Response(JSON.stringify({ success: false, error: 'Token de webhook inválido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const content = `${text || ''} ${bigText || ''}`.trim();
    const lowerContent = content.toLowerCase();
    const lowerTitle = (title || '').toLowerCase();

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
        return new Response(JSON.stringify({
          success: false,
          isIncoming: false,
          message: 'Notificación descartada (no corresponde a un cobro entrante)'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    const amountMatch = content.match(/\$\s*([\d\.,]+)/);
    if (!amountMatch) {
      return new Response(JSON.stringify({ success: false, isIncoming: false, message: 'Sin monto' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const rawAmountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(rawAmountStr);
    if (isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ success: false, isIncoming: false, message: 'Monto inválido' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const hasDecimals = amount % 1 !== 0;
    const formattedAmount = `$ ${amount.toLocaleString('es-AR', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2
    })}`;

    let paymentType = 'TRANSFERENCIA';
    if (lowerContent.includes('código qr') || lowerTitle.includes('código qr') || lowerContent.includes('qr')) {
      paymentType = 'QR';
    } else if (lowerContent.includes('point') || lowerTitle.includes('point') || lowerContent.includes('tarjeta de débito') || lowerContent.includes('tarjeta de crédito')) {
      paymentType = 'POINT';
    }

    let payerName = 'Cliente';
    const matchEnvio = content.match(/Recibiste\s+\$[\s\d\.,]+\s*(?:de\s+)?(.+?)\s+te envió dinero/i);
    const matchDe = content.match(/Recibiste\s+\$[\s\d\.,]+\s+De\s+([^.]+?)(?:\s+desde su cuenta|\s+y ya está|\.|$)/i);
    const matchGen = content.match(/(?:de|recibiste de|te transfirió)\s+([^.]+?)(?:\s+desde su cuenta|\s+y ya está|\s+por transferencia|\.|$)/i);

    if (matchEnvio && matchEnvio[1]) {
      payerName = matchEnvio[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (matchDe && matchDe[1]) {
      payerName = matchDe[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (matchGen && matchGen[1]) {
      payerName = matchGen[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    }

    payerName = payerName
      .replace(/\s+(desde su cuenta|y ya está|te envió dinero|en tu cuenta|por transferencia|transferencia recibida|transferencia|con mercado pago|desde mercado pago).*$/i, '')
      .trim();

    const paymentId = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

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
    } catch (_e) {
      // fallback safe
    }

    let isInternal = false;
    try {
      const { data: internalPayers } = await supabaseAdmin.from('mp_internal_payers').select('name, normalized_name');
      const normPayer = (payerName || '').toLowerCase().trim();
      if (normPayer && internalPayers && internalPayers.some((ip: any) => normPayer.includes(ip.normalized_name) || ip.normalized_name.includes(normPayer))) {
        isInternal = true;
      }
    } catch (_e) {
      // fallback safe
    }

    const paymentRecord = {
      id: paymentId,
      account_id: resolvedAccountId,
      account_name: account || 'Cuenta MP3',
      amount,
      formatted_amount: formattedAmount,
      payer_name: payerName || 'Cliente',
      payment_type: paymentType,
      source: 'NOTIFICATION_EDGE',
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
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Cobro registrado y transmitido con éxito (Supabase Edge)',
      payment: data
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
