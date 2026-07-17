import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    const [
      productsRes,
      sellersRes,
      localitiesRes,
      advSourcesRes,
      orderMediumsRes,
      paymentMethodsRes,
      phoneLinesRes
    ] = await Promise.all([
      supabaseAdmin.from('products').select('id, name, sku, price'),
      supabaseAdmin.from('sellers').select('id, full_name, is_organic'),
      supabaseAdmin.from('localities').select('id, name, zone_id'),
      supabaseAdmin.from('advertising_sources').select('id, name'),
      supabaseAdmin.from('order_mediums').select('id, name'),
      supabaseAdmin.from('payment_methods').select('id, name, surcharge_percentage, installments'),
      supabaseAdmin.from('phone_lines').select('id, phone_number')
    ]);

    if (productsRes.error) throw productsRes.error;
    if (sellersRes.error) throw sellersRes.error;
    if (localitiesRes.error) throw localitiesRes.error;
    if (advSourcesRes.error) throw advSourcesRes.error;
    if (orderMediumsRes.error) throw orderMediumsRes.error;
    if (paymentMethodsRes.error) throw paymentMethodsRes.error;
    if (phoneLinesRes.error) throw phoneLinesRes.error;

    return NextResponse.json({
      products: productsRes.data,
      sellers: sellersRes.data,
      localities: localitiesRes.data,
      advertising_sources: advSourcesRes.data,
      order_mediums: orderMediumsRes.data,
      payment_methods: paymentMethodsRes.data,
      phone_lines: phoneLinesRes.data
    });
  } catch (error: any) {
    console.error('[API Master Data] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
