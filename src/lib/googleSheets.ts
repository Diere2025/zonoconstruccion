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

  // 4. BioFort equipment normalization to exact DATABASE!A:A strings
  if (lowerName.includes('biodigestor') && !lowerName.includes('kit')) {
    if (lowerName.includes('500')) return 'BioFort - Biodigestor 500L';
    if (lowerName.includes('600')) return 'BioFort - Biodigestor 600L';
    if (lowerName.includes('750')) return 'BioFort - Biodigestor 750L';
    if (lowerName.includes('1000')) return 'BioFort - Biodigestor 1000L';
    if (lowerName.includes('3000')) return 'BioFort - Biodigestor 3000L';
  }
  if (lowerName.includes('autolimpiable') && lowerName.includes('700') && !lowerName.includes('kit')) {
    return 'BioFort - Autolimpiable 700L';
  }
  if (lowerName.includes('lodos')) {
    return 'BioFort - Registro Lodos';
  }
  if ((lowerName.includes('séptica') || lowerName.includes('septica')) && !lowerName.includes('kit')) {
    if (lowerName.includes('500')) return 'BioFort - Séptica 500L';
    if (lowerName.includes('600')) return 'BioFort - Séptica 600L';
    if (lowerName.includes('750')) return 'BioFort - Séptica 750L';
    if (lowerName.includes('1000')) return 'BioFort - Séptica 1000L';
    if (lowerName.includes('3000')) return 'BioFort - Séptica 3000L';
  }
  if (lowerName.includes('desengrasadora') && lowerName.includes('canasto')) {
    return 'WP - Camara Desengrasadora C/canasto';
  }
  if (lowerName.includes('cámara de inspección') || lowerName.includes('camara de inspeccion') || lowerName.includes('cii')) {
    return 'WP Kit cámara de inspección CII';
  }
  if (lowerName.includes('biolam')) {
    return 'Biolam - Concentrado Enzimático 500g';
  }
  if (lowerName.includes('lusqtoff') && lowerName.includes('lubricante')) {
    return 'Lusqtoff - Aerosol lubricante';
  }
  if (lowerName.includes('sombrero') && lowerName.includes('110')) {
    return 'Awaduct - Sombrero 110';
  }
  if (lowerName.includes('descuento combo biodigestor') || lowerName.includes('descuento combo bio')) {
    return 'Descuento Combo Biodigestor';
  }
  if (lowerName.includes('descuento') && lowerName.includes('bomba')) {
    return 'Descuento - Bombas';
  }
  if (lowerName.includes('descuento') && (lowerName.includes('mayorista') || lowerName.includes('general') || lowerName.includes('pedido') || lowerName.includes('compra'))) {
    return 'Descuento Compra Mayorista';
  }
  if (lowerName.includes('descuento') && lowerName.includes('mep')) {
    if (lowerName.includes('x12') || lowerName.includes('12')) return 'Descuento - MEP x12';
    if (lowerName.includes('x6') || lowerName.includes('6')) return 'Descuento - MEP x6';
    if (lowerName.includes('x3') || lowerName.includes('3')) return 'Descuento - MEP x3';
    if (lowerName.includes('x2') || lowerName.includes('2')) return 'Descuento - MEP x2';
  }

  return name;
}

export function buildSheetOrderItems(
  orderItems: Array<{
    id?: string;
    name?: string;
    product_name?: string;
    sku?: string;
    quantity?: number;
    customPrice?: number;
    unit_price?: number;
    price?: number;
    basePrice?: number;
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
  }>,
  orderDiscountAmount: number = 0,
  productsCatalog?: Array<{ id: string; price: number; name?: string; sku?: string }>
): SheetOrderItem[] {
  if (!orderItems || orderItems.length === 0) {
    if (orderDiscountAmount > 0) {
      return [{
        name: 'Descuento Compra Mayorista',
        sku: 'Descuento Compra Mayorista',
        quantity: 1,
        unitPrice: -Math.round(orderDiscountAmount)
      }];
    }
    return [];
  }

  const resultItems: SheetOrderItem[] = [];
  let bioFortSavings = 0;
  let mayoristaSavings = Math.max(0, orderDiscountAmount || 0);

  for (const item of orderItems) {
    const rawName = item.product_name || item.name || '';
    const rawSku = item.sku || '';
    const nameLower = rawName.toLowerCase();
    const skuLower = rawSku.toLowerCase();
    const qty = item.quantity || 1;
    const currentPrice = item.customPrice !== undefined ? item.customPrice : (item.unit_price !== undefined ? item.unit_price : 0);

    const isExplicitDiscount = nameLower.includes('descuento') || 
                               skuLower.includes('descuento') || 
                               nameLower.includes('bonificaci') || 
                               skuLower.includes('bonificaci') ||
                               currentPrice < 0;

    if (isExplicitDiscount) {
      // Si ya viene un "Descuento Combo Biodigestor" como ítem explícito, acumular su ahorro
      if (nameLower.includes('combo') && (nameLower.includes('bio') || nameLower.includes('biodigestor'))) {
        bioFortSavings += Math.abs(currentPrice) * qty;
        continue;
      }

      // Si ya viene un "Descuento Compra Mayorista" o "Descuento General", acumular al descuento mayorista
      if (nameLower.includes('mayorista') || nameLower.includes('general') || nameLower.includes('compra')) {
        mayoristaSavings += Math.abs(currentPrice) * qty;
        continue;
      }

      // Otras bonificaciones oficiales de planilla (MEP x2, x3, x6, x12, Bombas, Escaleras, etc.)
      resultItems.push({
        name: normalizeProductNameForSheet(rawName, rawSku),
        sku: rawSku || undefined,
        quantity: qty,
        unitPrice: -Math.abs(currentPrice)
      });
      continue;
    }

    // Para productos normales: determinar precio de lista
    let listPrice = (item.basePrice !== undefined && item.basePrice > 0) ? item.basePrice : 0;
    if (!listPrice && productsCatalog && productsCatalog.length > 0) {
      const found = productsCatalog.find(p => p.id === item.id || (item.sku && p.sku === item.sku) || (rawName && p.name === rawName));
      if (found && found.price) {
        listPrice = found.price;
      }
    }
    if (!listPrice) {
      listPrice = Math.max(0, currentPrice);
    }

    // Calcular ahorro si el producto tiene precio con descuento
    const priceDiff = listPrice - currentPrice;
    if (priceDiff > 0) {
      // Verificar si es parte de un combo BioFort (15% OFF en equipos y accesorios de saneamiento)
      const isBioComponent = nameLower.includes('biodigestor') || 
                             nameLower.includes('autolimpiable') || 
                             nameLower.includes('séptica') || 
                             nameLower.includes('septica') || 
                             nameLower.includes('lodos') || 
                             nameLower.includes('inspección') || 
                             nameLower.includes('inspeccion') || 
                             nameLower.includes('cii') || 
                             nameLower.includes('biolam') || 
                             nameLower.includes('desengrasadora') || 
                             nameLower.includes('desgrasadora');
      
      if (isBioComponent && item.discountValue === 15) {
        bioFortSavings += priceDiff * qty;
      } else {
        mayoristaSavings += priceDiff * qty;
      }
    }

    // En planilla SIEMPRE se registra el producto con su precio de lista
    resultItems.push({
      name: normalizeProductNameForSheet(rawName, rawSku),
      sku: rawSku || undefined,
      quantity: qty,
      unitPrice: listPrice
    });
  }

  // Si hay ahorro por Combo BioFort, agregar la línea consolidada 'Descuento Combo Biodigestor'
  if (bioFortSavings > 0) {
    resultItems.push({
      name: 'Descuento Combo Biodigestor',
      sku: 'Descuento Combo Biodigestor',
      quantity: 1,
      unitPrice: -Math.round(bioFortSavings)
    });
  }

  // Si hay ahorro negociado (al total del pedido o por productos personalizados), agregar 'Descuento Compra Mayorista'
  if (mayoristaSavings > 0) {
    resultItems.push({
      name: 'Descuento Compra Mayorista',
      sku: 'Descuento Compra Mayorista',
      quantity: 1,
      unitPrice: -Math.round(mayoristaSavings)
    });
  }

  return resultItems;
}

export function normalizeSellerNameForSheet(sellerName?: string | null): string {
  if (!sellerName) return '';
  const trimmed = sellerName.trim();
  if (/^jazm[ií]n(\s+s[aá]nchez)?$/i.test(trimmed)) {
    return 'Jazmin Sanchez';
  }
  if (/^ludmila(\s+krenz)?$/i.test(trimmed)) {
    return 'Ludmila Krenz';
  }
  if (/^facundo(\s+paz)?$/i.test(trimmed)) {
    return 'Facundo Paz';
  }
  if (/^diego(\s+b[oó]veda)?$/i.test(trimmed)) {
    return 'Diego Bóveda';
  }
  return trimmed;
}

const SPREADSHEET_DEFAULT_PREFIX: Record<string, string> = {
  '1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg': 'DB',
  '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw': 'JS',
  '1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8': 'LK',
  '1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns': 'AQ-FP'
};

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

export async function getNextAvailableSheetSlots(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  count: number = 1
): Promise<Array<{ code: string; rowNumber: number }>> {
  // Fetch columns B to F (all rows dynamically)
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!B2:F`);
  const results: Array<{ code: string; rowNumber: number }> = [];
  let lastAssignedNum = -1;
  let lastPrefix = '';
  let lastPadding = 4;

  const defaultPrefix = SPREADSHEET_DEFAULT_PREFIX[spreadsheetId] || 'DB';

  // 1. Scan rows to find existing codes and any free rows (Col F / client name empty)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const currentCode = (row[0] || '').trim();
    const clientName = (row[4] || '').trim();

    if (currentCode) {
      const match = currentCode.match(/^([A-Za-z-]+)(\d+)$/);
      if (match) {
        lastPrefix = match[1];
        lastAssignedNum = parseInt(match[2], 10);
        lastPadding = match[2].length;
      }
    }

    // A row is considered available if client name (Col F, index 4) is empty
    if (!clientName && results.length < count) {
      const rowNumber = i + 2;
      let slotCode = currentCode;
      if (!slotCode) {
        if (lastAssignedNum !== -1) {
          lastAssignedNum += 1;
          slotCode = `${lastPrefix || defaultPrefix}${String(lastAssignedNum).padStart(lastPadding, '0')}`;
        } else {
          slotCode = `${defaultPrefix}${String(rowNumber).padStart(4, '0')}`;
        }
      }
      results.push({ code: slotCode, rowNumber });
    }
  }

  // 2. If we still need more slots beyond existing rows
  let extraIndex = rows.length;
  while (results.length < count) {
    const rowNumber = extraIndex + 2;
    extraIndex++;
    let slotCode = '';
    if (lastAssignedNum !== -1) {
      lastAssignedNum += 1;
      slotCode = `${lastPrefix || defaultPrefix}${String(lastAssignedNum).padStart(lastPadding, '0')}`;
    } else {
      slotCode = `${defaultPrefix}${String(rowNumber).padStart(4, '0')}`;
    }
    results.push({ code: slotCode, rowNumber });
  }

  return results;
}

export async function getNextAvailableSheetCode(
  spreadsheetId: string,
  sheetName: string = 'Pendientes'
): Promise<{ code: string; rowNumber: number }> {
  const slots = await getNextAvailableSheetSlots(spreadsheetId, sheetName, 1);
  return slots[0] || { code: 'DB0001', rowNumber: 2 };
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

  // Obtener todos los slots y códigos de antemano para poder cruzarlos entre líneas hermanas
  const slots = await getNextAvailableSheetSlots(spreadsheetId, sheetName, itemChunks.length);
  const assignedCodes: string[] = slots.map(s => s.code);
  const firstRowNumber = slots[0]?.rowNumber || 2;
  const isMultiChunk = itemChunks.length > 1;

  for (let chunkIdx = 0; chunkIdx < itemChunks.length; chunkIdx++) {
    const chunk = itemChunks[chunkIdx];
    const isFirstChunk = chunkIdx === 0;
    const { code, rowNumber } = slots[chunkIdx];

    const formattedDeliveryDate = formatDateForSheet(order.deliveryDate);
    const formattedOrderDate = formatDateForSheet(order.orderDate);
    const formattedMaxDeliveryDate = formatDateForSheet(order.maxDeliveryDate);

    // Cuando se carga un pedido en 2 líneas (o más), expresar antes de las indicaciones:
    // "VA CON EL PEDIDO [Código pedido hermano]"
    const brotherCodes = assignedCodes.filter((_, idx) => idx !== chunkIdx);
    const brotherPrefix = (isMultiChunk && brotherCodes.length > 0)
      ? `VA CON EL PEDIDO ${brotherCodes.join(' / ')}`
      : '';

    // Limpiar notas de cualquier prefijo anterior
    let cleanNotes = (order.deliveryNotes || '').trim();
    cleanNotes = cleanNotes.replace(/\(Continuación pedido [^)]+\)/gi, '').trim();
    cleanNotes = cleanNotes.replace(/^VA CON EL PEDIDO\s+[A-Za-z0-9\-\/,\s]+?(\/|-|$)/i, '').trim();
    cleanNotes = cleanNotes.replace(/^[\/\-\s]+|[\/\-\s]+$/g, '').trim();

    let notes = cleanNotes;
    if (brotherPrefix) {
      notes = cleanNotes ? `${brotherPrefix} / ${cleanNotes}` : brotherPrefix;
    }

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
        values: [[order.whaticketLink || '', order.source || 'Publicidad Meta', notes]]
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

