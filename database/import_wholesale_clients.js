const { Client } = require('../node_modules/pg');
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

function parseSpanishNumber(val) {
  if (!val) return 1.0;
  let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
  if (!clean) return 1.0;
  clean = clean.replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 1.0 : parsed;
}

async function run() {
  const pgClient = new Client({
    connectionString: 'postgresql://postgres.ckvbyfgsbjbfaqotmeld:qxTfDGWsS1Nii6R8@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('Connected to PostgreSQL database!');

  // 1. Fetch Coef Map from Pedidos Sheet
  console.log('Fetching Coeficientes de Descuento...');
  const coefData = await fetchSheet('https://docs.google.com/spreadsheets/d/1qlOgKnj3BtcKRPPyE7n6ltfoSj5z2rcmUUZr0tSTQps/gviz/tq?tqx=out:csv&sheet=Coef');
  const coefRows = parseProperCSV(coefData);
  const coefMap = new Map();
  for (let i = 1; i < coefRows.length; i++) {
    const label = coefRows[i][0];
    const coefVal = coefRows[i][11]; // Col 12 (index 11)
    if (label && coefVal) {
      coefMap.set(label.trim().toLowerCase(), parseSpanishNumber(coefVal));
    }
  }
  console.log(`Loaded ${coefMap.size} discount coefficients.`);

  // 2. Fetch Clients from Mayorista BD Clientes
  console.log('Fetching Clientes from Mayorista BD Clientes...');
  const clientsData = await fetchSheet('https://docs.google.com/spreadsheets/d/1vp0GMuH8zwBLlvfI5DdYeA6EeWCAWIfTmlPWi9oWAZw/gviz/tq?tqx=out:csv&gid=0');
  const clientRows = parseProperCSV(clientsData);
  console.log(`Fetched ${clientRows.length - 1} rows.`);

  // Group by CódigoClienteÚnico
  const uniqueClientsMap = new Map();
  for (let i = 1; i < clientRows.length; i++) {
    const r = clientRows[i];
    const codDir = r[0];
    const clienteName = r[1];
    const rep = r[2];
    const tel1 = r[3];
    const tel2 = r[4];
    const zona = r[5];
    const loc = r[6];
    const dir = r[7];
    const map = r[8];
    const desc = r[9] || 'Sin Desc';
    const cuit = r[10] || '';
    const horario = r[12] || '';
    const codClienteUnico = r[13] || codDir;
    const tipo = r[14] || 'Mayorista';
    const estado = r[15] || 'Activo';

    if (!uniqueClientsMap.has(codClienteUnico)) {
      const coef = coefMap.get(desc.trim().toLowerCase()) || 1.0;
      uniqueClientsMap.set(codClienteUnico, {
        internal_code: codClienteUnico,
        business_name: clienteName,
        tax_id: cuit || null,
        phone_primary: tel1 || 'S/D',
        phone_secondary: tel2 || null,
        billing_address: dir || null,
        is_wholesale: tipo.toLowerCase().includes('mayor'),
        client_type: tipo || 'Mayorista',
        default_discount_label: desc,
        default_discount_coef: coef,
        notes: `Horario: ${horario} | Zona: ${zona} | Loc: ${loc}`,
        addresses: []
      });
    }

    uniqueClientsMap.get(codClienteUnico).addresses.push({
      code: codDir,
      name: clienteName,
      address: dir || 'S/D',
      locality: loc || null,
      zone: zona || null,
      google_maps_link: map || null,
      contact_name: rep || null,
      phone: tel1 || tel2 || null,
      schedule: horario || null
    });
  }

  console.log(`Ready to upsert ${uniqueClientsMap.size} Unique Clients...`);

  // 3. Upsert Clients into public.clients
  let insertedClients = 0;
  let updatedClients = 0;
  const clientIdByCode = new Map();

  for (const client of uniqueClientsMap.values()) {
    // Check if client already exists by internal_code or business_name
    const checkRes = await pgClient.query(
      `SELECT id FROM public.clients WHERE internal_code = $1 OR business_name = $2 LIMIT 1`,
      [client.internal_code, client.business_name]
    );

    let clientId;
    if (checkRes.rows.length > 0) {
      clientId = checkRes.rows[0].id;
      await pgClient.query(
        `UPDATE public.clients SET
          internal_code = $1,
          business_name = $2,
          tax_id = COALESCE(tax_id, $3),
          phone_primary = COALESCE(NULLIF(phone_primary, ''), $4),
          billing_address = COALESCE(billing_address, $5),
          is_wholesale = $6,
          client_type = $7,
          default_discount_label = $8,
          default_discount_coef = $9,
          notes = COALESCE(notes, $10)
        WHERE id = $11`,
        [
          client.internal_code,
          client.business_name,
          client.tax_id,
          client.phone_primary,
          client.billing_address,
          client.is_wholesale,
          client.client_type,
          client.default_discount_label,
          client.default_discount_coef,
          client.notes,
          clientId
        ]
      );
      updatedClients++;
    } else {
      const insRes = await pgClient.query(
        `INSERT INTO public.clients (
          internal_code, business_name, tax_id, phone_primary, phone_secondary,
          billing_address, is_wholesale, client_type, default_discount_label,
          default_discount_coef, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          client.internal_code,
          client.business_name,
          client.tax_id,
          client.phone_primary,
          client.phone_secondary,
          client.billing_address,
          client.is_wholesale,
          client.client_type,
          client.default_discount_label,
          client.default_discount_coef,
          client.notes
        ]
      );
      clientId = insRes.rows[0].id;
      insertedClients++;
    }

    clientIdByCode.set(client.internal_code, clientId);
  }

  console.log(`Clients processed: ${insertedClients} inserted, ${updatedClients} updated.`);

  // 4. Upsert Addresses into public.addresses
  console.log('Upserting Addresses/Branches...');
  let insertedAddresses = 0;
  let updatedAddresses = 0;

  for (const client of uniqueClientsMap.values()) {
    const parentId = clientIdByCode.get(client.internal_code);
    if (!parentId) continue;

    for (const addr of client.addresses) {
      const checkAddr = await pgClient.query(
        `SELECT id FROM public.addresses WHERE code = $1 OR (client_id = $2 AND address = $3) LIMIT 1`,
        [addr.code, parentId, addr.address]
      );

      if (checkAddr.rows.length > 0) {
        await pgClient.query(
          `UPDATE public.addresses SET
            client_id = $1,
            code = $2,
            name = $3,
            address = $4,
            locality = $5,
            zone = $6,
            google_maps_link = $7,
            contact_name = $8,
            phone = $9,
            schedule = $10
          WHERE id = $11`,
          [
            parentId,
            addr.code,
            addr.name,
            addr.address,
            addr.locality,
            addr.zone,
            addr.google_maps_link,
            addr.contact_name,
            addr.phone,
            addr.schedule,
            checkAddr.rows[0].id
          ]
        );
        updatedAddresses++;
      } else {
        await pgClient.query(
          `INSERT INTO public.addresses (
            client_id, code, name, address, locality, zone,
            google_maps_link, contact_name, phone, schedule
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            parentId,
            addr.code,
            addr.name,
            addr.address,
            addr.locality,
            addr.zone,
            addr.google_maps_link,
            addr.contact_name,
            addr.phone,
            addr.schedule
          ]
        );
        insertedAddresses++;
      }
    }
  }

  console.log(`Addresses processed: ${insertedAddresses} inserted, ${updatedAddresses} updated.`);
  await pgClient.end();
  console.log('Done!');
}

run().catch(console.error);
