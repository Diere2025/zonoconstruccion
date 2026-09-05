export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      listNumber = "13",
      listDate = "Septiembre 2026",
      globalFreightPct = 10.0,
      globalMarginDistributorPct = 10.0,
      globalDiscountCorralonPct = 8.0,
      globalDiscountDistributorPct = 14.0,
      categoryConfigs = {},
      productStates = {},
      items = []
    } = body;

    const payloadToStore = {
      listNumber,
      listDate,
      globalFreightPct,
      globalMarginDistributorPct,
      globalDiscountCorralonPct,
      globalDiscountDistributorPct,
      categoryConfigs,
      productStates,
      itemsCount: items.length,
      commercializedCount: items.filter((i: any) => i.isCommercialized).length,
      confirmedCount: items.filter((i: any) => i.isConfirmed).length,
      items,
      savedAt: new Date().toISOString()
    };

    // 1. Guardar en site_settings para respaldo y lectura ultrarrápida
    const { error: settingsError } = await supabaseAdmin
      .from('site_settings')
      .upsert({
        id: `wholesale_price_list_${listNumber}`,
        value: JSON.stringify(payloadToStore)
      });

    if (settingsError) {
      console.warn('[save-lista-mayorista] Warning site_settings upsert:', settingsError);
    }

    // 2. Guardar también como lista activa principal
    await supabaseAdmin
      .from('site_settings')
      .upsert({
        id: 'active_wholesale_price_list',
        value: JSON.stringify(payloadToStore)
      });

    // 3. Intentar guardar en la tabla relacional wholesale_price_lists si existe
    try {
      const { data: listData, error: listError } = await supabaseAdmin
        .from('wholesale_price_lists')
        .upsert({
          list_number: listNumber.toString(),
          name: `Lista ${listNumber} Mayorista`,
          valid_text: listDate,
          is_active: true,
          global_freight_pct: globalFreightPct,
          global_margin_dist_pct: globalMarginDistributorPct,
          global_discount_corralon_pct: globalDiscountCorralonPct,
          global_discount_dist_pct: globalDiscountDistributorPct,
          category_configs: categoryConfigs,
          metadata: {
            itemsCount: items.length,
            savedAt: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'list_number' })
        .select('id')
        .maybeSingle();

      if (!listError && listData?.id && items.length > 0) {
        // Upsert items
        const rowsToInsert = items.map((p: any) => ({
          price_list_id: listData.id,
          product_id: p.id,
          product_name: p.name,
          category: p.category,
          family: p.family || '',
          liters: p.liters || '',
          is_manufactured: !!p.isManufactured,
          cost_base_real: p.costBaseReal || 0,
          price_list: p.priceList || 0,
          price_corralon: p.priceCorralon || 0,
          price_distributor: p.priceDistributor || 0,
          is_commercialized: p.isCommercialized !== false,
          is_confirmed: !!p.isConfirmed,
          override_mode: p.mode || 'auto',
          custom_fixed_list_price: p.customFixedListPrice || null,
          custom_margin_dist_pct: p.customMarginDistPct || null,
          updated_at: new Date().toISOString()
        }));

        await supabaseAdmin
          .from('wholesale_price_list_items')
          .upsert(rowsToInsert, { onConflict: 'price_list_id,product_id' });
      }
    } catch (tblErr) {
      console.warn('[save-lista-mayorista] wholesale_price_lists table sync skipped (using site_settings):', tblErr);
    }

    return NextResponse.json({
      success: true,
      message: `Lista ${listNumber} guardada y publicada en la Base de Datos con éxito`,
      savedAt: payloadToStore.savedAt,
      listNumber,
      itemsCount: items.length
    });

  } catch (error: any) {
    console.error('[API save-lista-mayorista] Error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Error al guardar la lista mayorista en la base de datos'
    }, { status: 500 });
  }
}
