import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateBulkPrices } from '@/lib/erp/prices';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const listNumber = new URL(req.url).searchParams.get('listNumber') || '12';
  const { data: list, error: listError } = await db.from('wholesale_price_lists')
    .select('id,list_number,valid_text,global_discount_corralon_pct,global_discount_dist_pct')
    .eq('list_number', listNumber).maybeSingle();
  if (listError || !list) {
    return NextResponse.json({ success: false, error: 'La lista mayorista no está disponible en el ERP.' }, { status: 503 });
  }

  const { data: rows, error: itemsError } = await db.from('wholesale_price_list_items')
    .select('product_id,erp_product_id,product_name,category,family,liters,is_manufactured,price_list,price_corralon,price_distributor,is_commercialized')
    .eq('price_list_id', list.id)
    .eq('is_commercialized', true)
    .order('product_name');
  if (itemsError || !rows?.length || rows.some(row => !row.erp_product_id)) {
    return NextResponse.json({ success: false, error: 'La lista mayorista del ERP está incompleta.' }, { status: 503 });
  }

  // These complete kits and the coupling also belong in the B2B picker.
  // Only a published wholesale row can override their retail price.
  const { data: retailExtras, error: extrasError } = await db.from('products')
    .select('*')
    .eq('is_active', true)
    .or('name.ilike.%kit%instal%,name.ilike.%awaduct%cupla%110%');
  if (extrasError) {
    return NextResponse.json({ success: false, error: 'No se pudieron cargar los kits y accesorios.' }, { status: 503 });
  }
  const publishedIds = new Set(rows.map(row => row.erp_product_id));
  const extras = (retailExtras || []).filter(product => !publishedIds.has(product.id));
  const retailPrices = await calculateBulkPrices(db, extras, 'minorista');

  return NextResponse.json({
    success: true,
    isPersistedList: true,
    resolvedListNumber: list.list_number,
    savedDbConfig: {
      listNumber: list.list_number,
      listDate: list.valid_text,
      globalDiscountCorralonPct: Number(list.global_discount_corralon_pct || 0),
      globalDiscountDistributorPct: Number(list.global_discount_dist_pct || 0)
    },
    products: [...rows.map(row => ({
      id: row.erp_product_id,
      listItemId: row.product_id,
      name: row.product_name,
      category: row.category,
      family: row.family,
      liters: row.liters,
      isManufactured: row.is_manufactured,
      isCommercialized: row.is_commercialized,
      priceList: Number(row.price_list),
      priceCorralon: Number(row.price_corralon),
      priceDistributor: Number(row.price_distributor)
    })), ...extras.map(product => ({
      id: product.id,
      name: product.name,
      category: product.category,
      isCommercialized: true,
      catalogSource: 'minorista',
      priceList: Number(retailPrices[product.id]?.price ?? product.price),
      priceCorralon: Number(retailPrices[product.id]?.price ?? product.price),
      priceDistributor: Number(retailPrices[product.id]?.price ?? product.price)
    }))]
  });
}
