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

    function findRow(...keywords: string[]): string[] {
      for (const [k, r] of rowsByConcept.entries()) {
        if (keywords.every(kw => k.includes(kw.toLowerCase()))) {
          return r;
        }
      }
      return [];
    }

    const facturacionRow = findRow('facturación');
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

    // Totals
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

    // Helper to format a single line row
    function createRow(r: string[], conceptOverride?: string) {
      if (!r || r.length === 0) return null;
      const concept = conceptOverride || (r[1] || '').trim();
      const pctTot = (r[2] || '').trim();
      const ingresos = parseMoney(r[3]);
      const egresos = parseMoney(r[4]);
      const pctUnit = (r[5] || '').trim();
      const dailyValues = dayColIndices.map(col => parseMoney(r[col]));
      const total = ingresos > 0 ? ingresos : egresos;

      return {
        concept,
        pctTot,
        ingresos,
        egresos,
        pctUnit,
        total,
        dailyValues
      };
    }

    // Helper to sum daily values across multiple rows
    function sumDaily(rows: (any | null)[]): number[] {
      const validRows = rows.filter(Boolean);
      return dayColIndices.map((_, idx) => {
        return validRows.reduce((acc, r) => acc + (r.dailyValues[idx] || 0), 0);
      });
    }

    // STRUCTURED & LOGICAL GROUPS
    // 1. Ingresos
    const rowFacturacion = createRow(facturacionRow);

    // 2. Costos Directos & Mercadería (CMV, Insumo de Producto, Insumo GLP)
    const rowCmv = createRow(costoMercaderiaRow);
    const rowInsumoProd = createRow(insumoProdRow);
    const rowInsumoGlp = createRow(insumoGlpRow);
    const directCostRows = [rowCmv, rowInsumoProd, rowInsumoGlp].filter(Boolean);
    const subtotalDirectCost = {
      total: directCostRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(directCostRows)
    };

    // 3. Marketing & Comercial (Publicidad, Publicidad Fee, Costos MercadoPago)
    const rowPub = createRow(publicidadRow);
    const rowPubFee = createRow(publicidadFeeRow);
    const rowMp = createRow(mpRow);
    const marketingRows = [rowPub, rowPubFee, rowMp].filter(Boolean);
    const subtotalMarketing = {
      total: marketingRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(marketingRows)
    };

    // 4. Logística y Distribución (Servicio de Flete, Peajes, Vehículos)
    const rowFlete = createRow(fleteRow);
    const rowPeajes = createRow(peajesRow);
    const rowVehiculos = createRow(vehiculosRow);
    const logisticsRows = [rowFlete, rowPeajes, rowVehiculos].filter(Boolean);
    const subtotalLogistics = {
      total: logisticsRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(logisticsRows)
    };

    // 5. Personal, RRHH y Estructura (Sueldos, Personal Eventual, Honorarios, Alquileres)
    const rowSueldos = createRow(sueldosRow);
    const rowEventuales = createRow(eventualesRow, 'Personal Eventual (Jornales)');
    const rowHonorarios = createRow(honorariosRow);
    const rowAlquileres = createRow(alquileresRow);
    const structureRows = [rowSueldos, rowEventuales, rowHonorarios, rowAlquileres].filter(Boolean);
    const subtotalStructure = {
      total: structureRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(structureRows)
    };

    // 6. Gastos Operativos y Generales (Gastos Operativos Zono)
    const rowOperativos = createRow(operativosRow);
    const operationalRows = [rowOperativos].filter(Boolean);
    const subtotalOperational = {
      total: operationalRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(operationalRows)
    };

    // 7. Impuestos
    const rowImpuestos = createRow(impuestosRow);
    const taxRows = [rowImpuestos].filter(Boolean);
    const subtotalTax = {
      total: taxRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(taxRows)
    };

    // 8. Resultados
    const rowUtilidadNeta = {
      concept: 'Utilidad Neta dsp de Impuestos',
      pctTot: totalFacturacion > 0 ? `${((utilidadNetaActual / totalFacturacion) * 100).toFixed(2)}%` : '0%',
      ingresos: totalFacturacion,
      egresos: totalEgresos,
      pctUnit: '',
      total: utilidadNetaActual, // Correct actual net profit!
      dailyValues: dayColIndices.map(col => parseMoney(utilidadNetaRow[col]))
    };

    const rowAcumulado = {
      concept: 'Utilidad Neta Acumulada',
      pctTot: '-',
      ingresos: 0,
      egresos: 0,
      pctUnit: '',
      total: utilidadNetaActual,
      dailyValues: dayColIndices.map(col => parseMoney(actualRow[col]) || parseMoney(values[24]?.[col]))
    };

    const rowContribucion = {
      concept: 'Contribución Marginal',
      pctTot: totalFacturacion > 0 ? `${(((totalFacturacion - subtotalDirectCost.total) / totalFacturacion) * 100).toFixed(2)}%` : '0%',
      ingresos: 0,
      egresos: 0,
      pctUnit: '',
      total: totalFacturacion - subtotalDirectCost.total,
      dailyValues: dayColIndices.map(col => parseMoney(contribucionRow[col]))
    };

    const groups = [
      {
        id: 'ingresos',
        title: '1. Ingresos Operativos',
        badge: 'Facturación',
        color: '#4f46e5', // indigo
        subtotal: {
          total: totalFacturacion,
          dailyValues: rowFacturacion ? rowFacturacion.dailyValues : []
        },
        rows: [rowFacturacion].filter(Boolean)
      },
      {
        id: 'costos_directos',
        title: '2. Costos de Mercadería e Insumos (CMV)',
        badge: 'Costos Directos',
        color: '#2563eb', // blue
        subtotal: subtotalDirectCost,
        rows: directCostRows
      },
      {
        id: 'logistica',
        title: '3. Logística y Distribución',
        badge: 'Flete y Peajes',
        color: '#d97706', // amber
        subtotal: subtotalLogistics,
        rows: logisticsRows
      },
      {
        id: 'marketing',
        title: '4. Comercial, Marketing y Pasarelas',
        badge: 'Publicidad y Pagos',
        color: '#dc2626', // red
        subtotal: subtotalMarketing,
        rows: marketingRows
      },
      {
        id: 'estructura',
        title: '5. Personal, RRHH y Estructura',
        badge: 'Sueldos, Eventuales y Alquiler',
        color: '#7c3aed', // purple
        subtotal: subtotalStructure,
        rows: structureRows
      },
      {
        id: 'operativos',
        title: '6. Gastos Operativos y Servicios',
        badge: 'Operativos Zono',
        color: '#475569', // slate
        subtotal: subtotalOperational,
        rows: operationalRows
      },
      {
        id: 'impuestos',
        title: '7. Impuestos y Gravámenes',
        badge: 'Impuestos',
        color: '#0d9488', // teal
        subtotal: subtotalTax,
        rows: taxRows
      },
      {
        id: 'resultados',
        title: '8. Rentabilidad y Resultados Finales',
        badge: 'P&L',
        color: '#059669', // emerald
        subtotal: {
          total: utilidadNetaActual,
          dailyValues: rowUtilidadNeta.dailyValues
        },
        rows: [rowUtilidadNeta, rowAcumulado, rowContribucion]
      }
    ];

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
        groups
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
