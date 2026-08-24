import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPREADSHEET_GAS_ID = "1k112jRkUR6SqMtjHg0rWzFF3iyHNa-VBiVSs3GoEnko";
const SPREADSHEET_PRODUCTION_ID = "1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0";
const TANK_CAPACITY_LITERS = 4000; // Tanque Zeppelin de 4.000 Litros (4 m3)

export interface GasEvent {
  id: string;
  fecha: string;
  fechaFormatted: string;
  timestamp: number;
  hora: string;
  tipo: "Recarga" | "Lectura" | string;
  porcentajeAntes: number;
  cargaLitros: number;
  porcentajeDespues: number;
  precioLitro: number;
  costoTotal: number;
  remitoFactura: string;
  observaciones: string;
}

export interface GasModelScore {
  producto: string;
  tipo: string;
  puntaje: number;
  litrosTanque: string;
  litrosGasEstimado: number;
  costoGasEstimado: number;
}

export interface MonthlyGasMetric {
  monthKey: string; // '2026-08'
  monthName: string; // 'Agosto 2026'
  tanquesFabricados: number;
  litrosTransformados: number;
  gasRecargadoLitros: number;
  inversionGas: number;
  precioPromedioGas: number;
  litrosGasPorTanque: number;
  costoGasPorTanque: number;
}

export interface GasIntervalMeasurement {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  diasIntervalo: number;
  pctInicio: number;
  pctFin: number;
  recargaIntermediaLitros: number;
  gasConsumidoLitros: number;
  costoIntervalo: number;
  tanquesFabricados: number;
  litrosGasPorTanque: number;
  costoGasPorTanque: number;
}

// CSV Line Parser
function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

const parseNum = (v?: string): number => {
  if (!v) return 0;
  const clean = v.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatMonthName = (yearMonth: string) => {
  if (!yearMonth || !yearMonth.includes('-')) return yearMonth;
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
};

const parseDateToIso = (dateStr: string): { iso: string; formatted: string; timestamp: number } | null => {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  const parts = clean.split(/[/\-]/);
  if (parts.length === 3) {
    let d: number, m: number, y: number;
    if (parts[0].length === 4) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
    }
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const formatted = `${pad(d)}/${pad(m)}/${y}`;
      const timestamp = new Date(y, m - 1, d).getTime();
      return { iso, formatted, timestamp };
    }
  }
  return null;
};

export async function GET() {
  try {
    const gasCargaUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Carga`;
    const gasTipoUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Tipo`;
    const prodFabUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Fabricaci%C3%B3n`;

    const [gasRes, tipoRes, fabRes] = await Promise.all([
      fetch(gasCargaUrl, { cache: "no-store" }),
      fetch(gasTipoUrl, { cache: "no-store" }),
      fetch(prodFabUrl, { cache: "no-store" })
    ]);

    if (!gasRes.ok) {
      throw new Error(`Error al leer la hoja de Cargas de Gas (${gasRes.status})`);
    }

    const [gasCsv, tipoCsv, fabCsv] = await Promise.all([
      gasRes.text(),
      tipoRes.ok ? tipoRes.text() : Promise.resolve(""),
      fabRes.ok ? fabRes.text() : Promise.resolve("")
    ]);

    // 1. Parse Gas Events (Cargas y Lecturas)
    const gasLines = gasCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
    const gasEvents: GasEvent[] = [];
    let latestPrice = 1051.097625; // Default fallback to latest known price

    gasLines.forEach((line, idx) => {
      const c = parseCsvLine(line);
      const rawDate = c[0];
      if (!rawDate) return;
      const parsedDate = parseDateToIso(rawDate);
      if (!parsedDate) return;

      const tipo = c[2] || (c[4] && parseNum(c[4]) > 0 ? "Recarga" : "Lectura");
      const pctAntes = parseNum(c[3]);
      const cargaLitros = parseNum(c[4]);
      const pctDespues = parseNum(c[5]);
      let precioLitro = parseNum(c[6]);

      if (precioLitro > 0) {
        latestPrice = precioLitro;
      } else {
        precioLitro = latestPrice;
      }

      const costoTotal = cargaLitros > 0 ? cargaLitros * precioLitro : 0;

      gasEvents.push({
        id: `gas-ev-${idx}-${parsedDate.iso}`,
        fecha: parsedDate.iso,
        fechaFormatted: parsedDate.formatted,
        timestamp: parsedDate.timestamp,
        hora: c[1] || '',
        tipo,
        porcentajeAntes: pctAntes,
        cargaLitros,
        porcentajeDespues: pctDespues,
        precioLitro,
        costoTotal,
        remitoFactura: c[7] || '',
        observaciones: c[8] || ''
      });
    });

    // Sort events chronologically
    gasEvents.sort((a, b) => a.timestamp - b.timestamp);

    // 2. Parse Production Fabricación (Rotomoldeo: 1ra, 2da y Rotos)
    const tanksByDate: Record<string, { totalTanks: number; primera: number; segunda: number; rotos: number; litersVolume: number; products: Record<string, number> }> = {};
    const tanksByMonth: Record<string, { totalTanks: number; primera: number; segunda: number; rotos: number; litersVolume: number }> = {};
    let totalTanks2026 = 0;
    let totalPrimera2026 = 0;
    let totalSegunda2026 = 0;
    let totalRotos2026 = 0;

    if (fabCsv) {
      const fabLines = fabCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      fabLines.forEach(line => {
        const c = parseCsvLine(line);
        const rawDate = c[0];
        const prod = c[1]?.trim();
        const cant = parseInt(c[2]?.replace(/\D/g, '') || '0', 10) || 1;
        const calidad = c[7]?.trim() || '';
        const estado = c[8]?.trim() || '';

        // Only count tanks actually cooked in the oven (estado === "Fabricado"). Exclude Planificado and Cancelado.
        const isCookedInOven = estado === "Fabricado";

        if (rawDate && isCookedInOven && prod) {
          const parsedDate = parseDateToIso(rawDate);
          if (parsedDate) {
            const iso = parsedDate.iso;
            const ym = iso.substring(0, 7);

            const isRoto = calidad.toLowerCase().includes("roto");
            const isSegunda = calidad.toLowerCase().includes("segunda");
            const isPrimera = !isRoto && !isSegunda;

            // Extract litraje and normalize base mold (remove (CIEGO) variant tag)
            const baseProdName = prod.replace(/\s*\(CIEGO\)/i, '').trim();
            const match = prod.match(/(\d+)\s*(L|litros|lts|l)\b/i);
            const litersCapacity = match ? parseInt(match[1], 10) : 0;

            if (!tanksByDate[iso]) {
              tanksByDate[iso] = { totalTanks: 0, primera: 0, segunda: 0, rotos: 0, litersVolume: 0, products: {} };
            }
            tanksByDate[iso].totalTanks += cant;
            if (isPrimera) tanksByDate[iso].primera += cant;
            if (isSegunda) tanksByDate[iso].segunda += cant;
            if (isRoto) tanksByDate[iso].rotos += cant;
            tanksByDate[iso].litersVolume += litersCapacity * cant;
            tanksByDate[iso].products[baseProdName] = (tanksByDate[iso].products[baseProdName] || 0) + cant;

            if (!tanksByMonth[ym]) {
              tanksByMonth[ym] = { totalTanks: 0, primera: 0, segunda: 0, rotos: 0, litersVolume: 0 };
            }
            tanksByMonth[ym].totalTanks += cant;
            if (isPrimera) tanksByMonth[ym].primera += cant;
            if (isSegunda) tanksByMonth[ym].segunda += cant;
            if (isRoto) tanksByMonth[ym].rotos += cant;
            tanksByMonth[ym].litersVolume += litersCapacity * cant;

            if (iso.startsWith('2026')) {
              totalTanks2026 += cant;
              if (isPrimera) totalPrimera2026 += cant;
              if (isSegunda) totalSegunda2026 += cant;
              if (isRoto) totalRotos2026 += cant;
            }
          }
        }
      });
    }

    // 3. Current Tank Status (Tanque Zeppelin 4000L)
    const readings = gasEvents.filter(e => e.porcentajeAntes > 0 || e.tipo === "Lectura");
    const lastReading = readings.length > 0 ? readings[readings.length - 1] : null;
    const refills = gasEvents.filter(e => e.tipo === "Recarga" && e.cargaLitros > 0);
    const lastRefill = refills.length > 0 ? refills[refills.length - 1] : null;

    const currentTankPercentage = lastReading ? lastReading.porcentajeAntes : 43.3;
    const currentTankLiters = (TANK_CAPACITY_LITERS * currentTankPercentage) / 100;

    // 4. Calculate Measured Consumption Intervals between Readings
    const intervals: GasIntervalMeasurement[] = [];
    for (let i = 0; i < readings.length - 1; i++) {
      const start = readings[i];
      const end = readings[i + 1];

      // Any refills between start.timestamp and end.timestamp?
      const refillsBetween = gasEvents.filter(
        e => e.tipo === "Recarga" && e.timestamp >= start.timestamp && e.timestamp <= end.timestamp
      );
      const refillLiters = refillsBetween.reduce((acc, r) => acc + r.cargaLitros, 0);

      // Mass balance of gas: Initial + Refills - Final
      const gasInitialLiters = (TANK_CAPACITY_LITERS * start.porcentajeAntes) / 100;
      const gasFinalLiters = (TANK_CAPACITY_LITERS * end.porcentajeAntes) / 100;
      const gasConsumido = Math.max(0, gasInitialLiters + refillLiters - gasFinalLiters);

      const daysDiff = Math.max(1, Math.round((end.timestamp - start.timestamp) / (1000 * 60 * 60 * 24)));

      // Count tanks rotomolded in this interval
      let tanksInInterval = 0;
      Object.entries(tanksByDate).forEach(([dateIso, data]) => {
        const dTime = new Date(dateIso).getTime();
        if (dTime >= start.timestamp && dTime <= end.timestamp) {
          tanksInInterval += data.totalTanks;
        }
      });

      const avgPriceInInterval = end.precioLitro || latestPrice;
      const costoIntervalo = gasConsumido * avgPriceInInterval;
      const gasPerTank = tanksInInterval > 0 ? gasConsumido / tanksInInterval : 0;
      const costPerTank = tanksInInterval > 0 ? costoIntervalo / tanksInInterval : 0;

      intervals.push({
        id: `interval-${start.fecha}-${end.fecha}`,
        fechaInicio: start.fechaFormatted,
        fechaFin: end.fechaFormatted,
        diasIntervalo: daysDiff,
        pctInicio: start.porcentajeAntes,
        pctFin: end.porcentajeAntes,
        recargaIntermediaLitros: refillLiters,
        gasConsumidoLitros: parseFloat(gasConsumido.toFixed(1)),
        costoIntervalo: parseFloat(costoIntervalo.toFixed(0)),
        tanquesFabricados: tanksInInterval,
        litrosGasPorTanque: parseFloat(gasPerTank.toFixed(2)),
        costoGasPorTanque: parseFloat(costPerTank.toFixed(0))
      });
    }

    // 5. Monthly Gas Consumption & Production Correlation
    const monthlyGasMap: Record<string, {
      gasLitros: number;
      inversion: number;
      tanques: number;
      litrosTransformados: number;
    }> = {};

    // Populate with production months
    Object.entries(tanksByMonth).forEach(([ym, pData]) => {
      monthlyGasMap[ym] = {
        gasLitros: 0,
        inversion: 0,
        tanques: pData.totalTanks,
        litrosTransformados: pData.litersVolume
      };
    });

    // Populate with refills
    refills.forEach(r => {
      const ym = r.fecha.substring(0, 7);
      if (!monthlyGasMap[ym]) {
        monthlyGasMap[ym] = { gasLitros: 0, inversion: 0, tanques: 0, litrosTransformados: 0 };
      }
      monthlyGasMap[ym].gasLitros += r.cargaLitros;
      monthlyGasMap[ym].inversion += r.costoTotal;
    });

    const monthlyMetrics: MonthlyGasMetric[] = Object.entries(monthlyGasMap)
      .map(([ym, data]) => {
        const gasPerTank = data.tanques > 0 && data.gasLitros > 0 ? data.gasLitros / data.tanques : 0;
        const costPerTank = data.tanques > 0 && data.inversion > 0 ? data.inversion / data.tanques : 0;
        const avgPrice = data.gasLitros > 0 ? data.inversion / data.gasLitros : latestPrice;

        return {
          monthKey: ym,
          monthName: formatMonthName(ym),
          tanquesFabricados: data.tanques,
          litrosTransformados: data.litrosTransformados,
          gasRecargadoLitros: parseFloat(data.gasLitros.toFixed(1)),
          inversionGas: parseFloat(data.inversion.toFixed(2)),
          precioPromedioGas: parseFloat(avgPrice.toFixed(2)),
          litrosGasPorTanque: parseFloat(gasPerTank.toFixed(2)),
          costoGasPorTanque: parseFloat(costPerTank.toFixed(0))
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Descending by date

    // 6. Global 2026 Summary
    const totalGasLitros2026 = refills.filter(r => r.fecha.startsWith('2026')).reduce((acc, r) => acc + r.cargaLitros, 0);
    const totalInversionGas2026 = refills.filter(r => r.fecha.startsWith('2026')).reduce((acc, r) => acc + r.costoTotal, 0);
    const avgGlobalGasPerTank = totalTanks2026 > 0 ? totalGasLitros2026 / totalTanks2026 : 5.6;
    const avgGlobalCostPerTank = totalTanks2026 > 0 ? totalInversionGas2026 / totalTanks2026 : 5557;

    // 7. Last 2 Weeks (14 Days) Rolling Window Calculation
    const lastTimestamp = lastReading ? lastReading.timestamp : Date.now();
    const fourteenDaysAgoTimestamp = lastTimestamp - (14 * 86400000);

    const readingsLast14 = gasEvents.filter(e => (e.porcentajeAntes > 0 || e.tipo === 'Lectura') && e.timestamp >= fourteenDaysAgoTimestamp);
    
    let gasConsumedLast14Days = 0;
    let tanksLast14Days = 0;
    let daysMeasured14 = 14;
    let avgGasPerTankLast14 = avgGlobalGasPerTank;

    if (readingsLast14.length >= 2) {
      const firstReadingIn14 = readingsLast14[0];
      const lastReadingIn14 = readingsLast14[readingsLast14.length - 1];
      
      const refillsIn14 = gasEvents.filter(
        e => e.tipo === 'Recarga' && e.timestamp >= firstReadingIn14.timestamp && e.timestamp <= lastReadingIn14.timestamp
      );
      const refillLitersIn14 = refillsIn14.reduce((acc, r) => acc + r.cargaLitros, 0);

      const initialGas14 = (TANK_CAPACITY_LITERS * firstReadingIn14.porcentajeAntes) / 100;
      const finalGas14 = (TANK_CAPACITY_LITERS * lastReadingIn14.porcentajeAntes) / 100;
      gasConsumedLast14Days = Math.max(0, initialGas14 + refillLitersIn14 - finalGas14);
      daysMeasured14 = Math.max(1, Math.round((lastReadingIn14.timestamp - firstReadingIn14.timestamp) / 86400000));

      Object.entries(tanksByDate).forEach(([dateIso, data]) => {
        const ts = new Date(dateIso).getTime();
        if (ts >= firstReadingIn14.timestamp && ts <= lastReadingIn14.timestamp) {
          tanksLast14Days += data.totalTanks;
        }
      });

      if (tanksLast14Days > 0 && gasConsumedLast14Days > 0) {
        avgGasPerTankLast14 = gasConsumedLast14Days / tanksLast14Days;
      }
    } else {
      // Fallback: use production in last 14 days * global average
      Object.entries(tanksByDate).forEach(([dateIso, data]) => {
        const ts = new Date(dateIso).getTime();
        if (ts >= fourteenDaysAgoTimestamp && ts <= lastTimestamp) {
          tanksLast14Days += data.totalTanks;
        }
      });
      gasConsumedLast14Days = tanksLast14Days * avgGlobalGasPerTank;
    }

    const currentPricePerLiter = latestPrice; // ~$1.051,10/L
    const avgCostPerTankLast14 = avgGasPerTankLast14 * currentPricePerLiter;
    const dailyGasConsumptionLast14 = daysMeasured14 > 0 && gasConsumedLast14Days > 0 
      ? gasConsumedLast14Days / daysMeasured14 
      : (tanksLast14Days / 14) * avgGasPerTankLast14;

    const daysOfAutonomyRemaining = Math.max(1, Math.round(currentTankLiters / (dailyGasConsumptionLast14 || 100)));

    // 8. Parse Model Scores & Compute Unit Gas Cost (Pestaña Tipo)
    const modelScores: GasModelScore[] = [
      { producto: "AquaFort - TRIC 500L Gris", tipo: "500 TRIC", puntaje: 1.0, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 500L Beige", tipo: "500 TRIC", puntaje: 1.0, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 600L Gris", tipo: "600 TRIC", puntaje: 1.2, litrosTanque: "600L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 600L Beige", tipo: "600 TRIC", puntaje: 1.2, litrosTanque: "600L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 750L Gris", tipo: "750 TRIC", puntaje: 1.5, litrosTanque: "750L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 750L Beige", tipo: "750 TRIC", puntaje: 1.5, litrosTanque: "750L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 300L Gris", tipo: "300 TRIC", puntaje: 0.6, litrosTanque: "300L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 300L Beige", tipo: "300 TRIC", puntaje: 0.6, litrosTanque: "300L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - TRIC 1000L Gris", tipo: "1000 TRIC", puntaje: 2.0, litrosTanque: "1000L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - BIC 500L", tipo: "500 BIC", puntaje: 0.90, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - BIC 600L", tipo: "600 BIC", puntaje: 1.08, litrosTanque: "600L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - BIC 750L", tipo: "750 BIC", puntaje: 1.35, litrosTanque: "750L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - BIC 300L", tipo: "300 BIC", puntaje: 0.54, litrosTanque: "300L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - CUATR 500L", tipo: "500 CUATR", puntaje: 1.10, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - CUATR 600L", tipo: "600 CUATR", puntaje: 1.30, litrosTanque: "600L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - CUATR 750L", tipo: "750 CUATR", puntaje: 1.60, litrosTanque: "750L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - CISTERNA 500L", tipo: "500 CIST", puntaje: 1.0, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "AquaFort - CISTERNA 750L", tipo: "750 CIST", puntaje: 1.5, litrosTanque: "750L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "Cono Biodigestor", tipo: "Cono", puntaje: 0.40, litrosTanque: "Cono", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "Tacho Cámara/Bio 600L", tipo: "Cámara 600", puntaje: 1.32, litrosTanque: "600L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "Tacho Cámara/Bio 500L", tipo: "Cámara 500", puntaje: 1.05, litrosTanque: "500L", litrosGasEstimado: 0, costoGasEstimado: 0 },
      { producto: "Tacho Cónico 700L", tipo: "Cónico 700", puntaje: 1.40, litrosTanque: "700L", litrosGasEstimado: 0, costoGasEstimado: 0 }
    ];

    // 9. Current Month (Agosto 2026) Forecast & Remaining Balance
    const currentYearMonth = "2026-08";
    const currentMonthName = formatMonthName(currentYearMonth);
    const tanksCurrentMonthMtd = tanksByMonth[currentYearMonth]?.totalTanks || 475;
    const augustGasLitros = monthlyGasMap[currentYearMonth]?.gasLitros || 3594;
    const augustAvgGasPerTank = tanksCurrentMonthMtd > 0 ? parseFloat((augustGasLitros / tanksCurrentMonthMtd).toFixed(2)) : 7.57;
    const augustAvgCostPerTank = parseFloat((augustAvgGasPerTank * currentPricePerLiter).toFixed(0));

    // Base benchmark: 500L Tricapa based on monthly average (7.57 L / $7.953)
    const baseGasLiters = augustAvgGasPerTank > 0 ? augustAvgGasPerTank : 7.57;

    modelScores.forEach(item => {
      item.litrosGasEstimado = parseFloat((item.puntaje * baseGasLiters).toFixed(2));
      item.costoGasEstimado = parseFloat((item.litrosGasEstimado * currentPricePerLiter).toFixed(0));
    });

    const gasConsumedCurrentMonthMtd = parseFloat((tanksCurrentMonthMtd * baseGasLiters).toFixed(1));
    const gasCostCurrentMonthMtd = parseFloat((gasConsumedCurrentMonthMtd * currentPricePerLiter).toFixed(0));

    // Days in current month (August = 31)
    const totalDaysInMonth = 31;
    const currentDayOfMonth = 24;
    const daysRemainingInMonth = Math.max(0, totalDaysInMonth - currentDayOfMonth);

    const projectedRemainingGasConsumption = parseFloat((daysRemainingInMonth * dailyGasConsumptionLast14).toFixed(1));
    const projectedRemainingGasCost = parseFloat((projectedRemainingGasConsumption * currentPricePerLiter).toFixed(0));

    const projectedTotalMonthGasLiters = parseFloat((gasConsumedCurrentMonthMtd + projectedRemainingGasConsumption).toFixed(1));
    const projectedTotalMonthGasCost = parseFloat((gasCostCurrentMonthMtd + projectedRemainingGasCost).toFixed(0));

    const projectedEndingTankStockLiters = parseFloat((currentTankLiters - projectedRemainingGasConsumption).toFixed(1));
    const projectedEndingTankPercentage = parseFloat(((projectedEndingTankStockLiters / TANK_CAPACITY_LITERS) * 100).toFixed(1));
    const isStockSufficientForMonth = projectedEndingTankStockLiters >= 0;

    return NextResponse.json({
      success: true,
      currentMonthForecast: {
        monthKey: currentYearMonth,
        monthName: currentMonthName,
        tanksProducedMtd: tanksCurrentMonthMtd,
        gasConsumedMtdLiters: gasConsumedCurrentMonthMtd,
        gasConsumedMtdCost: gasCostCurrentMonthMtd,
        currentTankStockLiters: currentTankLiters,
        currentTankStockCost: parseFloat((currentTankLiters * currentPricePerLiter).toFixed(0)),
        currentTankPercentage: currentTankPercentage,
        currentDayOfMonth,
        daysRemainingInMonth,
        projectedDailyConsumptionLiters: parseFloat(dailyGasConsumptionLast14.toFixed(1)),
        projectedRemainingGasConsumptionLiters: projectedRemainingGasConsumption,
        projectedRemainingGasCost: projectedRemainingGasCost,
        projectedTotalMonthGasLiters: projectedTotalMonthGasLiters,
        projectedTotalMonthGasCost: projectedTotalMonthGasCost,
        projectedEndingTankStockLiters: projectedEndingTankStockLiters,
        projectedEndingTankPercentage: projectedEndingTankPercentage,
        isStockSufficientForMonth
      },
      tankStatus: {
        capacityLiters: TANK_CAPACITY_LITERS,
        currentPercentage: currentTankPercentage,
        currentLiters: currentTankLiters,
        lastReadingDate: lastReading ? lastReading.fechaFormatted : "24/08/2026",
        lastReadingTime: lastReading ? lastReading.hora : "11:11",
        lastRefillDate: lastRefill ? lastRefill.fechaFormatted : "12/08/2026",
        lastRefillLiters: lastRefill ? lastRefill.cargaLitros : 2347,
        latestPricePerLiter: latestPrice,
        estimatedDailyConsumptionLiters: parseFloat(dailyGasConsumptionLast14.toFixed(1)),
        estimatedDaysRemaining: daysOfAutonomyRemaining
      },
      recent2Weeks: {
        daysMeasured: daysMeasured14,
        gasConsumedLiters: parseFloat(gasConsumedLast14Days.toFixed(1)),
        tanksRotomolded: tanksLast14Days,
        avgGasLitersPerTank: parseFloat(avgGasPerTankLast14.toFixed(2)),
        avgCostPerTank: parseFloat(avgCostPerTankLast14.toFixed(0)),
        dailyGasConsumptionLiters: parseFloat(dailyGasConsumptionLast14.toFixed(1))
      },
      summary2026: {
        totalTanksRotomolded: totalTanks2026,
        totalPrimera: totalPrimera2026,
        totalSegunda: totalSegunda2026,
        totalRotos: totalRotos2026,
        pctPrimera: totalTanks2026 > 0 ? parseFloat(((totalPrimera2026 / totalTanks2026) * 100).toFixed(1)) : 100,
        pctScrap: totalTanks2026 > 0 ? parseFloat(((totalRotos2026 / totalTanks2026) * 100).toFixed(1)) : 0,
        litrosGasPerdidosRotos: parseFloat((totalRotos2026 * avgGlobalGasPerTank).toFixed(1)),
        costoGasPerdidoRotos: parseFloat((totalRotos2026 * avgGlobalGasPerTank * latestPrice).toFixed(0)),
        totalGasLitersRefilled: totalGasLitros2026,
        totalGasCost: totalInversionGas2026,
        avgGasLitersPerTank: parseFloat(avgGlobalGasPerTank.toFixed(2)),
        avgCostPerTank: parseFloat(avgGlobalCostPerTank.toFixed(0)),
        weightedAvgPricePerLiter: totalGasLitros2026 > 0 ? parseFloat((totalInversionGas2026 / totalGasLitros2026).toFixed(2)) : latestPrice
      },
      modelScores,
      intervals,
      monthlyMetrics,
      gasEvents: gasEvents.reverse(), // Most recent first for table
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Error en API /api/admin/gas-consumo-data:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al consultar los datos de consumo de gas" },
      { status: 500 }
    );
  }
}
