export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';

    if (action === 'accounts') {
      const { data, error } = await supabaseAdmin
        .from('mp_accounts')
        .select('*')
        .order('name');
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    if (action === 'list') {
      const accountId = searchParams.get('accountId');
      const search = searchParams.get('search');
      const dateRange = searchParams.get('dateRange') || 'TODAY';
      const type = searchParams.get('type');

      const now = new Date();
      // Argentina UTC-3 offset
      const todayStr = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const yesterdayStr = new Date(now.getTime() - (24 + 3) * 3600 * 1000).toISOString().split('T')[0];
      const sevenDaysAgoStr = new Date(now.getTime() - (7 * 24 + 3) * 3600 * 1000).toISOString().split('T')[0];

      let query = supabaseAdmin
        .from('mp_payments')
        .select('*')
        .order('received_at', { ascending: false });

      if (dateRange === 'TODAY') {
        query = query.gte('received_at', `${todayStr}T00:00:00.000Z`).lte('received_at', `${todayStr}T23:59:59.999Z`);
      } else if (dateRange === 'YESTERDAY') {
        query = query.gte('received_at', `${yesterdayStr}T00:00:00.000Z`).lte('received_at', `${yesterdayStr}T23:59:59.999Z`);
      } else if (dateRange === 'YESTERDAY_TODAY') {
        query = query.gte('received_at', `${yesterdayStr}T00:00:00.000Z`);
      } else if (dateRange === 'LAST_7_DAYS') {
        query = query.gte('received_at', `${sevenDaysAgoStr}T00:00:00.000Z`);
      }

      if (accountId && accountId !== 'ALL') {
        query = query.eq('account_id', accountId);
      }

      if (type && type !== 'ALL') {
        query = query.eq('payment_type', type);
      }

      if (search) {
        query = query.or(`payer_name.ilike.%${search}%,formatted_amount.ilike.%${search}%,raw_body.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(300);
      if (error) throw error;

      // Calculate today stats
      const { data: todayRecords } = await supabaseAdmin
        .from('mp_payments')
        .select('amount')
        .gte('received_at', `${todayStr}T00:00:00.000Z`)
        .lte('received_at', `${todayStr}T23:59:59.999Z`);

      const totalCount = todayRecords ? todayRecords.length : 0;
      const totalAmount = todayRecords ? todayRecords.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) : 0;

      return NextResponse.json({
        success: true,
        data: data || [],
        todayStats: { totalCount, totalAmount }
      });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Cobros MP Data GET Error]:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json().catch(() => ({}));

    if (action === 'simulate') {
      const { title, text, account } = body;
      const testTitle = title || 'Mercado Pago';
      const testText = text || 'Recibiste $ 15.000 de Juan Carlos Pérez';
      const testAccount = account || 'Cuenta Principal';

      const amountMatch = testText.match(/\$\s*([\d\.,]+)/);
      const rawAmount = amountMatch ? parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) : 15000;
      const formattedAmount = `$ ${rawAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

      let payerName = 'Juan Carlos Pérez';
      const deMatch = testText.match(/(?:de|recibiste de)\s+([^.]+)/i);
      if (deMatch && deMatch[1]) payerName = deMatch[1].trim();

      const paymentRecord = {
        id: `mp_sim_${Date.now()}`,
        account_id: testAccount.toLowerCase().replace(/\s+/g, '_'),
        account_name: testAccount,
        amount: rawAmount,
        formatted_amount: formattedAmount,
        payer_name: payerName,
        payment_type: testText.toLowerCase().includes('qr') ? 'QR' : testText.toLowerCase().includes('point') ? 'POINT' : 'TRANSFERENCIA',
        source: 'SIMULATION',
        received_at: new Date().toISOString(),
        raw_title: testTitle,
        raw_body: testText,
        is_verified: true
      };

      const { data, error } = await supabaseAdmin.from('mp_payments').insert(paymentRecord).select().single();
      if (error) throw error;

      return NextResponse.json({ success: true, payment: data });
    }

    if (action === 'purge-tests') {
      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .delete()
        .or('source.eq.SIMULATION,payer_name.ilike.%prueba%,payer_name.ilike.%test%,payer_name.ilike.%boveda%,payer_name.ilike.%ibarra%')
        .select('id');

      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: `Se eliminaron ${data ? data.length : 0} pagos de prueba`,
        deletedCount: data ? data.length : 0
      });
    }

    if (action === 'clear-all') {
      const { data, error } = await supabaseAdmin.from('mp_payments').delete().neq('id', 'non_existing').select('id');
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Todos los pagos fueron eliminados', count: data ? data.length : 0 });
    }

    if (action === 'save-account') {
      const { id, name, alias, color } = body;
      if (!name) return NextResponse.json({ error: 'Nombre de cuenta requerido' }, { status: 400 });

      const accId = id || `acc_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const { data, error } = await supabaseAdmin.from('mp_accounts').upsert({
        id: accId,
        name,
        alias: alias || name,
        color: color || '#0069ff',
        is_active: true
      }).select().single();

      if (error) throw error;
      return NextResponse.json({ success: true, account: data });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Cobros MP Data POST Error]:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
