import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateBulkPrices } from '@/lib/erp/prices';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
async function fetchAllProducts() {
  let allProducts: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
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



export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const [
      sellerRes,
      productsRes,
      clientsRes,
      localitiesRes,
      dtRes,
      kitsRes,
      advRes,
      mediumRes,
      phoneLinesRes,
      payMethodsRes,
      recentOrdersRes
    ] = await Promise.all([
      supabaseAdmin
        .from('sellers')
        .select('role, seller_type, is_organic')
        .eq('id', userId)
        .single(),
      fetchAllProducts(),
      supabaseAdmin
        .from("v_client_balances_and_stats")
        .select("id, business_name, tax_id, phone_primary, phone_secondary, billing_address, is_wholesale")
        .order("orders_count", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("localities")
        .select("id, name, zone_id, zones(name, delivery_schedule, delivery_time_id, delivery_times(name, description, delivery_days))")
        .eq("is_active", true)
        .order("name"),
      supabaseAdmin
        .from("delivery_times")
        .select("id, name, description, category, delivery_days")
        .eq("is_active", true)
        .order("name"),
      supabaseAdmin
        .from("kits")
        .select("*, kit_items(*)"),
      supabaseAdmin
        .from('advertising_sources')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('order_mediums')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('phone_lines')
        .select('*, seller_phone_lines(seller_id)')
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('orders')
        .select('advertising_source_id, order_medium_id, received_phone_line_id')
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    if (sellerRes.error) throw sellerRes.error;

    if (clientsRes.error) throw clientsRes.error;
    if (localitiesRes.error) throw localitiesRes.error;
    if (dtRes.error) throw dtRes.error;
    if (kitsRes.error) throw kitsRes.error;
    if (advRes.error) throw advRes.error;
    if (mediumRes.error) throw mediumRes.error;
    if (phoneLinesRes.error) throw phoneLinesRes.error;
    if (payMethodsRes.error) throw payMethodsRes.error;
    if (recentOrdersRes.error) throw recentOrdersRes.error;

    const seller = sellerRes.data;
    const sellerType = seller?.seller_type || 'minorista';
    const isOrganic = seller?.is_organic || false;
    const role = seller?.role === 'admin' ? 'admin' : 'seller';

    // Calculate bulk dynamic prices on the server
    const rawProducts = productsRes || [];
    let calculatedPrices: any = {};
    try {
      calculatedPrices = await calculateBulkPrices(supabaseAdmin, rawProducts, sellerType);
    } catch (e) {
      console.warn("Could not calculate dynamic prices server-side. Falling back to fixed prices.", e);
    }

    let productsWithPrices = rawProducts.map(p => ({
      ...p,
      price: calculatedPrices[p?.id] ? calculatedPrices[p.id].price : p.price,
      stock_current: p.stock_current !== undefined ? p.stock_current : 999
    }));

    // Price inheritance for variants
    productsWithPrices = productsWithPrices.map(p => {
      if (p.parent_id) {
        const parentProduct = productsWithPrices.find(parent => parent.id === p.parent_id);
        if (parentProduct) {
          return {
            ...p,
            price: parentProduct.price
          };
        }
      }
      return p;
    });

    // Localities mapping
    const mappedLocalities = (localitiesRes.data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      zone_id: item.zone_id,
      zones: Array.isArray(item.zones) ? item.zones[0] : item.zones
    }));

    // Kits mapping
    const rawKits = kitsRes.data || [];
    const mappedKits = rawKits.map((k: any) => {
      const items = (k.kit_items || []).map((ki: any) => {
        const prod = productsWithPrices.find((p: any) => p.id === ki.product_id);
        if (!prod) return null;
        return {
          ...prod,
          quantity: ki.quantity,
          customPrice: ki.custom_price !== null ? ki.custom_price : prod.price
        };
      }).filter(Boolean);

      return {
        id: k.id,
        name: k.name,
        detailText: k.detail_text || "",
        category: k.category || "",
        isGlobal: k.is_global,
        sellerId: k.seller_id,
        items
      };
    });

    return NextResponse.json({
      sellerType,
      isOrganic,
      role,
      products: productsWithPrices,
      clients: clientsRes.data || [],
      localities: mappedLocalities,
      deliveryTimes: dtRes.data || [],
      kits: mappedKits,
      advertisingSources: advRes.data || [],
      orderMediums: mediumRes.data || [],
      phoneLines: phoneLinesRes.data || [],
      paymentMethods: payMethodsRes.data || [],
      recentOrders: recentOrdersRes.data || []
    });

  } catch (error: any) {
    console.error('[API Pedidos Init] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
