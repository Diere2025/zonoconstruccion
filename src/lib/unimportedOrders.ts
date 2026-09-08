import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export interface UnimportedOrderItem {
  productId: string | null;
  productName: string;
  normalizedName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface UnimportedOrder {
  orderCode: string;
  sheetName: string;
  sellerName: string;
  customerName: string;
  status: string;
  orderDate: string; // YYYY-MM-DD
  rawDate: string;
  isReserved: boolean;
  totalAmount: number;
  items: UnimportedOrderItem[];
}

export interface UnimportedOrdersResult {
  success: boolean;
  unimportedOrders: UnimportedOrder[];
  reservesByProductId: Record<string, number>;
  reservesByNormName: Record<string, number>;
  salesByProductId: Record<string, number>;
  salesByNormName: Record<string, number>;
  todayStats: {
    ordersCount: number;
    totalAmount: number;
    totalUnits: number;
    orders: Array<{
      orderCode: string;
      sellerName: string;
      customerName: string;
      totalAmount: number;
      itemsCount: number;
      status: string;
    }>;
  };
  totalUnimportedCount: number;
  totalReservedUnits: number;
  totalSalesUnits: number;
  cachedAt: number;
}

export const SELLER_SHEETS = [
  {
    name: "Jazmín Sánchez",
    url: "https://docs.google.com/spreadsheets/d/16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw/gviz/tq?tqx=out:csv&gid=1414092286",
    isCentralSheet: false,
    isAquafortSheet: false
  },
  {
    name: "Diego Bóveda",
    url: "https://docs.google.com/spreadsheets/d/1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg/gviz/tq?tqx=out:csv&gid=1414092286",
    isCentralSheet: false,
    isAquafortSheet: false
  },
  {
    name: "Ludmila Krenz",
    url: "https://docs.google.com/spreadsheets/d/1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8/gviz/tq?tqx=out:csv&gid=1414092286",
    isCentralSheet: false,
    isAquafortSheet: false
  },
  {
    name: "Facundo Paz",
    url: "https://docs.google.com/spreadsheets/d/1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns/gviz/tq?tqx=out:csv",
    isCentralSheet: false,
    isAquafortSheet: false
  },
  {
    name: "Central/Ruteo",
    url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
    isCentralSheet: true,
    isAquafortSheet: false
  },
  {
    name: "Pedidos Mayoristas (AQU/POW/AQ-)",
    url: "https://docs.google.com/spreadsheets/d/1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0/gviz/tq?tqx=out:csv&gid=786380854",
    isCentralSheet: true,
    isAquafortSheet: true
  }
];

export const normalizeText = (text: any): string => {
  if (!text) return "";
  return text
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

export const cleanProductName = (name: any): string => {
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

export const parseSpanishNumber = (val: any): number => {
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

export const parseOrderDateToISO = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const clean = dateStr.trim();
  const parts = clean.split(/[\/\-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    // Handle YYYY-MM-DD
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (year < 100) {
      year += 2000;
    }
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
};

export const getArgentinaTodayDateString = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

const parseCSV = (csvText: string): string[][] => {
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
      
      let emptyIdx = 30;
      while ((prevRow[emptyIdx] || "").trim() !== "" && (prevRow[emptyIdx] || "").trim() !== "0") {
        emptyIdx += 4;
      }

      for (let pIdx = 30; pIdx < currentRow.length; pIdx += 4) {
        const prodName = (currentRow[pIdx] || "").trim();
        const prodQty = (currentRow[pIdx + 1] || "").trim();
        const prodPrice = (currentRow[pIdx + 2] || "").trim();
        const prodSub = (currentRow[pIdx + 3] || "").trim();
        if (prodName && prodName !== "0") {
          prevRow[emptyIdx] = prodName;
          prevRow[emptyIdx + 1] = prodQty;
          prevRow[emptyIdx + 2] = prodPrice;
          prevRow[emptyIdx + 3] = prodSub;
          emptyIdx += 4;
        }
      }
    } else {
      merged.push(currentRow);
    }
  }
  return merged;
};

// In-memory cache
let cachedResult: UnimportedOrdersResult | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getUnimportedSellerOrders(options: { forceRefresh?: boolean } = {}): Promise<UnimportedOrdersResult> {
  const now = Date.now();
  if (!options.forceRefresh && cachedResult && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedResult;
  }

  // 1. Fetch DB legacy_codes and DB products concurrently
  const [dbLegacyCodesSet, dbProducts] = await Promise.all([
    fetchAllDbLegacyCodes(),
    fetchDbProducts()
  ]);

  // Build product lookup maps
  const cleanToProdMap = new Map<string, any>();
  const normToProdMap = new Map<string, any>();
  const prodByIdMap = new Map<string, any>();

  dbProducts.forEach((p: any) => {
    prodByIdMap.set(p.id, p);
    const cName = cleanProductName(p.name);
    const cSku = p.sku ? cleanProductName(p.sku) : '';
    const nName = normalizeText(p.name);
    const nSku = normalizeText(p.sku || '');

    if (cName) cleanToProdMap.set(cName, p);
    if (cSku) cleanToProdMap.set(cSku, p);
    if (nName) normToProdMap.set(nName, p);
    if (nSku) normToProdMap.set(nSku, p);
  });

  // Handle generic product resolution to real product
  const resolveRealProduct = (prod: any) => {
    if (prod && prod.is_generic && prod.mapped_real_product_id) {
      const real = prodByIdMap.get(prod.mapped_real_product_id);
      if (real) return real;
    }
    return prod;
  };

  const todayIso = getArgentinaTodayDateString();
  const unimportedOrders: UnimportedOrder[] = [];
  const reservesByProductId: Record<string, number> = {};
  const reservesByNormName: Record<string, number> = {};
  const salesByProductId: Record<string, number> = {};
  const salesByNormName: Record<string, number> = {};

  let totalUnimportedCount = 0;
  let totalReservedUnits = 0;
  let totalSalesUnits = 0;

  const todayOrders: Array<{
    orderCode: string;
    sellerName: string;
    customerName: string;
    totalAmount: number;
    itemsCount: number;
    status: string;
  }> = [];
  let todayTotalAmount = 0;
  let todayTotalUnits = 0;

  const seenUnimportedCodes = new Set<string>();

  // 2. Fetch all seller sheets in parallel
  const sheetResults = await Promise.allSettled(
    SELLER_SHEETS.map(async (sheet) => {
      const csvText = await fetchSpreadsheetCsv(sheet.url);
      return { sheet, csvText };
    })
  );

  // 3. Process each sheet
  for (const res of sheetResults) {
    if (res.status !== 'fulfilled' || !res.value.csvText) continue;

    const { sheet, csvText } = res.value;
    const rawRows = parseCSV(csvText);
    const rows = mergeContiguousSheetRows(rawRows);

    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const rawCode = (row[1] || "").trim().toUpperCase();
      if (!rawCode) continue;

      // Skip header repetitions or invalid codes
      if (rawCode === "N° PEDIDO" || rawCode === "NRO" || rawCode === "PEDIDO" || rawCode === "CODIGO") continue;
      if (rawCode.startsWith("ENC")) continue;

      // Wholesale filter on central sheet
      if (sheet.isCentralSheet) {
        const isWholesaleCode = rawCode.startsWith("AQU") || rawCode.startsWith("POW") || rawCode.startsWith("AQ-");
        const matchesWholesale = sheet.isAquafortSheet ? isWholesaleCode : !isWholesaleCode;
        if (!matchesWholesale) continue;
      }

      // Logical detection: check if order code or any sub-part exists in DB
      const codeParts = rawCode.split(/[\/,]/).map(p => p.trim()).filter(Boolean);
      const existsInDb = codeParts.some(part => dbLegacyCodesSet.has(part)) || dbLegacyCodesSet.has(rawCode);

      if (existsInDb) {
        // Order is already in Supabase DB -> Skip
        continue;
      }

      // Deduplication: check if this code was already processed from another sheet
      const alreadyProcessed = codeParts.some(part => seenUnimportedCodes.has(part)) || seenUnimportedCodes.has(rawCode);
      if (alreadyProcessed) {
        continue;
      }

      const rawStatus = (row[0] || "").trim();
      const normStatus = normalizeText(rawStatus);

      // Skip cancelled / annulled orders
      if (normStatus === "cancelado" || normStatus === "anulado") {
        continue;
      }

      const rawDate = (row[3] || "").trim();
      const orderDate = parseOrderDateToISO(rawDate);
      const customerName = (row[5] || "").trim() || "Cliente sin Nombre";
      const sellerName = (row[12] || "").trim() || sheet.name;
      const rawTotal = parseSpanishNumber(row[28]);

      // Determine reservation status:
      // Pendiente or active = reserves stock.
      // Entregando or Entregado = does NOT reserve (already physically dispatched/delivered).
      const isReserved = normStatus === "pendiente" || normStatus === "" || normStatus === "no esta" || normStatus === "no está";

      // Parse items
      const items: UnimportedOrderItem[] = [];
      let calculatedTotal = 0;
      let orderUnits = 0;

      for (let pIdx = 30; pIdx < row.length; pIdx += 4) {
        const prodName = (row[pIdx] || "").trim();
        const qtyRaw = (row[pIdx + 1] || "").trim();
        const priceRaw = (row[pIdx + 2] || "").trim();
        const subRaw = (row[pIdx + 3] || "").trim();

        if (!prodName || prodName === "0") continue;

        const isDiscount = prodName.toLowerCase().includes("descuento") || prodName.toLowerCase().includes("bonificaci");
        if (isDiscount) {
          const qty = parseInt(qtyRaw.replace(/[^0-9.-]/g, ''), 10) || 1;
          const unitPrice = parseSpanishNumber(priceRaw);
          const subtotal = parseSpanishNumber(subRaw) || (qty * unitPrice);
          calculatedTotal += subtotal > 0 ? -subtotal : subtotal;
          continue;
        }

        const qty = parseInt(qtyRaw.replace(/[^0-9.-]/g, ''), 10) || 0;
        if (qty <= 0) continue;

        const unitPrice = parseSpanishNumber(priceRaw);
        const subtotal = parseSpanishNumber(subRaw) || (qty * unitPrice);
        calculatedTotal += subtotal;
        orderUnits += qty;

        const cProdName = cleanProductName(prodName);
        const nProdName = normalizeText(prodName);

        let matched = cleanToProdMap.get(cProdName) || normToProdMap.get(nProdName) || null;
        if (!matched) {
          // Fuzzy check if name contains SKU or product name
          matched = dbProducts.find((p: any) => {
            const pNorm = normalizeText(p.name);
            return pNorm && (nProdName.includes(pNorm) || pNorm.includes(nProdName));
          }) || null;
        }

        const realProduct = resolveRealProduct(matched);
        const prodId = realProduct ? realProduct.id : null;
        const normKey = realProduct ? normalizeText(realProduct.name) : nProdName;

        items.push({
          productId: prodId,
          productName: realProduct ? realProduct.name : prodName,
          normalizedName: normKey,
          quantity: qty,
          unitPrice,
          subtotal
        });

        // Accumulate reserves if order is pending
        if (isReserved) {
          if (prodId) {
            reservesByProductId[prodId] = (reservesByProductId[prodId] || 0) + qty;
          }
          if (normKey) {
            reservesByNormName[normKey] = (reservesByNormName[normKey] || 0) + qty;
          }
          totalReservedUnits += qty;
        }

        // Accumulate sales
        if (prodId) {
          salesByProductId[prodId] = (salesByProductId[prodId] || 0) + qty;
        }
        if (normKey) {
          salesByNormName[normKey] = (salesByNormName[normKey] || 0) + qty;
        }
        totalSalesUnits += qty;
      }

      const finalTotalAmount = rawTotal > 0 ? rawTotal : calculatedTotal;

      // Skip template or placeholder rows with no items
      if (items.length === 0) {
        continue;
      }

      const orderObj: UnimportedOrder = {
        orderCode: rawCode,
        sheetName: sheet.name,
        sellerName,
        customerName,
        status: rawStatus || "Pendiente",
        orderDate,
        rawDate,
        isReserved,
        totalAmount: finalTotalAmount,
        items
      };

      seenUnimportedCodes.add(rawCode);
      codeParts.forEach(part => seenUnimportedCodes.add(part));

      unimportedOrders.push(orderObj);
      totalUnimportedCount++;

      // Today stats check
      if (orderDate === todayIso) {
        todayOrders.push({
          orderCode: rawCode,
          sellerName,
          customerName,
          totalAmount: finalTotalAmount,
          itemsCount: orderUnits,
          status: rawStatus || "Pendiente"
        });
        todayTotalAmount += finalTotalAmount;
        todayTotalUnits += orderUnits;
      }
    }
  }

  cachedResult = {
    success: true,
    unimportedOrders,
    reservesByProductId,
    reservesByNormName,
    salesByProductId,
    salesByNormName,
    todayStats: {
      ordersCount: todayOrders.length,
      totalAmount: todayTotalAmount,
      totalUnits: todayTotalUnits,
      orders: todayOrders
    },
    totalUnimportedCount,
    totalReservedUnits,
    totalSalesUnits,
    cachedAt: now
  };
  lastFetchTime = now;

  return cachedResult;
}

async function fetchAllDbLegacyCodes(): Promise<Set<string>> {
  const codesSet = new Set<string>();
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('legacy_code')
      .not('legacy_code', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) {
      break;
    }

    data.forEach((o: any) => {
      if (o.legacy_code) {
        const raw = o.legacy_code.toString().trim().toUpperCase();
        codesSet.add(raw);
        if (raw.startsWith('ORIG-')) {
          codesSet.add(raw.replace(/^ORIG-/, ''));
        }
        const parts = raw.split(/[\/,]/).map((p: string) => p.trim()).filter(Boolean);
        parts.forEach((p: string) => {
          codesSet.add(p);
          if (p.startsWith('ORIG-')) {
            codesSet.add(p.replace(/^ORIG-/, ''));
          }
        });
      }
    });

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return codesSet;
}

async function fetchDbProducts(): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, price, is_generic, mapped_real_product_id');

  if (error) {
    console.error('[unimportedOrders] Error fetching products:', error);
    return [];
  }
  return data || [];
}
