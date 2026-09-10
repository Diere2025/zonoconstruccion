import { NextResponse } from 'next/server';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '1YFJcTYKjoP7uE1_LxKPNIC-7esxRY-1qn5y-4NKoaa0';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    // Parse target month and year from dayHeaders (e.g. "1/9" -> month 9)
    let targetMonth = new Date().getMonth() + 1;
    let targetYear = new Date().getFullYear();
    for (const dh of dayHeaders) {
      const match = dh.match(/^(\d+)\/(\d+)$/);
      if (match) {
        targetMonth = parseInt(match[2], 10);
        break;
      }
    }
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
    const startIso = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endIso = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59`;

    // Query orders and payment methods from Supabase for card surcharges
    let surchargesByOrderDate: Record<string, number> = {};
    let surchargesByDeliveryDate: Record<string, number> = {};

    try {
      const [ordersRes, pmsRes] = await Promise.all([
        supabaseAdmin
          .from('orders')
          .select('id, legacy_code, payment_method_id, total_amount, totals, order_date, initial_delivery_date, status')
          .gte('order_date', startIso)
          .lte('order_date', endIso)
          .neq('status', 'Cancelado')
          .limit(3000),
        supabaseAdmin
          .from('payment_methods')
          .select('id, name, surcharge_percentage')
      ]);

      const orders = ordersRes.data || [];
      const pms = pmsRes.data || [];
      const pmMap = new Map(pms.map((p: any) => [p.id, p]));

      orders.forEach((o: any) => {
        let sur = Number(o.totals?.payment_surcharges) || 0;
        const pm = pmMap.get(o.payment_method_id);
        const pmPct = Number(pm?.surcharge_percentage) || 0;
        const tot = Number(o.total_amount) || 0;

        if (sur <= 0 && pmPct > 0 && tot > 0) {
          sur = Math.round(tot - (tot / (1 + pmPct / 100)));
        }

        if (sur > 0) {
          if (o.order_date) {
            const [y, m, d] = o.order_date.split('T')[0].split('-');
            const k = `${parseInt(d)}/${parseInt(m)}`;
            surchargesByOrderDate[k] = (surchargesByOrderDate[k] || 0) + sur;
          }
          if (o.initial_delivery_date) {
            const [y, m, d] = o.initial_delivery_date.split('T')[0].split('-');
            const k = `${parseInt(d)}/${parseInt(m)}`;
            surchargesByDeliveryDate[k] = (surchargesByDeliveryDate[k] || 0) + sur;
          }
        }
      });
    } catch (dbErr) {
      console.error('[API EERR] Error querying Supabase surcharges:', dbErr);
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

    // Surcharge calculations
    const recargoRow = findRow('recargo tarjeta') || findRow('recargo por tarjeta') || findRow('recargo cliente') || findRow('recargo');
    const hasSheetRecargo = recargoRow.length > 0 && dayColIndices.some(col => parseMoney(recargoRow[col]) > 0);

    const dailyRecargosCliente = dayHeaders.map((dh, idx) =>
      hasSheetRecargo ? parseMoney(recargoRow[dayColIndices[idx]]) : (surchargesByOrderDate[dh] || 0)
    );
    const totalRecargoCliente = dailyRecargosCliente.reduce((acc, v) => acc + v, 0);

    const dailyRecargosDelivery = dayHeaders.map(dh => surchargesByDeliveryDate[dh] || 0);
    const totalRecargoDelivery = dailyRecargosDelivery.reduce((acc, v) => acc + v, 0);

    // STRUCTURED & LOGICAL GROUPS
    // 1. Ingresos
    const rowFacturacion = createRow(facturacionRow, 'Facturación Total');

    // Venta Base (sin recargo)
    const totalVentaBase = Math.max(0, totalFacturacion - totalRecargoCliente);
    const dailyVentaBase = dayColIndices.map((col, idx) => {
      const dayFact = parseMoney(facturacionRow[col]);
      const daySur = dailyRecargosCliente[idx] || 0;
      return Math.max(0, dayFact - daySur);
    });

    const rowVentaBase = {
      concept: 'Venta de Mercadería (Base sin recargos)',
      pctTot: totalFacturacion > 0 ? `${((totalVentaBase / totalFacturacion) * 100).toFixed(1)}%` : '-',
      ingresos: totalVentaBase,
      egresos: 0,
      pctUnit: '',
      total: totalVentaBase,
      dailyValues: dailyVentaBase,
      tag: 'base'
    };

    const rowRecargoCliente = {
      concept: 'Recargo por Tarjeta (Abonado por Clientes)',
      pctTot: totalFacturacion > 0 ? `${((totalRecargoCliente / totalFacturacion) * 100).toFixed(1)}%` : '-',
      ingresos: totalRecargoCliente,
      egresos: 0,
      pctUnit: '',
      total: totalRecargoCliente,
      dailyValues: dailyRecargosCliente,
      tag: 'surcharge'
    };

    const ingresosRows = [rowFacturacion, rowVentaBase, rowRecargoCliente].filter(Boolean);

    // 2. Costos Directos & Mercadería (CMV, Insumo de Producto, Insumo GLP)
    const rowCmv = createRow(costoMercaderiaRow);
    const rowInsumoProd = createRow(insumoProdRow);
    const rowInsumoGlp = createRow(insumoGlpRow);
    const directCostRows = [rowCmv, rowInsumoProd, rowInsumoGlp].filter(Boolean);
    const subtotalDirectCost = {
      total: directCostRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(directCostRows)
    };

    // 4. Comercial y Marketing (Publicidad, Publicidad Fee)
    const rowPub = createRow(publicidadRow);
    const rowPubFee = createRow(publicidadFeeRow);
    const marketingRows = [rowPub, rowPubFee].filter(Boolean);
    const subtotalMarketing = {
      total: marketingRows.reduce((acc, r) => acc + (r?.total || 0), 0),
      dailyValues: sumDaily(marketingRows)
    };

    // 3. Logística y Distribución (Servicio de Flete, Peajes, Vehículos)
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

    // 7. Impuestos, Gravámenes y Costos de Cobranza (MercadoPago, IVA, IIBB)
    const rowMp = createRow(mpRow, 'Costos MercadoPago (Bruto)');
    const rowImpuestos = createRow(impuestosRow);

    const netAbsorbedMp = Math.max(0, totalMp - totalRecargoCliente);
    const dailyNetAbsorbedMp = dayColIndices.map((col, idx) => {
      const dayMp = parseMoney(mpRow[col]);
      const daySur = dailyRecargosCliente[idx] || 0;
      return Math.max(0, dayMp - daySur);
    });

    const rowRecuperoMp = {
      concept: '(-) Recargos Cobrados a Clientes (Recupero)',
      pctTot: totalFacturacion > 0 ? `${((totalRecargoCliente / totalFacturacion) * 100).toFixed(2)}%` : '-',
      ingresos: 0,
      egresos: totalRecargoCliente,
      pctUnit: '',
      total: totalRecargoCliente,
      dailyValues: dailyRecargosCliente,
      tag: 'recupero'
    };

    const rowMpNeto = {
      concept: 'Costo MercadoPago Neto (Absorbido por Zono)',
      pctTot: totalFacturacion > 0 ? `${((netAbsorbedMp / totalFacturacion) * 100).toFixed(2)}%` : '-',
      ingresos: 0,
      egresos: netAbsorbedMp,
      pctUnit: '',
      total: netAbsorbedMp,
      dailyValues: dailyNetAbsorbedMp,
      tag: 'net_absorbed'
    };

    const taxRows = [rowMp, rowRecuperoMp, rowMpNeto, rowImpuestos].filter(Boolean);
    const subtotalTax = {
      total: (rowMp?.total || 0) + (rowImpuestos?.total || 0),
      dailyValues: sumDaily([rowMp, rowImpuestos])
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
        badge: 'Facturación y Recargos',
        color: '#4f46e5', // indigo
        subtotal: {
          total: totalFacturacion,
          dailyValues: rowFacturacion ? rowFacturacion.dailyValues : []
        },
        rows: ingresosRows
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
        title: '4. Comercial y Marketing',
        badge: 'Pauta y Agencia',
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
        title: '7. Impuestos, Gravámenes y Costos de Cobranza',
        badge: 'MercadoPago y Tributos',
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

    const coveragePercentage = totalMp > 0 ? Math.min(100, Number(((totalRecargoCliente / totalMp) * 100).toFixed(1))) : 0;
    const absorbedPercentage = totalMp > 0 ? Number(((netAbsorbedMp / totalMp) * 100).toFixed(1)) : 0;

    const buildAnalysisTimeline = (dailySurcharges: number[]) => {
      return dayHeaders.map((dh, idx) => {
        const col = dayColIndices[idx];
        const mpCost = parseMoney(mpRow[col]);
        const clientSurcharge = dailySurcharges[idx] || 0;
        const netAbsorbed = Math.max(0, mpCost - clientSurcharge);
        const difference = clientSurcharge - mpCost;
        const coveragePct = mpCost > 0 ? Number(((clientSurcharge / mpCost) * 100).toFixed(1)) : (clientSurcharge > 0 ? 100 : 0);
        let status: 'cubierto' | 'absorbido' | 'sin_costo' = 'sin_costo';
        if (mpCost > 0) {
          status = clientSurcharge >= mpCost ? 'cubierto' : 'absorbido';
        } else if (clientSurcharge > 0) {
          status = 'cubierto';
        }
        return {
          day: dh,
          mpCost,
          clientSurcharge,
          netAbsorbed,
          difference,
          coveragePct,
          status
        };
      });
    };

    const cardSurchargeAnalysis = {
      totalMp,
      totalSurcharge: totalRecargoCliente,
      netAbsorbed: netAbsorbedMp,
      coveragePercentage,
      absorbedPercentage,
      criteria: 'order_date',
      source: hasSheetRecargo ? 'Google Sheets' : 'Supabase Orders',
      dailyTimeline: buildAnalysisTimeline(dailyRecargosCliente),
      byDeliveryDate: {
        totalSurcharge: totalRecargoDelivery,
        netAbsorbed: Math.max(0, totalMp - totalRecargoDelivery),
        coveragePercentage: totalMp > 0 ? Math.min(100, Number(((totalRecargoDelivery / totalMp) * 100).toFixed(1))) : 0,
        dailyTimeline: buildAnalysisTimeline(dailyRecargosDelivery)
      }
    };

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
        totalSurcharge: totalRecargoCliente,
        netAbsorbedMp,
        pctMpCovered: coveragePercentage,
        pctMpAbsorbed: absorbedPercentage,
        utilidadNetaActual,
        pctUtilidadActual: totalFacturacion > 0 ? Number(((utilidadNetaActual / totalFacturacion) * 100).toFixed(2)) : 0,
        utilidadNetaProyectada,
        diasRegistrados: dailyTimeline.filter(d => d.hasData).length,
        totalDiasMes: dayHeaders.length
      },
      expensesByCategory,
      dailyTimeline,
      cardSurchargeAnalysis,
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
