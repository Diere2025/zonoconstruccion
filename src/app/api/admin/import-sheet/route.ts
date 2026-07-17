import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Helper normalizers/parsers for import
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      sheetName,
      rows,
      skipENC,
      skipCAMB,
      syncPaymentMethods,
      defaultSellerId,
      defaultChannel,
      isCentralSheet
    } = body;

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    };

    addLog(`Iniciando procesamiento de ${rows.length} pedidos en el servidor para ${sheetName}...`);

    // 1. Fetch Master Data
    const [
      productsRes,
      sellersRes,
      localitiesRes,
      advSourcesRes,
      orderMediumsRes,
      paymentMethodsRes,
      phoneLinesRes,
      ordersRes
    ] = await Promise.all([
      supabaseAdmin.from('products').select('id, name, sku, price'),
      supabaseAdmin.from('sellers').select('id, full_name, is_organic'),
      supabaseAdmin.from('localities').select('id, name, zone_id'),
      supabaseAdmin.from('advertising_sources').select('id, name'),
      supabaseAdmin.from('order_mediums').select('id, name'),
      supabaseAdmin.from('payment_methods').select('id, name, surcharge_percentage, installments'),
      supabaseAdmin.from('phone_lines').select('id, phone_number'),
      supabaseAdmin.from('orders').select('id, legacy_code, status, delivery_detail, whaticket_link, order_medium_id')
    ]);

    if (productsRes.error) throw productsRes.error;
    if (sellersRes.error) throw sellersRes.error;
    if (localitiesRes.error) throw localitiesRes.error;
    if (advSourcesRes.error) throw advSourcesRes.error;
    if (orderMediumsRes.error) throw orderMediumsRes.error;
    if (paymentMethodsRes.error) throw paymentMethodsRes.error;
    if (phoneLinesRes.error) throw phoneLinesRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const dbProducts = productsRes.data || [];
    const dbSellers = sellersRes.data || [];
    const dbLocalities = localitiesRes.data || [];
    const dbAdvSources = advSourcesRes.data || [];
    const dbOrderMediums = orderMediumsRes.data || [];
    const dbPaymentMethods = paymentMethodsRes.data || [];
    const dbPhoneLines = phoneLinesRes.data || [];
    const dbOrders = ordersRes.data || [];

    // 2. Build Maps
    const sellersMap = new Map();
    dbSellers.forEach(r => sellersMap.set(normalizeText(r.full_name), { id: r.id, is_organic: r.is_organic, full_name: r.full_name }));

    const localitiesMap = new Map();
    dbLocalities.forEach(r => localitiesMap.set(normalizeLocalityFuzzy(r.name), r.id));

    const advSourcesMap = new Map();
    dbAdvSources.forEach(r => advSourcesMap.set(normalizeText(r.name), r.id));

    const orderMediumsMap = new Map();
    dbOrderMediums.forEach(r => orderMediumsMap.set(normalizeText(r.name), r.id));

    const payMethodsMap = new Map();
    dbPaymentMethods.forEach(r => payMethodsMap.set(normalizeText(r.name), r));

    const phoneLinesMap = new Map();
    dbPhoneLines.forEach(r => phoneLinesMap.set(r.phone_number, r.id));

    const existingOrdersMap = new Map<string, { id: string; status: string; delivery_detail?: string; whaticket_link?: string; order_medium_id?: string }>();
    dbOrders.forEach((o: any) => {
      const rawCode = (o.legacy_code || "").trim();
      if (rawCode) {
        const parts = rawCode.split(/[\/,]/).map((c: string) => c.trim().toUpperCase());
        parts.forEach((code: string) => {
          if (code) {
            existingOrdersMap.set(code, { 
              id: o.id, 
              status: o.status || "", 
              delivery_detail: o.delivery_detail || "",
              whaticket_link: o.whaticket_link || "",
              order_medium_id: o.order_medium_id || ""
            });
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

    // Download and parse claims sheet for linking returns/exchanges
    let claimsMap = new Map<string, string[]>();
    if (!skipCAMB) {
      addLog("Descargando planilla general de reclamos para vinculación de cambios...");
      try {
        const claimsRes = await fetch("https://docs.google.com/spreadsheets/d/1PzbotWVO-iLqV0rPvH2ZlXKkMGYPTIkmBd1owU45OCo/gviz/tq?tqx=out:csv&gid=1414092286", { cache: 'no-store' });
        if (claimsRes.ok) {
          const claimsCsv = await claimsRes.text();
          
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

          const claimsRows = parseCSV(claimsCsv);
          for (let i = 1; i < claimsRows.length; i++) {
            const crow = claimsRows[i];
            const claimCode = (crow[0] || "").trim().toUpperCase();
            const orderCodeRef = (crow[3] || "").trim().toUpperCase();
            if (claimCode) claimsMap.set(claimCode, crow);
            if (orderCodeRef) claimsMap.set(orderCodeRef, crow);
          }
        }
      } catch (errClaims: any) {
        addLog(`⚠ Error al descargar planilla de reclamos: ${errClaims.message}`);
      }
    }

    let totalImported = 0;
    let totalItemsImported = 0;
    let totalUpdated = 0;

    // 3. Process rows
    for (const row of rows) {
      const orderCode = (row[1] || "").trim();
      if (!orderCode) continue;

      const rawStatus = (row[0] || "Pendiente").trim();
      const rawSolDate = (row[3] || "").trim();
      const rawEntDate = (row[2] || "").trim();
      const rawLimDate = (row[4] || "").trim();
      const rawClientName = (row[5] || "").trim() || "Cliente Sin Nombre";
      const rawPhone1 = cleanPhone(row[6]);
      const rawPhone2 = cleanPhone(row[7]);
      const rawEmail = null;
      const rawAdvSource = (row[9] || "").trim();
      const rawDeliveryDetail = (row[10] || "").trim();
      const rawMedium = (row[11] || "").trim();
      const rawSellerName = (row[12] || "").trim();
      const rawLocality = (row[17] || "").trim();
      const rawAddress = (row[18] || "").trim() || "Dirección Sin Especificar";
      const rawMapsLink = (row[19] || "").trim();
      const rawPayMethod = (row[21] || "").trim();
      const rawTaxId = (row[22] || "").trim();
      
      const rawSubtotal = parseSpanishNumber(row[28]);
      const rawFreight = parseSpanishNumber(row[27]);
      const rawSurcharge = parseSpanishNumber(row[25]);
      const rawAbonado = parseSpanishNumber(row[24]);
      const rawPending = parseSpanishNumber(row[29]);

      let sellerId = defaultSellerId;
      const normSeller = normalizeText(rawSellerName);
      if (sellersMap.has(normSeller)) {
        sellerId = sellersMap.get(normSeller).id;
      }

      const advSourceId = advSourcesMap.get(normalizeText(rawAdvSource)) || null;
      const paymentMethodObj = payMethodsMap.get(normalizeText(rawPayMethod)) || null;
      const paymentMethodId = paymentMethodObj ? paymentMethodObj.id : null;
      
      let localityId = null;
      if (rawLocality) {
        const normLoc = normalizeLocalityFuzzy(rawLocality);
        if (localitiesMap.has(normLoc)) {
          localityId = localitiesMap.get(normLoc);
        } else {
          addLog(`Creando localidad inexistente: "${rawLocality}"`);
          const { data: newLoc, error: errNl } = await supabaseAdmin
            .from('localities')
            .insert({ name: rawLocality, zone_id: null })
            .select('id')
            .single();
          
          if (errNl) {
            addLog(`Advertencia al crear localidad ${rawLocality}: ${errNl.message}`);
          } else if (newLoc) {
            localityId = newLoc.id;
            localitiesMap.set(normLoc, localityId);
            dbLocalities.push({ id: newLoc.id, name: rawLocality, zone_id: null });
          }
        }
      }

      const matchedLocObj = dbLocalities.find(l => l.id === localityId);
      const logisticsZoneId = matchedLocObj ? matchedLocObj.zone_id : null;

      let phoneLineId = null;
      const digitsMatch = rawMedium.match(/\d+/);
      if (digitsMatch) {
        const digits = digitsMatch[0];
        const matchedLine = dbPhoneLines.find(line => line.phone_number.endsWith(digits));
        if (matchedLine) phoneLineId = matchedLine.id;
      }

      let clientId = null;
      let shippingAddressId = null;

      const phonesToQuery = [];
      if (rawPhone1) phonesToQuery.push(rawPhone1);
      if (rawPhone2) phonesToQuery.push(rawPhone2);

      let existingClient = null;
      if (phonesToQuery.length > 0) {
        const { data: clientsFound } = await supabaseAdmin
          .from('clients')
          .select('id, business_name, phone_primary, phone_secondary, is_wholesale')
          .or(`phone_primary.in.(${phonesToQuery.join(',')}),phone_secondary.in.(${phonesToQuery.join(',')})`);
        if (clientsFound && clientsFound.length > 0) {
          existingClient = clientsFound[0];
        }
      }

      if (existingClient) {
        clientId = existingClient.id;
        const isWholesaleCode = orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-DB");
        if (isWholesaleCode && !existingClient.is_wholesale) {
          await supabaseAdmin
            .from('clients')
            .update({ is_wholesale: true })
            .eq('id', clientId);
          existingClient.is_wholesale = true;
        }

        const { data: clientAddresses } = await supabaseAdmin
          .from('addresses')
          .select('id, full_address, locality_id')
          .eq('client_id', clientId);
        
        const normRawAddress = normalizeText(rawAddress);
        const matchedAddr = clientAddresses?.find(addr => 
          addr.locality_id === localityId && normalizeText(addr.full_address) === normRawAddress
        );

        if (matchedAddr) {
          shippingAddressId = matchedAddr.id;
        } else {
          const addrIndex = (clientAddresses?.length || 0) + 1;
          const { data: newAddr, error: errNa } = await supabaseAdmin
            .from('addresses')
            .insert({
              client_id: clientId,
              alias: `Dirección ${addrIndex}`,
              full_address: rawAddress,
              locality_id: localityId,
              map_link: rawMapsLink,
              is_default: false
            })
            .select('id')
            .single();
          if (errNa) throw errNa;
          shippingAddressId = newAddr.id;
        }
      } else {
        const { data: newClient, error: errNc } = await supabaseAdmin
          .from('clients')
          .insert({
            business_name: rawClientName,
            phone_primary: rawPhone1 || rawPhone2 || "Sin teléfono",
            phone_secondary: rawPhone2 || null,
            email: rawEmail || null,
            tax_id: rawTaxId || null,
            credit_limit: 0,
            is_wholesale: orderCode.toUpperCase().startsWith("AQU") || orderCode.toUpperCase().startsWith("POW") || orderCode.toUpperCase().startsWith("AQ-DB")
          })
          .select('id')
          .single();
        if (errNc) throw errNc;
        clientId = newClient.id;

        const { data: newAddr, error: errNa } = await supabaseAdmin
          .from('addresses')
          .insert({
            client_id: clientId,
            alias: 'Principal',
            full_address: rawAddress,
            locality_id: localityId,
            map_link: rawMapsLink,
            is_default: true
          })
          .select('id')
          .single();
        if (errNa) throw errNa;
        shippingAddressId = newAddr.id;
      }

      let channel = defaultChannel;
      const sellerObj = dbSellers.find(s => s.id === sellerId);
      if (sellerObj) {
        if (sellerObj.is_organic) channel = "web_organica";
        else if (sellerObj.full_name === "Diego Bóveda") channel = "mostrador_minorista";
        else channel = "web_organica";
      }

      if (rawDeliveryDetail.toUpperCase().includes("MAYORISTA")) {
        channel = "mayorista";
      }

      const orderDate = parseDate(rawSolDate);
      const initDelDate = parseDate(rawEntDate);
      const maxDelDate = rawLimDate ? parseDate(rawLimDate) : initDelDate;

      let paymentStatus = 'Pendiente';
      if (rawPending <= 0) paymentStatus = 'Abonado';
      else if (rawAbonado > 0) paymentStatus = 'Seniado';

      const calculatedTotal = rawSubtotal + rawFreight + rawSurcharge;
      const totalsJson = {
        subtotal: rawSubtotal,
        freight: rawFreight,
        payment_surcharges: rawSurcharge,
        deposit_amount: rawAbonado,
        pending_balance: rawPending
      };

      // Deduce category from products
      let termotanqueCount = 0;
      let tanquesCount = 0;
      let biofortCount = 0;
      let mepsCount = 0;
      let escalerasCount = 0;
      let pinturasCount = 0;

      for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
        const prodName = (row[pIdx] || "").trim();
        const prodQtyRaw = (row[pIdx + 1] || "").trim();
        if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") continue;
        const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
        if (qty <= 0) continue;

        const nameLower = prodName.toLowerCase();
        if (nameLower.includes("termotanque") || nameLower.includes("termo")) termotanqueCount += qty;
        else if (nameLower.includes("aquafort") || nameLower.includes("tanque") || nameLower.includes("base") || nameLower.includes("flotante") || nameLower.includes("flotador")) tanquesCount += qty;
        else if (nameLower.includes("biofort") || nameLower.includes("biodigestor") || nameLower.includes("septic") || nameLower.includes("séptic") || nameLower.includes("desengrasadora") || nameLower.includes("inspeccion") || nameLower.includes("inspección") || nameLower.includes("lodos") || nameLower.includes("wp") || nameLower.includes("aerosol") || nameLower.includes("lubricante")) biofortCount += qty;
        else if (nameLower.includes("meps") || nameLower.includes("equilibrio") || nameLower.includes("membrana")) mepsCount += qty;
        else if (nameLower.includes("escalera")) mepsCount += qty; // wait, escaleras!
        else if (nameLower.includes("látex") || nameLower.includes("latex") || nameLower.includes("pintura")) pinturasCount += qty;
      }

      let deducedCategory = "Otros";
      const counts = [
        { cat: "Termotanques", count: termotanqueCount },
        { cat: "Tanques de Agua", count: tanquesCount },
        { cat: "Biodigestores", count: biofortCount },
        { cat: "MEPS", count: mepsCount },
        { cat: "Escaleras", count: escalerasCount },
        { cat: "Pinturas", count: pinturasCount }
      ];
      counts.sort((a, b) => b.count - a.count);
      if (counts[0].count > 0) deducedCategory = counts[0].cat;

      let dbOrderStatus = 'Pendiente';
      const normStatus = normalizeText(rawStatus);
      if (normStatus === 'entregado' || normStatus === 'pasado') dbOrderStatus = 'Entregado';
      else if (normStatus === 'cancelado' || normStatus === 'anulado') dbOrderStatus = 'Cancelado';
      else if (normStatus === 'entregando') dbOrderStatus = 'Entregando';
      else if (normStatus === 'pendiente') dbOrderStatus = 'Pendiente';

      const rawWhaticketLink = (row[8] || "").trim();
      const normRawMedium = normalizeText(rawMedium);
      
      let resolvedMediumName = "Otro";
      if (rawWhaticketLink && (rawWhaticketLink.toLowerCase().includes("whaticket") || rawWhaticketLink.startsWith("http"))) {
        resolvedMediumName = "Whaticket";
      } else if (normRawMedium.includes("whatsapp business api")) {
        resolvedMediumName = "Whaticket";
      } else if (normRawMedium.includes("whaticket linea 3690") || normRawMedium.includes("whaticket linea 3881")) {
        resolvedMediumName = "WhatsApp";
      } else if (normRawMedium.includes("whatsapp") || normRawMedium.includes("wp")) {
        resolvedMediumName = "WhatsApp";
      } else if (normRawMedium.includes("llamado") || normRawMedium.includes("llamada")) {
        resolvedMediumName = "Llamado";
      } else if (normRawMedium.includes("messenger")) {
        resolvedMediumName = "Messenger FB";
      } else if (normRawMedium.includes("whaticket")) {
        resolvedMediumName = "Whaticket";
      } else if (normRawMedium.includes("cliente agendado") && normRawMedium.includes("sin publicidad")) {
        resolvedMediumName = "WhatsApp";
      } else if (normRawMedium.includes("cliente agendado") && normRawMedium.includes("recupero")) {
        resolvedMediumName = "WhatsApp";
      } else if (normRawMedium.includes("redireccionado")) {
        resolvedMediumName = "Transferido";
      } else if (normRawMedium.includes("facebook pagina")) {
        resolvedMediumName = "Messenger FB";
      } else if (normRawMedium.includes("zc api")) {
        resolvedMediumName = "Whaticket";
      }
      
      const orderMediumId = orderMediumsMap.get(normalizeText(resolvedMediumName)) || null;

      const dbOrder = findExistingOrder(orderCode);
      if (dbOrder) {
        const activeStatuses = ['Pendiente', 'Confirmado', 'Entregando'];
        if (activeStatuses.includes(dbOrder.status)) {
          const rawStatusVal = (row[0] || "").trim();
          const normStatus = normalizeText(rawStatusVal);
          
          let newStatus = dbOrder.status;
          if (normStatus === 'entregado' || normStatus === 'pasado') newStatus = 'Entregado';
          else if (normStatus === 'cancelado' || normStatus === 'anulado') newStatus = 'Cancelado';
          else if (normStatus === 'entregando') newStatus = 'Entregando';
          else if (normStatus === 'pendiente') newStatus = 'Pendiente';
          
          const dbWhaticket = dbOrder.whaticket_link || "";
          const dbMediumId = dbOrder.order_medium_id || "";
          
          let needsMetadataUpdate = false;
          const updatePayload: any = {};
          
          if (rawWhaticketLink && rawWhaticketLink !== dbWhaticket) {
            updatePayload.whaticket_link = rawWhaticketLink;
            needsMetadataUpdate = true;
            dbOrder.whaticket_link = rawWhaticketLink;
          }
          if (orderMediumId && orderMediumId !== dbMediumId) {
            updatePayload.order_medium_id = orderMediumId;
            needsMetadataUpdate = true;
            dbOrder.order_medium_id = orderMediumId;
          }
          
          if (newStatus !== dbOrder.status || needsMetadataUpdate) {
            const fieldsToUpdate: any = { ...updatePayload };
            if (newStatus !== dbOrder.status) {
              fieldsToUpdate.status = newStatus;
              addLog(`🔄 Sincronizando pedido ${orderCode}: cambiando estado de '${dbOrder.status}' a '${newStatus}'...`);
            }
            if (needsMetadataUpdate) {
              addLog(`🔄 Sincronizando Whaticket/Medio para pedido ${orderCode}...`);
            }
            
            const { error: errUpdate } = await supabaseAdmin
              .from('orders')
              .update(fieldsToUpdate)
              .eq('id', dbOrder.id);
              
            if (errUpdate) {
              addLog(`❌ Error al actualizar estado del pedido ${orderCode}: ${errUpdate.message}`);
            } else {
              if (newStatus === 'Entregado' && orderCode.toUpperCase().startsWith("CAMB")) {
                const { data: matchedClaims } = await supabaseAdmin
                  .from('returns_exchanges')
                  .select('id')
                  .or(`notes.ilike.%${orderCode}%,problem_explanation.ilike.%${orderCode}%,reason.ilike.%${orderCode}%`);
                  
                if (matchedClaims && matchedClaims.length > 0) {
                  for (const c of matchedClaims) {
                    await supabaseAdmin
                      .from('returns_exchanges')
                      .update({ status: 'Completado' })
                      .eq('id', c.id);
                    addLog(`  ✅ Reclamo asociado ${c.id.substring(0,8)} actualizado a 'Completado' debido a entrega de ${orderCode}.`);
                  }
                }
              }
              let deliveryStatus = 'pendiente_ruteo';
              if (newStatus === 'Entregado') deliveryStatus = 'entregado';
              else if (newStatus === 'Cancelado') deliveryStatus = 'fallido';
              
              const updatePayloadDel: any = { status: deliveryStatus };
              if (newStatus === 'Entregado') {
                const rawEntDate = (row[2] || "").trim();
                const initDelDate = parseDate(rawEntDate);
                updatePayloadDel.delivery_date = initDelDate.toISOString();
              }
              
              const { error: errDelUpdate } = await supabaseAdmin
                .from('deliveries')
                .update(updatePayloadDel)
                .eq('order_id', dbOrder.id);
                
              if (errDelUpdate) {
                addLog(`❌ Error al actualizar entrega del pedido ${orderCode}: ${errDelUpdate.message}`);
              } else {
                addLog(`✅ Pedido ${orderCode} y entrega actualizados a '${newStatus}'.`);
                totalUpdated++;
                dbOrder.status = newStatus;
              }
            }
          }
        }

        if (syncPaymentMethods && paymentMethodObj && paymentMethodObj.surcharge_percentage > 0) {
          addLog(`💳 Sincronizando medio de pago con recargo para pedido ${orderCode}: ${rawPayMethod}...`);
          const { error: errUpdatePay } = await supabaseAdmin
            .from('orders')
            .update({
              payment_method_id: paymentMethodId,
              total_amount: calculatedTotal,
              totals: totalsJson
            })
            .eq('id', dbOrder.id);

          if (errUpdatePay) {
            addLog(`❌ Error al actualizar recargo/medio de pago del pedido ${orderCode}: ${errUpdatePay.message}`);
          } else {
            addLog(`✅ Surtotal/Recargo de pedido ${orderCode} actualizado a ${calculatedTotal} (${rawPayMethod}).`);
            totalUpdated++;
          }
        }

        if (rawDeliveryDetail && rawDeliveryDetail !== (dbOrder.delivery_detail || "")) {
          addLog(`  📝 El detalle de entrega del pedido ${orderCode} cambió. Actualizando en base de datos...`);
          const { error: errDetail } = await supabaseAdmin
            .from('orders')
            .update({ delivery_detail: rawDeliveryDetail })
            .eq('id', dbOrder.id);
            
          if (errDetail) {
            addLog(`  ❌ Error al actualizar detalle de entrega: ${errDetail.message}`);
          } else {
            dbOrder.delivery_detail = rawDeliveryDetail;
            addLog(`  ✅ Detalle de entrega actualizado.`);
          }
        }

        const isActiveOrder = ['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrder.status);
        if (isActiveOrder && (orderCode.toUpperCase().startsWith("CAMB") || orderCode.toUpperCase().startsWith("REC"))) {
          const detailMatch = rawDeliveryDetail.match(/^\d+\s*-\s*([A-Z0-9]+)\s*-\s*/i);
          let referencedCode = detailMatch ? detailMatch[1].toUpperCase() : null;
          if (!referencedCode) {
            const recMatch = rawDeliveryDetail.match(/REC\d+/i);
            if (recMatch) referencedCode = recMatch[0].toUpperCase();
          }
          if (!referencedCode) {
            const codeMatch = rawDeliveryDetail.match(/[A-Z]{2,4}\d+/i);
            if (codeMatch) {
              const matchedStr = codeMatch[0].toUpperCase();
              if (!matchedStr.startsWith("CAMB") && !matchedStr.startsWith("REC")) referencedCode = matchedStr;
            }
          }

          let claimsSheetRow = null;
          if (referencedCode) claimsSheetRow = claimsMap.get(referencedCode);
          if (!claimsSheetRow) claimsSheetRow = claimsMap.get(orderCode.toUpperCase());

          const searchCode = referencedCode || orderCode;
          const { data: matchedClaims } = await supabaseAdmin
            .from('returns_exchanges')
            .select('id, order_id')
            .or(`notes.ilike.%${searchCode}%,problem_explanation.ilike.%${searchCode}%,reason.ilike.%${searchCode}%`);

          if (matchedClaims && matchedClaims.length > 0) {
            for (const claim of matchedClaims) {
              const { data: currentOrderData } = await supabaseAdmin
                .from('orders')
                .select('id, legacy_code')
                .eq('id', claim.order_id)
                .single();

              const currentLegacyCode = currentOrderData?.legacy_code || "";
              if (currentLegacyCode.startsWith("ORIG-CAMB") || currentLegacyCode.startsWith("ORIG-REC") || currentLegacyCode === orderCode || currentLegacyCode.startsWith("ORIG-")) {
                let originalOrderCodeToSearch = null;
                if (claimsSheetRow) {
                  originalOrderCodeToSearch = (claimsSheetRow[3] || "").trim().toUpperCase();
                  if (originalOrderCodeToSearch.startsWith("CAMB") || originalOrderCodeToSearch.startsWith("ENC")) originalOrderCodeToSearch = null;
                }
                if (!originalOrderCodeToSearch && referencedCode && !referencedCode.startsWith("REC") && !referencedCode.startsWith("CAMB")) {
                  originalOrderCodeToSearch = referencedCode;
                }

                if (originalOrderCodeToSearch) {
                  const { data: origOrder } = await supabaseAdmin
                    .from('orders')
                    .select('id')
                    .eq('legacy_code', originalOrderCodeToSearch)
                    .limit(1);

                  let targetOrderId = null;
                  if (origOrder && origOrder.length > 0) {
                    targetOrderId = origOrder[0].id;
                    addLog(`  🔄 Re-vinculando reclamo ${claim.id.substring(0,8)} a pedido REAL: ${originalOrderCodeToSearch}`);
                  } else {
                    const dummyCode = originalOrderCodeToSearch.startsWith("ORIG-") ? originalOrderCodeToSearch : `ORIG-${originalOrderCodeToSearch}`;
                    const { data: existingDummy } = await supabaseAdmin
                      .from('orders')
                      .select('id')
                      .eq('legacy_code', dummyCode)
                      .limit(1);

                    if (existingDummy && existingDummy.length > 0) {
                      targetOrderId = existingDummy[0].id;
                    } else {
                      const { data: dummyOrder } = await supabaseAdmin
                        .from('orders')
                        .insert({
                          customer_name: rawClientName,
                          locality: rawLocality,
                          address: rawAddress,
                          google_maps_link: rawMapsLink,
                          freight_type: 'Regular',
                          status: 'Entregado',
                          total_amount: 0,
                          order_date: new Date().toISOString(),
                          initial_delivery_date: new Date().toISOString(),
                          max_delivery_date: new Date().toISOString(),
                          payment_status: 'Abonado',
                          channel: defaultChannel || 'web_organica',
                          legacy_code: dummyCode
                        })
                        .select('id')
                        .single();

                      if (dummyOrder) {
                        targetOrderId = dummyOrder.id;
                        await supabaseAdmin
                          .from('deliveries')
                          .update({ status: 'entregado' })
                          .eq('order_id', dummyOrder.id);
                      }
                    }
                  }

                  if (targetOrderId && targetOrderId !== claim.order_id) {
                    const oldOrderId = claim.order_id;
                    await supabaseAdmin
                      .from('returns_exchanges')
                      .update({ order_id: targetOrderId })
                      .eq('id', claim.id);
                    addLog(`  ✅ Reclamo re-vinculado con éxito.`);
                    if (currentLegacyCode.startsWith("ORIG-")) {
                      await supabaseAdmin.from('orders').delete().eq('id', oldOrderId);
                      addLog(`  🗑 Eliminado pedido temporal obsoleto: ${currentLegacyCode}`);
                    }
                  }
                }
              }
            }
          }
        }

        if (['Pendiente', 'Confirmado', 'Entregando'].includes(dbOrder.status)) {
          const { data: dbItems } = await supabaseAdmin
            .from('order_items')
            .select('id, product_name, quantity, unit_price, product_id')
            .eq('order_id', dbOrder.id);

          const sheetItems = [];
          for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
            const prodName = (row[pIdx] || "").trim();
            const prodQtyRaw = (row[pIdx + 1] || "").trim();
            const prodPriceRaw = (row[pIdx + 2] || "").trim();

            if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") continue;
            const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
            const unitPrice = parseSpanishNumber(prodPriceRaw);
            if (qty <= 0) continue;

            const csvCleanName = cleanProductName(prodName);
            const matchedProd = dbProducts.find(p => 
              cleanProductName(p.name) === csvCleanName || 
              (p.sku && cleanProductName(p.sku) === csvCleanName)
            );

            sheetItems.push({
              order_id: dbOrder.id,
              product_id: matchedProd ? matchedProd.id : null,
              product_name: prodName,
              quantity: qty,
              unit_price: unitPrice,
              discount_percentage: 0,
              historical_unit_cost: 0
            });
          }

          let itemsChanged = false;
          if (!dbItems || dbItems.length !== sheetItems.length) {
            itemsChanged = true;
          } else {
            for (const sItem of sheetItems) {
              const sClean = cleanProductName(sItem.product_name);
              const hasMatch = dbItems.some(dbi => 
                cleanProductName(dbi.product_name) === sClean && 
                dbi.quantity === sItem.quantity && 
                dbi.product_id === sItem.product_id && 
                Math.abs(dbi.unit_price - sItem.unit_price) <= 5.0
              );
              if (!hasMatch) {
                itemsChanged = true;
                break;
              }
            }
          }

          if (itemsChanged) {
            addLog(`  🔄 Sincronizando artículos modificados para pedido ${orderCode}...`);
            await supabaseAdmin
              .from('orders')
              .update({
                totals: totalsJson,
                total_amount: calculatedTotal,
                category: deducedCategory
              })
              .eq('id', dbOrder.id);

            await supabaseAdmin.from('order_items').delete().eq('order_id', dbOrder.id);

            if (sheetItems.length > 0) {
              const { error: errInsItems } = await supabaseAdmin
                .from('order_items')
                .insert(sheetItems);
              if (errInsItems) {
                addLog(`  ❌ Error al re-insertar artículos: ${errInsItems.message}`);
              } else {
                addLog(`  ✅ Artículos re-sincronizados con éxito (${sheetItems.length} items).`);
                totalItemsImported += sheetItems.length;
                totalUpdated++;
              }
            }
          }
        }

      } else {
        addLog(`  ✍ Creando pedido en la base de datos (${orderCode})...`);
        const { data: newOrder, error: errOrder } = await supabaseAdmin
          .from('orders')
          .insert({
            seller_id: sellerId,
            client_id: clientId,
            shipping_address_id: shippingAddressId,
            logistics_zone_id: logisticsZoneId,
            customer_name: rawClientName,
            locality: rawLocality,
            address: rawAddress,
            google_maps_link: rawMapsLink,
            payment_method_id: paymentMethodId,
            freight_type: 'Regular',
            status: dbOrderStatus,
            total_amount: calculatedTotal,
            order_date: orderDate.toISOString(),
            initial_delivery_date: initDelDate.toISOString(),
            max_delivery_date: maxDelDate.toISOString(),
            payment_status: paymentStatus,
            channel: channel,
            advertising_source_id: advSourceId,
            order_medium_id: orderMediumId,
            received_phone_line_id: phoneLineId,
            delivery_detail: rawDeliveryDetail,
            legacy_code: orderCode,
            whaticket_link: rawWhaticketLink || null,
            totals: totalsJson,
            category: deducedCategory
          })
          .select('id')
          .single();

        if (errOrder) throw errOrder;
        const orderId = newOrder.id;
        totalImported++;

        if (!orderCode.toUpperCase().startsWith("CAMB") && !orderCode.toUpperCase().startsWith("REC")) {
          const potentialDummyCode = `ORIG-${orderCode}`;
          const { data: matchedDummyOrders } = await supabaseAdmin
            .from('orders')
            .select('id')
            .eq('legacy_code', potentialDummyCode);
            
          if (matchedDummyOrders && matchedDummyOrders.length > 0) {
            for (const dummyOrd of matchedDummyOrders) {
              addLog(`  🔄 Encontrado pedido base temporal (${potentialDummyCode}). Relacionando reclamos al pedido real y eliminando temporal...`);
              const { error: errRelink } = await supabaseAdmin
                .from('returns_exchanges')
                .update({ order_id: orderId })
                .eq('order_id', dummyOrd.id);
                
              if (errRelink) {
                addLog(`  ❌ Error al re-vincular reclamos: ${errRelink.message}`);
              } else {
                await supabaseAdmin.from('orders').delete().eq('id', dummyOrd.id);
                addLog(`  ✅ Pedido temporal eliminado con éxito y reclamos re-vinculados.`);
              }
            }
          }
        }

        const sheetItems = [];
        for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
          const prodName = (row[pIdx] || "").trim();
          const prodQtyRaw = (row[pIdx + 1] || "").trim();
          const prodPriceRaw = (row[pIdx + 2] || "").trim();

          if (!prodName || prodName === "0" || prodName.toLowerCase() === "descuento") continue;
          const qty = parseInt(prodQtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
          const unitPrice = parseSpanishNumber(prodPriceRaw);
          if (qty <= 0) continue;

          const csvCleanName = cleanProductName(prodName);
          const matchedProd = dbProducts.find(p => 
            cleanProductName(p.name) === csvCleanName || 
            (p.sku && cleanProductName(p.sku) === csvCleanName)
          );

          sheetItems.push({
            order_id: orderId,
            product_id: matchedProd ? matchedProd.id : null,
            product_name: prodName,
            quantity: qty,
            unit_price: unitPrice,
            discount_percentage: 0,
            historical_unit_cost: 0
          });
        }

        if (sheetItems.length > 0) {
          const { error: errInsItems } = await supabaseAdmin
            .from('order_items')
            .insert(sheetItems);
          if (errInsItems) {
            addLog(`  ❌ Error al insertar artículos: ${errInsItems.message}`);
          } else {
            addLog(`  📦 Insertados ${sheetItems.length} artículos al pedido.`);
            totalItemsImported += sheetItems.length;
          }
        }

        let deliveryStatus = 'pendiente_ruteo';
        if (dbOrderStatus === 'Entregado') deliveryStatus = 'entregado';
        else if (dbOrderStatus === 'Cancelado') deliveryStatus = 'fallido';

        await supabaseAdmin
          .from('deliveries')
          .update({ status: deliveryStatus, delivery_date: initDelDate.toISOString() })
          .eq('order_id', orderId);

        if (dbOrderStatus === 'Entregado' && orderCode.toUpperCase().startsWith("CAMB")) {
          const { data: matchedClaims } = await supabaseAdmin
            .from('returns_exchanges')
            .select('id')
            .or(`notes.ilike.%${orderCode}%,problem_explanation.ilike.%${orderCode}%,reason.ilike.%${orderCode}%`);
            
          if (matchedClaims && matchedClaims.length > 0) {
            for (const c of matchedClaims) {
              await supabaseAdmin
                .from('returns_exchanges')
                .update({ status: 'Completado' })
                .eq('id', c.id);
              addLog(`  ✅ Reclamo asociado ${c.id.substring(0,8)} actualizado a 'Completado' debido a entrega de ${orderCode}.`);
            }
          }
        }

        if (dbOrderStatus === 'Entregado' && (orderCode.toUpperCase().startsWith("CAMB") || orderCode.toUpperCase().startsWith("REC"))) {
          const detailMatch = rawDeliveryDetail.match(/^\d+\s*-\s*([A-Z0-9]+)\s*-\s*/i);
          let referencedCode = detailMatch ? detailMatch[1].toUpperCase() : null;
          if (!referencedCode) {
            const recMatch = rawDeliveryDetail.match(/REC\d+/i);
            if (recMatch) referencedCode = recMatch[0].toUpperCase();
          }
          if (!referencedCode) {
            const codeMatch = rawDeliveryDetail.match(/[A-Z]{2,4}\d+/i);
            if (codeMatch) {
              const matchedStr = codeMatch[0].toUpperCase();
              if (!matchedStr.startsWith("CAMB") && !matchedStr.startsWith("REC")) referencedCode = matchedStr;
            }
          }

          let claimsSheetRow = null;
          if (referencedCode) claimsSheetRow = claimsMap.get(referencedCode);
          if (!claimsSheetRow) claimsSheetRow = claimsMap.get(orderCode.toUpperCase());

          const searchCode = referencedCode || orderCode;
          const { data: matchedClaims } = await supabaseAdmin
            .from('returns_exchanges')
            .select('id, order_id')
            .or(`notes.ilike.%${searchCode}%,problem_explanation.ilike.%${searchCode}%,reason.ilike.%${searchCode}%`);

          if (matchedClaims && matchedClaims.length > 0) {
            for (const claim of matchedClaims) {
              const { data: currentOrderData } = await supabaseAdmin
                .from('orders')
                .select('id, legacy_code')
                .eq('id', claim.order_id)
                .single();

              const currentLegacyCode = currentOrderData?.legacy_code || "";
              if (currentLegacyCode.startsWith("ORIG-CAMB") || currentLegacyCode.startsWith("ORIG-REC") || currentLegacyCode === orderCode || currentLegacyCode.startsWith("ORIG-")) {
                let originalOrderCodeToSearch = null;
                if (claimsSheetRow) {
                  originalOrderCodeToSearch = (claimsSheetRow[3] || "").trim().toUpperCase();
                  if (originalOrderCodeToSearch.startsWith("CAMB") || originalOrderCodeToSearch.startsWith("ENC")) originalOrderCodeToSearch = null;
                }
                if (!originalOrderCodeToSearch && referencedCode && !referencedCode.startsWith("REC") && !referencedCode.startsWith("CAMB")) {
                  originalOrderCodeToSearch = referencedCode;
                }

                if (originalOrderCodeToSearch) {
                  const { data: origOrder } = await supabaseAdmin
                    .from('orders')
                    .select('id')
                    .eq('legacy_code', originalOrderCodeToSearch)
                    .limit(1);

                  let targetOrderId = null;
                  if (origOrder && origOrder.length > 0) {
                    targetOrderId = origOrder[0].id;
                    addLog(`  🔄 Vinculando reclamo ${claim.id.substring(0,8)} a pedido REAL: ${originalOrderCodeToSearch}`);
                  } else {
                    const dummyCode = originalOrderCodeToSearch.startsWith("ORIG-") ? originalOrderCodeToSearch : `ORIG-${originalOrderCodeToSearch}`;
                    const { data: existingDummy } = await supabaseAdmin
                      .from('orders')
                      .select('id')
                      .eq('legacy_code', dummyCode)
                      .limit(1);

                    if (existingDummy && existingDummy.length > 0) {
                      targetOrderId = existingDummy[0].id;
                    } else {
                      const { data: dummyOrder } = await supabaseAdmin
                        .from('orders')
                        .insert({
                          customer_name: rawClientName,
                          locality: rawLocality,
                          address: rawAddress,
                          google_maps_link: rawMapsLink,
                          freight_type: 'Regular',
                          status: 'Entregado',
                          total_amount: 0,
                          order_date: new Date().toISOString(),
                          initial_delivery_date: new Date().toISOString(),
                          max_delivery_date: new Date().toISOString(),
                          payment_status: 'Abonado',
                          channel: defaultChannel || 'web_organica',
                          legacy_code: dummyCode
                        })
                        .select('id')
                        .single();

                      if (dummyOrder) {
                        targetOrderId = dummyOrder.id;
                        await supabaseAdmin
                          .from('deliveries')
                          .update({ status: 'entregado' })
                          .eq('order_id', dummyOrder.id);
                      }
                    }
                  }

                  if (targetOrderId && targetOrderId !== claim.order_id) {
                    const oldOrderId = claim.order_id;
                    await supabaseAdmin
                      .from('returns_exchanges')
                      .update({ order_id: targetOrderId })
                      .eq('id', claim.id);
                    addLog(`  ✅ Reclamo re-vinculado con éxito.`);
                    if (currentLegacyCode.startsWith("ORIG-")) {
                      await supabaseAdmin.from('orders').delete().eq('id', oldOrderId);
                      addLog(`  🗑 Eliminado pedido temporal obsoleto: ${currentLegacyCode}`);
                    }
                  }
                }
              }
            }
          }
        }

      }

      addLog(`Pedido ${orderCode} procesado con éxito.`);
    }

    return NextResponse.json({
      success: true,
      logs,
      totalImported,
      totalUpdated,
      totalItemsImported
    });

  } catch (error: any) {
    console.error('[API Import Sheet] Error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
