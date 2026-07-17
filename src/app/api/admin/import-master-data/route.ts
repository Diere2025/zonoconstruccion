import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    // Helper function to fetch all products
    async function fetchProductsAll() {
      let allProducts: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('products')
          .select('id, name, sku, price')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      return allProducts;
    }

    const [
      products,
      sellersRes,
      localitiesRes,
      advSourcesRes,
      orderMediumsRes,
      paymentMethodsRes,
      phoneLinesRes,
      ordersRes
    ] = await Promise.all([
      fetchProductsAll(),
      supabaseAdmin.from('sellers').select('id, full_name, is_organic'),
      supabaseAdmin.from('localities').select('id, name, zone_id'),
      supabaseAdmin.from('advertising_sources').select('id, name'),
      supabaseAdmin.from('order_mediums').select('id, name'),
      supabaseAdmin.from('payment_methods').select('id, name, surcharge_percentage, installments'),
      supabaseAdmin.from('phone_lines').select('id, phone_number'),
      // Fetch only active orders to prevent 1000 cap from omitting them
      supabaseAdmin.from('orders')
        .select('id, legacy_code, status, delivery_detail, whaticket_link, order_medium_id')
        .in('status', ['Pendiente', 'Confirmado', 'Entregando'])
    ]);

    
    if (sellersRes.error) throw sellersRes.error;
    if (localitiesRes.error) throw localitiesRes.error;
    if (advSourcesRes.error) throw advSourcesRes.error;
    if (orderMediumsRes.error) throw orderMediumsRes.error;
    if (paymentMethodsRes.error) throw paymentMethodsRes.error;
    if (phoneLinesRes.error) throw phoneLinesRes.error;
    if (ordersRes.error) throw ordersRes.error;

    return NextResponse.json({
      products,
      sellers: sellersRes.data,
      localities: localitiesRes.data,
      advertising_sources: advSourcesRes.data,
      order_mediums: orderMediumsRes.data,
      payment_methods: paymentMethodsRes.data,
      phone_lines: phoneLinesRes.data,
      orders: ordersRes.data
    });
  } catch (error: any) {
    console.error('[API Master Data] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
