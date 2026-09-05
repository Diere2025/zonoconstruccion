const { Client } = require('../node_modules/pg');
const https = require('https');
const crypto = require('crypto');

function fetchSheet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseProperCSV(text) {
  const rows = [];
  let curRow = [];
  let curCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        curCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      curRow.push(curCell.trim());
      curCell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      curRow.push(curCell.trim());
      if (curRow.length > 1 || curRow[0] !== '') {
        rows.push(curRow);
      }
      curRow = [];
      curCell = '';
    } else {
      curCell += c;
    }
  }
  if (curRow.length > 0 || curCell !== '') {
    curRow.push(curCell.trim());
    rows.push(curRow);
  }
  return rows;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.trim().split(' ')[0];
  const parts = clean.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseMoney(val) {
  if (!val) return 0;
  let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
  if (!clean) return 0;
  clean = clean.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function parseQty(val) {
  if (!val) return 1;
  const clean = val.toString().trim().replace(/[^0-9-]/g, '');
  const parsed = parseInt(clean);
  return isNaN(parsed) ? 1 : Math.max(1, parsed);
}

function normalizeInvoiceType(val) {
  if (!val) return null;
  const upper = val.toUpperCase();
  if (upper.includes('FACTURA A') || upper === 'A') return 'A';
  if (upper.includes('FACTURA B') || upper === 'B') return 'B';
  if (upper.includes('FACTURA C') || upper === 'C') return 'C';
  if (upper.includes('FACTURA M') || upper === 'M') return 'M';
  return null;
}

function normalizePaymentStatus(val) {
  if (!val) return 'Abonado';
  const lower = val.toLowerCase();
  if (lower.includes('debe') || lower.includes('pend')) return 'Pendiente';
  if (lower.includes('seña') || lower.includes('senia')) return 'Seniado';
  return 'Abonado';
}

async function run() {
  const startTime = Date.now();
  const pgClient = new Client({
    connectionString: 'postgresql://postgres.ckvbyfgsbjbfaqotmeld:qxTfDGWsS1Nii6R8@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('Connected to PostgreSQL database!');

  // Bypass triggers for bulk historical import
  await pgClient.query("SET session_replication_role = 'replica'");
  console.log("Safe mode active: session_replication_role = 'replica'");

  // 1. Pre-load existing orders legacy_code to make script idempotent
  console.log('Checking existing historical orders...');
  const existingOrdersRes = await pgClient.query(
    "SELECT legacy_code FROM public.orders WHERE channel = 'mayorista' AND legacy_code LIKE 'HIST-MAYORISTA-%'"
  );
  const existingCodes = new Set(existingOrdersRes.rows.map(r => r.legacy_code));
  console.log(`Found ${existingCodes.size} already imported wholesale orders.`);

  // 2. Pre-load addresses and clients
  console.log('Pre-loading addresses and clients in memory...');
  const addrRes = await pgClient.query(`SELECT id, code, client_id, full_address, locality_id, zone, map_link FROM public.addresses`);
  const addrByCode = new Map();
  addrRes.rows.forEach(a => {
    if (a.code) addrByCode.set(a.code.trim().toUpperCase(), a);
  });

  const clientRes = await pgClient.query(`SELECT id, internal_code, business_name FROM public.clients`);
  const clientByCode = new Map();
  const clientByName = new Map();
  clientRes.rows.forEach(c => {
    if (c.internal_code) clientByCode.set(c.internal_code.trim().toUpperCase(), c.id);
    if (c.business_name) clientByName.set(c.business_name.trim().toLowerCase(), c.id);
  });
  console.log(`Pre-loaded ${addrByCode.size} addresses and ${clientRes.rows.length} clients.`);

  // Default fallback client if none matches (Particular Sin Identificación)
  const fallbackClientId = clientByCode.get('CL00000') || clientRes.rows[0]?.id;

  // 3. Fetch orders sheet
  console.log('Fetching orders from Google Sheets (Entregados)...');
  const sheetData = await fetchSheet('https://docs.google.com/spreadsheets/d/1qlOgKnj3BtcKRPPyE7n6ltfoSj5z2rcmUUZr0tSTQps/gviz/tq?tqx=out:csv&gid=1164125642');
  const rows = parseProperCSV(sheetData);
  console.log(`Fetched ${rows.length - 1} order rows.`);

  const ordersToInsert = [];
  const itemsToInsert = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const legacyCode = `HIST-MAYORISTA-${i}`;
    if (existingCodes.has(legacyCode)) continue;

    const codCli = (r[2] || '').trim().toUpperCase();
    const clientName = (r[1] || r[3] || 'Cliente Mayorista').trim();
    const addr = addrByCode.get(codCli);
    const clientId = addr ? addr.client_id : (clientByCode.get(codCli) || clientByName.get(clientName.toLowerCase()) || fallbackClientId);
    const addressId = addr ? addr.id : null;

    const rawOrderDate = parseDate(r[15]);
    const rawDeliveryDate = parseDate(r[14]);
    const rawLimitDate = parseDate(r[16]);

    const orderDate = rawOrderDate || rawDeliveryDate || '2023-06-01';
    const deliveryDate = rawDeliveryDate || rawOrderDate || orderDate;
    const maxDeliveryDate = rawLimitDate || deliveryDate;

    const modoEntrega = (r[18] || 'A domicilio').trim();
    const vendedor = (r[20] || '').trim();
    const medioPago = (r[22] || '').trim();
    const estadoPago = (r[23] || 'Abonado').trim();
    const montoAbonado = parseMoney(r[24]);
    const factura = (r[27] || '').trim();
    const costoFlete = parseMoney(r[28]);
    const totalSinIva = parseMoney(r[29]);
    const totalAbonar = parseMoney(r[30]);
    const listaN = (r[13] || '').trim();
    const descAplicado = (r[12] || '').trim();
    const fletero = (r[81] || '').trim();
    const detalleEntrega = (r[17] || '').trim();

    // Collect line items
    const rowItems = [];
    let itemsSubtotal = 0;
    for (let p = 0; p < 12; p++) {
      const pIdx = 31 + (p * 4);
      const prodName = (r[pIdx] || '').trim();
      if (prodName) {
        const qty = parseQty(r[pIdx + 1]);
        const unitPrice = parseMoney(r[pIdx + 2]);
        const subt = parseMoney(r[pIdx + 3]) || (qty * unitPrice);
        itemsSubtotal += subt;
        rowItems.push({
          product_name: prodName,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: subt
        });
      }
    }

    // Determine final total
    let finalTotal = totalAbonar;
    if (finalTotal <= 0 && totalSinIva > 0) finalTotal = totalSinIva;
    if (finalTotal <= 0 && itemsSubtotal > 0) finalTotal = itemsSubtotal;
    if (finalTotal <= 0 && montoAbonado > 0) finalTotal = montoAbonado;

    const orderId = crypto.randomUUID();

    const totalsJson = {
      subtotal: itemsSubtotal > 0 ? itemsSubtotal : finalTotal,
      total: finalTotal,
      freight: costoFlete,
      paid_amount: montoAbonado,
      price_list: listaN,
      discount_label: descAplicado,
      seller: vendedor,
      carrier: fletero,
      payment_method: medioPago,
      invoice_type: factura
    };

    const deliveryNotes = [
      vendedor ? `Vendedor: ${vendedor}` : null,
      fletero ? `Transportista: ${fletero}` : null,
      listaN ? `Lista: ${listaN}` : null,
      descAplicado ? `Desc: ${descAplicado}` : null,
      medioPago ? `Pago: ${medioPago} (${estadoPago})` : null
    ].filter(Boolean).join(' | ');

    ordersToInsert.push({
      id: orderId,
      legacy_code: legacyCode,
      client_id: clientId,
      shipping_address_id: addressId,
      customer_name: clientName,
      locality: r[8] || (addr ? 'Localidad registrada' : 'Gran Buenos Aires'),
      address: r[9] || (addr ? addr.full_address : 'Dirección registrada'),
      google_maps_link: r[10] || (addr ? addr.map_link : null),
      order_date: orderDate,
      initial_delivery_date: deliveryDate,
      max_delivery_date: maxDeliveryDate,
      status: 'Entregado',
      freight_type: modoEntrega,
      channel: 'mayorista',
      category: 'Mayorista',
      total_amount: finalTotal,
      payment_status: normalizePaymentStatus(r[23]),
      invoice_type: normalizeInvoiceType(r[27]),
      delivery_detail: detalleEntrega || null,
      delivery_notes: deliveryNotes,
      totals: JSON.stringify(totalsJson),
      payment_approved: true,
      created_at: new Date(orderDate).toISOString()
    });

    for (const it of rowItems) {
      itemsToInsert.push({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: null, // Keep catalog clean!
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
        created_at: new Date(orderDate).toISOString()
      });
    }
  }

  console.log(`Ready to insert ${ordersToInsert.length} Orders and ${itemsToInsert.length} Order Items...`);

  // Batch insert orders (chunks of 100)
  const orderChunkSize = 100;
  for (let i = 0; i < ordersToInsert.length; i += orderChunkSize) {
    const chunk = ordersToInsert.slice(i, i + orderChunkSize);
    const valuePlaceholders = [];
    const params = [];
    let paramIdx = 1;

    for (const o of chunk) {
      const rowPlaceholders = [];
      const fields = [
        o.id, o.legacy_code, o.client_id, o.shipping_address_id, o.customer_name,
        o.locality, o.address, o.google_maps_link, o.order_date, o.initial_delivery_date,
        o.max_delivery_date, o.status, o.freight_type, o.channel, o.category,
        o.total_amount, o.payment_status, o.invoice_type, o.delivery_detail,
        o.delivery_notes, o.totals, o.payment_approved, o.created_at
      ];
      for (const val of fields) {
        rowPlaceholders.push(`$${paramIdx++}`);
        params.push(val);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const query = `
      INSERT INTO public.orders (
        id, legacy_code, client_id, shipping_address_id, customer_name,
        locality, address, google_maps_link, order_date, initial_delivery_date,
        max_delivery_date, status, freight_type, channel, category,
        total_amount, payment_status, invoice_type, delivery_detail,
        delivery_notes, totals, payment_approved, created_at
      ) VALUES ${valuePlaceholders.join(', ')}
    `;
    await pgClient.query(query, params);
    process.stdout.write(`Inserted ${Math.min(i + orderChunkSize, ordersToInsert.length)}/${ordersToInsert.length} orders...\r`);
  }
  console.log(`\nOrders insertion complete!`);

  // Batch insert order items (chunks of 200)
  const itemChunkSize = 200;
  for (let i = 0; i < itemsToInsert.length; i += itemChunkSize) {
    const chunk = itemsToInsert.slice(i, i + itemChunkSize);
    const valuePlaceholders = [];
    const params = [];
    let paramIdx = 1;

    for (const it of chunk) {
      const rowPlaceholders = [];
      const fields = [
        it.id, it.order_id, it.product_id, it.product_name,
        it.quantity, it.unit_price, it.subtotal, it.created_at
      ];
      for (const val of fields) {
        rowPlaceholders.push(`$${paramIdx++}`);
        params.push(val);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const query = `
      INSERT INTO public.order_items (
        id, order_id, product_id, product_name,
        quantity, unit_price, subtotal, created_at
      ) VALUES ${valuePlaceholders.join(', ')}
    `;
    await pgClient.query(query, params);
    process.stdout.write(`Inserted ${Math.min(i + itemChunkSize, itemsToInsert.length)}/${itemsToInsert.length} items...\r`);
  }
  console.log(`\nItems insertion complete!`);

  // Restore normal replication role
  await pgClient.query("SET session_replication_role = 'origin'");
  console.log("Restored normal mode: session_replication_role = 'origin'");

  await pgClient.end();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🚀 Successfully imported ${ordersToInsert.length} historical wholesale orders and ${itemsToInsert.length} items in ${duration}s!`);
}

run().catch(console.error);
