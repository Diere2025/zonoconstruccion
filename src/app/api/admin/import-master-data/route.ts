export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`[Supabase Master Data] Attempt ${attempt}/${retries} failed: ${err.message || err}. Retrying in ${delayMs}ms...`);
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
}

export async function GET() {
  try {
    // Helper function to fetch all products with pagination
    async function fetchProductsAll() {
      let allProducts: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const data = await withRetry(async () => {
          const { data, error } = await supabaseAdmin
            .from('products')
            .select('id, name, sku, price')
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          return data;
        });

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

    // Helper function to fetch ALL orders (ALL statuses) with pagination to prevent duplicates
    async function fetchOrdersAll() {
      let allOrders: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const data = await withRetry(async () => {
          const { data, error } = await supabaseAdmin
            .from('orders')
            .select('id, legacy_code, status, delivery_detail, whaticket_link, order_medium_id')
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          return data;
        });

        if (data && data.length > 0) {
          allOrders = [...allOrders, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      return allOrders;
    }

    const [
      products,
      sellersData,
      localitiesData,
      advSourcesData,
      orderMediumsData,
      paymentMethodsData,
      phoneLinesData,
      ordersData
    ] = await Promise.all([
      fetchProductsAll(),
      withRetry(async () => {
        const res = await supabaseAdmin.from('sellers').select('id, full_name, is_organic');
        if (res.error) throw res.error;
        return res.data;
      }),
      withRetry(async () => {
        const res = await supabaseAdmin.from('localities').select('id, name, zone_id');
        if (res.error) throw res.error;
        return res.data;
      }),
      withRetry(async () => {
        const res = await supabaseAdmin.from('advertising_sources').select('id, name');
        if (res.error) throw res.error;
        return res.data;
      }),
      withRetry(async () => {
        const res = await supabaseAdmin.from('order_mediums').select('id, name');
        if (res.error) throw res.error;
        return res.data;
      }),
      withRetry(async () => {
        const res = await supabaseAdmin.from('payment_methods').select('id, name, surcharge_percentage, installments');
        if (res.error) throw res.error;
        return res.data;
      }),
      withRetry(async () => {
        const res = await supabaseAdmin.from('phone_lines').select('id, phone_number');
        if (res.error) throw res.error;
        return res.data;
      }),
      fetchOrdersAll()
    ]);

    return NextResponse.json({
      products,
      sellers: sellersData,
      localities: localitiesData,
      advertising_sources: advSourcesData,
      order_mediums: orderMediumsData,
      payment_methods: paymentMethodsData,
      phone_lines: phoneLinesData,
      orders: ordersData
    });
  } catch (error: any) {
    console.error('[API Master Data] Error:', error);
    let errMsg = error?.message || String(error);
    if (errMsg.includes('<!DOCTYPE') || errMsg.includes('<html') || errMsg.includes('Cloudflare')) {
      errMsg = 'Error de conexión con la base de datos Supabase (Cloudflare/Timeout). Intenta nuevamente en unos instantes.';
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
