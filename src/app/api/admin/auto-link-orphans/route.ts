import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST() {
  try {
    // 1. Fetch unlinked items
    const { data: unlinked, error: errUnlinked } = await supabaseAdmin
      .from('order_items')
      .select('id, product_name')
      .is('product_id', null);

    if (errUnlinked) throw errUnlinked;
    if (!unlinked || unlinked.length === 0) {
      return NextResponse.json({ success: true, linkedCount: 0, message: 'No hay ítems huérfanos pendientes.' });
    }

    // 2. Fetch all products (active first, then inactive)
    const { data: products, error: errProd } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, is_active');

    if (errProd) throw errProd;

    // Map by sku and name (lowercase trimmed)
    const skuMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    // Inactive first so active overrides
    products?.filter(p => !p.is_active).forEach(p => {
      if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p.id);
      if (p.name) nameMap.set(p.name.toLowerCase().trim(), p.id);
    });
    // Active overrides
    products?.filter(p => p.is_active).forEach(p => {
      if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p.id);
      if (p.name) nameMap.set(p.name.toLowerCase().trim(), p.id);
    });

    let linkedCount = 0;
    const updatesByProductId = new Map<string, string[]>();

    for (const item of unlinked) {
      const raw = (item.product_name || '').trim();
      if (!raw) continue;
      const clean = raw.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const rawLower = raw.toLowerCase();
      const cleanLower = clean.toLowerCase();

      const matchedId = skuMap.get(rawLower) || 
                        skuMap.get(cleanLower) || 
                        nameMap.get(rawLower) || 
                        nameMap.get(cleanLower);

      if (matchedId) {
        if (!updatesByProductId.has(matchedId)) {
          updatesByProductId.set(matchedId, []);
        }
        updatesByProductId.get(matchedId)!.push(item.id);
      }
    }

    for (const [prodId, ids] of updatesByProductId.entries()) {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error: updErr } = await supabaseAdmin
          .from('order_items')
          .update({ product_id: prodId })
          .in('id', chunk);

        if (!updErr) {
          linkedCount += chunk.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      linkedCount,
      message: `Se vincularon ${linkedCount} ítems históricos al catálogo automáticamente.`
    });
  } catch (error: any) {
    console.error('Error auto-linking orphans:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
