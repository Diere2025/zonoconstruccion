interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getCredentials(): ServiceAccountCredentials | null {
  // 1. Try raw JSON from environment variable
  const rawEnvJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CREDENTIALS_JSON;
  if (rawEnvJson) {
    try {
      return JSON.parse(rawEnvJson);
    } catch (e) {
      console.error('[GoogleSheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', e);
    }
  }

  // 2. Try individual env vars
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID || 'cargapedidoszono',
      private_key_id: '',
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      client_id: '',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token'
    };
  }

  return null;
}

export async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const creds = getCredentials();
  if (!creds) {
    throw new Error('Google Service Account credentials not found (missing GOOGLE_SERVICE_ACCOUNT_KEY env var)');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encoder = new TextEncoder();
  const encHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encClaimSet = base64UrlEncode(encoder.encode(JSON.stringify(claimSet)));
  const signatureInput = `${encHeader}.${encClaimSet}`;

  const keyBuffer = pemToArrayBuffer(creds.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signature = base64UrlEncode(sigBuffer);
  const jwt = `${signatureInput}.${signature}`;

  const bodyParams = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString()
  });

  const data = await res.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600);
    return data.access_token;
  }

  throw new Error(`OAuth2 token error: ${JSON.stringify(data)}`);
}

export async function fetchSpreadsheetValues(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const token = await getGoogleAccessToken();
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Sheets API error: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json.values || [];
}

export async function fetchSpreadsheetCsv(
  urlOrId: string,
  options?: { gid?: string | number; sheet?: string }
): Promise<string> {
  const token = await getGoogleAccessToken();
  let spreadsheetId = urlOrId.trim();
  let gid = options?.gid;
  let sheet = options?.sheet;

  if (urlOrId.includes('docs.google.com/spreadsheets/d/')) {
    const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      spreadsheetId = match[1];
    }
    try {
      const parsedUrl = new URL(urlOrId);
      if (gid === undefined && parsedUrl.searchParams.has('gid')) {
        gid = parsedUrl.searchParams.get('gid')!;
      }
      if (sheet === undefined && parsedUrl.searchParams.has('sheet')) {
        sheet = parsedUrl.searchParams.get('sheet')!;
      }
    } catch {
      // Not a full URL with scheme, continue
    }
  }

  let fetchUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  if (gid !== undefined && gid !== null && gid !== '') {
    fetchUrl += `&gid=${gid}`;
  }
  if (sheet) {
    fetchUrl += `&sheet=${encodeURIComponent(sheet)}`;
  }

  const res = await fetch(fetchUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Sheets fetch error (${res.status}): ${errorText}`);
  }

  return await res.text();
}

export interface SheetOrderItem {
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
}

export interface SheetOrderPayload {
  deliveryDate?: string;
  orderDate?: string;
  maxDeliveryDate?: string;
  clientName: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  whaticketLink?: string;
  source?: string;
  deliveryNotes?: string;
  medium?: string;
  sellerName?: string;
  status?: string;
  locality?: string;
  address?: string;
  mapsLink?: string;
  category?: string;
  paymentMethod?: string;
  identification?: string;
  paymentStatus?: string;
  depositOrPaidAmount?: number;
  freightType?: string;
  freightCost?: number;
  items?: SheetOrderItem[];
}

const VALID_SHEET_CATEGORIES = [
  'MEP',
  'LATEX',
  'ROLLO MEMBRANA',
  'TANQUES',
  'BIODIGESTOR',
  'BASE',
  'OTRO',
  'ESCALERAS',
  'COLOMBRARO',
  'HERRAMIENTAS ELÉCTRICAS',
  'TERMOTANQUES',
  'INSTALACIÓN BIOFORT'
];

function normalizeCategoryForSheet(cat?: string | null): string {
  if (!cat) return 'OTRO';
  const c = cat.toUpperCase().trim();
  if (VALID_SHEET_CATEGORIES.includes(c)) return c;
  if (c.includes('TERMO')) return 'TERMOTANQUES';
  if (c.includes('INSTALACI')) return 'INSTALACIÓN BIOFORT';
  if (c.includes('BIO')) return 'BIODIGESTOR';
  if (c.includes('BASE')) return 'BASE';
  if (c.includes('TANQUE')) return 'TANQUES';
  if (c.includes('ROLLO') || c.includes('ASFALT') || c.includes('MEMBRANA')) return 'ROLLO MEMBRANA';
  if (c.includes('LATEX') || c.includes('LÁTEX') || c.includes('PINTUR')) return 'LATEX';
  if (c.includes('MEP')) return 'MEP';
  if (c.includes('ESCALERA')) return 'ESCALERAS';
  if (c.includes('COLOMBRARO')) return 'COLOMBRARO';
  if (c.includes('HERRAMIENT') || c.includes('ELECTR') || c.includes('ELÉCTR')) return 'HERRAMIENTAS ELÉCTRICAS';
  return 'OTRO';
}

function normalizeFreightForSheet(freight?: string | null): string {
  if (!freight) return '⚪ Flete Regular';
  const f = freight.toLowerCase();
  if (f.includes('express') || f.includes('🟢')) return '🟢 Flete Express';
  if (f.includes('particular') || f.includes('🟡')) return '🟡 Flete Día Particular';
  if (f.includes('zonal') || f.includes('🔵') || f.includes('plata') || f.includes('caba') || f.includes('zárate') || f.includes('zarate') || f.includes('escobar') || f.includes('cañuelas') || f.includes('varela') || f.includes('pilar') || f.includes('microcentro')) {
    return '🔵 Flete Zonal';
  }
  return '⚪ Flete Regular';
}

function normalizeProductNameForSheet(name: string, sku?: string): string {
  const lowerName = (name || '').toLowerCase();
  const lowerSku = (sku || '').toLowerCase();

  // 1. If it's a base, map to the exact dropdown string in DATABASE!A:A
  if (lowerName.includes('base') || lowerSku.includes('base')) {
    if (lowerName.includes('74') || lowerSku.includes('74')) return 'Base Hierro Reforzada 74 cms';
    if (lowerName.includes('85') || lowerSku.includes('85')) return 'Base Hierro Reforzada 85 cms';
    if (lowerName.includes('102') || lowerSku.includes('102')) return 'Base Hierro Reforzada 102 cms';
    if (lowerName.includes('145') || lowerSku.includes('145')) return 'Base Hierro Reforzada 145 cms';
    if (sku && !sku.startsWith('AUTO-')) return sku;
  }

  // 2. If it's Flotante Eco Varilla Plástica 1/2", ensure quotes are preserved/added
  if (lowerName.includes('flotante') && lowerName.includes('eco') && (lowerName.includes('1/2') || lowerSku.includes('1/2'))) {
    return 'Flotante Eco Varilla Plástica 1/2"';
  }

  // 3. If it's TurboFlex with quotes
  if (lowerName.includes('turboflex') && lowerName.includes('40cm')) {
    return 'TurboFlex 3/4" x 40cm con rosca normal - Macho fijo';
  }
  if (lowerName.includes('turboflex') && lowerName.includes('60cm')) {
    return 'TurboFlex 3/4" x 60cm con rosca normal - Macho fijo';
  }

  return name;
}

function normalizeSellerNameForSheet(sellerName?: string | null): string {
  if (!sellerName) return '';
  const trimmed = sellerName.trim();
  // Matchear 'Jazmín Sánchez' de la BD a 'Jazmín Sanchez' para planilla (sin acento en la 'á')
  if (/^jazm[ií]n\s+s[aá]nchez$/i.test(trimmed)) {
    return 'Jazmín Sanchez';
  }
  return trimmed;
}

const PRODUCT_SLOT_RANGES: [string, string][] = [
  ['AE', 'AG'],
  ['AI', 'AK'],
  ['AM', 'AO'],
  ['AQ', 'AS'],
  ['AU', 'AW'],
  ['AY', 'BA'],
  ['BC', 'BE'],
  ['BG', 'BI'],
  ['BK', 'BM'],
  ['BO', 'BQ'],
  ['BS', 'BU'],
  ['BW', 'BY']
];

function formatDateForSheet(val?: string | null): string {
  if (!val) return '';
  const clean = val.split('T')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [yyyy, mm, dd] = clean.split('-');
    return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}`;
  }
  return clean;
}

export async function getNextAvailableSheetCode(
  spreadsheetId: string,
  sheetName: string = 'Pendientes'
): Promise<{ code: string; rowNumber: number }> {
  // Fetch columns B to F (all rows dynamically)
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!B2:F`);
  let emptyRowIndex = -1;
  let code = '';
  let lastKnownCode = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const currentCode = (row[0] || '').trim();
    const clientName = (row[4] || '').trim();

    if (currentCode) {
      lastKnownCode = currentCode;
    }

    // Row is considered available if client name (Col F, index 4) is empty
    if (!clientName) {
      emptyRowIndex = i;
      code = currentCode;
      break;
    }
  }

  // Row number in 1-based index (row 2 is index 0)
  const rowNumber = emptyRowIndex !== -1 ? emptyRowIndex + 2 : rows.length + 2;

  if (!code) {
    if (lastKnownCode) {
      const match = lastKnownCode.match(/^([A-Za-z-]+)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const numStr = match[2];
        const nextNum = parseInt(numStr, 10) + 1;
        code = `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
      } else {
        code = `DB${String(rowNumber).padStart(4, '0')}`;
      }
    } else {
      code = `DB${String(rowNumber).padStart(4, '0')}`;
    }
  }

  return { code, rowNumber };
}

export async function appendOrderToSellerSheet(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  order: SheetOrderPayload
): Promise<{ success: boolean; code: string; codes: string[]; rowNumber: number }> {
  const token = await getGoogleAccessToken();

  const allItems = order.items && order.items.length > 0 ? order.items : [];
  const chunkSize = PRODUCT_SLOT_RANGES.length; // 12
  const itemChunks: SheetOrderItem[][] = [];

  if (allItems.length === 0) {
    itemChunks.push([]);
  } else {
    for (let i = 0; i < allItems.length; i += chunkSize) {
      itemChunks.push(allItems.slice(i, i + chunkSize));
    }
  }

  const assignedCodes: string[] = [];
  let firstRowNumber = 0;

  for (let chunkIdx = 0; chunkIdx < itemChunks.length; chunkIdx++) {
    const chunk = itemChunks[chunkIdx];
    const isFirstChunk = chunkIdx === 0;

    const { code, rowNumber } = await getNextAvailableSheetCode(spreadsheetId, sheetName);
    if (isFirstChunk) {
      firstRowNumber = rowNumber;
    }
    assignedCodes.push(code);

    const formattedDeliveryDate = formatDateForSheet(order.deliveryDate);
    const formattedOrderDate = formatDateForSheet(order.orderDate);
    const formattedMaxDeliveryDate = formatDateForSheet(order.maxDeliveryDate);

    // If second chunk, append continuation note and don't duplicate freight/deposit
    const notes = isFirstChunk 
      ? (order.deliveryNotes || '')
      : (order.deliveryNotes ? `${order.deliveryNotes} (Continuación pedido ${assignedCodes[0]})` : `(Continuación pedido ${assignedCodes[0]})`);
    const depositAmount = isFirstChunk ? (order.depositOrPaidAmount ?? 0) : 0;
    const freightCost = isFirstChunk ? (order.freightCost ?? 0) : 0;
    const paymentStatus = isFirstChunk ? (order.paymentStatus || 'No Abonado') : 'Abonado';

    const batchData: Array<{ range: string; values: any[][] }> = [
      {
        range: `'${sheetName}'!C${rowNumber}:E${rowNumber}`,
        values: [[formattedDeliveryDate, formattedOrderDate, formattedMaxDeliveryDate]]
      },
      {
        range: `'${sheetName}'!F${rowNumber}:H${rowNumber}`,
        values: [[order.clientName || '', order.phonePrimary || '', order.phoneSecondary || '']]
      },
      {
        range: `'${sheetName}'!I${rowNumber}:K${rowNumber}`,
        values: [[order.whaticketLink || '', order.source || '', notes]]
      },
      {
        range: `'${sheetName}'!L${rowNumber}:M${rowNumber}`,
        values: [[order.medium || '', normalizeSellerNameForSheet(order.sellerName)]]
      },
      {
        range: `'${sheetName}'!Q${rowNumber}:T${rowNumber}`,
        values: [[(order.status === 'En Espera') ? 'En Espera' : '🔸 Validado', order.locality || '', order.address || '', order.mapsLink || '']]
      },
      {
        range: `'${sheetName}'!U${rowNumber}:W${rowNumber}`,
        values: [[normalizeCategoryForSheet(order.category), order.paymentMethod || '', order.identification || '']]
      },
      {
        range: `'${sheetName}'!X${rowNumber}:Y${rowNumber}`,
        values: [[paymentStatus, depositAmount]]
      },
      {
        range: `'${sheetName}'!AA${rowNumber}:AB${rowNumber}`,
        values: [[normalizeFreightForSheet(order.freightType), freightCost]]
      }
    ];

    for (let i = 0; i < chunk.length; i++) {
      const item = chunk[i];
      const [startCol, endCol] = PRODUCT_SLOT_RANGES[i];
      const finalProdName = normalizeProductNameForSheet(item.name, item.sku);
      batchData.push({
        range: `'${sheetName}'!${startCol}${rowNumber}:${endCol}${rowNumber}`,
        values: [[finalProdName, item.quantity || 1, item.unitPrice || 0]]
      });
    }

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: batchData
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Google Sheets batchUpdate error (${updateRes.status}): ${errText}`);
    }
  }

  const finalCode = assignedCodes.join(' / ');

  return {
    success: true,
    code: finalCode,
    codes: assignedCodes,
    rowNumber: firstRowNumber
  };
}

