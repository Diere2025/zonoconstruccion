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
let tokenRequestInFlight: Promise<string> | null = null;

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

  // Several sheet reads usually start together. Reuse the same OAuth request
  // instead of signing and exchanging one JWT per concurrent read.
  if (tokenRequestInFlight) {
    return tokenRequestInFlight;
  }

  tokenRequestInFlight = requestGoogleAccessToken(now);
  try {
    return await tokenRequestInFlight;
  } finally {
    tokenRequestInFlight = null;
  }
}

async function requestGoogleAccessToken(now: number): Promise<string> {

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

/**
 * Reads several ranges from the same spreadsheet in one Google Sheets request.
 * Results preserve the order of the requested ranges.
 */
export async function fetchSpreadsheetValueRanges(
  spreadsheetId: string,
  ranges: string[]
): Promise<string[][][]> {
  if (ranges.length === 0) return [];

  const token = await getGoogleAccessToken();
  const query = ranges
    .map((range) => `ranges=${encodeURIComponent(range)}`)
    .join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}&valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Sheets batch API error: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  const valueRanges = Array.isArray(json.valueRanges) ? json.valueRanges : [];
  return ranges.map((_, index) => valueRanges[index]?.values || []);
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
    },
    cache: 'no-store'
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

export { normalizeProductNameForSheet, VALID_SHEET_PRODUCTS } from './sheetProducts';
import { normalizeProductNameForSheet } from './sheetProducts';

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
    isIncludedInKit?: boolean;
    bundleParentId?: string;
  }>,
  orderDiscountAmount: number = 0,
  productsCatalog?: Array<{ id: string; price: number; name?: string; sku?: string }>
): SheetOrderItem[] {
  if (!orderItems || orderItems.length === 0) {
    return [];
  }

  const resultItems: SheetOrderItem[] = [];
  let totalDiscount = Math.max(0, orderDiscountAmount || 0);

  // Los renglones históricos de descuento se normalizan como un único ajuste
  // al final. El resto de los productos conserva su precio de lista.
  for (const item of orderItems) {
    const rawName = item.product_name || item.name || '';
    const rawSku = item.sku || '';
    const currentPrice = item.customPrice !== undefined ? item.customPrice : (item.unit_price !== undefined ? item.unit_price : 0);
    const isExplicitDiscount = rawName.toLowerCase().includes('descuento') ||
      rawSku.toLowerCase().includes('descuento') ||
      rawName.toLowerCase().includes('bonificaci') ||
      rawSku.toLowerCase().includes('bonificaci') ||
      currentPrice < 0;
    if (isExplicitDiscount) {
      totalDiscount += Math.abs(currentPrice) * Math.max(1, item.quantity || 1);
    }
  }

  // Detectar si el pedido contiene un Kit de Instalación
  const hasInstallationKit = orderItems.some(item => {
    const rawName = item.product_name || item.name || '';
    const rawSku = item.sku || '';
    const nameLower = rawName.toLowerCase();
    const skuLower = rawSku.toLowerCase();
    const isExplicitDiscount = nameLower.includes('descuento') || 
                               skuLower.includes('descuento') || 
                               nameLower.includes('bonificaci') || 
                               skuLower.includes('bonificaci');
    if (isExplicitDiscount) return false;
    return nameLower.includes('kit instalaci') || 
           nameLower.includes('kit de instalaci') || 
           skuLower.includes('kit instalaci') ||
           skuLower.includes('kit de instalaci') ||
           (nameLower.startsWith('kit ') && !nameLower.includes('herramienta'));
  });

  for (const item of orderItems) {
    const rawName = item.product_name || item.name || '';
    let rawSku = item.sku || '';

    // Resolver producto del catálogo usando product_id, id, sku o nombre
    const prodId = (item as any).product_id || item.id;
    const catalogProduct = (productsCatalog && productsCatalog.length > 0)
      ? productsCatalog.find(p => (prodId && p.id === prodId) || (rawSku && p.sku === rawSku) || (rawName && p.name === rawName))
      : undefined;

    // Si falta SKU o es automático AUTO-*, adoptar el SKU del catálogo
    if ((!rawSku || rawSku.startsWith('AUTO-')) && catalogProduct?.sku && !catalogProduct.sku.startsWith('AUTO-')) {
      rawSku = catalogProduct.sku;
    }

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
      // Se agrega una sola línea consolidada después de todos los productos.
      continue;
    }

    // Verificar si es un ítem incluido en un Kit de Instalación o producto bonificado a $0
    const isKitProduct = (nameLower.includes('kit instalaci') || nameLower.includes('kit de instalaci') || (nameLower.includes('kit') && nameLower.includes('instalaci'))) && !isExplicitDiscount;
    const isIncludedInKitOrZero = !isKitProduct && (
      Boolean(item.isIncludedInKit) || 
      Boolean(item.bundleParentId) || 
      currentPrice === 0 ||
      (hasInstallationKit && (item.basePrice === 0 || currentPrice === 0))
    );

    if (isIncludedInKitOrZero) {
      // En pedidos de instalaciones, los productos incluidos en el kit básico salen en $0
      // sin generar diferencias de precio de lista ni descuentos mayoristas.
      resultItems.push({
        name: normalizeProductNameForSheet(rawName, rawSku),
        sku: rawSku || undefined,
        quantity: qty,
        unitPrice: 0
      });
      continue;
    }

    // Con descuento general/mayorista, la planilla debe mostrar el precio de
    // lista y el ajuste por separado. Los descuentos propios de un producto o
    // combo siguen usando su precio neto cuando no hay descuento de pedido.
    let effectivePrice = currentPrice;
    if (totalDiscount > 0) {
      effectivePrice = item.basePrice ?? catalogProduct?.price ?? item.price ?? currentPrice;
    }
    if (effectivePrice === 0 && item.customPrice === undefined && item.unit_price === undefined) {
      effectivePrice = item.price ?? item.basePrice ?? catalogProduct?.price ?? 0;
    }
    resultItems.push({
      name: normalizeProductNameForSheet(rawName, rawSku),
      sku: rawSku || undefined,
      quantity: qty,
      unitPrice: Math.max(0, effectivePrice)
    });
  }

  if (totalDiscount > 0) {
    resultItems.push({
      name: 'Descuento Compra Mayorista',
      sku: 'DESCUENTO',
      quantity: 1,
      unitPrice: -Math.round(totalDiscount * 100) / 100
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

export function normalizeLocalityForSheet(locality?: string | null): string {
  if (!locality) return '';
  const trimmed = locality.trim();
  const lower = trimmed.toLowerCase();

  // Mapeos canónicos para coincidir exactamente con el desplegable DATABASE!P:P de la planilla
  if (lower === 'caballito') return 'Caballito (CABA)';
  if (lower === 'palermo') return 'Palermo (CABA)';
  if (lower === 'belgrano') return 'Belgrano (CABA)';
  if (lower === 'flores') return 'Flores (CABA)';
  if (lower === 'villa urquiza') return 'Villa Urquiza (CABA)';
  if (lower === 'recoleta') return 'Recoleta (CABA)';
  if (lower === 'devoto' || lower === 'villa devoto') return 'Villa Devoto (CABA)';
  if (lower === 'san telmo') return 'San Telmo (CABA)';
  if (lower === 'la plata centro') return 'La Plata';

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

export const CENTRAL_ORDERS_SHEET = {
  spreadsheetId: '1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0',
  sheetName: 'Central pedidos',
  codeColumn: 'B',
  columnOffset: 0
};

export const DELIVERIES_CURRENT_SHEET = {
  spreadsheetId: '1mESHu4klY3N1XBXVgFT_Q7ZwlLtiA8GTi5NCCFFboZs',
  // Los pedidos recién creados ingresan en "Vendedores". El resto se conserva
  // para que las modificaciones posteriores encuentren el pedido luego del ruteo.
  sheetNames: ['Vendedores', 'Nuevos', 'Pend', 'Entregando', 'SinStock/o pasar dia', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
  codeColumn: 'A',
  // Entregas Actual omite la primera columna de las planillas de pedidos.
  columnOffset: -1
};

export interface OperationalSheetSyncResult {
  success: boolean;
  sheetName?: string;
  rowNumber?: number;
  message?: string;
}

export interface OperationalSheetsSyncResult {
  central: OperationalSheetSyncResult;
  deliveriesCurrent: OperationalSheetSyncResult;
}

function shiftColumn(column: string, offset: number): string {
  let value = columnToNumber(column);
  value += offset;
  if (value < 1) throw new Error(`Desplazamiento inválido para la columna ${column}`);

  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function columnToNumber(column: string): number {
  let value = 0;
  for (const char of column) {
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value;
}

function makeRange(sheetName: string, startColumn: string, endColumn: string, rowNumber: number, columnOffset: number): string {
  return `'${sheetName}'!${shiftColumn(startColumn, columnOffset)}${rowNumber}:${shiftColumn(endColumn, columnOffset)}${rowNumber}`;
}

const CALCULATED_COLUMNS = ['Z', 'AC', 'AD', 'AH', 'AL', 'AP', 'AT', 'AX', 'BB', 'BF', 'BJ', 'BN', 'BR', 'BV', 'BZ'];

function buildCalculatedFormula(baseColumn: string, rowNumber: number, columnOffset: number): string {
  const column = shiftColumn(baseColumn, columnOffset);
  if (baseColumn === 'Z') {
    return `=IF(${shiftColumn('V', columnOffset)}${rowNumber}="";0;${shiftColumn('AC', columnOffset)}${rowNumber}*VLOOKUP(${shiftColumn('V', columnOffset)}${rowNumber};'BD Recargos'!$A:$B;2;FALSE))`;
  }
  if (baseColumn === 'AC') {
    return `=${['AH', 'AL', 'AP', 'AT', 'AX', 'BB', 'BF', 'BJ', 'BN', 'BR', 'BV', 'BZ'].map(item => `${shiftColumn(item, columnOffset)}${rowNumber}`).join('+')}`;
  }
  if (baseColumn === 'AD') {
    return `=${shiftColumn('AC', columnOffset)}${rowNumber}+${shiftColumn('Z', columnOffset)}${rowNumber}-${shiftColumn('Y', columnOffset)}${rowNumber}+${shiftColumn('AB', columnOffset)}${rowNumber}`;
  }
  return `=${shiftColumn(column, -2)}${rowNumber}*${shiftColumn(column, -1)}${rowNumber}`;
}

async function restoreMissingCalculatedFormulas(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  columnOffset: number,
  token: string
): Promise<void> {
  const firstColumn = shiftColumn('Z', columnOffset);
  const lastColumn = shiftColumn('BZ', columnOffset);
  const encodedRange = encodeURIComponent(`'${sheetName}'!${firstColumn}${rowNumber}:${lastColumn}${rowNumber}`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMULA`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error(`No se pudieron verificar fórmulas (${response.status})`);
  }

  const data = await response.json();
  const currentValues: string[] = data.values?.[0] || [];
  const firstColumnNumber = columnToNumber(firstColumn);
  const missingFormulas = CALCULATED_COLUMNS.flatMap(baseColumn => {
    const targetColumn = shiftColumn(baseColumn, columnOffset);
    const currentValue = currentValues[columnToNumber(targetColumn) - firstColumnNumber];
    if (typeof currentValue === 'string' && currentValue.startsWith('=')) return [];
    return [{
      range: `'${sheetName}'!${targetColumn}${rowNumber}`,
      values: [[buildCalculatedFormula(baseColumn, rowNumber, columnOffset)]]
    }];
  });

  if (missingFormulas.length === 0) return;
  const restoreResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: missingFormulas })
  });
  if (!restoreResponse.ok) {
    throw new Error(`No se pudieron restaurar fórmulas (${restoreResponse.status})`);
  }
}

function assertOnlyDataCellsAreWritten(
  batchData: Array<{ range: string }>,
  columnOffset: number
): void {
  for (const update of batchData) {
    const columns = update.range.match(/!([A-Z]+)\d+(?::([A-Z]+)\d+)?$/);
    if (!columns) continue;
    const start = columnToNumber(columns[1]);
    const end = columnToNumber(columns[2] || columns[1]);
    const formulaColumn = CALCULATED_COLUMNS
      .map(column => columnToNumber(shiftColumn(column, columnOffset)))
      .find(column => column >= start && column <= end);
    if (formulaColumn !== undefined) {
      throw new Error(`La actualización intentó escribir una columna calculada (${update.range})`);
    }
  }
}

function buildOrderUpdateBatchData(
  sheetName: string,
  rowNumber: number,
  order: SheetOrderPayload,
  _logisticsObservation: string | undefined,
  columnOffset: number,
  statusOverride?: string
): Array<{ range: string; values: unknown[][] }> {
  const formattedDeliveryDate = formatDateForSheet(order.deliveryDate);
  const formattedOrderDate = formatDateForSheet(order.orderDate);
  const formattedMaxDeliveryDate = formatDateForSheet(order.maxDeliveryDate);
  let cleanNotes = (order.deliveryNotes || '').trim();
  cleanNotes = cleanNotes.replace(/(?:Cobrar al entregar|Saldo al entregar|Seña:)[^/]+/gi, '').trim();
  cleanNotes = cleanNotes.replace(/^[\/\-\s]+|[\/\-\s]+$/g, '').trim();

  // Las observaciones para logística son únicamente para Telegram; no se agregan a las notas de la planilla.

  const batchData: Array<{ range: string; values: unknown[][] }> = [
    { range: makeRange(sheetName, 'C', 'E', rowNumber, columnOffset), values: [[formattedDeliveryDate, formattedOrderDate, formattedMaxDeliveryDate]] },
    { range: makeRange(sheetName, 'F', 'H', rowNumber, columnOffset), values: [[order.clientName || '', order.phonePrimary || '', order.phoneSecondary || '']] },
    { range: makeRange(sheetName, 'I', 'K', rowNumber, columnOffset), values: [[order.whaticketLink || '', order.source || 'Publicidad Meta', cleanNotes]] },
    { range: makeRange(sheetName, 'L', 'M', rowNumber, columnOffset), values: [[order.medium || '', normalizeSellerNameForSheet(order.sellerName)]] }
  ];

  if (columnOffset === -1) {
    // Entregas Actual: no sobreescribe la columna P (estado logístico de entrega propio de la hoja)
    batchData.push({
      range: makeRange(sheetName, 'R', 'T', rowNumber, columnOffset),
      values: [[normalizeLocalityForSheet(order.locality), order.address || '', order.mapsLink || '']]
    });
  } else {
    // Central pedidos / Vendedora: columna Q es el estado de ruteo/entrega
    batchData.push({
      range: makeRange(sheetName, 'Q', 'T', rowNumber, columnOffset),
      values: [[statusOverride || 'Modificado', normalizeLocalityForSheet(order.locality), order.address || '', order.mapsLink || '']]
    });
  }

  batchData.push(
    { range: makeRange(sheetName, 'U', 'W', rowNumber, columnOffset), values: [[normalizeCategoryForSheet(order.category), order.paymentMethod || '', order.identification || '']] },
    { range: makeRange(sheetName, 'X', 'Y', rowNumber, columnOffset), values: [[order.paymentStatus || 'No Abonado', order.depositOrPaidAmount ?? 0]] },
    { range: makeRange(sheetName, 'AA', 'AB', rowNumber, columnOffset), values: [[normalizeFreightForSheet(order.freightType), order.freightCost ?? 0]] }
  );

  const items = order.items || [];
  for (let i = 0; i < PRODUCT_SLOT_RANGES.length; i++) {
    const [startColumn, endColumn] = PRODUCT_SLOT_RANGES[i];
    const item = items[i];
    batchData.push({
      range: makeRange(sheetName, startColumn, endColumn, rowNumber, columnOffset),
      values: [item
        ? [normalizeProductNameForSheet(item.name, item.sku), item.quantity || 1, item.unitPrice || 0]
        : ['', '', '']]
    });
  }
  return batchData;
}

async function findOrderRowsInSheet(
  spreadsheetId: string,
  sheetName: string,
  codeColumn: string,
  legacyCode: string
): Promise<Array<{ rowNumber: number; code: string }>> {
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!${codeColumn}2:${codeColumn}`);
  const codesToSearch = legacyCode.split(/[\/,]/).map(code => code.trim().toUpperCase()).filter(Boolean);
  const matches = new Map<string, { rowNumber: number; code: string }>();
  for (let index = 0; index < rows.length; index++) {
    const currentCode = (rows[index]?.[0] || '').trim().toUpperCase();
    if (codesToSearch.includes(currentCode) && !matches.has(currentCode)) {
      matches.set(currentCode, { rowNumber: index + 2, code: currentCode });
    }
  }
  return codesToSearch.flatMap(code => {
    const match = matches.get(code);
    return match ? [match] : [];
  });
}

function splitOrderItemsForRows(order: SheetOrderPayload, rowCount: number): SheetOrderItem[][] {
  const items = order.items || [];
  const maxItems = rowCount * PRODUCT_SLOT_RANGES.length;
  if (items.length > maxItems) {
    throw new Error(`El pedido tiene ${items.length} productos y las ${rowCount} filas disponibles admiten ${maxItems}`);
  }
  return Array.from(
    { length: rowCount },
    (_, index) => items.slice(index * PRODUCT_SLOT_RANGES.length, (index + 1) * PRODUCT_SLOT_RANGES.length)
  );
}

async function updateOrderInOperationalSheet(
  spreadsheetId: string,
  sheetName: string,
  codeColumn: string,
  columnOffset: number,
  legacyCode: string,
  order: SheetOrderPayload,
  logisticsObservation?: string,
  statusOverride?: string
): Promise<OperationalSheetSyncResult> {
  try {
    const targets = await findOrderRowsInSheet(spreadsheetId, sheetName, codeColumn, legacyCode);
    if (targets.length === 0) {
      return { success: false, sheetName, message: `No se encontró el pedido ${legacyCode} en la hoja ${sheetName}` };
    }

    const token = await getGoogleAccessToken();
    const itemChunks = splitOrderItemsForRows(order, targets.length);
    const batchData = targets.flatMap((target, index) => {
      const orderForRow = { ...order, items: itemChunks[index] };
      return buildOrderUpdateBatchData(sheetName, target.rowNumber, orderForRow, logisticsObservation, columnOffset, statusOverride);
    });
    await Promise.all(targets.map(target =>
      restoreMissingCalculatedFormulas(spreadsheetId, sheetName, target.rowNumber, columnOffset, token)
    ));
    assertOnlyDataCellsAreWritten(batchData, columnOffset);
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: batchData
      })
    });
    if (!updateRes.ok) {
      throw new Error(`Google Sheets respondió ${updateRes.status}`);
    }
    return { success: true, sheetName, rowNumber: targets[0].rowNumber };
  } catch (error) {
    console.error(`[GoogleSheets] No se pudo sincronizar ${sheetName}:`, error);
    return { success: false, sheetName, message: `No se pudo actualizar ${sheetName} (sin acceso o error de Google Sheets)` };
  }
}

export async function syncOrderModificationToOperationalSheets(
  legacyCode: string,
  order: SheetOrderPayload,
  logisticsObservation?: string
): Promise<OperationalSheetsSyncResult> {
  // 1. Buscar y actualizar primero en Entregas Actual
  let deliveriesCurrent: OperationalSheetSyncResult = {
    success: false,
    message: `No se encontró el pedido ${legacyCode} en Entregas Actual`
  };
  for (const sheetName of DELIVERIES_CURRENT_SHEET.sheetNames) {
    const result = await updateOrderInOperationalSheet(
      DELIVERIES_CURRENT_SHEET.spreadsheetId,
      sheetName,
      DELIVERIES_CURRENT_SHEET.codeColumn,
      DELIVERIES_CURRENT_SHEET.columnOffset,
      legacyCode,
      order,
      logisticsObservation
    );
    if (result.success) {
      deliveriesCurrent = result;
      break;
    }
    if (!result.message?.startsWith(`No se encontró el pedido ${legacyCode}`)) {
      deliveriesCurrent = result;
      break;
    }
  }

  // 2. Si aplicó en Entregas Actual -> '🔹 Pasado' en Central, caso contrario 'Modificado'
  const centralStatus = deliveriesCurrent.success ? '🔹 Pasado' : 'Modificado';

  // 3. Actualizar Central pedidos
  const central = await updateOrderInOperationalSheet(
    CENTRAL_ORDERS_SHEET.spreadsheetId,
    CENTRAL_ORDERS_SHEET.sheetName,
    CENTRAL_ORDERS_SHEET.codeColumn,
    CENTRAL_ORDERS_SHEET.columnOffset,
    legacyCode,
    order,
    logisticsObservation,
    centralStatus
  );

  return { central, deliveriesCurrent };
}

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
): Promise<{ success: boolean; code: string; codes: string[]; rowNumber: number; rowNumbers: number[] }> {
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

    // Limpiar notas de cualquier prefijo anterior o residuos de cobrar al entregar
    let cleanNotes = (order.deliveryNotes || '').trim();
    cleanNotes = cleanNotes.replace(/\(Continuación pedido [^)]+\)/gi, '').trim();
    cleanNotes = cleanNotes.replace(/^VA CON EL PEDIDO\s+[A-Za-z0-9\-\/,\s]+?(\/|-|$)/i, '').trim();
    cleanNotes = cleanNotes.replace(/(?:Cobrar al entregar|Saldo al entregar|Seña:)[^/]+/gi, '').trim();
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
        values: [[(order.status === 'En Espera') ? 'En Espera' : '🔸 Validado', normalizeLocalityForSheet(order.locality), order.address || '', order.mapsLink || '']]
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

    await restoreMissingCalculatedFormulas(spreadsheetId, sheetName, rowNumber, 0, token);
    assertOnlyDataCellsAreWritten(batchData, 0);
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

    // Formatear celda de notas (Columna K) con fondo amarillo y texto negro en negrita si hay notas
    if (notes && notes.trim().length > 0) {
      try {
        await formatSheetNoteCell(spreadsheetId, sheetName, rowNumber, token);
      } catch (fErr) {
        console.warn('Could not format note cell in sheet:', fErr);
      }
    }
  }

  const finalCode = assignedCodes.join(' / ');

  return {
    success: true,
    code: finalCode,
    codes: assignedCodes,
    rowNumber: firstRowNumber,
    rowNumbers: slots.map(slot => slot.rowNumber)
  };
}

export interface NewOperationalSheetSyncResult {
  success: boolean;
  sheetName: string;
  rowNumbers?: number[];
  message?: string;
}

export interface NewOperationalSheetsSyncResult {
  central: NewOperationalSheetSyncResult;
  deliveriesCurrent: NewOperationalSheetSyncResult;
}

export interface SheetStatusSyncResult {
  success: boolean;
  message?: string;
}

/** Actualiza únicamente el estado, sin tocar datos ni fórmulas de la fila. */
export async function setOrderStatusInSheetRows(
  spreadsheetId: string,
  sheetName: string,
  rowNumbers: number[],
  columnOffset: number,
  status: string
): Promise<SheetStatusSyncResult> {
  try {
    if (rowNumbers.length === 0) throw new Error('No hay filas para actualizar');
    const token = await getGoogleAccessToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: rowNumbers.map(rowNumber => ({
            range: makeRange(sheetName, 'Q', 'Q', rowNumber, columnOffset),
            values: [[status]]
          }))
        })
      }
    );
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error(`[GoogleSheets] No se pudo actualizar el estado en ${sheetName}:`, error);
    return { success: false, message: `No se pudo marcar ${status} en ${sheetName}` };
  }
}

/** Busca el pedido por código y actualiza sólo su estado en la planilla del vendedor. */
export async function setOrderStatusInSellerSheetByCode(
  spreadsheetId: string,
  sheetName: string,
  legacyCode: string,
  status: string
): Promise<SheetStatusSyncResult> {
  try {
    const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!B2:B`);
    const codesToSearch = legacyCode
      .split(/[\/,]/)
      .map(code => code.trim().toUpperCase())
      .filter(Boolean);
    const rowNumbers: number[] = [];

    rows.forEach((row, index) => {
      const currentCode = (row[0] || '').trim().toUpperCase();
      if (currentCode && codesToSearch.includes(currentCode)) rowNumbers.push(index + 2);
    });

    if (rowNumbers.length === 0) {
      return { success: false, message: `No se encontró ${legacyCode} en ${sheetName}` };
    }
    return setOrderStatusInSheetRows(spreadsheetId, sheetName, rowNumbers, 0, status);
  } catch (error) {
    console.error(`[GoogleSheets] No se pudo buscar ${legacyCode} en ${sheetName}:`, error);
    return { success: false, message: `No se pudo marcar ${legacyCode} como ${status}` };
  }
}

/** Devuelve el ordinal del pedido dentro de su fecha de carga en Central. */
export async function getCentralOrderDailySequence(orderDate?: string): Promise<number> {
  const normalizeDate = (value?: string): string => {
    const clean = (value || '').split('T')[0].trim();
    const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    const sheetMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (sheetMatch) return `${sheetMatch[3]}-${sheetMatch[2].padStart(2, '0')}-${sheetMatch[1].padStart(2, '0')}`;
    return clean;
  };
  const targetDate = normalizeDate(orderDate);
  if (!targetDate) throw new Error('Falta la fecha del pedido para calcular su número diario');
  const rows = await fetchSpreadsheetValues(
    CENTRAL_ORDERS_SHEET.spreadsheetId,
    `'${CENTRAL_ORDERS_SHEET.sheetName}'!D2:D`
  );
  const matchingRows = rows.filter(row => normalizeDate(row[0]) === targetDate);
  if (matchingRows.length === 0) throw new Error('No se encontró el pedido nuevo en Central para calcular su número diario');
  return matchingRows.length;
}

/**
 * Busca filas realmente vacías en una hoja operativa. Central tiene el código
 * en B y Entregas Actual en A; el offset mantiene ambos formatos alineados.
 */
async function getNextEmptyOperationalRows(
  spreadsheetId: string,
  sheetName: string,
  columnOffset: number,
  count: number
): Promise<number[]> {
  const codeColumn = shiftColumn('B', columnOffset);
  const clientColumn = shiftColumn('F', columnOffset);
  const rows = await fetchSpreadsheetValues(
    spreadsheetId,
    `'${sheetName}'!${codeColumn}2:${clientColumn}`
  );
  // Las planillas operativas se cargan siempre al final. Una fila vacía entre
  // cabeceras y pedidos históricos es parte del diseño de la planilla, no un
  // slot disponible para altas nuevas.
  const lastUsedIndex = rows.reduce((lastIndex, row, index) => (
    row.some(value => String(value || '').trim() !== '') ? index : lastIndex
  ), -1);
  const firstNewRow = Math.max(2, lastUsedIndex + 3);
  return Array.from({ length: count }, (_, index) => firstNewRow + index);
}

function makeContinuationOrder(
  order: SheetOrderPayload,
  items: SheetOrderItem[],
  codes: string[],
  index: number
): SheetOrderPayload {
  const siblingCodes = codes.filter((_, codeIndex) => codeIndex !== index);
  const continuationPrefix = siblingCodes.length > 0
    ? `VA CON EL PEDIDO ${siblingCodes.join(' / ')}`
    : '';
  const originalNotes = (order.deliveryNotes || '').trim();
  const deliveryNotes = continuationPrefix
    ? (originalNotes ? `${continuationPrefix} / ${originalNotes}` : continuationPrefix)
    : originalNotes;

  return {
    ...order,
    items,
    deliveryNotes,
    // Los importes pertenecen sólo a la primera línea cuando el pedido se
    // divide en varias filas por tener más de 12 productos.
    depositOrPaidAmount: index === 0 ? order.depositOrPaidAmount : 0,
    freightCost: index === 0 ? order.freightCost : 0,
    paymentStatus: index === 0 ? order.paymentStatus : 'Abonado'
  };
}

async function appendOrderToOperationalSheet(
  spreadsheetId: string,
  sheetName: string,
  columnOffset: number,
  codes: string[],
  order: SheetOrderPayload
): Promise<NewOperationalSheetSyncResult> {
  try {
    const rowNumbers = await getNextEmptyOperationalRows(
      spreadsheetId,
      sheetName,
      columnOffset,
      codes.length
    );
    const itemChunks = splitOrderItemsForRows(order, codes.length);
    const token = await getGoogleAccessToken();
    const batchData = rowNumbers.flatMap((rowNumber, index) => {
      const rowOrder = makeContinuationOrder(order, itemChunks[index], codes, index);
      return [
        {
          // B en Central pedidos y A en Entregas Actual.
          range: makeRange(sheetName, 'B', 'B', rowNumber, columnOffset),
          values: [[codes[index]]]
        },
        ...buildOrderUpdateBatchData(
          sheetName,
          rowNumber,
          rowOrder,
          undefined,
          columnOffset,
          rowOrder.status === 'En Espera' ? 'En Espera' : '🔸 Validado'
        )
      ];
    });

    // buildOrderUpdateBatchData deliberately preserves the delivery-status
    // column while editing Entregas Actual. A new row has no status yet, so it
    // must be initialized here (Q in Central, P in Entregas Actual).
    if (columnOffset === -1) {
      rowNumbers.forEach(rowNumber => {
        batchData.push({
          range: makeRange(sheetName, 'Q', 'Q', rowNumber, columnOffset),
          values: [[order.status === 'En Espera' ? 'En Espera' : '🔸 Validado']]
        });
      });
    }

    // Central y Entregas Actual ya tienen las fórmulas preconfiguradas en sus
    // filas plantilla. No intentamos recrearlas al dar de alta un pedido: esas
    // columnas pueden estar protegidas y no intervienen en la carga de datos.
    assertOnlyDataCellsAreWritten(batchData, columnOffset);

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData })
      }
    );
    if (!response.ok) {
      throw new Error(`Google Sheets respondió ${response.status}: ${await response.text()}`);
    }

    return { success: true, sheetName, rowNumbers };
  } catch (error) {
    console.error(`[GoogleSheets] No se pudo crear el pedido en ${sheetName}:`, error);
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      sheetName,
      message: `No se pudo registrar el pedido nuevo en ${sheetName}: ${detail}`
    };
  }
}

/** Registra un alta nueva en las dos planillas operativas con el mismo código. */
export async function appendNewOrderToOperationalSheets(
  codes: string[],
  order: SheetOrderPayload
): Promise<NewOperationalSheetsSyncResult> {
  const central = await appendOrderToOperationalSheet(
    CENTRAL_ORDERS_SHEET.spreadsheetId,
    CENTRAL_ORDERS_SHEET.sheetName,
    CENTRAL_ORDERS_SHEET.columnOffset,
    codes,
    order
  );
  if (!central.success) {
    return {
      central,
      deliveriesCurrent: {
        success: false,
        sheetName: 'Vendedores',
        message: 'No se cargó Entregas Actual porque Central no pudo registrar el pedido'
      }
    };
  }

  const deliveriesCurrent = await appendOrderToOperationalSheet(
    DELIVERIES_CURRENT_SHEET.spreadsheetId,
    'Vendedores',
    DELIVERIES_CURRENT_SHEET.columnOffset,
    codes,
    order
  );

  return { central, deliveriesCurrent };
}

export const SELLER_SHEET_CONFIG: Record<string, { spreadsheetId: string; sheetName: string; enabled: boolean }> = {
  // Diego Bóveda
  '381df0d1-183f-4ccb-aaf2-8147c76159a9': {
    spreadsheetId: '1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg',
    sheetName: 'Pendientes',
    enabled: true
  },
  // Jazmín Sánchez
  '13430e05-b61a-4a3f-9fc3-152d377c4b0c': {
    spreadsheetId: '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw',
    sheetName: 'Pendientes',
    enabled: true
  },
  // Ludmila Krenz
  '54b2d319-8f6f-47ff-b794-b7731978410a': {
    spreadsheetId: '1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8',
    sheetName: 'Pendientes',
    enabled: true
  },
  '8207801b-b6cb-48cc-af0f-d2f9f2c98032': {
    spreadsheetId: '1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8',
    sheetName: 'Pendientes',
    enabled: true
  },
  // Facundo Paz
  '3820a0fe-bb0a-4a84-ad85-79e49868cad7': {
    spreadsheetId: '1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns',
    sheetName: 'Pendientes',
    enabled: true
  }
};

export async function getOrderStatusInSellerSheet(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  legacyCode: string
): Promise<string | null> {
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!A2:B`);
  const codesToSearch = legacyCode
    .split(/[\/,]/)
    .map(code => code.trim().toUpperCase())
    .filter(Boolean);

  const matchingRow = rows.find(row => {
    const currentCode = (row[1] || '').trim().toUpperCase();
    return currentCode && codesToSearch.some(code => code === currentCode);
  });

  return matchingRow ? (matchingRow[0] || '').trim() : null;
}

export function isSellerOrderNotYetProcessed(status: string | null): boolean {
  return (status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() === 'no esta';
}

export async function updateOrderInSellerSheet(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  legacyCode: string,
  order: SheetOrderPayload,
  logisticsObservation?: string,
  statusOverride?: string
): Promise<{ success: boolean; rowNumber: number; code: string; message?: string }> {
  if (!legacyCode || !legacyCode.trim()) {
    throw new Error('legacyCode es requerido para modificar un pedido en la planilla');
  }

  const token = await getGoogleAccessToken();

  // 1. Obtener todos los códigos de la Columna B
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!B2:B`);
  
  // Buscar coincidencia por código (puede venir como 'DB0064' o 'DB0064 / DB0065')
  const codesToSearch = legacyCode
    .split(/[\/,]/)
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  const targetRows: Array<{ rowNumber: number; code: string }> = [];
  let matchedCode = '';

  for (let i = 0; i < rows.length; i++) {
    const currentCode = (rows[i]?.[0] || '').trim().toUpperCase();
    if (!currentCode) continue;

    if (codesToSearch.some(c => c === currentCode)) {
      targetRows.push({ rowNumber: i + 2, code: currentCode });
      if (!matchedCode) matchedCode = currentCode;
    }
  }

  if (targetRows.length === 0) {
    return {
      success: false,
      rowNumber: -1,
      code: legacyCode,
      message: `No se encontró la fila en la planilla con el código ${legacyCode}`
    };
  }

  const rowNumber = targetRows[0].rowNumber;

  // En la planilla, Columna Q: 'Modificado' o valor sobrescrito (ej. '❌ Anulado')
  const sheetStatus = statusOverride || 'Modificado';

  const itemChunks = splitOrderItemsForRows(order, targetRows.length);
  const allBatchData = targetRows.flatMap((target, index) =>
    buildOrderUpdateBatchData(
      sheetName,
      target.rowNumber,
      { ...order, items: itemChunks[index] },
      logisticsObservation,
      0,
      sheetStatus
    )
  );
  await Promise.all(targetRows.map(target =>
    restoreMissingCalculatedFormulas(spreadsheetId, sheetName, target.rowNumber, 0, token)
  ));
  assertOnlyDataCellsAreWritten(allBatchData, 0);
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
        data: allBatchData
      })
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Google Sheets batchUpdate error (${updateRes.status}): ${errText}`);
  }

  // Formatear celda de notas (Columna K) con fondo amarillo y texto negro en negrita si hay notas
  if (order.deliveryNotes?.trim()) {
    try {
      await Promise.all(targetRows.map(target =>
        formatSheetNoteCell(spreadsheetId, sheetName, target.rowNumber, token)
      ));
    } catch (fErr) {
      console.warn('Could not format note cell in sheet:', fErr);
    }
  }

  return {
    success: true,
    rowNumber,
    code: matchedCode || legacyCode
  };
}

/**
 * Anula un pedido existente en la planilla del vendedor:
 * - Coloca '❌ Anulado' en la Columna Q.
 * - Opcionalmente añade la razón de anulación en la columna de notas (Columna K).
 */
export async function cancelOrderInSellerSheet(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  legacyCode: string,
  cancelReason?: string
): Promise<{ success: boolean; rowNumber: number; code: string; message?: string }> {
  if (!legacyCode || !legacyCode.trim()) {
    throw new Error('legacyCode es requerido para anular un pedido en la planilla');
  }

  const token = await getGoogleAccessToken();

  // 1. Obtener todos los códigos de la Columna B
  const rows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!B2:B`);
  
  const codesToSearch = legacyCode
    .split(/[\/,]/)
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  let targetRowIndex = -1;
  let matchedCode = '';

  for (let i = 0; i < rows.length; i++) {
    const currentCode = (rows[i]?.[0] || '').trim().toUpperCase();
    if (!currentCode) continue;

    if (codesToSearch.some(c => c === currentCode)) {
      targetRowIndex = i;
      matchedCode = currentCode;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return {
      success: false,
      rowNumber: -1,
      code: legacyCode,
      message: `No se encontró la fila en la planilla con el código ${legacyCode}`
    };
  }

  const rowNumber = targetRowIndex + 2;

  // Actualizar Columna Q a '❌ Anulado'
  const batchData: Array<{ range: string; values: any[][] }> = [
    {
      range: `'${sheetName}'!Q${rowNumber}`,
      values: [['❌ Anulado']]
    }
  ];

  // Si hay motivo de anulación, anexarlo a la celda de notas/aclaraciones (Columna K)
  if (cancelReason && cancelReason.trim()) {
    try {
      const currentNotesRows = await fetchSpreadsheetValues(spreadsheetId, `'${sheetName}'!K${rowNumber}`);
      const existingNote = (currentNotesRows[0]?.[0] || '').trim();
      const cancelNoteText = `❌ ANULADO: ${cancelReason.trim()}`;
      const newNote = existingNote ? `${existingNote} / ${cancelNoteText}` : cancelNoteText;
      batchData.push({
        range: `'${sheetName}'!K${rowNumber}`,
        values: [[newNote]]
      });
    } catch (noteErr) {
      console.warn('Could not read existing note before appending cancel reason:', noteErr);
    }
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

  if (cancelReason && cancelReason.trim()) {
    try {
      await formatSheetNoteCell(spreadsheetId, sheetName, rowNumber, token);
    } catch (fErr) {
      console.warn('Could not format cancel note cell in sheet:', fErr);
    }
  }

  return {
    success: true,
    rowNumber,
    code: matchedCode || legacyCode
  };
}

const sheetIdCache: Record<string, number> = {
  'Pendientes': 1414092286
};

async function getSheetIdByTitle(spreadsheetId: string, sheetTitle: string, token: string): Promise<number> {
  const cacheKey = `${spreadsheetId}_${sheetTitle}`;
  if (sheetIdCache[cacheKey] !== undefined) {
    return sheetIdCache[cacheKey];
  }

  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const match = data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === sheetTitle.toLowerCase());
      if (match && match.properties?.sheetId !== undefined) {
        sheetIdCache[cacheKey] = match.properties.sheetId;
        return match.properties.sheetId;
      }
    }
  } catch (err) {
    console.warn(`Could not lookup sheetId for ${sheetTitle} in ${spreadsheetId}:`, err);
  }

  return sheetIdCache[sheetTitle] || 1414092286;
}

/**
 * Aplica formato en Columna K (Aclaraciones / Detalle Entrega):
 * - Fondo amarillo (#FFFF00)
 * - Letras negras en negrita (#000000)
 */
export async function formatSheetNoteCell(
  spreadsheetId: string,
  sheetName: string = 'Pendientes',
  rowNumber: number,
  token?: string
): Promise<void> {
  const authToken = token || await getGoogleAccessToken();
  const sheetId = await getSheetIdByTitle(spreadsheetId, sheetName, authToken);

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: rowNumber - 1,
              endRowIndex: rowNumber,
              startColumnIndex: 10, // Columna K (0-indexed)
              endColumnIndex: 11
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 0 },
                textFormat: {
                  foregroundColor: { red: 0, green: 0, blue: 0 },
                  bold: true,
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        }
      ]
    })
  });
}

export const LOCALITIES_SPREADSHEET_ID = '1iNciz2d6Do7m7weYP5o9gYLIu_F-15vYL933FrAX2cs';

export async function appendLocalityToGoogleSheet(
  localityName: string,
  zoneName: string,
  schedule?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const token = await getGoogleAccessToken();
    const range = encodeURIComponent('Localidades!A:C');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${LOCALITIES_SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'Localidades!A:C',
        majorDimension: 'ROWS',
        values: [
          [localityName, zoneName, schedule || '']
        ]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[GoogleSheets] Error al agregar fila en Localidades: ${res.status} ${errorText}`);
      if (errorText.includes('protected cell') || errorText.includes('protected range') || errorText.includes('edit a protected')) {
        return {
          success: false,
          message: 'La hoja "Localidades" tiene un rango protegido (candado) en Google Sheets. Se requiere permitir a la cuenta de servicio la edición para sincronizar.'
        };
      }
      return {
        success: false,
        message: `Google Sheets error (${res.status}): ${errorText}`
      };
    }

    return {
      success: true,
      message: 'Localidad agregada exitosamente a la planilla de Google Sheets'
    };
  } catch (err: any) {
    console.error('[GoogleSheets] Excepción en appendLocalityToGoogleSheet:', err);
    return {
      success: false,
      message: err.message || 'Error al conectar con Google Sheets'
    };
  }
}


