import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    products: rows.map(row => ({
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
    }))
  });
}
