export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';
import {
  LogisticsOrderMetadata,
  mergeLogisticsPrintOrders,
  parseLogisticsPrintRows
} from '@/lib/logisticsPrintOrders';

const PRINT_SPREADSHEET_ID = '1t1fNJ4O-gSSxyvUTvDuswWihRyLue_Y0VpAaiG-2dXk';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    const values = await fetchSpreadsheetValues(PRINT_SPREADSHEET_ID, "'Imprimir'!A3:BZ42");
    const parsedRows = parseLogisticsPrintRows(values, 3);
    const codes = Array.from(new Set(parsedRows.flatMap(order => order.codes)))
      .filter(code => /^[A-Z0-9-]+$/.test(code));

    let metadata: LogisticsOrderMetadata[] = [];
    if (codes.length > 0) {
      const conditions = codes.map(code => `legacy_code.ilike.%${code}%`).join(',');
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('legacy_code, commercial_brand, channel')
        .or(conditions)
        .limit(250);

      if (error) {
        console.warn('[ComprobantesPlanilla] No se pudo enriquecer la marca desde ERP:', error.message);
      } else {
        metadata = (data || []).map(order => ({
          legacyCode: String(order.legacy_code || ''),
          commercialBrand: order.commercial_brand === 'aquafort' ? 'aquafort' : 'zono',
          channel: order.channel
        }));
      }
    }

    const orders = mergeLogisticsPrintOrders(parsedRows, metadata);
    return NextResponse.json({ orders, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[ComprobantesPlanilla] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer la planilla de comprobantes.' },
      { status: 500 }
    );
  }
}
