import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const LOGISTICS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg/gviz/tq?tqx=out:csv&gid=1438488516';

function parseCSV(text: string): string[][] {
  const results: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      results.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    results.push(currentRow);
  }
  
  return results;
}

function parseSpanishNumber(val: string): number {
  if (!val) return 0;
  let clean = val.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const cleanProductName = (name: string): string => {
  if (!name) return "";
  let clean = name.toString().toLowerCase().trim();
  clean = clean.replace(/^\[interno\]\s*(-\s*)?/, "");
  clean = clean.replace(/\s*-\s*aquafort/g, "");
  clean = clean.replace(/\s*-\s*biofort/g, "");
  clean = clean.replace(/\s*-\s*rotoplas/g, "");
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/[^a-z0-9]/g, "");
  return clean;
};

const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

export async function GET() {
  try {
    // 1. Fetch Logistics CSV from Google Sheets
    const csvRes = await fetch(LOGISTICS_SHEET_URL, { cache: 'no-store' });
    if (!csvRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la planilla de logística.' }, { status: 500 });
    }
    const csvText = await csvRes.text();
    const rows = parseCSV(csvText);

    // 2. Fetch all database orders (paginated to bypass Supabase 1000 limit)
    let dbOrdersList: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id, legacy_code, status, total_amount, payment_method_id, payment_methods(name), customer_name')
        .not('legacy_code', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      dbOrdersList = dbOrdersList.concat(data || []);
      if (!data || data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Fetch all database order items (paginated)
    let dbItemsList: any[] = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('order_items')
        .select('order_id, product_name, quantity, unit_price')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      dbItemsList = dbItemsList.concat(data || []);
      if (!data || data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    const dbOrdersMap = new Map<string, any>();
    dbOrdersList.forEach(o => {
      dbOrdersMap.set(o.legacy_code.trim().toUpperCase(), {
        id: o.id,
        legacy_code: o.legacy_code,
        status: o.status,
        total_amount: o.total_amount,
        payment_method_name: o.payment_methods ? (o.payment_methods as any).name : 'Sin especificar',
        customer_name: o.customer_name,
        items: []
      });
    });

    dbItemsList.forEach(item => {
      // Find matching order legacy code to push item
      for (const order of dbOrdersList) {
        if (item.order_id === order.id) {
          const mapped = dbOrdersMap.get(order.legacy_code.trim().toUpperCase());
          if (mapped) {
            mapped.items.push(item);
          }
          break;
        }
      }
    });

    // 3. Process CSV Rows
    const orderAttempts = new Map<string, any>();
    let checkedCount = 0;
    let statusMismatchesCount = 0;
    let totalMismatchesCount = 0;
    let itemMismatchesCount = 0;
    let paymentMismatchesCount = 0;

    const discrepancies: any[] = [];

    // Header index mappings
    // 0: Pedido, 1: Fecha (Attempt Date), 2: Pedido Fecha (Initial Date)
    // 4: Cliente Nombre, 15: Estado Pedido, 20: Pago Tipo de, 28: Total a Abonar (or 27: Recargo Total sin)
    // 29+: Products slots
    // 91: Motivo Postergación / Cancelación
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 30) continue;

      const code = (row[0] || "").trim().toUpperCase();
      const attemptDateStr = (row[1] || "").trim();
      const initialDateStr = (row[2] || "").trim();
      const client = (row[4] || "").trim();
      const status = (row[15] || "").trim();
      const motive = (row[91] || "").trim();

      if (!code || !code.match(/^[A-Z]+\d+$/)) {
        continue;
      }

      // Group attempts per order code for postponements analysis
      if (!orderAttempts.has(code)) {
        orderAttempts.set(code, {
          code,
          client,
          initialDateStr,
          attempts: []
        });
      }
      orderAttempts.get(code).attempts.push({
        dateStr: attemptDateStr,
        status,
        motive
      });

      // Audit discrepancies only for rows with "Entregado" status
      const isDelivered = status.toLowerCase().includes("entregado");
      if (!isDelivered) continue;

      checkedCount++;

      if (dbOrdersMap.has(code)) {
        const dbOrder = dbOrdersMap.get(code);
        const errors: string[] = [];

        // Audit A: Status mismatch
        if (dbOrder.status !== 'Entregado') {
          errors.push(`Estado desincronizado: Planilla figura "Entregado" pero base de datos figura "${dbOrder.status}".`);
          statusMismatchesCount++;
        }

        // Audit B: Total amount mismatch
        const sheetTotal = parseSpanishNumber(row[27]) + parseSpanishNumber(row[24]);
        const dbTotal = parseFloat(dbOrder.total_amount || 0);
        if (Math.abs(sheetTotal - dbTotal) > 1.0) {
          errors.push(`Diferencia de monto: Planilla indica $${sheetTotal.toLocaleString()} (Total/Recargo sin flete) pero base de datos indica $${dbTotal.toLocaleString()}.`);
          totalMismatchesCount++;
        }

        // Audit C: Payment method mismatch
        const sheetPayment = (row[20] || "").trim();
        const dbPayment = dbOrder.payment_method_name;
        
        let payMatches = sheetPayment.toLowerCase() === dbPayment.toLowerCase();

        if (!payMatches && sheetPayment && dbPayment !== "Sin especificar") {
          errors.push(`Método de pago modificado: Planilla indica "${sheetPayment}" pero base de datos indica "${dbPayment}".`);
          paymentMismatchesCount++;
        }

        // Audit D: Products/Quantities comparison
        const sheetItems: any[] = [];
        for (let pIdx = 29; pIdx <= 73; pIdx += 4) {
          const prodName = (row[pIdx] || "").trim();
          const qtyRaw = (row[pIdx + 1] || "").trim();
          const priceRaw = (row[pIdx + 2] || "").trim();
          
          if (prodName && prodName !== "0" && prodName.toLowerCase() !== "descuento") {
            const qty = parseInt(qtyRaw, 10) || 0;
            const price = parseSpanishNumber(priceRaw);
            if (qty > 0) {
              sheetItems.push({
                product_name: prodName,
                quantity: qty,
                unit_price: price
              });
            }
          }
        }

        let itemDiscrepancy = false;
        sheetItems.forEach(sItem => {
          const sClean = cleanProductName(sItem.product_name);
          const dbMatch = dbOrder.items.find((dbi: any) => cleanProductName(dbi.product_name) === sClean);
          
          if (!dbMatch) {
            itemDiscrepancy = true;
            errors.push(`Producto entregado ausente en DB: "${sItem.product_name}" (x${sItem.quantity}).`);
          } else {
            if (dbMatch.quantity !== sItem.quantity) {
              itemDiscrepancy = true;
              errors.push(`Diferencia de cantidad: "${sItem.product_name}" (Planilla: x${sItem.quantity} | DB: x${dbMatch.quantity}).`);
            }
            if (Math.abs(dbMatch.unit_price - sItem.unit_price) > 5.0) {
              itemDiscrepancy = true;
              errors.push(`Diferencia de precio unitario: "${sItem.product_name}" (Planilla: $${sItem.unit_price.toLocaleString()} | DB: $${dbMatch.unit_price.toLocaleString()}).`);
            }
          }
        });

        dbOrder.items.forEach((dbi: any) => {
          const dbClean = cleanProductName(dbi.product_name);
          const sheetMatch = sheetItems.find(si => cleanProductName(si.product_name) === dbClean);
          if (!sheetMatch && dbi.product_name.toLowerCase() !== 'descuento') {
            itemDiscrepancy = true;
            errors.push(`Producto de DB ausente en planilla: "${dbi.product_name}" (x${dbi.quantity}) no figura como entregado.`);
          }
        });

        if (itemDiscrepancy) {
          itemMismatchesCount++;
        }

        if (errors.length > 0) {
          discrepancies.push({
            code,
            client: dbOrder.customer_name,
            errors
          });
        }
      }
    }

    // 4. Group multiple postponements and delays stats
    const postponed: any[] = [];
    const delayStats: number[] = [];

    for (const [code, info] of orderAttempts.entries()) {
      info.attempts.sort((a: any, b: any) => {
        const dA = parseDate(a.dateStr) || new Date(0);
        const dB = parseDate(b.dateStr) || new Date(0);
        return dA.getTime() - dB.getTime();
      });

      const postponements = info.attempts.filter((a: any) => a.status.toLowerCase().includes("postergado"));
      
      if (postponements.length >= 2) {
        const dbOrder = dbOrdersMap.get(code);
        postponed.push({
          code,
          client: info.client,
          count: postponements.length,
          attempts: info.attempts,
          dbStatus: dbOrder ? dbOrder.status : 'No en DB'
        });
      }

      const deliveredAttempt = info.attempts.find((a: any) => a.status.toLowerCase().includes("entregado"));
      if (deliveredAttempt) {
        const initDate = parseDate(info.initialDateStr);
        const delDate = parseDate(deliveredAttempt.dateStr);
        if (initDate && delDate) {
          const diffTime = delDate.getTime() - initDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 0) {
            delayStats.push(diffDays);
          }
        }
      }
    }

    postponed.sort((a, b) => b.count - a.count);

    let avgDelay = 0;
    let maxDelay = 0;
    let pctOnTime = 0;

    if (delayStats.length > 0) {
      avgDelay = delayStats.reduce((sum, d) => sum + d, 0) / delayStats.length;
      maxDelay = Math.max(...delayStats);
      const zeroDelayCount = delayStats.filter(d => d === 0).length;
      pctOnTime = (zeroDelayCount / delayStats.length) * 100;
    }

    return NextResponse.json({
      stats: {
        checkedCount,
        itemMismatches: itemMismatchesCount,
        paymentMismatches: paymentMismatchesCount,
        totalMismatches: totalMismatchesCount,
        statusMismatches: statusMismatchesCount,
        avgDelay: parseFloat(avgDelay.toFixed(1)),
        maxDelay,
        pctOnTime: parseFloat(pctOnTime.toFixed(1))
      },
      postponed,
      discrepancies
    });

  } catch (err: any) {
    console.error("Error in audit-deliveries API:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

export async function POST() {
  try {
    console.log("POST: Starting logistics delivered sync...");
    // 1. Fetch Logistics CSV from Google Sheets
    const csvRes = await fetch(LOGISTICS_SHEET_URL, { cache: 'no-store' });
    if (!csvRes.ok) {
      console.error("POST: Failed to download logistics sheet");
      return NextResponse.json({ error: 'No se pudo descargar la planilla de logística.' }, { status: 500 });
    }
    const csvText = await csvRes.text();
    console.log("POST: Downloaded CSV text, length:", csvText.length);
    const rows = parseCSV(csvText);
    console.log("POST: Parsed CSV rows count:", rows.length);

    // 2. Fetch all database orders (paginated to bypass Supabase 1000 limit)
    console.log("POST: Fetching database orders...");
    let dbOrdersList: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id, legacy_code, status, total_amount, payment_method_id, customer_name')
        .not('legacy_code', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("POST: Error fetching orders page", page, error);
        throw error;
      }
      dbOrdersList = dbOrdersList.concat(data || []);
      if (!data || data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
    console.log(`POST: Loaded ${dbOrdersList.length} database orders.`);

    // Fetch all database order items (paginated)
    console.log("POST: Fetching database order items...");
    let dbItemsList: any[] = [];
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('order_items')
        .select('order_id, product_name, quantity, unit_price')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("POST: Error fetching items page", page, error);
        throw error;
      }
      dbItemsList = dbItemsList.concat(data || []);
      if (!data || data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
    console.log(`POST: Loaded ${dbItemsList.length} database order items.`);

    const [productsRes, payMethodsRes] = await Promise.all([
      supabaseAdmin.from('products').select('id, name, sku'),
      supabaseAdmin.from('payment_methods').select('id, name')
    ]);

    if (productsRes.error) throw productsRes.error;
    if (payMethodsRes.error) throw payMethodsRes.error;

    const dbProducts = productsRes.data || [];
    const payMethods = payMethodsRes.data || [];
    console.log(`POST: Loaded ${dbProducts.length} products and ${payMethods.length} payment methods.`);

    // Pre-calculate cleaned product names and SKUs for O(1) Map lookups (prevents CPU bottleneck)
    const cleanedProductsMap = new Map<string, string>();
    dbProducts.forEach(p => {
      const cleanedName = cleanProductName(p.name);
      if (cleanedName) cleanedProductsMap.set(cleanedName, p.id);
      if (p.sku) {
        const cleanedSku = cleanProductName(p.sku);
        if (cleanedSku) cleanedProductsMap.set(cleanedSku, p.id);
      }
    });

    const dbOrdersMap = new Map<string, any>();
    dbOrdersList.forEach(o => {
      dbOrdersMap.set(o.legacy_code.trim().toUpperCase(), {
        id: o.id,
        legacy_code: o.legacy_code,
        status: o.status,
        total_amount: o.total_amount,
        payment_method_id: o.payment_method_id,
        customer_name: o.customer_name,
        items: []
      });
    });

    dbItemsList.forEach(item => {
      for (const order of dbOrdersList) {
        if (item.order_id === order.id) {
          const mapped = dbOrdersMap.get(order.legacy_code.trim().toUpperCase());
          if (mapped) {
            mapped.items.push(item);
          }
          break;
        }
      }
    });

    // Synchronous read-only payment method lookup (prevents API calls inside loop)
    const getPaymentMethodId = (sheetPaymentName: string) => {
      if (!sheetPaymentName) return null;
      const clean = sheetPaymentName.trim().toLowerCase();
      const match = payMethods.find(pm => pm.name.toLowerCase() === clean);
      return match ? match.id : null;
    };

    // Lazy async payment method creation (only called when order actually needs update)
    const getOrCreatePaymentMethodId = async (sheetPaymentName: string) => {
      if (!sheetPaymentName) return null;
      const clean = sheetPaymentName.trim();
      let match = payMethods.find(pm => pm.name.toLowerCase() === clean.toLowerCase());
      if (match) return match.id;

      console.log(`POST: Creating new payment method "${clean}" in database...`);
      const { data: newPM, error: insertErr } = await supabaseAdmin
        .from('payment_methods')
        .insert({ name: clean })
        .select('id, name')
        .single();

      if (insertErr) {
        console.error("Error creating payment method:", insertErr);
        return null;
      }

      if (newPM) {
        payMethods.push(newPM);
        return newPM.id;
      }
      return null;
    };

    const getProductId = (sheetProductName: string) => {
      const clean = cleanProductName(sheetProductName);
      return cleanedProductsMap.get(clean) || null;
    };

    // Pre-aggregate spreadsheet rows by order code to handle duplicates (e.g. JS22737)
    const aggregatedSheetOrders = new Map<string, {
      code: string;
      status: string;
      sheetTotal: number;
      sheetPayment: string;
      sheetItems: any[];
    }>();

    let checkedLogiRows = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 30) continue;

      const code = (row[0] || "").trim().toUpperCase();
      const status = (row[15] || "").trim();

      if (!code || !code.match(/^[A-Z]+\d+$/)) {
        continue;
      }

      const isDelivered = status.toLowerCase().includes("entregado");
      if (!isDelivered) continue;

      checkedLogiRows++;

      const rowTotal = parseSpanishNumber(row[27]) + parseSpanishNumber(row[24]);
      const rowPayment = (row[20] || "").trim();

      // Parse items for this row
      const rowItems: any[] = [];
      for (let pIdx = 29; pIdx <= 73; pIdx += 4) {
        const prodName = (row[pIdx] || "").trim();
        const qtyRaw = (row[pIdx + 1] || "").trim();
        const priceRaw = (row[pIdx + 2] || "").trim();
        
        if (prodName && prodName !== "0" && prodName.toLowerCase() !== "descuento") {
          const qty = parseInt(qtyRaw, 10) || 0;
          const price = parseSpanishNumber(priceRaw);
          const productId = getProductId(prodName);
          if (qty > 0) {
            rowItems.push({
              product_id: productId,
              product_name: prodName,
              quantity: qty,
              unit_price: price,
              discount_percentage: 0,
              historical_unit_cost: 0
            });
          }
        }
      }

      if (aggregatedSheetOrders.has(code)) {
        const existing = aggregatedSheetOrders.get(code)!;
        existing.sheetTotal += rowTotal;
        if (rowPayment && !existing.sheetPayment) {
          existing.sheetPayment = rowPayment;
        }
        rowItems.forEach(ri => existing.sheetItems.push(ri));
      } else {
        aggregatedSheetOrders.set(code, {
          code,
          status,
          sheetTotal: rowTotal,
          sheetPayment: rowPayment,
          sheetItems: rowItems
        });
      }
    }

    // Summarize quantities for duplicate items with the exact same name and price (user request)
    const summarizeItems = (items: any[]) => {
      const summarized: any[] = [];
      for (const item of items) {
        const cleanName = cleanProductName(item.product_name);
        const match = summarized.find(s => 
          cleanProductName(s.product_name) === cleanName && 
          Math.abs(s.unit_price - item.unit_price) < 1.0
        );
        if (match) {
          match.quantity += item.quantity;
        } else {
          summarized.push({ ...item });
        }
      }
      return summarized;
    };

    for (const sheetOrder of aggregatedSheetOrders.values()) {
      sheetOrder.sheetItems = summarizeItems(sheetOrder.sheetItems);
    }

    let syncedOrdersCount = 0;
    let skippedOrdersCount = 0;

    console.log(`POST: Loop started over ${aggregatedSheetOrders.size} aggregated sheet orders...`);
    for (const sheetOrder of aggregatedSheetOrders.values()) {
      const code = sheetOrder.code;

      if (dbOrdersMap.has(code)) {
        const dbOrder = dbOrdersMap.get(code);

        const sheetTotal = sheetOrder.sheetTotal;
        const sheetPayment = sheetOrder.sheetPayment;
        const sheetPaymentId = getPaymentMethodId(sheetPayment);

        const sheetItems = sheetOrder.sheetItems;
        sheetItems.forEach(si => si.order_id = dbOrder.id);

        // --- OPTIMIZATION: Check if there is ANY difference ---
        let needsUpdate = false;

        // A. Check status
        if (dbOrder.status !== 'Entregado') {
          needsUpdate = true;
        }

        // B. Check total amount
        const dbTotal = parseFloat(dbOrder.total_amount || 0);
        if (Math.abs(sheetTotal - dbTotal) > 1.0) {
          needsUpdate = true;
        }

        // C. Check payment method (only if spreadsheet has one specified)
        if (sheetPayment) {
          if (!sheetPaymentId) {
            needsUpdate = true;
          } else if (dbOrder.payment_method_id !== sheetPaymentId) {
            needsUpdate = true;
          }
        }

        // D. Check items (using copy-and-delete index matching to handle duplicates)
        let itemsDiffer = false;
        if (sheetItems.length !== dbOrder.items.length) {
          itemsDiffer = true;
        } else {
          const dbItemsCopy = [...dbOrder.items];
          for (const sItem of sheetItems) {
            const sClean = cleanProductName(sItem.product_name);
            const dbMatchIdx = dbItemsCopy.findIndex((dbi: any) => 
              cleanProductName(dbi.product_name) === sClean && 
              dbi.quantity === sItem.quantity && 
              Math.abs(dbi.unit_price - sItem.unit_price) <= 5.0
            );
            if (dbMatchIdx === -1) {
              itemsDiffer = true;
              break;
            }
            dbItemsCopy.splice(dbMatchIdx, 1);
          }
        }
        if (itemsDiffer) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log(`POST: Updating order "${code}". Reason: statusDiff=${dbOrder.status !== 'Entregado'} (db="${dbOrder.status}", sheet="Entregado"), totalDiff=${Math.abs(sheetTotal - dbTotal) > 1.0} (db="${dbTotal}", sheet="${sheetTotal}"), paymentDiff=${sheetPayment ? (dbOrder.payment_method_id !== sheetPaymentId) : false} (db="${dbOrder.payment_method_id}", sheet="${sheetPaymentId}"/"${sheetPayment}"), itemsDiff=${itemsDiffer}`);
        }

        // If no changes are needed, skip database updates entirely
        if (!needsUpdate) {
          skippedOrdersCount++;
          continue;
        }

        // Resolve lazy payment method (create if missing since we are updating)
        const finalPaymentId = (sheetPayment ? sheetPaymentId : null) || await getOrCreatePaymentMethodId(sheetPayment) || dbOrder.payment_method_id;

        // Apply changes directly to DB:
        // A. Update status, payment method and total amount on public.orders
        const { error: errOrderUpdate } = await supabaseAdmin
          .from('orders')
          .update({
            status: 'Entregado',
            total_amount: sheetTotal,
            payment_method_id: finalPaymentId
          })
          .eq('id', dbOrder.id);

        if (errOrderUpdate) throw errOrderUpdate;

        // B. Recreate order items if we parsed valid sheet items
        if (sheetItems.length > 0) {
          // Delete old items
          const { error: errDelete } = await supabaseAdmin
            .from('order_items')
            .delete()
            .eq('order_id', dbOrder.id);
          
          if (errDelete) throw errDelete;

          // Insert new items
          const { error: errInsert } = await supabaseAdmin
            .from('order_items')
            .insert(sheetItems);
          
          if (errInsert) throw errInsert;
        }

        syncedOrdersCount++;
      }
    }
    console.log(`POST: Loop completed. Checked logistics rows: ${checkedLogiRows}, Synced orders: ${syncedOrdersCount}`);

    // 5. Trigger Stock Sync / Recalculate reserves after synchronization
    console.log("POST: Triggering stock recalculation...");
    const STOCK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1vrI3WFH6W35sj9JJ4sa3yr7XlJDaKP920R6t54jLW6o/export?format=csv&gid=447948741';
    const csvStockRes = await fetch(STOCK_SHEET_URL, { cache: 'no-store' });
    if (csvStockRes.ok) {
      const csvStockText = await csvStockRes.text();
      const stockLines = csvStockText.split('\n');
      if (stockLines.length > 0) {
        const stockHeaders = stockLines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
        const stockRows: any[] = [];
        for (let j = 1; j < stockLines.length; j++) {
          const l = stockLines[j].trim();
          if (!l) continue;
          const cells: string[] = [];
          let cur = '';
          let q = false;
          for (let c = 0; c < l.length; c++) {
            if (l[c] === '"') q = !q;
            else if (l[c] === ',' && !q) { cells.push(cur.trim()); cur = ''; }
            else cur += l[c];
          }
          cells.push(cur.trim());
          const obj: any = {};
          stockHeaders.forEach((h, idx) => {
            obj[h] = cells[idx] ? cells[idx].replace(/^"|"$/g, '').trim() : '';
          });
          stockRows.push(obj);
        }
        console.log(`POST: Parsed ${stockRows.length} stock rows.`);

        // Fetch products and active orders (excluding Entregando!)
        const [productsRes, pendingRes] = await Promise.all([
          supabaseAdmin.from('products').select('id, name, sku, stock_physical, stock_reserved, stock_current'),
          supabaseAdmin.from('order_items').select('product_id, quantity, orders!inner(status)').in('orders.status', ['Pendiente', 'Confirmado'])
        ]);

        if (!productsRes.error && !pendingRes.error) {
          const products = productsRes.data || [];
          const pendingItems = pendingRes.data || [];
          const dbCalculatedReservesMap = new Map();
          pendingItems.forEach(item => {
            const current = dbCalculatedReservesMap.get(item.product_id) || 0;
            dbCalculatedReservesMap.set(item.product_id, current + parseFloat(item.quantity || 0));
          });

          let updatedStockCount = 0;

          for (const sRow of stockRows) {
            const pName = sRow['Producto'] || '';
            if (!pName || pName === 'Brida') continue;
            const normPName = normalizeText(pName);
            const dbP = products.find(p => normalizeText(p.name) === normPName || normalizeText(p.sku) === normPName);
            if (dbP) {
              const sheetPhys = parseFloat((sRow['Stock Actual'] || '0').replace(',', '.')) || 0;
              const dbRes = dbCalculatedReservesMap.get(dbP.id) || 0;
              const newAv = sheetPhys - dbRes;

              // Skip DB update if stock levels are already perfectly matched (crucial optimization)
              const curPhys = parseFloat((dbP as any).stock_physical || 0);
              const curRes = parseFloat((dbP as any).stock_reserved || 0);
              const curCur = parseFloat((dbP as any).stock_current || 0);

              if (curPhys === sheetPhys && curRes === dbRes && curCur === newAv) {
                continue;
              }

              updatedStockCount++;
              await supabaseAdmin
                .from('products')
                .update({
                  stock_physical: sheetPhys,
                  stock_reserved: dbRes,
                  stock_current: newAv
                })
                .eq('id', dbP.id);
            }
          }
          console.log(`POST: Stock sync completed. Updated ${updatedStockCount} products.`);
        } else {
          console.error("POST: Stock sync error fetching db data", productsRes.error, pendingRes.error);
        }
      }
    } else {
      console.error("POST: Failed to download Stock sheet");
    }

    console.log(`POST: Completed successfully. Synced ${syncedOrdersCount} orders.`);
    return NextResponse.json({
      success: true,
      message: `Sincronización masiva completada con éxito. Se actualizaron ${syncedOrdersCount} pedidos a 'Entregado' con sus cobros e ítems finales.`
    });

  } catch (err: any) {
    console.error("POST: Error in audit-deliveries API:", err);
    return NextResponse.json({ error: err.message || 'Error interno al sincronizar pedidos.' }, { status: 500 });
  }
}
