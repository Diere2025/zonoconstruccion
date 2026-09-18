export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const SPREADSHEET_COSTS_ID = '1q5m7T0pqlYBj9imWyTkJf5fus2eVyPtTLc74cp0Nul0';
const GID_BD_COSTO = '39870918';

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseSpanishNumber(val: unknown): number {
  if (!val) return 0;
  let clean = String(val).trim().replace(/[^0-9.,-]/g, '');
  if (!clean) return 0;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  if (hasComma && hasDot) {
    clean = clean.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma) {
    clean = clean.replace(/,/g, '.');
  } else if (hasDot) {
    clean = clean.replace(/\./g, '');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeKey(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function syncCostsFromSheet() {
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  addLog("Descargando pestaña BDCosto desde Google Sheets...");
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_COSTS_ID}/gviz/tq?tqx=out:csv&gid=${GID_BD_COSTO}`;
  const csvText = await fetchSpreadsheetCsv(url);
  const lines = csvText.split('\n');
  addLog(`Descargadas ${lines.length} líneas de la planilla.`);

  // 1. Parsear productos y Costo sin IVA (Columna E / índice 4)
  const sheetCostMap = new Map<string, { rawName: string; costSinIva: number; costConIva: number }>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const prodName = cols[0]?.trim();
    if (!prodName || prodName.toLowerCase() === 'producto' || prodName.toLowerCase().startsWith('producto')) continue;

    // Columna E (índice 4): Costo sin IVA
    // Columna F (índice 5): Costos + IVA
    const costSinIva = parseSpanishNumber(cols[4]);
    const costConIva = parseSpanishNumber(cols[5]);

    if (costSinIva > 0) {
      const normKey = normalizeKey(prodName);
      sheetCostMap.set(normKey, {
        rawName: prodName,
        costSinIva,
        costConIva
      });
    }
  }

  addLog(`Parseados ${sheetCostMap.size} artículos con Costo sin IVA válido > $0.`);

  // 2. Traer todos los productos de la base de datos
  let dbProducts: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, cost_price, price')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      dbProducts = [...dbProducts, ...data];
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  addLog(`Cargados ${dbProducts.length} productos de Supabase.`);

  // 3. Emparejar y actualizar cost_price en lotes
  let updatedCount = 0;
  const updatedSamples: any[] = [];
  const updatesQueue: { id: string; cost_price: number }[] = [];

  for (const prod of dbProducts) {
    const normName = normalizeKey(prod.name || '');
    const normSku = normalizeKey(prod.sku || '');

    // Match exacto por nombre o sku
    let match = sheetCostMap.get(normName) || sheetCostMap.get(normSku);

    // Si no hay match exacto, buscar coincidencia parcial
    if (!match && normName.length > 6) {
      for (const [sKey, sVal] of sheetCostMap.entries()) {
        if (sKey === normName || sKey.includes(normName) || normName.includes(sKey)) {
          match = sVal;
          break;
        }
      }
    }

    if (match && match.costSinIva > 0) {
      // Si el costo cambió o estaba en 0
      if (Number(prod.cost_price) !== match.costSinIva) {
        updatesQueue.push({
          id: prod.id,
          cost_price: match.costSinIva
        });
        updatedCount++;
        if (updatedSamples.length < 20 || prod.name?.toLowerCase().includes('cooper')) {
          updatedSamples.push({
            name: prod.name,
            sku: prod.sku,
            oldCost: prod.cost_price || 0,
            newCostSinIva: match.costSinIva
          });
        }
      }
    }
  }

  // Ejecutar actualizaciones en paralelo en bloques de 25
  const chunkSize = 25;
  for (let i = 0; i < updatesQueue.length; i += chunkSize) {
    const chunk = updatesQueue.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(u =>
        supabaseAdmin
          .from('products')
          .update({ cost_price: u.cost_price })
          .eq('id', u.id)
      )
    );
  }

  addLog(`Sincronización finalizada. Se actualizaron ${updatedCount} productos en Supabase con Costo sin IVA.`);

  return {
    success: true,
    sheetProductsCount: sheetCostMap.size,
    dbProductsCount: dbProducts.length,
    updatedCount,
    updatedSamples,
    logs
  };
}

export async function POST() {
  try {
    const result = await syncCostsFromSheet();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error en syncCostsFromSheet:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await syncCostsFromSheet();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Error en syncCostsFromSheet GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
