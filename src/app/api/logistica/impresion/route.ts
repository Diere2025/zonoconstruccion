export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';
import {
  LogisticsOrderMetadata,
  mergeLogisticsPrintOrders,
  parseLogisticsPrintRows
} from '@/lib/logisticsPrintOrders';
import { parseLogisticsRemittanceRows } from '@/lib/logisticsRemittances';
import { LOGISTICS_TRIP_MAX_COLUMNS } from '@/lib/logisticsPaste';

const RECEIPTS_SPREADSHEET_ID = '1t1fNJ4O-gSSxyvUTvDuswWihRyLue_Y0VpAaiG-2dXk';
const REMITTANCES_SPREADSHEET_ID = '1AogvMaQJH1JFlikdWfdGYPkgvnXfe-DecYbkHmxGR-s';
const MAX_ROWS = 200;
const MAX_COLUMNS = LOGISTICS_TRIP_MAX_COLUMNS;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function metadataForRows(rows: string[][]): Promise<LogisticsOrderMetadata[]> {
  const parsed = parseLogisticsPrintRows(rows, 1);
  const codes = Array.from(new Set(parsed.flatMap(order => order.codes)))
    .filter(code => /^[A-Z0-9-]+$/.test(code));
  if (codes.length === 0) return [];

  const conditions = codes.map(code => `legacy_code.ilike.%${code}%`).join(',');
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('legacy_code, commercial_brand, channel')
    .or(conditions)
    .limit(250);

  if (error) {
    console.warn('[ImpresionLogistica] No se pudo enriquecer desde ERP:', error.message);
    return [];
  }

  return (data || []).map(order => ({
    legacyCode: String(order.legacy_code || ''),
    commercialBrand: order.commercial_brand === 'aquafort' || order.commercial_brand === 'zono'
      ? order.commercial_brand
      : null,
    channel: order.channel
  }));
}

async function buildPayload(rows: string[][], firstRowNumber: number, source: string) {
  const safeRows = rows.slice(0, MAX_ROWS).map(row => row.slice(0, MAX_COLUMNS));
  const metadata = await metadataForRows(safeRows);
  const parsedOrders = parseLogisticsPrintRows(safeRows, firstRowNumber);
  const orders = mergeLogisticsPrintOrders(parsedOrders, metadata);
  const linkedOrderCodes = metadata.map(item => item.legacyCode).filter(Boolean);
  const remittances = parseLogisticsRemittanceRows(safeRows, firstRowNumber, linkedOrderCodes);
  return { source, rows: safeRows, orders, remittances, fetchedAt: new Date().toISOString() };
}

export async function GET(request: NextRequest) {
  try {
    const source = request.nextUrl.searchParams.get('source') === 'remitos' ? 'remitos' : 'comprobantes';
    const isRemittances = source === 'remitos';
    const values = await fetchSpreadsheetValues(
      isRemittances ? REMITTANCES_SPREADSHEET_ID : RECEIPTS_SPREADSHEET_ID,
      isRemittances ? "'Imprimir'!A1:CF40" : "'Imprimir'!A3:CF42"
    );
    return NextResponse.json(await buildPayload(values, isRemittances ? 1 : 3, source));
  } catch (error) {
    console.error('[ImpresionLogistica] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer la planilla.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { rows?: unknown };
    if (!Array.isArray(payload.rows)) {
      return NextResponse.json({ error: 'El contenido pegado no tiene filas válidas.' }, { status: 400 });
    }
    const rows = payload.rows
      .filter(Array.isArray)
      .map(row => row.map(cell => String(cell ?? '')) as string[][][number]);
    return NextResponse.json(await buildPayload(rows, 1, 'pegado'));
  } catch (error) {
    console.error('[ImpresionLogistica] Error al procesar pegado:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo procesar el contenido pegado.' },
      { status: 500 }
    );
  }
}
