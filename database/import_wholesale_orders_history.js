const { Client } = require('../node_modules/pg');
const https = require('https');
const crypto = require('crypto');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
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
      if (inQuotes && next === '"') { curCell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      curRow.push(curCell.trim());
      curCell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      curRow.push(curCell.trim());
      if (curRow.length > 1 || curRow[0] !== '') rows.push(curRow);
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
    if (year.length === 4 && !isNaN(parseInt(year)) && !isNaN(parseInt(month)) && !isNaN(parseInt(day))) {
      const d = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
      if (!isNaN(d.getTime())) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  return null;
}

function safeIsoDate(dStr) {
  try {
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  return new Date('2023-06-01T12:00:00.000Z').toISOString();
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

function normalizeKey(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  // Pre-load addresses
  console.log('Pre-loading addresses, clients, sellers and products...');
  const addrRes = await pgClient.query(`SELECT id, code, client_id, full_address, locality_id, zone, map_link FROM public.addresses`);
  const addrByCode = new Map();
  addrRes.rows.forEach(a => {
    if (a.code) addrByCode.set(a.code.trim().toUpperCase(), a);
  });

  // Pre-load clients
  const clientRes = await pgClient.query(`SELECT id, internal_code, business_name FROM public.clients`);
  const clientByCode = new Map();
  const clientByName = new Map();
  clientRes.rows.forEach(c => {
    if (c.internal_code) clientByCode.set(c.internal_code.trim().toUpperCase(), c.id);
    if (c.business_name) clientByName.set(normalizeKey(c.business_name), c.id);
  });
  const fallbackClientId = clientByCode.get('CL00000') || clientRes.rows[0]?.id;

  // Pre-load sellers
  const sellersRes = await pgClient.query("SELECT id, full_name, role, seller_type FROM public.sellers");
  const sellerMap = new Map();
  sellersRes.rows.forEach(s => {
    const norm = normalizeKey(s.full_name);
    if (!sellerMap.has(norm) || s.role === 'seller') {
      sellerMap.set(norm, s.id);
    }
  });

  // Pre-load products
  const prodRes = await pgClient.query("SELECT id, sku, name FROM public.products");
  const prodMap = new Map();
  prodRes.rows.forEach(p => {
    if (p.sku) prodMap.set(normalizeKey(p.sku), p.id);
    if (p.name) prodMap.set(normalizeKey(p.name), p.id);
  });
  // Add known aliases
  const tacho500Id = prodMap.get(normalizeKey('Tacho Camara/Bio 500L')) || 'cbe4f09f-0a84-4cfd-8ec4-af459d4c0445';
  prodMap.set(normalizeKey('Tacho Camara/Bio 470L'), tacho500Id);
  prodMap.set(normalizeKey('Powerlit Camara Registro Lodos'), prodMap.get(normalizeKey('CR LODOS')));

  console.log(`Pre-loaded ${addrByCode.size} addresses, ${clientRes.rows.length} clients, ${sellersRes.rows.length} sellers, ${prodRes.rows.length} products.`);

  // Fetch full sheet (using export?format=csv to avoid filter truncations)
  console.log('Fetching orders from Google Sheets (Full Export)...');
  const exportUrl = 'https://docs.google.com/spreadsheets/d/1qlOgKnj3BtcKRPPyE7n6ltfoSj5z2rcmUUZr0tSTQps/export?format=csv&gid=1164125642';
  const sheetData = await fetchUrl(exportUrl);
  const rows = parseProperCSV(sheetData);
  console.log(`Fetched ${rows.length} total rows from sheet.`);

  const ordersToInsert = [];
  const itemsToInsert = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const clientName = (r[1] || r[3] || '').trim();
    const codCli = (r[2] || '').trim().toUpperCase();

    // Line items
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

        const normProd = normalizeKey(prodName);
        const matchedProdId = prodMap.get(normProd) || null;

        rowItems.push({
          product_id: matchedProdId,
          product_name: prodName,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: subt
        });
      }
    }

    if (!clientName && !codCli && rowItems.length === 0) {
      continue;
    }

    const legacyCode = `HIST-MAYORISTA-${i - 1}`;
    const addr = addrByCode.get(codCli);
    const clientId = addr ? addr.client_id : (clientByCode.get(codCli) || clientByName.get(normalizeKey(clientName)) || fallbackClientId);
    const addressId = addr ? addr.id : null;

    const rawOrderDate = parseDate(r[15]);
    const rawDeliveryDate = parseDate(r[14]);
    const rawLimitDate = parseDate(r[16]);

    const orderDate = rawOrderDate || rawDeliveryDate || '2023-06-01';
    const deliveryDate = rawDeliveryDate || rawOrderDate || orderDate;
    const maxDeliveryDate = rawLimitDate || deliveryDate;

    const modoEntrega = (r[18] || 'A domicilio').trim();
    const vendedor = (r[20] || '').trim();
    const sellerId = sellerMap.get(normalizeKey(vendedor)) || null;

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
      customer_name: clientName || 'Cliente Mayorista',
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
      seller_id: sellerId,
      total_amount: finalTotal,
      payment_status: normalizePaymentStatus(r[23]),
      invoice_type: normalizeInvoiceType(r[27]),
      delivery_detail: detalleEntrega || null,
      delivery_notes: deliveryNotes,
      totals: JSON.stringify(totalsJson),
      payment_approved: true,
      created_at: safeIsoDate(orderDate)
    });

    for (const it of rowItems) {
      itemsToInsert.push({
        id: crypto.randomUUID(),
        order_id: orderId,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
        created_at: safeIsoDate(orderDate)
      });
    }
  }

  console.log(`Prepared ${ordersToInsert.length} orders and ${itemsToInsert.length} items to insert.`);

  // Transaction with replica role
  console.log('Replacing existing HIST-MAYORISTA orders and inserting updated data...');
  await pgClient.query("SET session_replication_role = 'replica'");

  await pgClient.query('BEGIN');
  try {
    // Delete existing HIST-MAYORISTA items and orders
    console.log('Clearing old HIST-MAYORISTA orders and items...');
    await pgClient.query(`
      DELETE FROM public.order_items 
      WHERE order_id IN (SELECT id FROM public.orders WHERE channel = 'mayorista' AND legacy_code LIKE 'HIST-MAYORISTA-%')
    `);
    await pgClient.query(`
      DELETE FROM public.orders 
      WHERE channel = 'mayorista' AND legacy_code LIKE 'HIST-MAYORISTA-%'
    `);

    // Insert orders in batches of 100
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
          o.seller_id, o.total_amount, o.payment_status, o.invoice_type, o.delivery_detail,
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
          seller_id, total_amount, payment_status, invoice_type, delivery_detail,
          delivery_notes, totals, payment_approved, created_at
        ) VALUES ${valuePlaceholders.join(', ')}
      `;
      await pgClient.query(query, params);
      process.stdout.write(`Inserted ${Math.min(i + orderChunkSize, ordersToInsert.length)}/${ordersToInsert.length} orders...\r`);
    }
    console.log(`\nOrders insertion complete!`);

    // Insert order items in batches of 200
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
          it.quantity, it.unit_price, it.created_at
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
          quantity, unit_price, created_at
        ) VALUES ${valuePlaceholders.join(', ')}
      `;
      await pgClient.query(query, params);
      process.stdout.write(`Inserted ${Math.min(i + itemChunkSize, itemsToInsert.length)}/${itemsToInsert.length} items...\r`);
    }
    console.log(`\nItems insertion complete!`);

    await pgClient.query('COMMIT');
    console.log('Transaction committed successfully!');
  } catch (err) {
    await pgClient.query('ROLLBACK');
    console.error('Error during transaction, rolled back:', err);
    throw err;
  } finally {
    await pgClient.query("SET session_replication_role = 'origin'");
  }

  await pgClient.end();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🚀 Successfully imported ${ordersToInsert.length} historical wholesale orders and ${itemsToInsert.length} items in ${duration}s!`);
}

run().catch(console.error);
