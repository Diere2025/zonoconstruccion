import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

function parseCSV(csvText: string): string[][] {
  const result: string[][] = [];
  let currentWord = '';
  let inQuotes = false;
  let currentRow: string[] = [];
  const text = csvText.replace(/\r\n/g, '\n');
  const firstLine = text.split('\n')[0] || '';
  const delimiter = firstLine.includes(';') ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentWord += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentWord += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentWord.trim());
        currentWord = '';
      } else if (char === '\n') {
        currentRow.push(currentWord.trim());
        if (currentRow.length > 1 || currentRow[0] !== '') {
          result.push(currentRow);
        }
        currentRow = [];
        currentWord = '';
      } else {
        currentWord += char;
      }
    }
  }
  currentRow.push(currentWord.trim());
  if (currentRow.length > 1 || currentRow[0] !== '') {
    result.push(currentRow);
  }
  return result;
}

const normalizeProductName = (name: any): string => {
  if (!name) return "";
  let clean = name.toString().toLowerCase().trim();
  clean = clean.replace(/^\[interno\]\s*(-\s*)?/, "");
  clean = clean.replace(/^realizar\s+cobro\s*(de)?\s*/gi, "");
  clean = clean.replace(/^cobro\s*(de)?\s*/gi, "");
  clean = clean.replace(/\s*\(?\s*outlet\s*\)?/gi, "");
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/[^a-z0-9]/g, "");
  return clean;
};

const parseSpanishPrice = (priceStr: any): number => {
  if (!priceStr) return 0;
  let clean = priceStr.toString().replace(/[$\s]/g, "").trim();
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
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
};

const deduceCategoryFromTitle = (title: string, brand?: string): string => {
  const lower = title.toLowerCase();
  if (lower.includes('termotanque') || lower.includes('estufa') || lower.includes('calefactor') || lower.includes('convector')) return 'Hogar';
  if (lower.includes('tanque') && lower.includes('bicapa')) return 'Tanques Bicapa';
  if (lower.includes('tanque') && lower.includes('tricapa')) return 'Tanques Tricapa Beige';
  if (lower.includes('tanque') && lower.includes('cuatricapa')) return 'Tanques Cuatricapa';
  if (lower.includes('cisterna')) return 'Tanques Cisterna';
  if (lower.includes('biodigestor') || lower.includes('sépti') || lower.includes('septi')) return 'Biodigestores';
  if (lower.includes('desengrasadora')) return 'Cámaras Desengrasadoras';
  if (lower.includes('membrana') || lower.includes('latex') || lower.includes('látex') || lower.includes('pintura')) return 'Pinturas';
  if (lower.includes('bomba') || lower.includes('compresor') || lower.includes('cargador')) return 'Herramientas';
  if (brand && (brand.toLowerCase() === 'cooper' || brand.toLowerCase() === 'sirena')) return 'Hogar';
  return 'Otros';
};

export async function POST() {
  try {
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    };

    addLog("Iniciando sincronización completa de productos y precios desde Google Sheets...");

    // 1. Fetch all products from DB (Paginated)
    let dbProducts: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('id, name, sku, price, is_active, is_discontinued, category, brand')
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
    addLog(`Cargados ${dbProducts.length} productos de la base de datos.`);

    const dbBySkuMap = new Map();
    const dbByNameMap = new Map();
    dbProducts.forEach(p => {
      if (p.sku) dbBySkuMap.set(normalizeProductName(p.sku), p);
      dbByNameMap.set(normalizeProductName(p.name), p);
    });

    // 2. Fetch BDProductos
    const bdRes = await fetch("https://docs.google.com/spreadsheets/d/1FRVREzG1O_m8SENpTv-bOgu7AmnS-Em-cxCy-5_fmGI/export?format=csv&gid=1789541813", { cache: 'no-store' });
    const bdDiscontinuedSet = new Set<string>();
    if (bdRes.ok) {
      const bdCsv = await bdRes.text();
      const bdRows = parseCSV(bdCsv);
      for (let i = 1; i < bdRows.length; i++) {
        const row = bdRows[i];
        const name = row[0]?.trim();
        const discFlag = row[9]?.trim()?.toLowerCase();
        if (name && (discFlag === 'si' || discFlag === 'sí' || discFlag === 'true' || discFlag === 'x')) {
          bdDiscontinuedSet.add(normalizeProductName(name));
        }
      }
      addLog(`BDProductos cargada con ${bdRows.length - 1} registros.`);
    }

    // 3. Fetch Prices Sheet
    const priceRes = await fetch("https://docs.google.com/spreadsheets/d/1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg/export?format=csv&gid=508601925", { cache: 'no-store' });
    if (!priceRes.ok) {
      throw new Error("No se pudo descargar la planilla de precios de Google Sheets.");
    }
    const priceCsv = await priceRes.text();
    const priceRows = parseCSV(priceCsv);

    const activePricesMap = new Map<string, { price: number; brand?: string; rawName: string }>();
    for (let i = 0; i < priceRows.length; i++) {
      const row = priceRows[i];
      const brand = row[0]?.trim();
      const nameOrSku = row[1]?.trim();
      const priceStr = row[2]?.trim();
      if (!nameOrSku || nameOrSku.toLowerCase() === "producto" || nameOrSku === "Brida" || nameOrSku === "SIN SOBRANTES") continue;
      if (!priceStr) continue;

      const price = parseSpanishPrice(priceStr);
      if (price > 0) {
        activePricesMap.set(normalizeProductName(nameOrSku), { price, brand, rawName: nameOrSku });
      }
    }
    addLog(`Encontrados ${activePricesMap.size} productos con precios activos > $0 en Google Sheets.`);

    // 4. Perform Updates / Inserts
    let pricesUpdatedCount = 0;
    let activatedCount = 0;
    let deactivatedCount = 0;
    let discontinuedCount = 0;
    let insertedCount = 0;

    const activeDbProductIds = new Set<string>();

    for (const [normKey, sheetInfo] of activePricesMap.entries()) {
      const matchedProduct = dbByNameMap.get(normKey) || dbBySkuMap.get(normKey);
      
      if (matchedProduct) {
        activeDbProductIds.add(matchedProduct.id);

        const isDiscontinued = bdDiscontinuedSet.has(normKey);
        const targetIsActive = !isDiscontinued;
        const targetPrice = sheetInfo.price;

        const updates: any = {};
        let needsUpdate = false;

        // Clean up [Interno] prefix if present
        if (matchedProduct.name?.toLowerCase().startsWith('[interno]')) {
          updates.name = matchedProduct.name.replace(/^\[Interno\]\s*/i, '').trim();
          needsUpdate = true;
        }

        // Set brand if missing or null
        if (!matchedProduct.brand && sheetInfo.brand) {
          updates.brand = sheetInfo.brand;
          needsUpdate = true;
        }

        // Fix category if 'Interno'
        if (matchedProduct.category === 'Interno') {
          updates.category = deduceCategoryFromTitle(matchedProduct.name, sheetInfo.brand);
          needsUpdate = true;
        }

        if (matchedProduct.price !== targetPrice) {
          updates.price = targetPrice;
          needsUpdate = true;
          pricesUpdatedCount++;
        }

        if (matchedProduct.is_active !== targetIsActive) {
          updates.is_active = targetIsActive;
          needsUpdate = true;
          if (targetIsActive) activatedCount++;
          else deactivatedCount++;
        }

        if (isDiscontinued && !matchedProduct.is_discontinued) {
          updates.is_discontinued = true;
          needsUpdate = true;
          discontinuedCount++;
        }

        if (needsUpdate) {
          await supabaseAdmin
            .from('products')
            .update(updates)
            .eq('id', matchedProduct.id);
        }
      } else {
        // Product in Google Sheets does not exist in DB: INSERT IT!
        const cleanTitle = sheetInfo.rawName.replace(/^\[Interno\]\s*/i, '').trim();
        const cat = deduceCategoryFromTitle(cleanTitle, sheetInfo.brand);
        const { data: newProd, error: insertErr } = await supabaseAdmin
          .from('products')
          .insert({
            sku: cleanTitle,
            name: cleanTitle,
            price: sheetInfo.price,
            brand: sheetInfo.brand || null,
            category: cat,
            is_active: true,
            is_discontinued: false
          })
          .select('id')
          .single();

        if (!insertErr && newProd) {
          activeDbProductIds.add(newProd.id);
          insertedCount++;
          addLog(`  ✨ Nuevo producto insertado: ${cleanTitle} ($${sheetInfo.price})`);
        }
      }
    }

    for (const p of dbProducts) {
      if (!activeDbProductIds.has(p.id)) {
        const normName = normalizeProductName(p.name);
        const isDiscontinued = bdDiscontinuedSet.has(normName);

        const updates: any = {};
        let needsUpdate = false;

        if (p.is_active) {
          updates.is_active = false;
          needsUpdate = true;
          deactivatedCount++;
        }

        if (isDiscontinued && !p.is_discontinued) {
          updates.is_discontinued = true;
          needsUpdate = true;
          discontinuedCount++;
        }

        if (needsUpdate) {
          await supabaseAdmin
            .from('products')
            .update(updates)
            .eq('id', p.id);
        }
      }
    }

    addLog(`Sincronización finalizada: ${pricesUpdatedCount} precios actualizados, ${insertedCount} nuevos creados, ${activatedCount} activados, ${deactivatedCount} desactivados.`);

    return NextResponse.json({
      success: true,
      pricesUpdatedCount,
      insertedCount,
      activatedCount,
      deactivatedCount,
      discontinuedCount,
      totalActiveProducts: activeDbProductIds.size,
      logs
    });

  } catch (error: any) {
    console.error('[API Sync Products] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
