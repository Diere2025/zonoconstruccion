export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';
import { parseLogisticsRemittanceRows } from '@/lib/logisticsRemittances';

const REMITTANCES_SPREADSHEET_ID = '1AogvMaQJH1JFlikdWfdGYPkgvnXfe-DecYbkHmxGR-s';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    const values = await fetchSpreadsheetValues(REMITTANCES_SPREADSHEET_ID, "'Imprimir'!A1:BZ40");
    const sheetCodes = Array.from(new Set(values
      .flatMap(row => String(row[1] || '').split(/[/,]/))
      .map(code => code.trim().toUpperCase())
      .filter(code => /^[A-Z0-9-]+$/.test(code))));
    let linkedOrderCodes: string[] = [];

    if (sheetCodes.length > 0) {
      const conditions = sheetCodes.map(code => `legacy_code.ilike.%${code}%`).join(',');
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('legacy_code')
        .or(conditions)
        .limit(250);

      if (error) {
        console.warn('[RemitosPlanilla] No se pudieron consultar pedidos vinculados:', error.message);
      } else {
        linkedOrderCodes = (data || []).map(order => String(order.legacy_code || '')).filter(Boolean);
      }
    }

    const remittances = parseLogisticsRemittanceRows(values, 1, linkedOrderCodes);
    return NextResponse.json({ remittances, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[RemitosPlanilla] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer la planilla de remitos.' },
      { status: 500 }
    );
  }
}
