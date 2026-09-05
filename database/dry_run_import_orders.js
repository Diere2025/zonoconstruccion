const { Client } = require('d:/GitHub/zonoconstruccion/node_modules/pg');
const https = require('https');

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

async function run() {
  const pgClient = new Client({
    connectionString: 'postgresql://postgres.ckvbyfgsbjbfaqotmeld:qxTfDGWsS1Nii6R8@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  console.log('Pre-loading addresses and clients from DB...');
  const addrRes = await pgClient.query(`SELECT id, code, client_id, full_address, locality_id FROM public.addresses`);
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

  console.log(`Indexed ${addrByCode.size} addresses and ${clientRes.rows.length} clients.`);

  // Load orders from sheet
  console.log('Fetching orders from sheet...');
  const data = await fetchSheet('https://docs.google.com/spreadsheets/d/1qlOgKnj3BtcKRPPyE7n6ltfoSj5z2rcmUUZr0tSTQps/gviz/tq?tqx=out:csv&gid=1164125642');
  const rows = parseProperCSV(data);
  console.log(`Fetched ${rows.length - 1} order rows.`);

  let matchedAddress = 0;
  let matchedClientOnly = 0;
  let unmatched = 0;
  let validDates = 0;
  let totalItemsToCreate = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const codCli = (r[2] || '').trim().toUpperCase();
    const clientName = (r[1] || r[3] || '').trim();

    const addr = addrByCode.get(codCli);
    let clientId = addr ? addr.client_id : (clientByCode.get(codCli) || clientByName.get(clientName.toLowerCase()));

    if (addr) {
      matchedAddress++;
    } else if (clientId) {
      matchedClientOnly++;
    } else {
      unmatched++;
    }

    const orderDate = parseDate(r[15]) || parseDate(r[14]) || '2023-06-01';
    if (orderDate) validDates++;

    for (let p = 0; p < 12; p++) {
      const pIdx = 31 + (p * 4);
      if (r[pIdx] && r[pIdx].trim()) {
        totalItemsToCreate++;
      }
    }
  }

  console.log('\n=== DRY RUN SUMMARY ===');
  console.log(`Matched to exact Address/Branch: ${matchedAddress} (${((matchedAddress/(rows.length-1))*100).toFixed(1)}%)`);
  console.log(`Matched to Parent Client: ${matchedClientOnly} (${((matchedClientOnly/(rows.length-1))*100).toFixed(1)}%)`);
  console.log(`Total Matched: ${matchedAddress + matchedClientOnly} (${(((matchedAddress + matchedClientOnly)/(rows.length-1))*100).toFixed(1)}%)`);
  console.log(`Unmatched (Generic / Particular): ${unmatched}`);
  console.log(`Valid Order Dates: ${validDates}`);
  console.log(`Total Order Items to Create: ${totalItemsToCreate}`);

  await pgClient.end();
}
run().catch(console.error);
