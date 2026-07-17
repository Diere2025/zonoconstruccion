import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateLimitStr = thirtyDaysAgo.toISOString().split('T')[0];

    // 2. Fetch products and active orders from database
    const [productsRes, pendingRes] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('id, name, sku, stock_physical, stock_reserved, stock_current')
        .order('name'),
      supabaseAdmin
        .from('order_items')
        .select('product_id, quantity, orders!inner(status, order_date)')
        .in('orders.status', ['Pendiente', 'Confirmado'])
        .gt('orders.order_date', dateLimitStr)
    ]);

    if (productsRes.error) throw productsRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const dbProducts = productsRes.data || [];
    const pendingItems = pendingRes.data || [];

    // Calculate DB reserves (sum of quantities of pending order items)
    const dbCalculatedReservesMap = new Map<string, number>();
    pendingItems.forEach((item: any) => {
      const current = dbCalculatedReservesMap.get(item.product_id) || 0;
      dbCalculatedReservesMap.set(item.product_id, current + parseFloat(item.quantity || 0));
    });

    const comparisonList: any[] = [];
    const unmatchedSheetProducts: any[] = [];
    const matchedProductIds = new Set<string>();

    sheetRows.forEach((row: any) => {
      const prodName = row['Producto'] || '';
      if (!prodName || prodName === 'Brida') return;

      const normProdName = normalizeText(prodName);

      // Find match in DB
      const dbProd = dbProducts.find((p: any) => 
        normalizeText(p.name) === normProdName || 
        normalizeText(p.sku) === normProdName
      );

      if (dbProd) {
        matchedProductIds.add(dbProd.id);
        const sheetPhysical = parseFloat((row['Stock Actual'] || '0').replace(',', '.')) || 0;
        const sheetReserved = parseFloat((row['Reservado'] || '0').replace(',', '.')) || 0;
        const sheetAvailable = parseFloat((row['Stock Disponible'] || '0').replace(',', '.')) || 0;

        const dbPhysical = parseFloat(dbProd.stock_physical || '0') || 0;
        const dbReserved = parseFloat(dbProd.stock_reserved || '0') || 0;
        const dbCalculatedReserved = dbCalculatedReservesMap.get(dbProd.id) || 0;
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateLimitStr = thirtyDaysAgo.toISOString().split('T')[0];

    // 2. Fetch products and active orders from database
    const [productsRes, pendingRes] = await Promise.all([
      supabaseAdmin.from('products').select('id, name, sku, stock_physical, stock_reserved, stock_current'),
      supabaseAdmin.from('order_items').select('product_id, quantity, orders!inner(status, order_date)').in('orders.status', ['Pendiente', 'Confirmado']).gt('orders.order_date', dateLimitStr)
    ]);

    if (productsRes.error) throw productsRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const dbProducts = productsRes.data || [];
    const pendingItems = pendingRes.data || [];

    // Calculate DB reserves (sum of quantities of pending order items)
    const dbCalculatedReservesMap = new Map<string, number>();
    pendingItems.forEach((item: any) => {
      const current = dbCalculatedReservesMap.get(item.product_id) || 0;
      dbCalculatedReservesMap.set(item.product_id, current + parseFloat(item.quantity || 0));
    });

    let updatedCount = 0;
    const sheetProductNames = new Set<string>();
    const updatesToUpsert: any[] = [];

    // Update matched products
    for (const row of sheetRows) {
      const prodName = row['Producto'] || '';
      if (!prodName || prodName === 'Brida') continue;

      const normProdName = normalizeText(prodName);
      sheetProductNames.add(normProdName);

      const dbProd = dbProducts.find((p: any) => 
        normalizeText(p.name) === normProdName || 
        normalizeText(p.sku) === normProdName
      );

      if (dbProd) {
        const sheetPhysical = parseFloat((row['Stock Actual'] || '0').replace(',', '.')) || 0;
        const dbCalculatedReserved = dbCalculatedReservesMap.get(dbProd.id) || 0;
        const newAvailable = sheetPhysical - dbCalculatedReserved;

        updatesToUpsert.push({
          id: dbProd.id,
          stock_physical: sheetPhysical,
          stock_reserved: dbCalculatedReserved,
          stock_current: newAvailable
        });
      }
    }

    // Reset stock_reserved and stock_current for products not in the sheet but in the DB
    // to match database order items (preventing reservations drift)
    for (const p of dbProducts) {
      const normName = normalizeText(p.name);
      const normSku = normalizeText(p.sku);
      
      if (!sheetProductNames.has(normName) && !sheetProductNames.has(normSku)) {
        const dbCalculatedReserved = dbCalculatedReservesMap.get(p.id) || 0;
        const dbPhysical = parseFloat(p.stock_physical || '0') || 0;
        const newAvailable = dbPhysical - dbCalculatedReserved;

        const currentReserved = parseFloat(p.stock_reserved || '0') || 0;
        if (currentReserved !== dbCalculatedReserved) {
          updatesToUpsert.push({
            id: p.id,
            stock_physical: dbPhysical,
            stock_reserved: dbCalculatedReserved,
            stock_current: newAvailable
          });
        }
      }
    }

    if (updatesToUpsert.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('products')
        .upsert(updatesToUpsert, { onConflict: 'id' });

      if (upsertErr) throw upsertErr;
      updatedCount = updatesToUpsert.length;
    }

    return NextResponse.json({ success: true, updatedCount });

  } catch (err: any) {
    console.error("Error in sync-stock POST:", err);
    return NextResponse.json({ error: err.message || 'Error interno al sincronizar stock.' }, { status: 500 });
  }
}
