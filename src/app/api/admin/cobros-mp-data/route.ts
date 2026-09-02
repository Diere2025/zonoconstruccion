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
    const userRole = (searchParams.get('role') || 'admin').toLowerCase();

    if (action === 'accounts') {
      const { data, error } = await supabaseAdmin
        .from('mp_accounts')
        .select('*')
        .order('name');
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    if (action === 'internal-payers') {
      const { data, error } = await supabaseAdmin
        .from('mp_internal_payers')
        .select('*')
        .order('name');
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    if (action === 'search-orders') {
      const queryText = (searchParams.get('q') || '').trim();
      let q = supabaseAdmin
        .from('orders')
        .select('id, legacy_code, customer_name, total_amount, status, created_at')
        .order('created_at', { ascending: false });

      if (queryText) {
        q = q.or(`legacy_code.ilike.%${queryText}%,customer_name.ilike.%${queryText}%`);
      }

      const { data, error } = await q.limit(25);
      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: (data || []).map(o => ({
          id: o.id,
          order_code: o.legacy_code || `ORD-${o.id.substring(0, 6)}`,
          client_name: o.customer_name || 'Cliente S/D',
          total_amount: Number(o.total_amount) || 0,
          status: o.status,
          created_at: o.created_at
        }))
      });
    }

    if (action === 'list') {
      const accountId = searchParams.get('accountId');
      const search = searchParams.get('search');
      let dateRange = searchParams.get('dateRange') || 'TODAY';
      let type = searchParams.get('type') || 'ALL';
      const showHidden = searchParams.get('showHidden') === 'true';

      const isSeller = userRole === 'seller' || userRole === 'vendedora' || userRole === 'ventas';
      const isLogistica = userRole === 'logistica';
      const isFletero = userRole === 'fletero' || userRole === 'carrier';
      const isAdminOrAdminStaff = userRole === 'admin' || userRole === 'administracion';

      // Apply strict role restrictions
      if (isSeller) {
        dateRange = 'LAST_3_DAYS';
        type = 'TRANSFERENCIA';
      } else if (isLogistica) {
        if (!['TODAY', 'YESTERDAY', 'LAST_3_DAYS', 'YESTERDAY_TODAY'].includes(dateRange)) {
          dateRange = 'LAST_3_DAYS';
        }
      } else if (isFletero) {
        dateRange = 'LAST_HOUR';
      }

      const now = new Date();
      // Argentina UTC-3 offset helper
      const oneHourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const todayStr = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const yesterdayStr = new Date(now.getTime() - (24 + 3) * 3600 * 1000).toISOString().split('T')[0];
      const threeDaysAgoStr = new Date(now.getTime() - (3 * 24 + 3) * 3600 * 1000).toISOString().split('T')[0];
      const sevenDaysAgoStr = new Date(now.getTime() - (7 * 24 + 3) * 3600 * 1000).toISOString().split('T')[0];

      let query = supabaseAdmin
        .from('mp_payments')
        .select('*')
        .order('received_at', { ascending: false });

      // Non-admin / non-administracion users NEVER see internal user payments
      if (!isAdminOrAdminStaff) {
        query = query.or('is_internal.is.null,is_internal.eq.false');
      }

      // Hidden filter: only admin can view hidden items
      if (isAdminOrAdminStaff && showHidden) {
        query = query.eq('is_hidden', true);
      } else {
        query = query.or('is_hidden.is.null,is_hidden.eq.false');
      }

      // Date Range Filter
      if (dateRange === 'LAST_HOUR') {
        query = query.gte('received_at', oneHourAgoIso);
      } else if (dateRange === 'TODAY') {
        query = query.gte('received_at', `${todayStr}T00:00:00.000Z`).lte('received_at', `${todayStr}T23:59:59.999Z`);
      } else if (dateRange === 'YESTERDAY') {
        query = query.gte('received_at', `${yesterdayStr}T00:00:00.000Z`).lte('received_at', `${yesterdayStr}T23:59:59.999Z`);
      } else if (dateRange === 'YESTERDAY_TODAY') {
        query = query.gte('received_at', `${yesterdayStr}T00:00:00.000Z`);
      } else if (dateRange === 'LAST_3_DAYS') {
        query = query.gte('received_at', `${threeDaysAgoStr}T00:00:00.000Z`);
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
        query = query.or(`payer_name.ilike.%${search}%,formatted_amount.ilike.%${search}%,raw_body.ilike.%${search}%,order_code.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(300);
      if (error) throw error;

      // Calculate stats ONLY for Admin & Administracion
      let todayStats = null;
      if (isAdminOrAdminStaff) {
        const { data: todayRecords } = await supabaseAdmin
          .from('mp_payments')
          .select('amount, is_internal')
          .gte('received_at', `${todayStr}T00:00:00.000Z`)
          .lte('received_at', `${todayStr}T23:59:59.999Z`)
          .or('is_hidden.is.null,is_hidden.eq.false');

        const totalCount = todayRecords ? todayRecords.length : 0;
        const totalAmount = todayRecords ? todayRecords.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) : 0;
        todayStats = { totalCount, totalAmount };
      }

      return NextResponse.json({
        success: true,
        data: data || [],
        todayStats,
        effectiveRole: userRole,
        effectiveRange: dateRange
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

    if (action === 'toggle-internal-payer') {
      const { paymentId, payerName, isInternal } = body;
      if (!payerName) return NextResponse.json({ error: 'payerName requerido' }, { status: 400 });
      const normName = payerName.toLowerCase().trim();

      if (isInternal) {
        await supabaseAdmin.from('mp_internal_payers').upsert({
          name: payerName.trim(),
          normalized_name: normName,
          notes: 'Marcado desde transacción'
        }, { onConflict: 'name' });

        await supabaseAdmin
          .from('mp_payments')
          .update({ is_internal: true })
          .or(`id.eq.${paymentId},payer_name.ilike.%${normName}%`);
      } else {
        await supabaseAdmin.from('mp_internal_payers').delete().eq('normalized_name', normName);

        await supabaseAdmin
          .from('mp_payments')
          .update({ is_internal: false })
          .or(`id.eq.${paymentId},payer_name.ilike.%${normName}%`);
      }

      return NextResponse.json({ success: true, isInternal });
    }

    if (action === 'add-internal-payer') {
      const { name, notes } = body;
      if (!name) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
      const normName = name.toLowerCase().trim();

      const { data, error } = await supabaseAdmin.from('mp_internal_payers').upsert({
        name: name.trim(),
        normalized_name: normName,
        notes: notes || 'Usuario propio'
      }, { onConflict: 'name' }).select().single();

      if (error) throw error;

      await supabaseAdmin
        .from('mp_payments')
        .update({ is_internal: true })
        .ilike('payer_name', `%${normName}%`);

      return NextResponse.json({ success: true, data });
    }

    if (action === 'remove-internal-payer') {
      const { id, name } = body;
      if (!id && !name) return NextResponse.json({ error: 'id o name requerido' }, { status: 400 });

      let q = supabaseAdmin.from('mp_internal_payers').delete();
      if (id) q = q.eq('id', id);
      else if (name) q = q.eq('name', name);

      const { error } = await q;
      if (error) throw error;

      if (name) {
        await supabaseAdmin
          .from('mp_payments')
          .update({ is_internal: false })
          .ilike('payer_name', `%${name.toLowerCase().trim()}%`);
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'link-order') {
      const { paymentId, orderId, orderCode, linkedBy } = body;
      if (!paymentId || !orderCode) {
        return NextResponse.json({ error: 'paymentId y orderCode son requeridos' }, { status: 400 });
      }

      const cleanCode = String(orderCode).trim().toUpperCase();

      // If orderId was not provided, attempt a lookup in orders table by legacy_code
      let finalOrderId = orderId || null;
      if (!finalOrderId) {
        try {
          const { data: matchedOrder } = await supabaseAdmin
            .from('orders')
            .select('id')
            .ilike('legacy_code', cleanCode)
            .maybeSingle();

          if (matchedOrder?.id) {
            finalOrderId = matchedOrder.id;
          }
        } catch (e) {
          console.warn('Error looking up order ID by code:', e);
        }
      }

      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .update({
          order_id: finalOrderId,
          order_code: cleanCode,
          linked_by: linkedBy || 'Usuario',
          linked_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, payment: data });
    }

    if (action === 'unlink-order') {
      const { paymentId } = body;
      if (!paymentId) return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 });

      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .update({
          order_id: null,
          order_code: null,
          linked_by: null,
          linked_at: null
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, payment: data });
    }

    if (action === 'toggle-hide') {
      const { paymentId, isHidden } = body;
      if (!paymentId) return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 });

      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .update({
          is_hidden: Boolean(isHidden)
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, payment: data });
    }

    if (action === 'delete-payment') {
      const { paymentId } = body;
      if (!paymentId) return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 });

      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .delete()
        .eq('id', paymentId)
        .select('id')
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Pago eliminado con éxito', id: data?.id });
    }

    if (action === 'save-account') {
      const { id, name, alias, color } = body;
      if (!name) return NextResponse.json({ error: 'Nombre de cuenta requerido' }, { status: 400 });

      const accountId = id || `acc_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const { data, error } = await supabaseAdmin
        .from('mp_accounts')
        .upsert({
          id: accountId,
          name: name.trim(),
          alias: (alias || name).trim(),
          color: color || '#0069ff',
          is_active: true
        }, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    if (action === 'simulate') {
      const { title, text, account } = body;
      const testTitle = title || 'Mercado Pago';
      const testText = text || 'Recibiste $ 15.000 de Juan Carlos Pérez';
      const testAccount = account || 'Cuenta MP3';

      const amountMatch = testText.match(/\$\s*([\d\.,]+)/);
      const rawAmount = amountMatch ? parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) : 15000;
      const hasDecimals = rawAmount % 1 !== 0;
      const formattedAmount = `$ ${rawAmount.toLocaleString('es-AR', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      })}`;

      let payerName = 'Juan Carlos Pérez';
      const deMatch = testText.match(/(?:de|recibiste de)\s+([^.]+)/i);
      if (deMatch && deMatch[1]) payerName = deMatch[1].trim();

      // Check if internal payer
      let isInternal = false;
      const { data: internalPayers } = await supabaseAdmin.from('mp_internal_payers').select('normalized_name');
      const normPayer = payerName.toLowerCase().trim();
      if (internalPayers && internalPayers.some(ip => normPayer.includes(ip.normalized_name) || ip.normalized_name.includes(normPayer))) {
        isInternal = true;
      }

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
        is_verified: true,
        is_hidden: false,
        is_internal: isInternal
      };

      const { data, error } = await supabaseAdmin.from('mp_payments').insert(paymentRecord).select().single();
      if (error) throw error;

      return NextResponse.json({ success: true, payment: data });
    }

    if (action === 'purge-tests') {
      const { data, error } = await supabaseAdmin
        .from('mp_payments')
        .delete()
        .or('source.eq.SIMULATION,payer_name.ilike.%prueba%,payer_name.ilike.%test%')
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
