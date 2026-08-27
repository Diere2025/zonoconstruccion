export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getArgentinaDaysAgoString } from '@/lib/utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

// Initialize Supabase admin client to bypass RLS for sync operations
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const STOCK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1vrI3WFH6W35sj9JJ4sa3yr7XlJDaKP920R6t54jLW6o/export?format=csv&gid=447948741';

const normalizeText = (text: string): string => {
  return (text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, ""); // remove spaces, quotes, and symbols for robust matching
};

async function fetchProductsAll() {
  let allProducts: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allProducts = [...allProducts, ...data];
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }
  return allProducts;
}

async function fetchPendingOrderItems(dateLimitStr: string) {
  let allItems: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('order_items')
      .select('product_id, product_name, quantity, orders!inner(id, legacy_code, status, order_date)')
      .in('orders.status', ['Pendiente', 'Confirmado'])
      .gte('orders.order_date', dateLimitStr)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allItems = [...allItems, ...data];
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }
  return allItems;
}

function parseCSV(text: string): any[] {
  const lines = text.split('\n');
  const results: any[] = [];
  if (lines.length === 0) return results;
  
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    
    const obj: any = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ? cells[idx].replace(/^"|"$/g, '').trim() : '';
    });
    results.push(obj);
  }
  return results;
}

// GET: Download spreadsheet, fetch database calculated reserves, and return comparison preview
export async function GET() {
  try {
    // 1. Fetch CSV from Google Sheets
    const csvRes = await fetch(STOCK_SHEET_URL, { cache: 'no-store' });
    if (!csvRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la planilla de stock de Google Sheets.' }, { status: 500 });
    }
    const csvText = await csvRes.text();
    const sheetRows = parseCSV(csvText);

    // 30-day window (matching spreadsheet operational cutoff)
    const dateLimitStr = getArgentinaDaysAgoString(30);

    // 2. Fetch products and active orders from database within 30-day window
    const [dbProducts, rawPendingItems] = await Promise.all([
      fetchProductsAll(),
      fetchPendingOrderItems(dateLimitStr)
    ]);

    // Deduplicate pending items by order legacy_code + product_id to prevent double counting
    const seenOrderKeys = new Set<string>();
    const pendingItems = rawPendingItems.filter((item: any) => {
      const code = (item.orders?.legacy_code || '').trim();
      if (code) {
        const pKey = item.product_id || item.product_name;
        const key = `${code}_${pKey}`;
        if (seenOrderKeys.has(key)) return false;
        seenOrderKeys.add(key);
      }
      return true;
    });

    const productByIdMap = new Map<string, any>();
    dbProducts.forEach((p: any) => productByIdMap.set(p.id, p));

    // Calculate DB reserves (by product_id AND by normalized name for consolidation)
    const dbCalculatedReservesMap = new Map<string, number>();
    pendingItems.forEach((item: any) => {
      const qty = parseFloat(item.quantity || 0);
      let targetId = item.product_id;
      const prod = productByIdMap.get(item.product_id);
      if (prod && prod.is_generic && prod.mapped_real_product_id) {
        targetId = prod.mapped_real_product_id;
      }
      if (targetId) {
        dbCalculatedReservesMap.set(targetId, (dbCalculatedReservesMap.get(targetId) || 0) + qty);
      }

      const realProd = (targetId ? productByIdMap.get(targetId) : null) || prod;
      const normName = normalizeText(realProd ? realProd.name : (item.product_name || ''));
      const normCleanName = normName.replace(/^interno\s*/i, "").trim();
      const normSku = normalizeText(realProd ? (realProd.sku || '') : '');
      const normCleanSku = normSku.replace(/^interno\s*/i, "").trim();

      if (normName) dbCalculatedReservesMap.set(`norm_${normName}`, (dbCalculatedReservesMap.get(`norm_${normName}`) || 0) + qty);
      if (normCleanName && normCleanName !== normName) dbCalculatedReservesMap.set(`norm_${normCleanName}`, (dbCalculatedReservesMap.get(`norm_${normCleanName}`) || 0) + qty);
      if (normSku) dbCalculatedReservesMap.set(`norm_${normSku}`, (dbCalculatedReservesMap.get(`norm_${normSku}`) || 0) + qty);
      if (normCleanSku && normCleanSku !== normSku) dbCalculatedReservesMap.set(`norm_${normCleanSku}`, (dbCalculatedReservesMap.get(`norm_${normCleanSku}`) || 0) + qty);
    });

    const comparisonList: any[] = [];
    const unmatchedSheetProducts: any[] = [];
    const matchedProductIds = new Set<string>();

    sheetRows.forEach((row: any) => {
      const prodName = row['Producto'] || '';
      if (!prodName || prodName === 'Brida') return;

      const cleanProdName = prodName.replace(/^\[interno\]\s*/i, "").trim();
      const normProdName = normalizeText(prodName);
      const normCleanProdName = normalizeText(cleanProdName);

      // Find match in DB (prefer active and non-AUTO SKU)
      const matchingProds = dbProducts.filter((p: any) => {
        const normName = normalizeText(p.name);
        const normSku = normalizeText(p.sku || '');
        return (
          normName === normProdName ||
          normSku === normProdName ||
          (normCleanProdName && (normName === normCleanProdName || normSku === normCleanProdName))
        );
      });

      matchingProds.sort((a: any, b: any) => {
        if (a.is_active && !b.is_active) return -1;
        if (!a.is_active && b.is_active) return 1;
        const aIsAuto = (a.sku || '').startsWith('AUTO-');
        const bIsAuto = (b.sku || '').startsWith('AUTO-');
        if (aIsAuto && !bIsAuto) return 1;
        if (!aIsAuto && bIsAuto) return -1;
        return 0;
      });

      const dbProd = matchingProds[0];

      if (dbProd) {
        matchedProductIds.add(dbProd.id);
        const sheetPhysical = parseFloat((row['Stock Actual'] || '0').replace(',', '.')) || 0;
        const sheetReserved = parseFloat((row['Reservado'] || '0').replace(',', '.')) || 0;
        const sheetAvailable = parseFloat((row['Stock Disponible'] || '0').replace(',', '.')) || 0;

        const dbPhysical = parseFloat(dbProd.stock_physical || '0') || 0;
        const dbReserved = parseFloat(dbProd.stock_reserved || '0') || 0;
        const dbCalculatedReserved = 
          dbCalculatedReservesMap.get(dbProd.id) ||
          dbCalculatedReservesMap.get(`norm_${normCleanProdName}`) ||
          dbCalculatedReservesMap.get(`norm_${normProdName}`) ||
          dbCalculatedReservesMap.get(`norm_${normalizeText(dbProd.name)}`) ||
          dbCalculatedReservesMap.get(`norm_${normalizeText(dbProd.sku || '')}`) ||
          0;
        const dbAvailable = parseFloat(dbProd.stock_current || '0') || 0;

        comparisonList.push({
          productId: dbProd.id,
          name: dbProd.name,
          sku: dbProd.sku,
          sheetPhysical,
          dbPhysical,
          sheetReserved,
          dbReserved,
          dbCalculatedReserved,
          sheetAvailable,
          dbAvailable
        });
      } else {
        unmatchedSheetProducts.push({
          name: prodName,
          sheetPhysical: parseFloat((row['Stock Actual'] || '0').replace(',', '.')) || 0,
          sheetReserved: parseFloat((row['Reservado'] || '0').replace(',', '.')) || 0
        });
      }
    });

    // Check database products only
    const onlyInDb: any[] = [];
    dbProducts.forEach((p: any) => {
      if (!matchedProductIds.has(p.id)) {
        onlyInDb.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          dbPhysical: parseFloat(p.stock_physical || '0') || 0,
          dbReserved: parseFloat(p.stock_reserved || '0') || 0,
          dbCalculatedReserved: dbCalculatedReservesMap.get(p.id) || 0,
          dbAvailable: parseFloat(p.stock_current || '0') || 0
        });
      }
    });

    return NextResponse.json({
      comparisonList,
      unmatchedSheetProducts,
      onlyInDb
    });

  } catch (err: any) {
    console.error("Error in sync-stock GET:", err);
    return NextResponse.json({ error: err.message || 'Error interno al procesar comparación.' }, { status: 500 });
  }
}

// POST: Execute the actual synchronization updates
export async function POST() {
  try {
    // 1. Fetch CSV from Google Sheets
    const csvRes = await fetch(STOCK_SHEET_URL, { cache: 'no-store' });
    if (!csvRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la planilla de stock de Google Sheets.' }, { status: 500 });
    }
    const csvText = await csvRes.text();
    const sheetRows = parseCSV(csvText);

    // 30-day window (matching spreadsheet operational cutoff)
    const dateLimitStr = getArgentinaDaysAgoString(30);

    // 2. Fetch products and active orders from database within 30-day window
    const [dbProducts, rawPostPendingItems] = await Promise.all([
      fetchProductsAll(),
      fetchPendingOrderItems(dateLimitStr)
    ]);

    // Deduplicate pending items by order legacy_code + product_id to prevent double counting
    const seenPostOrderKeys = new Set<string>();
    const pendingItems = rawPostPendingItems.filter((item: any) => {
      const code = (item.orders?.legacy_code || '').trim();
      if (code) {
        const pKey = item.product_id || item.product_name;
        const key = `${code}_${pKey}`;
        if (seenPostOrderKeys.has(key)) return false;
        seenPostOrderKeys.add(key);
      }
      return true;
    });

    const productByIdMap = new Map<string, any>();
    dbProducts.forEach((p: any) => productByIdMap.set(p.id, p));

    // Calculate DB reserves (by product_id AND by normalized name for consolidation)
    const dbCalculatedReservesMap = new Map<string, number>();
    pendingItems.forEach((item: any) => {
      const qty = parseFloat(item.quantity || 0);
      let targetId = item.product_id;
      const prod = productByIdMap.get(item.product_id);
      if (prod && prod.is_generic && prod.mapped_real_product_id) {
        targetId = prod.mapped_real_product_id;
      }
      if (targetId) {
        dbCalculatedReservesMap.set(targetId, (dbCalculatedReservesMap.get(targetId) || 0) + qty);
      }

      const realProd = (targetId ? productByIdMap.get(targetId) : null) || prod;
      const normName = normalizeText(realProd ? realProd.name : (item.product_name || ''));
      const normCleanName = normName.replace(/^interno\s*/i, "").trim();
      const normSku = normalizeText(realProd ? (realProd.sku || '') : '');
      const normCleanSku = normSku.replace(/^interno\s*/i, "").trim();

      if (normName) dbCalculatedReservesMap.set(`norm_${normName}`, (dbCalculatedReservesMap.get(`norm_${normName}`) || 0) + qty);
      if (normCleanName && normCleanName !== normName) dbCalculatedReservesMap.set(`norm_${normCleanName}`, (dbCalculatedReservesMap.get(`norm_${normCleanName}`) || 0) + qty);
      if (normSku) dbCalculatedReservesMap.set(`norm_${normSku}`, (dbCalculatedReservesMap.get(`norm_${normSku}`) || 0) + qty);
      if (normCleanSku && normCleanSku !== normSku) dbCalculatedReservesMap.set(`norm_${normCleanSku}`, (dbCalculatedReservesMap.get(`norm_${normCleanSku}`) || 0) + qty);
    });

    let updatedCount = 0;
    const sheetProductNames = new Set<string>();
    const updatesToUpsertMap = new Map<string, any>();

    // Update matched products
    for (const row of sheetRows) {
      const prodName = row['Producto'] || '';
      if (!prodName || prodName === 'Brida') continue;

      const cleanProdName = prodName.replace(/^\[interno\]\s*/i, "").trim();
      const normProdName = normalizeText(prodName);
      const normCleanProdName = normalizeText(cleanProdName);
      sheetProductNames.add(normProdName);
      if (normCleanProdName) sheetProductNames.add(normCleanProdName);

      // Find match in DB (prefer active and non-AUTO SKU)
      const matchingProds = dbProducts.filter((p: any) => {
        const normName = normalizeText(p.name);
        const normSku = normalizeText(p.sku || '');
        return (
          normName === normProdName ||
          normSku === normProdName ||
          (normCleanProdName && (normName === normCleanProdName || normSku === normCleanProdName))
        );
      });

      matchingProds.sort((a: any, b: any) => {
        if (a.is_active && !b.is_active) return -1;
        if (!a.is_active && b.is_active) return 1;
        const aIsAuto = (a.sku || '').startsWith('AUTO-');
        const bIsAuto = (b.sku || '').startsWith('AUTO-');
        if (aIsAuto && !bIsAuto) return 1;
        if (!aIsAuto && bIsAuto) return -1;
        return 0;
      });

      const dbProd = matchingProds[0];

      if (dbProd) {
        const sheetPhysical = parseFloat((row['Stock Actual'] || '0').replace(',', '.')) || 0;
        const sheetReserved = parseFloat((row['Reservado'] || '0').replace(',', '.')) || 0;
        const dbCalculatedReserved = 
          dbCalculatedReservesMap.get(dbProd.id) ||
          dbCalculatedReservesMap.get(`norm_${normCleanProdName}`) ||
          dbCalculatedReservesMap.get(`norm_${normProdName}`) ||
          dbCalculatedReservesMap.get(`norm_${normalizeText(dbProd.name)}`) ||
          dbCalculatedReservesMap.get(`norm_${normalizeText(dbProd.sku || '')}`) ||
          0;
        const effectiveReserved = Math.max(sheetReserved, dbCalculatedReserved);
        const newAvailable = sheetPhysical - effectiveReserved;

        updatesToUpsertMap.set(dbProd.id, {
          ...dbProd,
          stock_physical: sheetPhysical,
          stock_reserved: effectiveReserved,
          stock_current: newAvailable
        });
      }
    }

    // Reset stock_reserved and stock_current for products not in the sheet but in the DB
    // to match database order items (preventing reservations drift)
    for (const p of dbProducts) {
      const normName = normalizeText(p.name);
      const cleanName = normalizeText(p.name.replace(/^\[interno\]\s*/i, "").trim());
      const isAlreadyInUpdate = updatesToUpsertMap.has(p.id);

      if (!isAlreadyInUpdate && !sheetProductNames.has(normName) && (!cleanName || !sheetProductNames.has(cleanName))) {
        const dbCalculatedReserved = dbCalculatedReservesMap.get(p.id) || 0;
        const physical = parseFloat(p.stock_physical || '0') || 0;
        const newAvailable = physical - dbCalculatedReserved;

        updatesToUpsertMap.set(p.id, {
          ...p,
          stock_reserved: dbCalculatedReserved,
          stock_current: newAvailable
        });
      }
    }

    const updatesToUpsert = Array.from(updatesToUpsertMap.values());

    // Batch upsert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < updatesToUpsert.length; i += chunkSize) {
      const chunk = updatesToUpsert.slice(i, i + chunkSize);
      const { error: upsertErr } = await supabaseAdmin
        .from('products')
        .upsert(chunk);

      if (upsertErr) {
        console.error("Error upserting synced products chunk:", upsertErr);
        throw upsertErr;
      }
      updatedCount += chunk.length;
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      totalMatched: updatesToUpsert.length
    });

  } catch (err: any) {
    console.error("Error in sync-stock POST:", err);
    return NextResponse.json({ error: err.message || 'Error interno al sincronizar el stock.' }, { status: 500 });
  }
}
