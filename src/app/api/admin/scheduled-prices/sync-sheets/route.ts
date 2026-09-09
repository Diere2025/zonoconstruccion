export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncScheduledPricesFromSheet } from '@/lib/erp/scheduledPrices';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// POST /api/admin/scheduled-prices/sync-sheets
export async function POST() {
  try {
    const result = await syncScheduledPricesFromSheet(supabaseAdmin);
    return NextResponse.json({
      success: true,
      ...result,
      message: `Sincronización completada. ${result.newScheduledCreated} nuevos precios programados creados para fechas futuras. ${result.appliedCount} precios vencidos aplicados.`
    });
  } catch (error: any) {
    console.error('Error syncing scheduled prices from sheet:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al sincronizar con Google Sheets' },
      { status: 500 }
    );
  }
}
