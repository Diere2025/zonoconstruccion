import { NextResponse } from 'next/server';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '1YFJcTYKjoP7uE1_LxKPNIC-7esxRY-1qn5y-4NKoaa0';

interface CachedData {
  timestamp: number;
  data: any;
}

let cache: CachedData | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

function parseMoney(val: any): number {
  if (!val) return 0;
  let str = val.toString().trim().replace(/[^0-9.,-]/g, '');
  if (!str) return 0;
  // If format like 44.021.701 or 44.021.701,00
  str = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val: any): number {
  if (!val) return 0;
  let str = val.toString().trim().replace(/[^0-9.,-]/g, '');
  if (!str) return 0;
  str = str.replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && cache && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cache.data);
    }

    // 1. Fetch main EERR range
    const values = await fetchSpreadsheetValues(SPREADSHEET_ID, 'EERR!A1:AK34');

    if (!values || values.length < 25) {
      throw new Error('EERR sheet data is empty or too short');
    }

    // Days headers: from column index 8 onwards in row 0
    // Row 0: ["ge", "Concepto", "% Tot", "Ingresos", "Egresos", "% Unit", "", "", "1/9", "2/9", ...]
    const headerRow = values[0] || [];
    const dayHeaders: string[] = [];
    const dayColIndices: number[] = [];

    for (let c = 8; c < headerRow.length; c++) {
      const h = (headerRow[c] || '').trim();
      if (h) {
        dayHeaders.push(h);
        dayColIndices.push(c);
      }
    }

    // Map rows by concept name
    const rowsByConcept = new Map<string, string[]>();
    values.forEach(r => {
      const concept = (r[1] || '').trim();
      if (concept) {
        rowsByConcept.set(concept.toLowerCase(), r);
      }
    });

    // Helper to get row by keywords
    function findRow(...keywords: string[]): string[] {
      for (const [k, r] of rowsByConcept.entries()) {
        if (keywords.every(kw => k.includes(kw.toLowerCase()))) {
          return r;
        }
      }
      return [];
    }

    const facturacionRow = findRow('facturación');
    const inversionesRow = findRow('inversiones');
    const costoMercaderiaRow = findRow('costo mercadería') || findRow('mercaderia');
    const publicidadRow = findRow('publicidad') && !findRow('publicidad (fee)') ? findRow('publicidad') : (rowsByConcept.get('publicidad') || []);
    const publicidadFeeRow = findRow('publicidad (fee)') || findRow('fee');
    const sueldosRow = findRow('sueldos');
    const fleteRow = findRow('servicio de flete') || findRow('flete');
    const mpRow = findRow('mercadopago') || findRow('mercado pago');
    const alquileresRow = findRow('alquileres');
    const honorariosRow = findRow('honorarios');
    const insumoGlpRow = findRow('insumo glp') || findRow('glp');
    const insumoProdRow = findRow('insumo de producto');
    const operativosRow = findRow('gastos operativos');
    const peajesRow = findRow('peajes');
    const eventualesRow = findRow('eventuales');
    const vehiculosRow = findRow('vehículos') || findRow('vehiculos');
    const impuestosRow = findRow('iva + iibb');
    const utilidadNetaRow = findRow('utilidad neta');
    const actualRow = findRow('actual');
    const proyectadoRow = findRow('proyectado');
    const contribucionRow = findRow('contribución marginal') || findRow('contribucion');
    const pctFleteRow = findRow('% servicio de flete') || findRow('% flete');
    const pctPublicidadRow = findRow('% publicidad');
    const pctCmvRow = findRow('%cmv');

    // Extract Totals and KPIs
    const totalFacturacion = parseMoney(facturacionRow[3]);
    const totalEgresos = parseMoney(utilidadNetaRow[4]);
    const totalCmv = parseMoney(costoMercaderiaRow[4]);
    const totalPublicidad = parseMoney(publicidadRow[4]) + parseMoney(publicidadFeeRow[4]);
    const totalFlete = parseMoney(fleteRow[4]);
    const totalSueldos = parseMoney(sueldosRow[4]);
    const totalMp = parseMoney(mpRow[4]);

    const margenBruto = totalFacturacion - totalCmv;
    const pctMargenBruto = totalFacturacion > 0 ? (margenBruto / totalFacturacion) * 100 : 0;
    const pctCmv = totalFacturacion > 0 ? (totalCmv / totalFacturacion) * 100 : 0;
    const pctFlete = totalFacturacion > 0 ? (totalFlete / totalFacturacion) * 100 : 0;
    const pctPublicidad = totalFacturacion > 0 ? (totalPublicidad / totalFacturacion) * 100 : 0;

    const utilidadNetaActual = parseMoney(actualRow[2]) || (totalFacturacion - totalEgresos);
    const utilidadNetaProyectada = parseMoney(proyectadoRow[2]);

    // Categories breakdown for Donut Chart
    const categoriesList = [
      { name: 'Costo Mercadería (CMV)', amount: parseMoney(costoMercaderiaRow[4]), color: '#3b82f6' },
      { name: 'Publicidad + Fee', amount: totalPublicidad, color: '#ef4444' },
      { name: 'Sueldos', amount: parseMoney(sueldosRow[4]), color: '#8b5cf6' },
      { name: 'Servicio de Flete', amount: parseMoney(fleteRow[4]), color: '#f59e0b' },
      { name: 'Insumo GLP', amount: parseMoney(insumoGlpRow[4]), color: '#10b981' },
      { name: 'Costos MercadoPago', amount: parseMoney(mpRow[4]), color: '#06b6d4' },
      { name: 'Alquileres', amount: parseMoney(alquileresRow[4]), color: '#ec4899' },
      { name: 'Insumo de Producto', amount: parseMoney(insumoProdRow[4]), color: '#84cc16' },
      { name: 'Honorarios', amount: parseMoney(honorariosRow[4]), color: '#64748b' },
      { name: 'Eventuales', amount: parseMoney(eventualesRow[4]), color: '#d97706' },
      { name: 'Gastos Operativos', amount: parseMoney(operativosRow[4]), color: '#a855f7' },
      { name: 'IVA + IIBB', amount: parseMoney(impuestosRow[4]), color: '#14b8a6' },
      { name: 'Gasto Peajes', amount: parseMoney(peajesRow[4]), color: '#e11d48' },
      { name: 'Vehículos', amount: parseMoney(vehiculosRow[4]), color: '#0284c7' }
    ].filter(c => c.amount > 0);

    const sumExpenses = categoriesList.reduce((acc, c) => acc + c.amount, 0);
    const expensesByCategory = categoriesList.map(c => ({
      ...c,
      percentage: sumExpenses > 0 ? Number(((c.amount / sumExpenses) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.amount - a.amount);

    // Build Daily Timeline (day 1 to 30/31)
    const dailyTimeline = dayHeaders.map((dayLabel, idx) => {
      const col = dayColIndices[idx];

      const facturacion = parseMoney(facturacionRow[col]);
      const cmv = parseMoney(costoMercaderiaRow[col]);
      const publicidad = parseMoney(publicidadRow[col]) + parseMoney(publicidadFeeRow[col]);
      const flete = parseMoney(fleteRow[col]);
      const sueldos = parseMoney(sueldosRow[col]);
      const utilidadDia = parseMoney(utilidadNetaRow[col]);
      const acumulado = parseMoney(actualRow[col]) || parseMoney(values[24]?.[col]);

      const pctFleteVal = pctFleteRow[col] ? parsePercent(pctFleteRow[col]) : (facturacion > 0 ? (flete / facturacion) * 100 : 0);
      const pctPubVal = pctPublicidadRow[col] ? parsePercent(pctPublicidadRow[col]) : (facturacion > 0 ? (publicidad / facturacion) * 100 : 0);
      const pctCmvVal = pctCmvRow[col] ? parsePercent(pctCmvRow[col]) : (facturacion > 0 ? (cmv / facturacion) * 100 : 0);

      // Daily total expenses
      let dayExpenses = 0;
      for (let rIdx = 3; rIdx <= 22; rIdx++) {
        dayExpenses += parseMoney(values[rIdx]?.[col]);
      }

      return {
        day: dayLabel,
        revenue: facturacion,
        expenses: dayExpenses,
        cmv,
        flete,
        publicidad,
        sueldos,
        netProfit: utilidadDia,
        cumulativeProfit: acumulado,
        pctFlete: Number(pctFleteVal.toFixed(2)),
        pctPublicidad: Number(pctPubVal.toFixed(2)),
        pctCmv: Number(pctCmvVal.toFixed(2)),
        hasData: facturacion > 0 || dayExpenses > 0
      };
    });

    // Matrix rows for table view
    const matrixRows = values.slice(1, 24).map(r => {
      const concept = (r[1] || '').trim();
      const pctTot = (r[2] || '').trim();
      const ingresos = parseMoney(r[3]);
      const egresos = parseMoney(r[4]);
      const pctUnit = (r[5] || '').trim();

      const dailyValues = dayColIndices.map(col => parseMoney(r[col]));

      let categoryType = 'gasto';
      if (concept.toLowerCase().includes('facturación')) categoryType = 'ingreso';
      else if (concept.toLowerCase().includes('mercadería') || concept.toLowerCase().includes('insumo')) categoryType = 'costo_directo';
      else if (concept.toLowerCase().includes('publicidad') || concept.toLowerCase().includes('flete')) categoryType = 'comercial';
      else if (concept.toLowerCase().includes('sueldos') || concept.toLowerCase().includes('alquileres') || concept.toLowerCase().includes('honorarios')) categoryType = 'fijo';
      else if (concept.toLowerCase().includes('iibb') || concept.toLowerCase().includes('iigg')) categoryType = 'impuesto';

      return {
        concept,
        pctTot,
        ingresos,
        egresos,
        pctUnit,
        total: ingresos > 0 ? ingresos : egresos,
        type: categoryType,
        dailyValues
      };
    }).filter(r => r.concept && (r.ingresos > 0 || r.egresos > 0 || r.concept.toLowerCase().includes('facturación')));

    const result = {
      success: true,
      lastUpdated: new Date().toISOString(),
      source: 'Google Sheets (Service Account)',
      kpis: {
        totalFacturacion,
        totalEgresos,
        margenBruto,
        pctMargenBruto: Number(pctMargenBruto.toFixed(2)),
        totalCmv,
        pctCmv: Number(pctCmv.toFixed(2)),
        totalPublicidad,
        pctPublicidad: Number(pctPublicidad.toFixed(2)),
        totalFlete,
        pctFlete: Number(pctFlete.toFixed(2)),
        totalSueldos,
        totalMp,
        utilidadNetaActual,
        pctUtilidadActual: totalFacturacion > 0 ? Number(((utilidadNetaActual / totalFacturacion) * 100).toFixed(2)) : 0,
        utilidadNetaProyectada,
        diasRegistrados: dailyTimeline.filter(d => d.hasData).length,
        totalDiasMes: dayHeaders.length
      },
      expensesByCategory,
      dailyTimeline,
      matrix: {
        days: dayHeaders,
        rows: matrixRows
      }
    };

    cache = { timestamp: now, data: result };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /api/admin/finanzas/eerr] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error fetching EERR data from Google Sheets'
      },
      { status: 500 }
    );
  }
}
