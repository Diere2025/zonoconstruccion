import { NextResponse } from 'next/server';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export interface SellerConfig {
  name: string;
  spreadsheetId: string;
  sheetName: string;
  prefix: string;
}

export const SELLERS: SellerConfig[] = [
  {
    name: 'Diego Bóveda',
    spreadsheetId: '1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg',
    sheetName: 'Pendientes',
    prefix: 'DB'
  },
  {
    name: 'Jazmín Sánchez',
    spreadsheetId: '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw',
    sheetName: 'Pendientes',
    prefix: 'JS'
  },
  {
    name: 'Ludmila Krenz',
    spreadsheetId: '1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8',
    sheetName: 'Pendientes',
    prefix: 'LK'
  },
  {
    name: 'Facundo Paz',
    spreadsheetId: '1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns',
    sheetName: 'Pendientes',
    prefix: 'AQ-FP'
  }
];

export const CENTRAL_SPREADSHEET_ID = '1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0';
export const CENTRAL_SHEET_NAME = 'Central pedidos';

export const ENTREGAS_SPREADSHEET_ID = '1mESHu4klY3N1XBXVgFT_Q7ZwlLtiA8GTi5NCCFFboZs';
export const ENTREGAS_SHEETS_TO_CHECK = [
  'Vendedores',
  'Nuevos',
  'Pend',
  'Entregando',
  'SinStock/o pasar dia',
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L6'
];

interface CachedReport {
  timestamp: number;
  data: any;
}

let cachedReport: CachedReport | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60s cache

function normalizeCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

function extractCodeParts(rawCode: string): string[] {
  const norm = normalizeCode(rawCode);
  if (!norm) return [];
  const parts = norm.split(/[\/,]/).map(p => p.trim()).filter(Boolean);
  return Array.from(new Set([norm, ...parts]));
}

function isCompletedStatus(status: string): boolean {
  const s = (status || '').trim().toLowerCase();
  return s === 'entregado' || s === 'cancelado' || s === 'anulado' || s === 'pasado';
}

function parseSheetDateToTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const clean = dateStr.trim();
  if (!clean) return 0;

  const parts = clean.split(/[\/\-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (year < 100) {
      year += 2000;
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month - 1, day).getTime() || 0;
    }
  }

  const parsed = Date.parse(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function compareRecency(
  dateA?: string,
  dateB?: string,
  rowA: number = 0,
  rowB: number = 0,
  codeA: string = '',
  codeB: string = ''
): number {
  const timeA = parseSheetDateToTimestamp(dateA);
  const timeB = parseSheetDateToTimestamp(dateB);

  // Highest/newest timestamp first
  if (timeA !== timeB && timeA > 0 && timeB > 0) {
    return timeB - timeA;
  }
  if (timeA > 0 && timeB === 0) return -1;
  if (timeB > 0 && timeA === 0) return 1;

  // Numerical part of code if same format (e.g. JS25316 vs JS24002)
  const numA = parseInt(codeA.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(codeB.replace(/\D/g, ''), 10) || 0;
  if (numA !== numB && numA > 0 && numB > 0) {
    return numB - numA;
  }

  // Fallback to row number descending (higher row = newer)
  return rowB - rowA;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && cachedReport && (now - cachedReport.timestamp < CACHE_TTL_MS)) {
      return NextResponse.json({
        ...cachedReport.data,
        fromCache: true,
        cachedAt: new Date(cachedReport.timestamp).toISOString()
      });
    }

    // 1. Fetch Entregas Actual sheets in parallel
    const entregasPromises = ENTREGAS_SHEETS_TO_CHECK.map(async (sheetName) => {
      try {
        const rows = await fetchSpreadsheetValues(ENTREGAS_SPREADSHEET_ID, `'${sheetName}'!A1:B`);
        return { sheetName, rows, error: null };
      } catch (err: any) {
        console.warn(`[ControlPlanillas] Error fetching Entregas Actual sheet "${sheetName}":`, err?.message || err);
        return { sheetName, rows: [], error: err?.message || 'Error al leer hoja' };
      }
    });

    // 2. Fetch Central pedidos
    const centralPromise = (async () => {
      try {
        const rows = await fetchSpreadsheetValues(CENTRAL_SPREADSHEET_ID, `'${CENTRAL_SHEET_NAME}'!A1:N`);
        return { rows, error: null };
      } catch (err: any) {
        console.error('[ControlPlanillas] Error fetching Central pedidos:', err?.message || err);
        return { rows: [], error: err?.message || 'Error al leer Central pedidos' };
      }
    })();

    // 3. Fetch Sellers sheets
    const sellersPromises = SELLERS.map(async (seller) => {
      try {
        const rows = await fetchSpreadsheetValues(seller.spreadsheetId, `'${seller.sheetName}'!A1:N`);
        return { seller, rows, error: null };
      } catch (err: any) {
        console.error(`[ControlPlanillas] Error fetching seller "${seller.name}":`, err?.message || err);
        return { seller, rows: [], error: err?.message || 'Error al leer planilla de vendedor' };
      }
    });

    const [entregasResults, centralResult, sellersResults] = await Promise.all([
      Promise.all(entregasPromises),
      centralPromise,
      Promise.all(sellersPromises)
    ]);

    // Index Entregas Actual codes
    // Map: normalizedCode -> { sheet: string, row: number, rawCode: string }
    const entregasMap = new Map<string, { sheet: string; row: number; rawCode: string }>();
    const sheetsStats: Record<string, { rowCount: number; error: string | null }> = {};

    for (const res of entregasResults) {
      sheetsStats[`Entregas: ${res.sheetName}`] = {
        rowCount: res.rows.length,
        error: res.error
      };
      res.rows.forEach((r, idx) => {
        const rawCode = normalizeCode(r[0] || '');
        if (!rawCode || rawCode.length < 3) return;
        if (['PEDIDO', 'CÓDIGO', 'CODIGO', 'FECHA', 'GYV TRANSPORTE', 'PEDIDOS QUE NO TENEMOS STOCK'].includes(rawCode)) return;

        const parts = extractCodeParts(rawCode);
        for (const p of parts) {
          if (!entregasMap.has(p)) {
            entregasMap.set(p, { sheet: res.sheetName, row: idx + 1, rawCode });
          }
        }
      });
    }

    // Index Central codes
    // Map: normalizedCode -> { row: number, status: string, date: string, client: string, phone: string, seller: string, rawCode: string }
    const centralMap = new Map<string, {
      row: number;
      status: string;
      deliveryDate: string;
      orderDate: string;
      client: string;
      phone: string;
      seller: string;
      rawCode: string;
    }>();

    sheetsStats['Central pedidos'] = {
      rowCount: centralResult.rows.length,
      error: centralResult.error
    };

    centralResult.rows.forEach((r, idx) => {
      if (idx < 2) return; // Header rows
      const status = (r[0] || '').trim();
      const rawCode = normalizeCode(r[1] || '');
      const deliveryDate = (r[2] || '').trim();
      const orderDate = (r[3] || '').trim();
      const client = (r[5] || '').trim();
      const phone = (r[6] || '').trim();
      const seller = (r[12] || '').trim();

      if (!rawCode) return;
      const parts = extractCodeParts(rawCode);
      for (const p of parts) {
        if (!centralMap.has(p)) {
          centralMap.set(p, {
            row: idx + 1,
            status,
            deliveryDate,
            orderDate,
            client,
            phone,
            seller,
            rawCode
          });
        }
      }
    });

    // 4. Process Seller discrepancies
    interface SellerDiscrepancy {
      sellerName: string;
      sellerSpreadsheetId: string;
      sellerSheetName: string;
      rowNumber: number;
      orderCode: string;
      sellerStatus: string;
      deliveryDate: string;
      orderDate: string;
      customerName: string;
      phone: string;
      inCentral: boolean;
      centralStatus?: string;
      centralRow?: number;
      inEntregas: boolean;
      entregasSheet?: string;
      entregasRow?: number;
      discrepancyType: 'missing_in_both' | 'in_central_missing_entregas' | 'missing_in_central';
      severity: 'critical' | 'high' | 'medium';
    }

    const sellerDiscrepancies: SellerDiscrepancy[] = [];
    let totalPendingSellerOrders = 0;
    let totalSynchronizedSellerOrders = 0;

    for (const sRes of sellersResults) {
      sheetsStats[`Vendedor: ${sRes.seller.name}`] = {
        rowCount: sRes.rows.length,
        error: sRes.error
      };

      sRes.rows.forEach((r, idx) => {
        if (idx < 2) return; // Header rows
        const sellerStatus = (r[0] || '').trim();
        const rawCode = normalizeCode(r[1] || '');
        const deliveryDate = (r[2] || '').trim();
        const orderDate = (r[3] || '').trim();
        const customerName = (r[5] || '').trim();
        const phone = (r[6] || '').trim();

        // Must have code and client
        if (!rawCode || !customerName) return;
        // Skip completed / cancelled / delivered
        if (isCompletedStatus(sellerStatus)) return;

        totalPendingSellerOrders++;

        const inCentral = centralMap.has(rawCode);
        const inEntregas = entregasMap.has(rawCode);

        const centralInfo = centralMap.get(rawCode);
        const entregasInfo = entregasMap.get(rawCode);

        if (!inCentral && !inEntregas) {
          sellerDiscrepancies.push({
            sellerName: sRes.seller.name,
            sellerSpreadsheetId: sRes.seller.spreadsheetId,
            sellerSheetName: sRes.seller.sheetName,
            rowNumber: idx + 1,
            orderCode: rawCode,
            sellerStatus: sellerStatus || '(Sin estado)',
            deliveryDate,
            orderDate,
            customerName,
            phone,
            inCentral: false,
            inEntregas: false,
            discrepancyType: 'missing_in_both',
            severity: 'critical'
          });
        } else if (inCentral && !inEntregas) {
          sellerDiscrepancies.push({
            sellerName: sRes.seller.name,
            sellerSpreadsheetId: sRes.seller.spreadsheetId,
            sellerSheetName: sRes.seller.sheetName,
            rowNumber: idx + 1,
            orderCode: rawCode,
            sellerStatus: sellerStatus || '(Sin estado)',
            deliveryDate,
            orderDate,
            customerName,
            phone,
            inCentral: true,
            centralStatus: centralInfo?.status,
            centralRow: centralInfo?.row,
            inEntregas: false,
            discrepancyType: 'in_central_missing_entregas',
            severity: 'high'
          });
        } else if (!inCentral && inEntregas) {
          sellerDiscrepancies.push({
            sellerName: sRes.seller.name,
            sellerSpreadsheetId: sRes.seller.spreadsheetId,
            sellerSheetName: sRes.seller.sheetName,
            rowNumber: idx + 1,
            orderCode: rawCode,
            sellerStatus: sellerStatus || '(Sin estado)',
            deliveryDate,
            orderDate,
            customerName,
            phone,
            inCentral: false,
            inEntregas: true,
            entregasSheet: entregasInfo?.sheet,
            entregasRow: entregasInfo?.row,
            discrepancyType: 'missing_in_central',
            severity: 'medium'
          });
        } else {
          totalSynchronizedSellerOrders++;
        }
      });
    }

    // 5. Process Central discrepancies (in Central active, but missing in Entregas Actual)
    interface CentralDiscrepancy {
      rowNumber: number;
      orderCode: string;
      centralStatus: string;
      deliveryDate: string;
      orderDate: string;
      customerName: string;
      phone: string;
      sellerName: string;
      inEntregas: boolean;
    }

    const centralDiscrepancies: CentralDiscrepancy[] = [];
    const seenCentralCodes = new Set<string>();

    for (const [code, info] of centralMap.entries()) {
      if (code.includes('/')) continue;
      if (seenCentralCodes.has(code)) continue;
      seenCentralCodes.add(code);

      // Skip completed or cancelled in central
      if (isCompletedStatus(info.status)) continue;

      if (!entregasMap.has(code)) {
        centralDiscrepancies.push({
          rowNumber: info.row,
          orderCode: code,
          centralStatus: info.status || '(Sin estado)',
          deliveryDate: info.deliveryDate,
          orderDate: info.orderDate,
          customerName: info.client,
          phone: info.phone,
          sellerName: info.seller,
          inEntregas: false
        });
      }
    }

    // Sort from newest / most recent to oldest
    sellerDiscrepancies.sort((a, b) => 
      compareRecency(
        a.orderDate || a.deliveryDate,
        b.orderDate || b.deliveryDate,
        a.rowNumber,
        b.rowNumber,
        a.orderCode,
        b.orderCode
      )
    );

    centralDiscrepancies.sort((a, b) => 
      compareRecency(
        a.orderDate || a.deliveryDate,
        b.orderDate || b.deliveryDate,
        a.rowNumber,
        b.rowNumber,
        a.orderCode,
        b.orderCode
      )
    );

    // Metrics summary
    const missingInBothCount = sellerDiscrepancies.filter(d => d.discrepancyType === 'missing_in_both').length;
    const inCentralMissingEntregasCount = sellerDiscrepancies.filter(d => d.discrepancyType === 'in_central_missing_entregas').length;
    const missingInCentralCount = sellerDiscrepancies.filter(d => d.discrepancyType === 'missing_in_central').length;

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        totalDiscrepancies: sellerDiscrepancies.length + centralDiscrepancies.length,
        missingInBothCount,
        inCentralMissingEntregasCount,
        missingInCentralCount,
        centralOnlyMissingEntregasCount: centralDiscrepancies.length,
        totalPendingSellerOrders,
        totalSynchronizedSellerOrders,
        totalEntregasCodesIndexed: entregasMap.size,
        totalCentralCodesIndexed: centralMap.size
      },
      sellerDiscrepancies,
      centralDiscrepancies,
      sheetsStats,
      config: {
        centralSpreadsheetId: CENTRAL_SPREADSHEET_ID,
        centralSheetName: CENTRAL_SHEET_NAME,
        entregasSpreadsheetId: ENTREGAS_SPREADSHEET_ID,
        entregasSheets: ENTREGAS_SHEETS_TO_CHECK,
        sellers: SELLERS.map(s => ({ name: s.name, id: s.spreadsheetId, sheet: s.sheetName }))
      }
    };

    cachedReport = {
      timestamp: now,
      data: payload
    };

    return NextResponse.json({
      ...payload,
      fromCache: false
    });
  } catch (error: any) {
    console.error('[ControlPlanillas] Error general:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Error al ejecutar control de planillas'
      },
      { status: 500 }
    );
  }
}
