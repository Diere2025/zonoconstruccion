import { canImportPurchaseReception, purchaseSlipKey } from './purchaseReceptionGuard';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from '@/lib/googleSheets';

export const PURCHASE_ORDERS_SHEET_ID = '1cbqEFLraMcSVnHdMpb3C8OrvCKFXed2Hq_RxeylEK0w';
export const DEFAULT_SINCE_DATE = '2026-09-01';

const norm = (s: string | null | undefined): string =>
  (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const SUPPLIER_ALIASES: Record<string, string> = {
  inyectplast: 'inyecplast',
  inyecplastic: 'inyecplast',
  fibrosur: 'fibrosur',
};

const PRODUCT_ALIASES: Record<string, string> = {
  [norm('Ramal T PVC 110mm')]: norm('PVC - Ramal 90 de 110 (R90-110)'),
  [norm('Codo PVC 110mm')]: norm('PVC - Codo 110(CO-110)'),
};

// Historical equivalences where an OC was registered in ERP with OP-AUTO-* and in Sheet with OP003*
const EQUIVALENT_SHEET_TO_ERP_OCS: Record<string, string[]> = {
  OP003221: ['OP-AUTO-00288', 'OP-AUTO-00289'],
  OP003247: ['OP-AUTO-00307'],
};
const EQUIVALENT_ERP_TO_SHEET_OCS: Record<string, string> = {
  'OP-AUTO-00288': 'OP003221',
  'OP-AUTO-00289': 'OP003221',
  'OP-AUTO-00307': 'OP003247',
};

export function parseDDMMYYYY(str: string | null | undefined): string | null {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  return null;
}

export function formatDDMMYYYY(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(isoStr);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const clean = String(val).replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim();
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

async function fetchBatchRanges(
  token: string,
  spreadsheetId: string,
  ranges: string[],
  renderOption: 'UNFORMATTED_VALUE' | 'FORMATTED_VALUE' = 'UNFORMATTED_VALUE'
): Promise<any[][][]> {
  const q = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${q}&valueRenderOption=${renderOption}&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Sheets batchGet error: ${JSON.stringify(json)}`);
  return (json.valueRanges || []).map((vr: any) => vr.values || []);
}

async function batchUpdateValues(
  token: string,
  spreadsheetId: string,
  dataUpdates: Array<{ range: string; values: any[][] }>
) {
  if (!dataUpdates.length) return;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: dataUpdates,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Sheets batchUpdate failed: ${res.status} ${await res.text()}`);
  }
}

async function ensureSheetCapacity(
  token: string,
  spreadsheetId: string,
  sheetTitle: string,
  requiredRow: number
) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  const meta = await metaRes.json();
  const prop = meta.sheets?.find((s: any) => s.properties.title === sheetTitle)?.properties;
  if (!prop) return;
  const rowCount = prop.gridProperties?.rowCount || 1000;
  if (requiredRow <= rowCount) return;
  const addRows = Math.max(200, requiredRow - rowCount + 50);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          appendDimension: {
            sheetId: prop.sheetId,
            dimension: 'ROWS',
            length: addRows,
          },
        },
      ],
    }),
  });
}

async function fetchProductsAll(supabase: SupabaseClient) {
  const all: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, price, cost_price, category, is_active, is_generic, mapped_real_product_id')
      .order('id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

function productPriority(product: any): number {
  let score = 0;
  if (product.is_active) score += 2;
  if (!(product.sku || '').startsWith('AUTO-')) score += 1;
  return score;
}

function buildProductLookup(products: any[]): Map<string, any[]> {
  const lookup = new Map<string, any[]>();
  for (const product of products) {
    const aliases = new Set(
      [
        norm(product.name || ''),
        norm(product.sku || ''),
        norm((product.name || '').replace(/^\[interno\]\s*/i, '').trim()),
      ].filter(Boolean)
    );
    for (const alias of aliases) {
      const list = lookup.get(alias) || [];
      list.push(product);
      lookup.set(alias, list);
    }
  }
  for (const list of lookup.values()) {
    list.sort((a, b) => productPriority(b) - productPriority(a));
  }
  return lookup;
}

export interface PurchaseSheetContrastSummary {
  sinceDate: string;
  sheetToErp: {
    missingOCs: Array<{
      oc_code: string;
      date: string;
      supplier: string;
      status: string;
      total: number;
      itemsCount: number;
    }>;
    missingReceptions: Array<{
      oc_code: string;
      date: string;
      supplier: string;
      itemsCount: number;
      totalUnits: number;
    }>;
  };
  erpToSheet: {
    missingOCs: Array<{
      oc_code: string;
      date: string;
      supplier: string;
      status: string;
      total: number;
      itemsCount: number;
    }>;
    missingReceptionLines: Array<{
      oc_code: string;
      date: string;
      supplier: string;
      productName: string;
      quantityReceived: number;
    }>;
  };
  executed?: {
    importedOCsCount: number;
    importedOCItemsCount: number;
    importedReceptionsCount: number;
    importedReceptionItemsCount: number;
    pushedOCsCount: number;
    pushedOCItemsCount: number;
    pushedReceptionItemsCount: number;
  };
}

export async function contrastAndSyncPurchaseSheet(options: {
  sinceDate?: string;
  execute?: boolean;
}): Promise<PurchaseSheetContrastSummary> {
  const sinceDate = options.sinceDate || DEFAULT_SINCE_DATE;
  const execute = Boolean(options.execute);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const allProducts = await fetchProductsAll(supabase);
  const productLookup = buildProductLookup(allProducts);

  function resolveProduct(rawName: string) {
    const n = norm(rawName);
    const target = PRODUCT_ALIASES[n] || n;
    return productLookup.get(target)?.[0] || null;
  }

  const { data: erpSuppliers } = await supabase.from('suppliers').select('*');
  const supByNorm = new Map<string, any>();
  for (const s of erpSuppliers || []) {
    supByNorm.set(norm(s.name), s);
  }
  function resolveSupplier(rawName: string) {
    const n = norm(rawName);
    const target = SUPPLIER_ALIASES[n] || n;
    if (supByNorm.has(target)) return supByNorm.get(target);
    return null;
  }

  const token = await getGoogleAccessToken();
  const [ocRows, detalleRows, recepRows, dbRows] = await fetchBatchRanges(
    token,
    PURCHASE_ORDERS_SHEET_ID,
    ["'1.OCs'!A1:I1500", "'2.DetalleOCs'!A1:P6000", "'DocumentosDeRecepción'!A1:F15000", "'DB'!A1:B1000"]
  );

  // Build canonical validation lookup from DB!$A:$A (products) and DB!$B:$B (suppliers)
  const dbProductByNorm = new Map<string, string>();
  const dbSupplierByNorm = new Map<string, string>();
  for (let i = 1; i < (dbRows || []).length; i++) {
    const r = dbRows[i];
    const prodVal = String(r?.[0] || '').trim();
    const supVal = String(r?.[1] || '').trim();
    if (prodVal) dbProductByNorm.set(norm(prodVal), prodVal);
    if (supVal) dbSupplierByNorm.set(norm(supVal), supVal);
  }

  function getSheetProductName(product: any, fallbackRawName?: string | null): string {
    const sku = String(product?.sku || '').trim();
    const validSku = sku && !sku.startsWith('AUTO-') && !sku.endsWith('_OLD') ? sku : '';
    const rawFallback = String(fallbackRawName || '').trim();
    const cleanName = String(product?.name || '')
      .replace(/^\[interno\]\s*/i, '')
      .trim();

    // 1. Prefer exact match in DB!$A:$A via SKU, fallbackRawName, or cleanName
    for (const candidate of [validSku, rawFallback, cleanName]) {
      if (!candidate) continue;
      const n = norm(candidate);
      if (dbProductByNorm.has(n)) return dbProductByNorm.get(n)!;
      const aliased = PRODUCT_ALIASES[n];
      if (aliased && dbProductByNorm.has(aliased)) return dbProductByNorm.get(aliased)!;
    }

    // 2. Otherwise always prefer the product's canonical SKU over its internal display name
    return validSku || rawFallback || cleanName || String(product?.name || '').trim();
  }

  function getSheetSupplierName(rawSupplierName?: string | null): string {
    const s = String(rawSupplierName || '').trim();
    if (!s) return '';
    const n = norm(s);
    if (dbSupplierByNorm.has(n)) return dbSupplierByNorm.get(n)!;
    if (n === 'inyecplast' && dbSupplierByNorm.has('inyectplast')) {
      return dbSupplierByNorm.get('inyectplast')!;
    }
    return s;
  }

  const sheetOCMap = new Map<string, any>();
  const sheetOCsSince: any[] = [];
  let lastOCRow = 1;
  for (let i = 1; i < ocRows.length; i++) {
    const r = ocRows[i];
    const code = String(r[0] || '').trim();
    if (!code) continue;
    lastOCRow = i + 1;
    const rawDate = String(r[1] || '').trim();
    const isoDate = parseDDMMYYYY(rawDate);
    const entry = {
      rowNumber: i + 1,
      oc_code: code,
      rawDate,
      isoDate,
      supplier: String(r[2] || '').trim(),
      payCond: String(r[3] || '').trim(),
      payTerm: String(r[4] || '').trim(),
      estDeliv: String(r[5] || '').trim(),
      notes: String(r[6] || '').trim(),
      total: parseNumber(r[7]),
      status: String(r[8] || '').trim(),
      items: [] as any[],
    };
    sheetOCMap.set(code, entry);
    if (isoDate && isoDate >= sinceDate) {
      sheetOCsSince.push(entry);
    }
  }

  let lastDetalleRow = 1;
  for (let i = 1; i < detalleRows.length; i++) {
    const r = detalleRows[i];
    const code = String(r[0] || '').trim();
    const prod = String(r[3] || '').trim();
    if (!code && !prod) continue;
    lastDetalleRow = i + 1;
    const oc = sheetOCMap.get(code);
    if (oc && prod) {
      oc.items.push({
        rowNumber: i + 1,
        oc_code: code,
        productName: prod,
        qtyOrdered: parseNumber(r[4]),
        unitCost: parseNumber(r[5]),
        subtotal: parseNumber(r[6]),
        qtyReceived: parseNumber(r[7]),
        qtyPending: parseNumber(r[8]),
        lineStatus: String(r[9] || '').trim(),
        sent: String(r[10] || '').trim(),
        cancelled: String(r[11] || '').trim(),
        bdCosto: parseNumber(r[15]),
      });
    }
  }

  const sheetReceptionsSince: any[] = [];
  let lastRecepRow = 1;
  for (let i = 1; i < recepRows.length; i++) {
    const r = recepRows[i];
    const rawDate = String(r[1] || '').trim();
    const prod = String(r[3] || '').trim();
    if (rawDate || prod) lastRecepRow = i + 1;
    const isoDate = parseDDMMYYYY(rawDate);
    if (!isoDate || isoDate < sinceDate || !prod) continue;
    sheetReceptionsSince.push({
      rowNumber: i + 1,
      remitoRef: String(r[0] || '').trim(),
      rawDate,
      isoDate,
      supplier: String(r[2] || '').trim(),
      productName: prod,
      qtyReceived: parseNumber(r[4]),
      oc_code: String(r[5] || '').trim(),
    });
  }

  const [{ data: erpOCs, error: eOC }, { data: erpReceptions, error: eRec }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(name), purchase_order_items(*, product:products(id, name, sku))')
      .gte('order_date', sinceDate)
      .order('order_date', { ascending: true }),
    supabase
      .from('purchase_receptions')
      .select(
        '*, supplier:suppliers(name), purchase_orders!purchase_receptions_purchase_order_id_fkey(oc_code), purchase_reception_items(*, product:products(id, name, sku), purchase_order_items(purchase_order_id, purchase_orders(oc_code))), purchase_reception_orders(purchase_order_id, purchase_orders(oc_code))'
      )
      .gte('reception_date', sinceDate)
      .order('reception_date', { ascending: true }),
  ]);
  if (eOC) throw eOC;
  if (eRec) throw eRec;

  const erpOCByCode = new Map<string, any>();
  for (const o of erpOCs || []) {
    erpOCByCode.set(o.oc_code, o);
  }

  // 1. Identify missing Sheet OCs in ERP
  const missingSheetOCs = sheetOCsSince.filter(sOC => {
    if (!sOC.items.length) return false;
    const existing = erpOCByCode.get(sOC.oc_code);
    if (existing && (existing.purchase_order_items || []).length > 0) return false;
    if (EQUIVALENT_SHEET_TO_ERP_OCS[sOC.oc_code]) return false;
    return true;
  });

  // 2. Group Sheet Receptions and identify missing in ERP
  const recepGroups = new Map<string, any>();
  for (const r of sheetReceptionsSince) {
    const key = `${r.isoDate}||${norm(r.supplier)}||${r.oc_code}`;
    if (!recepGroups.has(key)) {
      recepGroups.set(key, {
        isoDate: r.isoDate,
        rawDate: r.rawDate,
        supplier: r.supplier,
        oc_code: r.oc_code,
        remitoRef: r.remitoRef,
        rows: [] as any[],
      });
    }
    recepGroups.get(key)!.rows.push(r);
  }

  const existingErpSlipSet = new Set(
    (erpReceptions || []).filter((r: any) => r.delivery_slip_number).map((r: any) => purchaseSlipKey(r.supplier_id, r.delivery_slip_number))
  );
  const existingErpRecOCs = new Set<string>();
  for (const rec of erpReceptions || []) {
    if (rec.purchase_orders?.oc_code) existingErpRecOCs.add(rec.purchase_orders.oc_code);
    for (const ro of rec.purchase_reception_orders || []) {
      if (ro.purchase_orders?.oc_code) existingErpRecOCs.add(ro.purchase_orders.oc_code);
    }
    for (const ri of rec.purchase_reception_items || []) {
      const c = ri.purchase_order_items?.purchase_orders?.oc_code;
      if (c) existingErpRecOCs.add(c);
    }
  }

  const missingSheetReceptions = Array.from(recepGroups.values()).filter(g => {
    if (EQUIVALENT_SHEET_TO_ERP_OCS[g.oc_code]) return false;
    const slipNumber = g.remitoRef || `DR-${g.oc_code}-${g.isoDate}`;
    const supplier = resolveSupplier(g.supplier);
    if (supplier && existingErpSlipSet.has(purchaseSlipKey(supplier.id, slipNumber))) return false;
    if (!canImportPurchaseReception(erpOCByCode.get(g.oc_code), existingErpRecOCs.has(g.oc_code))) return false;
    return true;
  });

  // 3. Identify missing ERP OCs in Sheet
  const missingErpOCs = (erpOCs || []).filter((o: any) => {
    if (o.status === 'Cancelado') return false;
    if (sheetOCMap.has(o.oc_code)) return false;
    if (EQUIVALENT_ERP_TO_SHEET_OCS[o.oc_code]) return false;
    const activeItems = (o.purchase_order_items || []).filter((i: any) => i.status !== 'Cancelado');
    return activeItems.length > 0;
  });

  // 4. Identify missing ERP reception lines in Sheet
  const existingSheetRecKeys = new Set<string>();
  for (const r of sheetReceptionsSince) {
    existingSheetRecKeys.add(`${r.oc_code}||norm:${norm(r.productName)}`);
    const resolvedProd = resolveProduct(r.productName);
    if (resolvedProd) {
      existingSheetRecKeys.add(`${r.oc_code}||id:${resolvedProd.id}`);
      existingSheetRecKeys.add(`${r.oc_code}||norm:${norm(getSheetProductName(resolvedProd, r.productName))}`);
    }
  }

  const missingErpReceptionLines: Array<{
    oc_code: string;
    date: string;
    isoDate: string;
    supplier: string;
    productName: string;
    quantityReceived: number;
    slipNumber: string;
  }> = [];

  for (const rec of erpReceptions || []) {
    // Receptions imported from DocumentosDeRecepción already exist in the Sheet
    const slipStr = String(rec.delivery_slip_number || '').trim();
    const notesStr = String(rec.notes || '');
    if (slipStr.startsWith('DR-') || notesStr.includes('DocumentosDeRecepción')) {
      continue;
    }

    const recDateDDMMYYYY = formatDDMMYYYY(rec.reception_date);
    const supName = getSheetSupplierName(rec.supplier?.name || '');
    const headerOCCode = rec.purchase_orders?.oc_code || null;

    for (const ri of rec.purchase_reception_items || []) {
      const itemOCCode = ri.purchase_order_items?.purchase_orders?.oc_code || headerOCCode;
      if (!itemOCCode) continue;
      if (EQUIVALENT_ERP_TO_SHEET_OCS[itemOCCode]) continue;
      if (!erpOCByCode.has(itemOCCode)) continue;

      const sheetProdName = getSheetProductName(ri.product, ri.product_name);
      const prodId = ri.product?.id || ri.product_id || null;
      if (
        (prodId && existingSheetRecKeys.has(`${itemOCCode}||id:${prodId}`)) ||
        existingSheetRecKeys.has(`${itemOCCode}||norm:${norm(sheetProdName)}`) ||
        existingSheetRecKeys.has(`${itemOCCode}||norm:${norm(ri.product_name)}`) ||
        existingSheetRecKeys.has(`${itemOCCode}||norm:${norm(ri.product?.name)}`)
      ) {
        continue;
      }

      missingErpReceptionLines.push({
        oc_code: itemOCCode,
        date: recDateDDMMYYYY,
        isoDate: String(rec.reception_date).slice(0, 10),
        supplier: supName,
        productName: sheetProdName,
        quantityReceived: Number(ri.quantity_received || 0),
        slipNumber: slipStr,
      });
    }
  }

  const summary: PurchaseSheetContrastSummary = {
    sinceDate,
    sheetToErp: {
      missingOCs: missingSheetOCs.map(o => ({
        oc_code: o.oc_code,
        date: o.rawDate || formatDDMMYYYY(o.isoDate),
        supplier: o.supplier,
        status: o.status || 'Pendiente',
        total: o.total,
        itemsCount: o.items.length,
      })),
      missingReceptions: missingSheetReceptions.map(g => ({
        oc_code: g.oc_code,
        date: g.rawDate || formatDDMMYYYY(g.isoDate),
        supplier: g.supplier,
        itemsCount: g.rows.length,
        totalUnits: g.rows.reduce((s: number, r: any) => s + Number(r.qtyReceived || 0), 0),
      })),
    },
    erpToSheet: {
      missingOCs: missingErpOCs.map((o: any) => ({
        oc_code: o.oc_code,
        date: formatDDMMYYYY(o.order_date),
        supplier: getSheetSupplierName(o.supplier?.name || ''),
        status: o.status,
        total: Number(o.total_amount || 0),
        itemsCount: (o.purchase_order_items || []).filter((i: any) => i.status !== 'Cancelado').length,
      })),
      missingReceptionLines: missingErpReceptionLines.map(l => ({
        oc_code: l.oc_code,
        date: l.date,
        supplier: l.supplier,
        productName: l.productName,
        quantityReceived: l.quantityReceived,
      })),
    },
  };

  if (!execute) {
    return summary;
  }

  // Execute Synchronization
  let importedOCsCount = 0;
  let importedOCItemsCount = 0;
  let importedReceptionsCount = 0;
  let importedReceptionItemsCount = 0;
  let pushedOCsCount = 0;
  let pushedOCItemsCount = 0;
  let pushedReceptionItemsCount = 0;

  // A. Import missing Sheet OCs into ERP
  for (const sOC of missingSheetOCs) {
    const sup = resolveSupplier(sOC.supplier);
    if (!sup) continue;

    let computedTotal = 0;
    const preparedItems = sOC.items
      .map((it: any) => {
        const prod = resolveProduct(it.productName);
        if (!prod) return null;
        const effectiveCost =
          it.unitCost > 0 ? it.unitCost : it.bdCosto > 0 ? it.bdCosto : Number(prod.cost_price || 0);
        const isCancelledZero = it.cancelled.toUpperCase() === 'SI' && it.qtyReceived === 0;
        const isShortfallClosed =
          it.cancelled.toUpperCase() === 'SI' && it.qtyReceived > 0 && it.qtyReceived < it.qtyOrdered;
        const lineSubtotal = Math.round(it.qtyOrdered * effectiveCost * 100) / 100;
        if (!isCancelledZero) computedTotal += lineSubtotal;
        return {
          product_id: prod.id,
          raw_product_name: it.productName,
          quantity_ordered: it.qtyOrdered,
          quantity_received: 0,
          legacy_received_quantity: 0,
          unit_cost: Math.round(effectiveCost * 100) / 100,
          subtotal: lineSubtotal,
          status: isCancelledZero ? 'Cancelado' : 'Pendiente',
          shortfall_closed: isShortfallClosed,
          notes: it.cancelled.toUpperCase() === 'SI' ? 'Cancelado en planilla' : null,
        };
      })
      .filter(Boolean);

    if (!preparedItems.length) continue;

    const headerTotal =
      sOC.total > 0 ? Math.round(sOC.total * 100) / 100 : Math.round(computedTotal * 100) / 100;
    const orderTimestamp = `${sOC.isoDate}T15:00:00-03:00`;
    const estDelivIso = parseDDMMYYYY(sOC.estDeliv);

    let insertedPO = erpOCByCode.get(sOC.oc_code);
    if (!insertedPO) {
      const { data: poData, error: insPOErr } = await supabase
        .from('purchase_orders')
        .insert({
          oc_code: sOC.oc_code,
          supplier_id: sup.id,
          order_date: orderTimestamp,
          estimated_delivery_date: estDelivIso ? `${estDelivIso}T15:00:00-03:00` : null,
          payment_condition: sOC.payCond || null,
          payment_term_days: parseNumber(sOC.payTerm) || null,
          notes: sOC.notes
            ? `${sOC.notes} [Sincronizado Planilla]`
            : 'Sincronizado desde planilla de Órdenes de Compra',
          total_amount: headerTotal,
          // Receipt import determines fulfillment after quantities are registered.
          status: 'Pendiente',
        })
        .select('*')
        .single();
      if (insPOErr) throw new Error(`Error al importar OC ${sOC.oc_code}: ${insPOErr.message}`);
      insertedPO = poData;
    }

    const itemsPayload = preparedItems.map((pi: any) => ({
      ...pi,
      purchase_order_id: insertedPO.id,
    }));
    const { data: insertedItems, error: insItemsErr } = await supabase
      .from('purchase_order_items')
      .insert(itemsPayload)
      .select('*');
    if (insItemsErr) throw new Error(`Error al importar ítems de ${sOC.oc_code}: ${insItemsErr.message}`);

    insertedPO.purchase_order_items = insertedItems;
    insertedPO.supplier = { name: sup.name };
    erpOCByCode.set(sOC.oc_code, insertedPO);
    importedOCsCount++;
    importedOCItemsCount += (insertedItems || []).length;
  }

  const defaultCreatedBy =
    (erpOCs || []).find((o: any) => o.created_by)?.created_by ||
    (erpReceptions || []).find((r: any) => r.created_by)?.created_by ||
    null;

  // B. Import missing Sheet Receptions into ERP
  for (const group of missingSheetReceptions) {
    const sup = resolveSupplier(group.supplier);
    if (!sup) continue;

    const slipNumber = group.remitoRef || `DR-${group.oc_code}-${group.isoDate}`;
    const targetOC = erpOCByCode.get(group.oc_code) || null;
    const receptionTimestamp = `${group.isoDate}T15:00:00-03:00`;

    const { data: insertedRec, error: recErr } = await supabase
      .from('purchase_receptions')
      .insert({
        supplier_id: sup.id,
        purchase_order_id: targetOC ? targetOC.id : null,
        delivery_slip_number: slipNumber,
        reception_date: receptionTimestamp,
        notes: `Sincronizado desde DocumentosDeRecepción (${group.oc_code})`,
        impacts_stock: false,
        currency: 'ARS',
        created_by: defaultCreatedBy,
      })
      .select('*')
      .single();
    if (recErr) throw new Error(`Error al importar recepción ${slipNumber}: ${recErr.message}`);

    if (targetOC) {
      await supabase.from('purchase_reception_orders').insert({
        purchase_reception_id: insertedRec.id,
        purchase_order_id: targetOC.id,
      });
    }

    let recTotal = 0;
    const recItemsPayload: any[] = [];
    const usedOCItemIds = new Set<string>();

    for (const line of group.rows) {
      const prod = resolveProduct(line.productName);
      if (!prod) continue;

      let matchedOCItem: any = null;
      if (targetOC && Array.isArray(targetOC.purchase_order_items)) {
        matchedOCItem =
          targetOC.purchase_order_items.find(
            (oi: any) => oi.product_id === prod.id && !usedOCItemIds.has(oi.id)
          ) || targetOC.purchase_order_items.find((oi: any) => oi.product_id === prod.id);
        if (matchedOCItem) usedOCItemIds.add(matchedOCItem.id);
      }

      const unitCost =
        matchedOCItem?.unit_cost > 0 ? Number(matchedOCItem.unit_cost) : Number(prod.cost_price || 0);
      recTotal += Math.round(line.qtyReceived * unitCost * 100) / 100;

      recItemsPayload.push({
        purchase_reception_id: insertedRec.id,
        purchase_order_item_id: matchedOCItem ? matchedOCItem.id : null,
        product_id: prod.id,
        product_name: line.productName,
        quantity_received: line.qtyReceived,
        unit_cost: Math.round(unitCost * 100) / 100,
      });
    }

    if (recItemsPayload.length > 0) {
      const { error: recItemsErr } = await supabase
        .from('purchase_reception_items')
        .insert(recItemsPayload);
      if (recItemsErr) throw new Error(`Error en ítems de recepción ${slipNumber}: ${recItemsErr.message}`);
    }

    const sheetOC = sheetOCMap.get(group.oc_code);
    if (targetOC && sheetOC && sheetOC.status === 'Cumplido') {
      await supabase
        .from('purchase_order_items')
        .update({ status: 'Cumplido', shortfall_closed: true })
        .eq('purchase_order_id', targetOC.id)
        .neq('status', 'Cancelado');
      await supabase.from('purchase_orders').update({ status: 'Cumplido' }).eq('id', targetOC.id);
    }

    await supabase.from('supplier_purchases').insert({
      supplier_id: sup.id,
      invoice_number: slipNumber,
      purchase_date: receptionTimestamp,
      total_amount: Math.round(recTotal * 100) / 100,
      paid_amount: 0,
      currency: 'ARS',
      status: 'Pendiente',
      document_type: 'Remito',
      purchase_order_id: targetOC ? targetOC.id : null,
      purchase_reception_id: insertedRec.id,
      notes: `Sincronizado desde DocumentosDeRecepción (${group.oc_code})`,
      created_by: defaultCreatedBy,
    });

    importedReceptionsCount++;
    importedReceptionItemsCount += recItemsPayload.length;
  }

  // C. Push missing ERP OCs & Receptions to Google Sheet
  let nextOCRow = lastOCRow + 1;
  let nextDetalleRow = lastDetalleRow + 1;
  let nextRecepRow = lastRecepRow + 1;
  const sheetUpdates: Array<{ range: string; values: any[][] }> = [];

  for (const erpOC of missingErpOCs) {
    const activeItems = (erpOC.purchase_order_items || []).filter((i: any) => i.status !== 'Cancelado');
    if (!activeItems.length) continue;

    const rOC = nextOCRow++;
    const dateDDMMYYYY = formatDDMMYYYY(erpOC.order_date);
    const estDelivDDMMYYYY = erpOC.estimated_delivery_date
      ? formatDDMMYYYY(erpOC.estimated_delivery_date)
      : '';
    const supplierName = getSheetSupplierName(erpOC.supplier?.name || '');

    sheetUpdates.push({
      range: `'1.OCs'!A${rOC}:I${rOC}`,
      values: [
        [
          erpOC.oc_code,
          dateDDMMYYYY,
          supplierName,
          erpOC.payment_condition || '',
          erpOC.payment_term_days || '',
          estDelivDDMMYYYY,
          erpOC.notes || '',
          `=SUMIF('2.DetalleOCs'!A:A;A${rOC};'2.DetalleOCs'!G:G)`,
          `=IF(A${rOC}="";"";IF(COUNTIFS('2.DetalleOCs'!A:A;A${rOC};'2.DetalleOCs'!J:J;"Pendiente")>0;"Pendiente";"Cumplido"))`,
        ],
      ],
    });
    pushedOCsCount++;

    for (const item of activeItems) {
      const rDet = nextDetalleRow++;
      const prodName = getSheetProductName(item.product, item.raw_product_name);
      const qtyOrd = Number(item.quantity_ordered || 0);
      const unitCost = Number(item.unit_cost || 0);

      sheetUpdates.push({
        range: `'2.DetalleOCs'!A${rDet}:P${rDet}`,
        values: [
          [
            erpOC.oc_code,
            `=IFERROR(VLOOKUP(A${rDet};'1.OCs'!A:B;2;0))`,
            `=IFERROR(VLOOKUP(A${rDet};'1.OCs'!A:C;3;0))`,
            prodName,
            qtyOrd,
            unitCost,
            `=F${rDet}*E${rDet}`,
            `=SUMIFS('DocumentosDeRecepción'!E:E;'DocumentosDeRecepción'!D:D;D${rDet};'DocumentosDeRecepción'!F:F;A${rDet})+SUMIFS('Recibidos Enero'!C:C;'Recibidos Enero'!B:B;D${rDet};'Recibidos Enero'!E:E;A${rDet})`,
            `=IF(L${rDet}="SI";0;E${rDet}-H${rDet})`,
            `=IF(I${rDet}=0;"Linea Cumplida";IF(I${rDet}<0;"Demás";"Pendiente"))`,
            'SI',
            '',
            estDelivDDMMYYYY,
            '',
            '',
            `=IFERROR(VLOOKUP(D${rDet};'BD Costo'!A:E;5;0))`,
          ],
        ],
      });
      pushedOCItemsCount++;
    }
  }

  for (const line of missingErpReceptionLines) {
    const rRec = nextRecepRow++;
    sheetUpdates.push({
      range: `'DocumentosDeRecepción'!A${rRec}:F${rRec}`,
      values: [
        [
          line.slipNumber,
          line.date,
          line.supplier,
          line.productName,
          line.quantityReceived,
          line.oc_code,
        ],
      ],
    });
    pushedReceptionItemsCount++;
  }

  if (sheetUpdates.length > 0) {
    await ensureSheetCapacity(token, PURCHASE_ORDERS_SHEET_ID, '1.OCs', nextOCRow);
    await ensureSheetCapacity(token, PURCHASE_ORDERS_SHEET_ID, '2.DetalleOCs', nextDetalleRow);
    await ensureSheetCapacity(token, PURCHASE_ORDERS_SHEET_ID, 'DocumentosDeRecepción', nextRecepRow);
    await batchUpdateValues(token, PURCHASE_ORDERS_SHEET_ID, sheetUpdates);
  }

  summary.executed = {
    importedOCsCount,
    importedOCItemsCount,
    importedReceptionsCount,
    importedReceptionItemsCount,
    pushedOCsCount,
    pushedOCItemsCount,
    pushedReceptionItemsCount,
  };

  return summary;
}
