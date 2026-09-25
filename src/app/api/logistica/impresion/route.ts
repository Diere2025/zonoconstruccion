export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  LogisticsOrderMetadata,
  mergeLogisticsPrintOrders,
  parseLogisticsPrintRows
} from '@/lib/logisticsPrintOrders';
import { parseLogisticsRemittanceRows } from '@/lib/logisticsRemittances';
import { LOGISTICS_TRIP_MAX_COLUMNS } from '@/lib/logisticsPaste';
import { resolveWarehouseCategory, warehouseCategoryConfig, WAREHOUSE_CATEGORY_SETTING_ID } from '@/lib/warehouseCategoryConfig';

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
  const parsedOrders = parseLogisticsPrintRows(safeRows, firstRowNumber);
  const metadataPromise = metadataForRows(safeRows);
  const settingsPromise = supabaseAdmin.from('site_settings')
    .select('value').eq('id', WAREHOUSE_CATEGORY_SETTING_ID).maybeSingle();
  const [metadata, { data: savedCategories, error: categorySettingsError }] = await Promise.all([
    metadataPromise, settingsPromise
  ]);
  const orders = mergeLogisticsPrintOrders(parsedOrders, metadata);
  if (categorySettingsError) console.warn('[ImpresionLogistica] No se pudieron consultar categorías de depósito:', categorySettingsError.message);
  let printConfig = warehouseCategoryConfig(null);
  try {
    const stored = savedCategories?.value
      ? (typeof savedCategories.value === 'string' ? JSON.parse(savedCategories.value) : savedCategories.value)
      : null;
    printConfig = warehouseCategoryConfig(stored);
  } catch (error) {
    console.warn('[ImpresionLogistica] Configuración de categorías inválida:', error);
  }
  for (const order of orders) for (const item of order.items) {
    item.categoryOverride = true;
    item.category = resolveWarehouseCategory(item.name, printConfig);
  }
  const linkedOrderCodes = metadata.map(item => item.legacyCode).filter(Boolean);
  const remittances = parseLogisticsRemittanceRows(safeRows, firstRowNumber, linkedOrderCodes);
  return { source, rows: safeRows, orders, remittances, printCategories: printConfig.categories, fetchedAt: new Date().toISOString() };
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
