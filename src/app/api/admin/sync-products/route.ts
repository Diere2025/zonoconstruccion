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

    addLog("Iniciando sincronización completa de productos, precios y proveedores desde Google Sheets...");

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
    const bdProductSupplierMap = new Map<string, string>();
    const bdSupplierNames = new Set<string>();

    if (bdRes.ok) {
      const bdCsv = await bdRes.text();
      const bdRows = parseCSV(bdCsv);
      for (let i = 1; i < bdRows.length; i++) {
        const row = bdRows[i];
        const name = row[0]?.trim();
        const supp = row[2]?.trim();
        const discFlag = row[9]?.trim()?.toLowerCase();
        const sku = row[11]?.trim();

        if (name && (discFlag === 'si' || discFlag === 'sí' || discFlag === 'true' || discFlag === 'x')) {
          bdDiscontinuedSet.add(normalizeProductName(name));
        }

        if (supp && supp.toLowerCase() !== 'descuento') {
          bdSupplierNames.add(supp);
          if (name) bdProductSupplierMap.set(normalizeProductName(name), supp);
          if (sku) bdProductSupplierMap.set(normalizeProductName(sku), supp);
        }
      }
      addLog(`BDProductos cargada con ${bdRows.length - 1} registros y ${bdSupplierNames.size} proveedores detectados.`);
    }

    // 2b. Sync Suppliers with Database
    const { data: currentSuppliers, error: suppFetchErr } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, business_unit, is_active');
    
    if (suppFetchErr) throw suppFetchErr;

    const dbSuppliersMap = new Map<string, any>();
    (currentSuppliers || []).forEach(s => {
      if (s.name) dbSuppliersMap.set(normalizeProductName(s.name), s);
    });

    let suppliersCreatedCount = 0;
    const newSuppliersToInsert: { name: string; business_unit: string; is_active: boolean; base_discount_percentage: number }[] = [];

    for (const sName of bdSupplierNames) {
      const normS = normalizeProductName(sName);
      if (!dbSuppliersMap.has(normS)) {
        newSuppliersToInsert.push({
          name: sName,
          business_unit: 'Zono',
          is_active: true,
          base_discount_percentage: 0
        });
      }
    }

    if (newSuppliersToInsert.length > 0) {
      addLog(`Registrando ${newSuppliersToInsert.length} nuevos proveedores en la base de datos...`);
      const { data: insertedSuppliers, error: suppInsertErr } = await supabaseAdmin
        .from('suppliers')
        .insert(newSuppliersToInsert)
        .select('id, name, business_unit, is_active');

      if (suppInsertErr) {
        console.warn("Error auto-inserting suppliers:", suppInsertErr);
      } else if (insertedSuppliers) {
        insertedSuppliers.forEach(s => {
          dbSuppliersMap.set(normalizeProductName(s.name), s);
          addLog(`  🏢 Proveedor dado de alta: "${s.name}"`);
        });
        suppliersCreatedCount = insertedSuppliers.length;
      }
    }

    // Ensure generic fallback suppliers exist
    let genericSupplier = Array.from(dbSuppliersMap.values()).find(s => 
      ['varios', 'zono', 'generico', 'fábrica propia'].includes(s.name.toLowerCase())
    ) || currentSuppliers?.[0];

    // 2c. Fetch existing Product-Supplier Relations
    const { data: currentRelations, error: relFetchErr } = await supabaseAdmin
      .from('product_supplier_relations')
      .select('id, product_id, supplier_id, is_primary');
    
    if (relFetchErr) throw relFetchErr;

    const relationsByProduct = new Map<string, any[]>();
    (currentRelations || []).forEach(r => {
      const list = relationsByProduct.get(r.product_id) || [];
      list.push(r);
      relationsByProduct.set(r.product_id, list);
    });

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

    // 4. Perform Updates / Inserts & Link Suppliers
    let pricesUpdatedCount = 0;
    let activatedCount = 0;
    let deactivatedCount = 0;
    let discontinuedCount = 0;
    let insertedCount = 0;
    let relationsLinkedCount = 0;

    const activeDbProductIds = new Set<string>();
    const allProductsToLink: Array<{ id: string; name: string; sku?: string; brand?: string }> = [];

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

        allProductsToLink.push({
          id: matchedProduct.id,
          name: updates.name || matchedProduct.name,
          sku: matchedProduct.sku,
          brand: updates.brand || matchedProduct.brand
        });

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
          .select('id, name, sku, brand')
          .single();

        if (!insertErr && newProd) {
          activeDbProductIds.add(newProd.id);
          insertedCount++;
          addLog(`  ✨ Nuevo producto insertado: ${cleanTitle} ($${sheetInfo.price})`);

          allProductsToLink.push(newProd);
        }
      }
    }

    // Process remaining products in DB that may not be in activePricesMap
    for (const p of dbProducts) {
      if (!activeDbProductIds.has(p.id)) {
        allProductsToLink.push(p);

        const isDiscountPseudoProduct = p.name?.toLowerCase().includes('descuento') || p.sku?.toLowerCase().includes('descuento') || p.name?.toLowerCase().includes('bonificaci');
        if (isDiscountPseudoProduct) continue; // Keep discount pseudo-products active

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

    // 5. Batch Link Suppliers & Relations
    addLog(`Vinculando proveedores para ${allProductsToLink.length} productos...`);
    const relationsToUpsert: Array<{ product_id: string; supplier_id: string; is_primary: boolean }> = [];

    for (const product of allProductsToLink) {
      const normName = normalizeProductName(product.name);
      const normSku = product.sku ? normalizeProductName(product.sku) : '';

      let matchedSuppName = bdProductSupplierMap.get(normName) || (normSku ? bdProductSupplierMap.get(normSku) : null);

      let matchedSupplier: any = null;
      if (matchedSuppName) {
        matchedSupplier = dbSuppliersMap.get(normalizeProductName(matchedSuppName));
      }

      // Fallback 1: Match by brand
      if (!matchedSupplier && product.brand) {
        matchedSupplier = dbSuppliersMap.get(normalizeProductName(product.brand));
      }

      // Fallback 2: Match by name prefix before '-'
      if (!matchedSupplier) {
        const parts = product.name.split('-').map(p => p.trim());
        if (parts.length > 1 && parts[0].length >= 3) {
          const prefix = parts[0];
          matchedSupplier = dbSuppliersMap.get(normalizeProductName(prefix));
        }
      }

      // Fallback 3: Use generic supplier
      if (!matchedSupplier) {
        matchedSupplier = genericSupplier;
      }

      if (!matchedSupplier) continue;

      const existingRels = relationsByProduct.get(product.id) || [];
      const primaryRel = existingRels.find(r => r.is_primary);

      if (!primaryRel || primaryRel.supplier_id !== matchedSupplier.id) {
        relationsToUpsert.push({
          product_id: product.id,
          supplier_id: matchedSupplier.id,
          is_primary: true
        });
      }
    }

    if (relationsToUpsert.length > 0) {
      addLog(`Guardando ${relationsToUpsert.length} relaciones producto-proveedor en lote...`);
      const chunkSize = 100;
      for (let c = 0; c < relationsToUpsert.length; c += chunkSize) {
        const chunk = relationsToUpsert.slice(c, c + chunkSize);
        const { error: upsertErr } = await supabaseAdmin
          .from('product_supplier_relations')
          .upsert(chunk, { onConflict: 'product_id,supplier_id' });

        if (!upsertErr) {
          relationsLinkedCount += chunk.length;
        } else {
          console.warn("Error upserting relations chunk:", upsertErr);
        }
      }
    }

    addLog(`Sincronización finalizada con éxito:`);
    addLog(`  - ${pricesUpdatedCount} precios actualizados`);
    addLog(`  - ${insertedCount} productos nuevos creados`);
    addLog(`  - ${suppliersCreatedCount} proveedores nuevos registrados`);
    addLog(`  - ${relationsLinkedCount} relaciones producto-proveedor actualizadas`);
    addLog(`  - ${activatedCount} productos activados, ${deactivatedCount} desactivados.`);

    return NextResponse.json({
      success: true,
      pricesUpdatedCount,
      insertedCount,
      suppliersCreatedCount,
      relationsLinkedCount,
      totalSuppliers: dbSuppliersMap.size,
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
