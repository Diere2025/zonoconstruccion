export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Helper parsers and normalizers
const normalizeText = (text: any): string => {
  if (!text) return "";
  return text
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

const normalizeLocalityFuzzy = (text: any): string => {
  if (!text) return "";
  return text
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
};

const cleanPhone = (phone: any): string => {
  if (!phone) return "";
  return phone.toString().replace(/\D/g, "");
};

const cleanProductName = (name: any): string => {
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

const parseSpanishNumber = (val: any): number => {
  if (!val) return 0;
  let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
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
};

const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const parseCSV = (csvText: string) => {
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
};

const mergeContiguousSheetRows = (rows: string[][]): string[][] => {
  if (rows.length <= 1) return rows;
  const merged: string[][] = [rows[0]];
  
  for (let i = 1; i < rows.length; i++) {
    const currentRow = [...rows[i]];
    const prevRow = merged[merged.length - 1];
    
    const code1 = (prevRow[1] || "").trim().toUpperCase();
    const code2 = (currentRow[1] || "").trim().toUpperCase();
    
    const match1 = code1.match(/^([A-Z]+)(\d+)$/);
    const match2 = code2.match(/^([A-Z]+)(\d+)$/);
    
    let isConsecutive = false;
    if (match1 && match2 && match1[1] === match2[1]) {
      const num1 = parseInt(match1[2], 10);
      const num2 = parseInt(match2[2], 10);
      if (Math.abs(num1 - num2) === 1) {
        isConsecutive = true;
      }
    }
    
    const client1 = normalizeText(prevRow[5] || "");
    const client2 = normalizeText(currentRow[5] || "");
    const sameClient = client1 === client2 && client1 !== "";
    
    const date1 = (prevRow[3] || "").trim();
    const date2 = (currentRow[3] || "").trim();
    const sameDate = date1 === date2 && date1 !== "";
    
    const addr1 = normalizeText(prevRow[18] || "");
    const addr2 = normalizeText(currentRow[18] || "");
    const sameAddr = addr1 === addr2 && addr1 !== "";
    
    if (isConsecutive && sameClient && sameDate && sameAddr) {
      prevRow[1] = `${prevRow[1].trim()} / ${currentRow[1].trim()}`;
      
      const subtotal1 = parseSpanishNumber(prevRow[28]);
      const subtotal2 = parseSpanishNumber(currentRow[28]);
      prevRow[28] = (subtotal1 + subtotal2).toString();
      
      const freight1 = parseSpanishNumber(prevRow[27]);
      const freight2 = parseSpanishNumber(currentRow[27]);
      prevRow[27] = (freight1 + freight2).toString();

      const surcharge1 = parseSpanishNumber(prevRow[25]);
      const surcharge2 = parseSpanishNumber(currentRow[25]);
      prevRow[25] = (surcharge1 + surcharge2).toString();

      const abonado1 = parseSpanishNumber(prevRow[24]);
      const abonado2 = parseSpanishNumber(currentRow[24]);
      prevRow[24] = (abonado1 + abonado2).toString();

      const pending1 = parseSpanishNumber(prevRow[29]);
      const pending2 = parseSpanishNumber(currentRow[29]);
      prevRow[29] = (pending1 + pending2).toString();

      let emptyIdx = 30;
      while ((prevRow[emptyIdx] || "").trim() !== "" && (prevRow[emptyIdx] || "").trim() !== "0") {
        emptyIdx += 4;
      }

      for (let pIdx = 30; pIdx < currentRow.length; pIdx += 4) {
        const prodName = (currentRow[pIdx] || "").trim();
        const prodQty = (currentRow[pIdx+1] || "").trim();
        const prodPrice = (currentRow[pIdx+2] || "").trim();
        const prodSubt = (currentRow[pIdx+3] || "").trim();

        if (prodName && prodName !== "0" && prodName.toLowerCase() !== "descuento") {
          prevRow[emptyIdx] = prodName;
          prevRow[emptyIdx+1] = prodQty;
          prevRow[emptyIdx+2] = prodPrice;
          prevRow[emptyIdx+3] = prodSubt;
          emptyIdx += 4;
        }
      }
    } else {
      merged.push(currentRow);
    }
  }
  return merged;
};

// Autonomous Background Runner executing on the server
async function runBackgroundImportJob(jobId: string, payload: any) {
  const startTime = Date.now();
  const logs: string[] = [];

  const addLog = async (msg: string) => {
    const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logLine = `[${timeStr}] ${msg}`;
    logs.push(logLine);
    console.log(`[Import Job ${jobId}] ${logLine}`);
    
    await supabaseAdmin
      .from('import_jobs')
      .update({ logs, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  };

  try {
    await addLog("🚀 Iniciando sincronización en servidor...");

    const {
      skipENC = true,
      skipCAMB = false,
      syncPaymentMethods = false,
      sheets = []
    } = payload;

    // Fetch all existing orders (with pagination)
    async function fetchOrdersAll() {
      let allOrders: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .select('id, legacy_code, status, payment_status, delivery_detail, whaticket_link, order_medium_id, client_id, total_amount')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allOrders = [...allOrders, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      return allOrders;
    }

    // Fetch all products (with pagination)
    async function fetchProductsAll() {
      let allProducts: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('products')
          .select('id, name, sku, price')
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

    // Fetch all clients (with pagination)
    async function fetchClientsAll() {
      let allClients: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('clients')
          .select('id, business_name, phone_primary, phone_secondary, is_wholesale')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allClients = [...allClients, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      return allClients;
    }

    // 1. Sync Payment Methods if requested
    if (syncPaymentMethods) {
      await supabaseAdmin.from('import_jobs').update({
        current_step: "Sincronizando medios de pago...",
        progress_percent: 10
      }).eq('id', jobId);

      try {
        const pmRes = await fetch("https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=1294713859", { cache: 'no-store' });
        if (pmRes.ok) {
          const pmCsv = await pmRes.text();
          const pmRows = parseCSV(pmCsv);
          const { data: currentPms } = await supabaseAdmin.from('payment_methods').select('*');
          const existingPms = currentPms || [];
          
          for (const row of pmRows) {
            if (row.length < 2) continue;
            const name = row[0].trim();
            const surchargeStr = row[1].trim();
            if (!name) continue;
            const floatVal = parseFloat(surchargeStr.replace(',', '.'));
            if (isNaN(floatVal)) continue;
            const surchargePercentage = Math.round(floatVal * 100);
            let installments = name.toLowerCase().includes("cuota simple") ? 6 : (name.match(/(\d+)\s*cuota/i) ? parseInt(name.match(/(\d+)\s*cuota/i)![1], 10) : 1);
            
            const existing = existingPms.find(pm => pm.name.toLowerCase() === name.toLowerCase());
            if (existing) {
              if (existing.surcharge_percentage !== surchargePercentage || existing.installments !== installments) {
                await supabaseAdmin.from('payment_methods').update({ surcharge_percentage: surchargePercentage, installments }).eq('id', existing.id);
              }
            } else {
              await supabaseAdmin.from('payment_methods').insert({ name, surcharge_percentage: surchargePercentage, installments, is_active: true, is_default: false });
            }
          }
          await addLog("💳 Medios de pago y recargos sincronizados con éxito.");
        }
      } catch (errPm: any) {
        await addLog(`⚠️ Medios de pago: ${errPm.message}`);
      }
    }

    // 2. Load Master Data
    await supabaseAdmin.from('import_jobs').update({
      current_step: "Cargando catálogo y pedidos existentes...",
      progress_percent: 18
    }).eq('id', jobId);

    const [
      products,
      sellersRes,
      localitiesRes,
      advSourcesRes,
      orderMediumsRes,
      paymentMethodsRes,
      phoneLinesRes,
      dbOrders,
      dbClients
    ] = await Promise.all([
      fetchProductsAll(),
      supabaseAdmin.from('sellers').select('id, full_name, is_organic'),
      supabaseAdmin.from('localities').select('id, name, zone_id'),
      supabaseAdmin.from('advertising_sources').select('id, name'),
      supabaseAdmin.from('order_mediums').select('id, name'),
      supabaseAdmin.from('payment_methods').select('id, name, surcharge_percentage, installments'),
      supabaseAdmin.from('phone_lines').select('id, phone_number'),
      fetchOrdersAll(),
      fetchClientsAll()
    ]);

    if (sellersRes.error) throw sellersRes.error;
    if (localitiesRes.error) throw localitiesRes.error;
    if (advSourcesRes.error) throw advSourcesRes.error;
    if (orderMediumsRes.error) throw orderMediumsRes.error;
    if (paymentMethodsRes.error) throw paymentMethodsRes.error;
    if (phoneLinesRes.error) throw phoneLinesRes.error;

    await addLog(`📥 Datos maestros cargados: ${products.length} productos, ${dbOrders.length} pedidos y ${dbClients.length} clientes existentes.`);

    // Build Maps
    const sellersMap = new Map();
    (sellersRes.data || []).forEach(r => sellersMap.set(normalizeText(r.full_name), { id: r.id, is_organic: r.is_organic, full_name: r.full_name }));

    const localitiesMap = new Map();
    (localitiesRes.data || []).forEach(r => localitiesMap.set(normalizeLocalityFuzzy(r.name), r.id));

    const advSourcesMap = new Map();
    (advSourcesRes.data || []).forEach(r => advSourcesMap.set(normalizeText(r.name), r.id));

    const orderMediumsMap = new Map();
    (orderMediumsRes.data || []).forEach(r => orderMediumsMap.set(normalizeText(r.name), r.id));

    const payMethodsMap = new Map();
    (paymentMethodsRes.data || []).forEach(r => payMethodsMap.set(normalizeText(r.name), r.id));

    const productMap = new Map();
    products.forEach(p => {
      productMap.set(cleanProductName(p.name), p);
      if (p.sku) productMap.set(cleanProductName(p.sku), p);
    });

    const clientsMap = new Map();
    dbClients.forEach(c => {
      const p1 = cleanPhone(c.phone_primary);
      if (p1) clientsMap.set(p1, c);
      const p2 = cleanPhone(c.phone_secondary);
      if (p2) clientsMap.set(p2, c);
      if (c.business_name) clientsMap.set(normalizeText(c.business_name), c);
    });

    const existingOrdersMap = new Map<string, any>();
    dbOrders.forEach((o: any) => {
      const rawCode = (o.legacy_code || "").trim();
      if (rawCode) {
        const parts = rawCode.split(/[\/,]/).map((c: string) => c.trim().toUpperCase());
        parts.forEach((code: string) => {
          if (code) {
            existingOrdersMap.set(code, o);
          }
        });
      }
    });

    const findExistingOrder = (orderCode: string) => {
      const code = orderCode.trim().toUpperCase();
      const incomingParts = code.split(/[\/,]/).map(p => p.trim()).filter(Boolean);
      for (const p of incomingParts) {
        const found = existingOrdersMap.get(p);
        if (found) return found;
      }
      return null;
    };

    let totalImported = 0;
    let totalUpdated = 0;
    let totalItemsImported = 0;
    let sheetsDone = 0;

    // 3. Process Each Sheet
    for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
      // Check cancellation status
      const { data: jobCheck } = await supabaseAdmin.from('import_jobs').select('status').eq('id', jobId).single();
      if (jobCheck?.status === 'cancelled') {
        await addLog("🛑 Trabajo cancelado por el usuario.");
        return;
      }

      const sheet = sheets[sIdx];
      const stepPercent = 20 + Math.round((sIdx / sheets.length) * 60);

      await supabaseAdmin.from('import_jobs').update({
        current_step: `Procesando planilla ${sIdx + 1}/${sheets.length}: ${sheet.name}...`,
        progress_percent: stepPercent,
        stats: {
          imported: totalImported,
          updated: totalUpdated,
          items: totalItemsImported,
          sheetsCompleted: sheetsDone,
          totalSheets: sheets.length
        }
      }).eq('id', jobId);

      await addLog(`📄 Descargando planilla de ${sheet.name}...`);
      const response = await fetch(sheet.url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Error al descargar ${sheet.name} (HTTP ${response.status})`);
      }
      const csvText = await response.text();
      const rawRows = parseCSV(csvText);
      const rows = mergeContiguousSheetRows(rawRows);

      const targetRows = rows.filter((row, idx) => {
        if (idx === 0) return false;
        const orderCode = (row[1] || "").trim();
        if (!orderCode) return false;

        // Skip ENC or CAMB if requested
        if (skipENC && orderCode.toUpperCase().startsWith("ENC")) return false;
        if (skipCAMB && orderCode.toUpperCase().startsWith("CAMB")) return false;

        if (sheet.isCentralSheet) {
          const isWholesaleCode = orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-");
          let matchesWholesale = sheet.isAquafortSheet ? isWholesaleCode : !isWholesaleCode;
          if (!matchesWholesale) return false;
        }

        return true;
      });

      if (targetRows.length > 0) {
        const startProc = Date.now();
        let sheetNew = 0;
        let sheetUpd = 0;

        for (const row of targetRows) {
          const rawEstado = (row[0] || "").trim();
          const orderCode = (row[1] || "").trim().toUpperCase();
          if (!orderCode) continue;

          const rawOrderDate = (row[3] || "").trim();
          const rawClientName = (row[5] || "").trim();
          const rawPhone1 = (row[6] || "").trim();
          const rawPhone2 = (row[7] || "").trim();
          const rawWhaticket = (row[8] || "").trim();
          const rawAdvSource = (row[9] || "").trim();
          const rawMedium = (row[11] || "").trim();
          const rawSellerName = (row[12] || "").trim();
          const rawLocality = (row[17] || "").trim();
          const rawAddress = (row[18] || "").trim();
          const rawMapsLink = (row[19] || "").trim();
          const rawPaymentMethod = (row[21] || "").trim();
          const rawPaymentStatus = (row[23] || "").trim();
          const rawTotalAmount = parseSpanishNumber(row[28]) || 0;
          const rawDeliveryDetail = (row[89] || "").trim();

          const orderDate = parseDate(rawOrderDate);
          const initDelDate = new Date(orderDate);
          initDelDate.setDate(initDelDate.getDate() + 3);
          const maxDelDate = new Date(orderDate);
          maxDelDate.setDate(maxDelDate.getDate() + 10);

          let dbOrderStatus = 'Pendiente';
          const lowerEstado = rawEstado.toLowerCase();
          if (lowerEstado === 'entregado' || lowerEstado === 'pasado') {
            dbOrderStatus = 'Entregado';
          } else if (lowerEstado === 'cancelado' || lowerEstado === 'anulado') {
            dbOrderStatus = 'Cancelado';
          } else if (lowerEstado === 'entregando' || lowerEstado === 'en reparto') {
            dbOrderStatus = 'Entregando';
          } else {
            dbOrderStatus = 'Pendiente';
          }

          // Strict check constraint compliance: 'Pendiente' | 'Seniado' | 'Abonado'
          let dbPaymentStatus = 'Pendiente';
          const lowerPay = rawPaymentStatus.toLowerCase();
          if (lowerPay.includes('abonado') || dbOrderStatus === 'Entregado') {
            dbPaymentStatus = 'Abonado';
          } else if (lowerPay.includes('seniado') || lowerPay.includes('seña') || lowerPay.includes('señado')) {
            dbPaymentStatus = 'Seniado';
          }

          // Lookup seller, locality, payment method, adv source, order medium
          let sellerId = sheet.defaultSellerId;
          const matchedSeller = sellersMap.get(normalizeText(rawSellerName)) || sellersMap.get(normalizeText(sheet.name));
          if (matchedSeller) sellerId = matchedSeller.id;

          let localityId = localitiesMap.get(normalizeLocalityFuzzy(rawLocality)) || null;
          let paymentMethodId = payMethodsMap.get(normalizeText(rawPaymentMethod)) || null;
          let advSourceId = advSourcesMap.get(normalizeText(rawAdvSource)) || null;
          let orderMediumId = orderMediumsMap.get(normalizeText(rawMedium)) || null;

          // Deduce Channel
          let channel = sheet.defaultChannel || 'mostrador_minorista';
          if (orderCode.startsWith("AQU") || orderCode.startsWith("POW") || orderCode.startsWith("AQ-") || rawDeliveryDetail.toUpperCase().includes("MAYORISTA")) {
            channel = 'mayorista';
          }

          // Client handling
          let clientId: string | null = null;
          const cleanP1 = cleanPhone(rawPhone1);
          const cleanP2 = cleanPhone(rawPhone2);
          const existingClient = (cleanP1 && clientsMap.get(cleanP1)) || (cleanP2 && clientsMap.get(cleanP2)) || (rawClientName && clientsMap.get(normalizeText(rawClientName)));

          if (existingClient) {
            clientId = existingClient.id;
          } else if (rawClientName) {
            const { data: newClient } = await supabaseAdmin.from('clients').insert({
              business_name: rawClientName,
              phone_primary: rawPhone1 || rawPhone2 || "Sin teléfono",
              phone_secondary: rawPhone2 || null,
              is_wholesale: channel === 'mayorista'
            }).select('id').single();

            if (newClient) {
              clientId = newClient.id;
              if (cleanP1) clientsMap.set(cleanP1, newClient);
              if (cleanP2) clientsMap.set(cleanP2, newClient);
              clientsMap.set(normalizeText(rawClientName), newClient);
            }
          }

          // Check Existing Order
          const dbOrder = findExistingOrder(orderCode);

          if (dbOrder) {
            // UPDATE EXISTING ORDER (Never duplicate)
            const updatePayload: any = {};
            if (dbOrder.status !== 'Entregado' && dbOrderStatus === 'Entregado') {
              updatePayload.status = 'Entregado';
              updatePayload.payment_status = 'Abonado';
            }
            if (rawDeliveryDetail && rawDeliveryDetail !== dbOrder.delivery_detail) {
              updatePayload.delivery_detail = rawDeliveryDetail;
            }
            if (rawWhaticket && rawWhaticket !== dbOrder.whaticket_link) {
              updatePayload.whaticket_link = rawWhaticket;
            }
            if (rawTotalAmount > 0 && dbOrder.total_amount !== rawTotalAmount) {
              updatePayload.total_amount = rawTotalAmount;
            }

            if (Object.keys(updatePayload).length > 0) {
              await supabaseAdmin.from('orders').update(updatePayload).eq('id', dbOrder.id);
              sheetUpd++;
              totalUpdated++;
            }
          } else {
            // INSERT NEW ORDER
            const { data: newOrder, error: errIns } = await supabaseAdmin.from('orders').insert({
              seller_id: sellerId,
              client_id: clientId,
              customer_name: rawClientName,
              locality: rawLocality,
              address: rawAddress,
              google_maps_link: rawMapsLink || null,
              payment_method_id: paymentMethodId,
              advertising_source_id: advSourceId,
              order_medium_id: orderMediumId,
              freight_type: 'Regular',
              status: dbOrderStatus,
              total_amount: rawTotalAmount,
              order_date: orderDate.toISOString(),
              initial_delivery_date: initDelDate.toISOString(),
              max_delivery_date: maxDelDate.toISOString(),
              payment_status: dbPaymentStatus,
              channel,
              delivery_detail: rawDeliveryDetail || null,
              legacy_code: orderCode,
              whaticket_link: rawWhaticket || null
            }).select('id').single();

            if (!errIns && newOrder) {
              sheetNew++;
              totalImported++;

              // Extract and Insert Order Items
              const itemsToInsert: any[] = [];
              for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
                const prodName = (row[pIdx] || "").trim();
                const prodQtyRaw = (row[pIdx + 1] || "").trim();
                const prodPriceRaw = (row[pIdx + 2] || "").trim();
                const prodSubtRaw = (row[pIdx + 3] || "").trim();

                if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") continue;
                const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 1;
                const unitPrice = parseSpanishNumber(prodPriceRaw) || 0;
                const subtotal = parseSpanishNumber(prodSubtRaw) || (qty * unitPrice);

                const matchedProd = productMap.get(cleanProductName(prodName));

                itemsToInsert.push({
                  order_id: newOrder.id,
                  product_id: matchedProd ? matchedProd.id : null,
                  product_name: prodName,
                  quantity: qty,
                  unit_price: unitPrice,
                  subtotal: subtotal
                });
              }

              if (itemsToInsert.length > 0) {
                await supabaseAdmin.from('order_items').insert(itemsToInsert);
                totalItemsImported += itemsToInsert.length;
              }

              // Cache immediately in memory
              const parts = orderCode.split(/[\/,]/).map(c => c.trim().toUpperCase());
              parts.forEach(code => {
                if (code) {
                  existingOrdersMap.set(code, {
                    id: newOrder.id,
                    status: dbOrderStatus,
                    delivery_detail: rawDeliveryDetail,
                    whaticket_link: rawWhaticket
                  });
                }
              });
            }
          }
        }

        const duration = ((Date.now() - startProc) / 1000).toFixed(1);
        await addLog(`✅ ${sheet.name}: ${sheetNew} nuevos creados, ${sheetUpd} actualizados (${duration}s).`);
      } else {
        await addLog(`ℹ️ ${sheet.name}: Sin pedidos nuevos para procesar.`);
      }

      sheetsDone++;
      await supabaseAdmin.from('import_jobs').update({
        stats: {
          imported: totalImported,
          updated: totalUpdated,
          items: totalItemsImported,
          sheetsCompleted: sheetsDone,
          totalSheets: sheets.length
        }
      }).eq('id', jobId);
    }

    // 4. Audit Deliveries (Logística)
    await supabaseAdmin.from('import_jobs').update({
      current_step: "Sincronizando entregas con Logística...",
      progress_percent: 90
    }).eq('id', jobId);
    await addLog("🚚 Sincronizando remitos y entregados con Logística...");

    try {
      const logiRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://zonoconstruccion.pages.dev'}/api/admin/audit-deliveries`, { method: "POST" });
      if (logiRes.ok) {
        const logiData = await logiRes.json();
        await addLog(`✅ Logística: ${logiData.message || 'Sincronización completada'}`);
      }
    } catch (syncErr: any) {
      await addLog(`⚠️ Logística: ${syncErr.message}`);
    }

    // 5. Complete Job
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalSummary = `Sincronización completada con éxito en ${totalTime}s. Se crearon ${totalImported} pedidos nuevos y se actualizaron ${totalUpdated} existentes.`;

    await addLog(`🏁 ¡PROCESO COMPLETADO EN ${totalTime}s!`);

    await supabaseAdmin.from('import_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: parseFloat(totalTime),
      current_step: "Completado con éxito",
      progress_percent: 100,
      summary: finalSummary,
      logs
    }).eq('id', jobId);

  } catch (err: any) {
    console.error(`[Import Job ${jobId}] Error:`, err);
    const errMsg = err?.message || String(err);
    await addLog(`❌ Error en servidor: ${errMsg}`);

    await supabaseAdmin.from('import_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      current_step: "Error en el proceso",
      error_message: errMsg,
      logs
    }).eq('id', jobId);
  }
}

// GET: Returns Current Running Job and Recent History
export async function GET() {
  try {
    const { data: runningJobs } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1);

    let currentJob = runningJobs && runningJobs.length > 0 ? runningJobs[0] : null;

    if (currentJob) {
      const lastActive = new Date(currentJob.updated_at || currentJob.started_at).getTime();
      const diffSec = (Date.now() - lastActive) / 1000;
      if (diffSec > 180) { // Older than 3 minutes without update
        await supabaseAdmin.from('import_jobs').update({
          status: 'failed',
          error_message: 'El servidor tardó más de lo esperado o el proceso fue interrumpido.',
          completed_at: new Date().toISOString()
        }).eq('id', currentJob.id);
        currentJob.status = 'failed';
      }
    }

    const { data: recentJobs, error } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(15);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      currentJob,
      recentJobs: recentJobs || []
    });
  } catch (err: any) {
    console.error('[API import-job GET] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Trigger new background job or cancel existing
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, jobId, sheets, skipENC = true, skipCAMB = false, syncPaymentMethods = false, userEmail = "admin" } = body;

    // Handle Cancel Action
    if (action === 'cancel' && jobId) {
      await supabaseAdmin.from('import_jobs').update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        current_step: "Cancelado por el usuario"
      }).eq('id', jobId);

      return NextResponse.json({ success: true, message: "Trabajo cancelado con éxito." });
    }

    // Check if there is already a running job
    const { data: activeJobs } = await supabaseAdmin
      .from('import_jobs')
      .select('id, started_at')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      const active = activeJobs[0];
      const diffSec = (Date.now() - new Date(active.started_at).getTime()) / 1000;
      if (diffSec < 300) {
        return NextResponse.json({
          success: false,
          error: "Ya hay una sincronización en curso en el servidor iniciada hace unos instantes.",
          jobId: active.id
        }, { status: 409 });
      } else {
        await supabaseAdmin.from('import_jobs').update({
          status: 'failed',
          error_message: 'Trabajo cancelado por timeout del servidor (stale).'
        }).eq('id', active.id);
      }
    }

    // Create New Job Record
    const defaultJazminSellerId = "13430e05-b61a-4a3f-9fc3-152d377c4b0c";
    const defaultDiegoSellerId = "381df0d1-183f-4ccb-aaf2-8147c76159a9";
    const defaultLudmilaSellerId = "8207801b-b6cb-48cc-af0f-d2f9f2c98032";
    const defaultFacundoSellerId = "54b9ce55-7354-4b39-9886-314aa79f6aa6";

    const targetSheets = (sheets && sheets.length > 0) ? sheets : [
      {
        name: "Jazmín Sánchez",
        url: "https://docs.google.com/spreadsheets/d/16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw/gviz/tq?tqx=out:csv&gid=1414092286",
        defaultSellerId: defaultJazminSellerId,
        defaultChannel: "web_organica",
        isCentralSheet: false,
        isAquafortSheet: false,
        enabled: true
      },
      {
        name: "Diego Bóveda",
        url: "https://docs.google.com/spreadsheets/d/1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg/gviz/tq?tqx=out:csv&gid=1414092286",
        defaultSellerId: defaultDiegoSellerId,
        defaultChannel: "mostrador_minorista",
        isCentralSheet: false,
        isAquafortSheet: false,
        enabled: true
      },
      {
        name: "Ludmila Krenz",
        url: "https://docs.google.com/spreadsheets/d/1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8/gviz/tq?tqx=out:csv&gid=1414092286",
        defaultSellerId: defaultLudmilaSellerId,
        defaultChannel: "mostrador_minorista",
        isCentralSheet: false,
        isAquafortSheet: false,
        enabled: true
      },
      {
        name: "Facundo Paz",
        url: "https://docs.google.com/spreadsheets/d/1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns/gviz/tq?tqx=out:csv",
        defaultSellerId: defaultFacundoSellerId,
        defaultChannel: "mostrador_minorista",
        isCentralSheet: false,
        isAquafortSheet: false,
        enabled: true
      },
      {
        name: "Central/Ruteo",
        url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
        defaultSellerId: defaultDiegoSellerId,
        defaultChannel: "mostrador_minorista",
        isCentralSheet: true,
        isAquafortSheet: false,
        enabled: true
      },
      {
        name: "Pedidos Mayoristas (AQU/POW/AQ-)",
        url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
        defaultSellerId: defaultDiegoSellerId,
        defaultChannel: "mayorista",
        isCentralSheet: true,
        isAquafortSheet: true,
        enabled: true
      }
    ].filter((s: any) => s.enabled);

    const { data: newJob, error: errCreate } = await supabaseAdmin.from('import_jobs').insert({
      status: 'running',
      created_by: userEmail,
      selected_sheets: targetSheets.map((s: any) => s.name),
      config: { skipENC, skipCAMB, syncPaymentMethods },
      stats: { imported: 0, updated: 0, items: 0, sheetsCompleted: 0, totalSheets: targetSheets.length },
      current_step: "Iniciando proceso autónomo en servidor...",
      progress_percent: 5,
      logs: [`[${new Date().toLocaleTimeString('es-AR')}] 🚀 Orden recibida desde cliente (${userEmail}). Iniciando en servidor.`]
    }).select('id').single();

    if (errCreate) throw errCreate;

    // Launch Background Execution with Next.js after() to ensure background promise is not killed
    after(async () => {
      await runBackgroundImportJob(newJob.id, {
        skipENC,
        skipCAMB,
        syncPaymentMethods,
        sheets: targetSheets
      });
    });

    return NextResponse.json({
      success: true,
      message: "Sincronización iniciada en segundo plano en el servidor con éxito.",
      jobId: newJob.id
    });

  } catch (err: any) {
    console.error('[API import-job POST] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
