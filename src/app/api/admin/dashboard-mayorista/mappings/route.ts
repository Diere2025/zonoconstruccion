export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    // 1. Get active products in catalog
    const { data: catalogProducts, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, category')
      .eq('is_active', true)
      .order('name');

    if (prodErr) throw prodErr;

    // 2. Fetch existing mappings
    const { data: existingMappings, error: mapErr } = await supabaseAdmin
      .from('historical_product_mappings')
      .select('historical_name, current_product_id, products(id, name)');

    if (mapErr) throw mapErr;

    const mapByName = new Map();
    (existingMappings || []).forEach((m: any) => {
      mapByName.set(m.historical_name.trim().toLowerCase(), {
        current_product_id: m.current_product_id,
        current_product_name: m.products?.name || null
      });
    });

    // 3. Get distinct historical products from order_items
    // Use RPC or raw query via RPC helper
    const { data: histItems, error: histErr } = await supabaseAdmin.rpc('get_historical_products_for_mapping');

    let processedItems = [];
    if (histItems && !histErr) {
      processedItems = histItems.map((h: any) => {
        const mapping = mapByName.get(h.historical_name.trim().toLowerCase());
        return {
          historical_name: h.historical_name,
          total_qty: Number(h.total_qty || 0),
          total_revenue: Number(h.total_revenue || 0),
          occurrences: Number(h.occurrences || 0),
          current_product_id: mapping?.current_product_id || h.current_product_id || null,
          current_product_name: mapping?.current_product_name || h.current_product_name || null,
          is_mapped: Boolean(mapping?.current_product_id || h.current_product_id)
        };
      });
    }

    return NextResponse.json({
      success: true,
      historical_products: processedItems,
      catalog_products: catalogProducts || []
    });
  } catch (err: any) {
    console.error('Error in mappings GET:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { historical_name, current_product_id } = body;

    if (!historical_name || typeof historical_name !== 'string') {
      return NextResponse.json({ error: 'historical_name is required' }, { status: 400 });
    }

    const cleanName = historical_name.trim();

    const { data, error } = await supabaseAdmin.rpc('save_historical_product_mapping', {
      p_historical_name: cleanName,
      p_current_product_id: current_product_id || null
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      result: data
    });
  } catch (err: any) {
    console.error('Error in mappings POST:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
