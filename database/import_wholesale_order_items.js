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

async function run() {
  const startTime = Date.now();
  const pgClient = new Client({
    connectionString: 'postgresql://postgres.ckvbyfgsbjbfaqotmeld:qxTfDGWsS1Nii6R8@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('Connected to PostgreSQL database!');

  // Pre-load existing orders by legacy_code
  console.log('Loading orders mapping...');
  const ordersRes = await pgClient.query(`SELECT id, legacy_code, order_date FROM public.orders WHERE legacy_code LIKE 'HIST-MAYORISTA-%'`);
  const orderByLegacyCode = new Map();
  ordersRes.rows.forEach(o => {
    orderByLegacyCode.set(o.legacy_code, o);
  });
  console.log(`Loaded ${orderByLegacyCode.size} orders.`);

  // Load items from sheet
  console.log('Fetching sheet rows...');
  const sheetData = await fetchSheet('https://docs.google.com/spreadsheets/d/1qlOgKnj3BtcKRPPyE7n6ltfoSj5z2rcmUUZr0tSTQps/gviz/tq?tqx=out:csv&gid=1164125642');
  const rows = parseProperCSV(sheetData);

  const itemsToInsert = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const legacyCode = `HIST-MAYORISTA-${i}`;
    const order = orderByLegacyCode.get(legacyCode);
    if (!order) continue;

    const rawOrderDate = parseDate(r[15]) || parseDate(r[14]) || '2023-06-01';
    const createdAt = new Date(rawOrderDate).toISOString();

    for (let p = 0; p < 12; p++) {
      const pIdx = 31 + (p * 4);
      const prodName = (r[pIdx] || '').trim();
      if (prodName) {
        const qty = parseQty(r[pIdx + 1]);
        const unitPrice = parseMoney(r[pIdx + 2]);
        itemsToInsert.push({
          id: crypto.randomUUID(),
          order_id: order.id,
          product_id: null, // Keep catalog clean!
          product_name: prodName,
          quantity: qty,
          unit_price: unitPrice,
          created_at: createdAt
        });
      }
    }
  }

  console.log(`Ready to insert ${itemsToInsert.length} order items...`);

  // Bypass triggers
  await pgClient.query("SET session_replication_role = 'replica'");

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

  await pgClient.query("SET session_replication_role = 'origin'");
  console.log(`\nItems insertion complete!`);

  await pgClient.end();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`🚀 Successfully imported ${itemsToInsert.length} items in ${duration}s!`);
}

run().catch(console.error);
