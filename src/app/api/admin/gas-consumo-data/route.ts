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

export interface ElectricityRecord {
  id: string;
  paymentDate: string;
  paymentDateFormatted: string;
  consumedMonthKey: string;
  consumedMonthName: string;
  concept: string;
  amount: number;
  tanksProducedInMonth: number;
  costPerTank: number;
}

export interface CombinedModelCost {
  producto: string;
  tipo: string;
  puntaje: number;
  litrosTanque: string;
  litrosGasEstimado: number;
  costoGasEstimado: number;
  costoManoObraEstimado: number;
  costoElectricidadEstimado: number;
  costoTotalFabricacion: number;
  porcentajeGas: number;
  porcentajeManoObra: number;
  porcentajeElectricidad: number;
}

export interface MonthlyCostBreakdown {
  monthKey: string;
  monthName: string;
  tanquesFabricados: number;
  litrosTransformados: number;
  gasLitros: number;
  gasInversion: number;
  gasCostoUnitario: number;
  mdoTotal: number;
  mdoCostoUnitario: number;
  luzTotal: number;
  luzCostoUnitario: number;
  costoTotalOperativo: number;
  costoUnitarioTotal: number;
}

export interface OperatorMonthlyMetric {
  monthKey: string;
  monthName: string;
  salary: number;
  tanksFabricated: number;
  tanksAssembled: number;
  tanksTotal: number;
  costPerTank: number;
  isAguinaldoMonth: boolean;
}

export interface OperatorSummary {
  key: string;
  name: string;
  role: string;
  isMaintenanceSupport: boolean;
  isEventual: boolean;
  notes?: string;
  totalSalary: number;
  totalSalaryWithoutAguinaldo: number;
  totalTanksFabricated: number;
  totalTanksAssembled: number;
  totalTanks: number;
  avgCostPerTank: number;
  avgCostPerTankWithoutAguinaldo: number;
  months: Record<string, OperatorMonthlyMetric>;
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

const parseDateToIso = (dateStr: string) => {
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
    const pad = (n: number) => n.toString().padStart(2, '0');
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const timestamp = new Date(y, m - 1, d).getTime();
    return {
      iso,
      formatted: `${pad(d)}/${pad(m)}/${y}`,
      timestamp,
      year: y,
      month: m,
      day: d
    };
  }
  return null;
};

const parseSueldoMonth = (mStr?: string) => {
  if (!mStr) return null;
  const lower = mStr.toLowerCase();
  if (lower.includes('enero')) return '2026-01';
  if (lower.includes('febrero')) return '2026-02';
  if (lower.includes('marzo')) return '2026-03';
  if (lower.includes('abril')) return '2026-04';
  if (lower.includes('mayo')) return '2026-05';
  if (lower.includes('junio')) return '2026-06';
  if (lower.includes('julio')) return '2026-07';
  if (lower.includes('agosto')) return '2026-08';
  return null;
};

const canonicalOperatorMap: Record<string, { canonicalKey: string; displayName: string; role: string; isMaintenance: boolean; isEventual: boolean; notes?: string }> = {
  'RODRIGO RAMIREZ': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  'RODRIGO RAMIREX': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  'RAMIREZ, RODRIGO MAXIMILIANO': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  
  'LEONARDO SANDOVAL': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  'LEO SANDOVAL': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  'SANDOVAL, LEONARDO JUAN CARLOS': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
  
  'JULIO VERÓN': { canonicalKey: 'VERON_JULIO', displayName: 'Julio Verón', role: 'Mantenimiento & Operario Mixto', isMaintenance: true, isEventual: false, notes: 'Realiza mantenimiento preventivo y correctivo de maquinaria y soporte técnico de planta (no 100% de producción directa).' },
  'JULIO VERON': { canonicalKey: 'VERON_JULIO', displayName: 'Julio Verón', role: 'Mantenimiento & Operario Mixto', isMaintenance: true, isEventual: false, notes: 'Realiza mantenimiento preventivo y correctivo de maquinaria y soporte técnico de planta (no 100% de producción directa).' },
  'VERON, JULIO CESAR': { canonicalKey: 'VERON_JULIO', displayName: 'Julio Verón', role: 'Mantenimiento & Operario Mixto', isMaintenance: true, isEventual: false, notes: 'Realiza mantenimiento preventivo y correctivo de maquinaria y soporte técnico de planta (no 100% de producción directa).' },
  
  'MATIAS OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Ensamblaje Principal & Rotomoldeo', isMaintenance: false, isEventual: false, notes: 'Responsable principal del armado de Biodigestores, Cámaras Sépticas y Desengrasadoras.' },
  'MATÍAS OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Ensamblaje Principal & Rotomoldeo', isMaintenance: false, isEventual: false, notes: 'Responsable principal del armado de Biodigestores, Cámaras Sépticas y Desengrasadoras.' },
  'MATI OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Ensamblaje Principal & Rotomoldeo', isMaintenance: false, isEventual: false, notes: 'Responsable principal del armado de Biodigestores, Cámaras Sépticas y Desengrasadoras.' },
  'OLIVERA, MATIAS NAHUEL': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Ensamblaje Principal & Rotomoldeo', isMaintenance: false, isEventual: false, notes: 'Responsable principal del armado de Biodigestores, Cámaras Sépticas y Desengrasadoras.' },
  
  'SAMUEL CONTRERAS': { canonicalKey: 'CONTRERAS_SAMUEL', displayName: 'Samuel Contreras', role: 'Operario Eventual (Variable)', isMaintenance: false, isEventual: true, notes: 'Operario eventual contratado según demanda productiva sin sueldo fijo mensual.' },
  'CONTRERAS, SAMUEL': { canonicalKey: 'CONTRERAS_SAMUEL', displayName: 'Samuel Contreras', role: 'Operario Eventual (Variable)', isMaintenance: false, isEventual: true, notes: 'Operario eventual contratado según demanda productiva sin sueldo fijo mensual.' },
  
  'GABRIEL MANSILLA': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isEventual: true },
  'ENZO MANSILLA': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isEventual: true },
  'MANSILLA, ENZO GABRIEL': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isEventual: true }
};

const getOperatorMeta = (rawName?: string) => {
  if (!rawName) return null;
  const clean = rawName.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [k, meta] of Object.entries(canonicalOperatorMap)) {
    const kNorm = k.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (clean === kNorm || clean.includes(kNorm) || kNorm.includes(clean)) {
      return meta;
    }
  }
  return null;
};

export async function GET() {
  try {
    const gasCargaUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Carga`;
    const gasTipoUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Tipo`;
    const gasSueldosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Sueldos`;
    const gasEdenorUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=Edenor`;
    const prodFabUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Fabricaci%C3%B3n`;
    const prodEnsUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Ensamblaje`;

    const [gasRes, tipoRes, sueldosRes, edenorRes, fabRes, ensRes] = await Promise.all([
      fetch(gasCargaUrl, { cache: "no-store" }),
      fetch(gasTipoUrl, { cache: "no-store" }),
      fetch(gasSueldosUrl, { cache: "no-store" }),
      fetch(gasEdenorUrl, { cache: "no-store" }),
      fetch(prodFabUrl, { cache: "no-store" }),
      fetch(prodEnsUrl, { cache: "no-store" })
    ]);

    if (!gasRes.ok) {
      throw new Error(`Error al leer la hoja de Cargas de Gas (${gasRes.status})`);
    }

    const [gasCsv, tipoCsv, sueldosCsv, edenorCsv, fabCsv, ensCsv] = await Promise.all([
      gasRes.text(),
      tipoRes.ok ? tipoRes.text() : Promise.resolve(""),
      sueldosRes.ok ? sueldosRes.text() : Promise.resolve(""),
      edenorRes.ok ? edenorRes.text() : Promise.resolve(""),
      fabRes.ok ? fabRes.text() : Promise.resolve(""),
      ensRes.ok ? ensRes.text() : Promise.resolve("")
    ]);

    // 1. Parse Gas Events (Cargas y Lecturas)
    const gasLines = gasCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
    const gasEvents: GasEvent[] = [];
    let latestPrice = 1051.097625;

    gasLines.forEach((line, idx) => {
      const c = parseCsvLine(line);
      const parsedDate = parseDateToIso(c[0]);
      if (!parsedDate) return;

      const tipo = c[2] || (c[4] && parseNum(c[4]) > 0 ? "Recarga" : "Lectura");
      const cargaLitros = parseNum(c[4]);
      let precioLitro = parseNum(c[6]);
      if (precioLitro > 0) latestPrice = precioLitro;
      else precioLitro = latestPrice;

      gasEvents.push({
        id: `gas-ev-${idx}-${parsedDate.iso}`,
        fecha: parsedDate.iso,
        fechaFormatted: parsedDate.formatted,
        timestamp: parsedDate.timestamp,
        hora: c[1] || '',
        tipo,
        porcentajeAntes: parseNum(c[3]),
        cargaLitros,
        porcentajeDespues: parseNum(c[5]),
        precioLitro,
        costoTotal: cargaLitros * precioLitro,
        remitoFactura: c[7] || '',
        observaciones: c[8] || ''
      });
    });

    gasEvents.sort((a, b) => a.timestamp - b.timestamp);

    // 2. Parse Production Fabricación
    const tanksByDate: Record<string, { totalTanks: number; primera: number; segunda: number; rotos: number; litersVolume: number; products: Record<string, number> }> = {};
    const tanksByMonth: Record<string, { totalTanks: number; primera: number; segunda: number; rotos: number; litersVolume: number }> = {};
    const fabByMonthAndOpKey: Record<string, Record<string, number>> = {};
    let totalTanks2026 = 0;
    let totalPrimera2026 = 0;
    let totalSegunda2026 = 0;
    let totalRotos2026 = 0;

    if (fabCsv) {
      const fabLines = fabCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      fabLines.forEach(line => {
        const c = parseCsvLine(line);
        const parsedDate = parseDateToIso(c[0]);
        const cant = parseInt(c[2]?.replace(/\D/g, '') || '0', 10) || 1;
        const op = c[5]?.trim();
        const calidad = c[7]?.trim() || '';
        const estado = c[8]?.trim() || '';

        if (parsedDate && estado === "Fabricado") {
          const iso = parsedDate.iso;
          const ym = iso.substring(0, 7);
          const isRoto = calidad.toLowerCase().includes("roto");
          const isSegunda = calidad.toLowerCase().includes("segunda");
          const isPrimera = !isRoto && !isSegunda;
          const baseProdName = c[1]?.replace(/\s*\(CIEGO\)/i, '').trim();
          const litersCapacity = parseInt(c[1]?.match(/(\d+)\s*(L|litros|lts|l)\b/i)?.[1] || '0', 10);

          if (!tanksByDate[iso]) tanksByDate[iso] = { totalTanks: 0, primera: 0, segunda: 0, rotos: 0, litersVolume: 0, products: {} };
          tanksByDate[iso].totalTanks += cant;
          if (isPrimera) tanksByDate[iso].primera += cant;
          if (isSegunda) tanksByDate[iso].segunda += cant;
          if (isRoto) tanksByDate[iso].rotos += cant;
          tanksByDate[iso].litersVolume += litersCapacity * cant;
          tanksByDate[iso].products[baseProdName] = (tanksByDate[iso].products[baseProdName] || 0) + cant;

          if (!tanksByMonth[ym]) tanksByMonth[ym] = { totalTanks: 0, primera: 0, segunda: 0, rotos: 0, litersVolume: 0 };
          tanksByMonth[ym].totalTanks += cant;
          if (isPrimera) tanksByMonth[ym].primera += cant;
          if (isSegunda) tanksByMonth[ym].segunda += cant;
          if (isRoto) tanksByMonth[ym].rotos += cant;
          tanksByMonth[ym].litersVolume += litersCapacity * cant;

          const opMeta = getOperatorMeta(op);
          if (opMeta) {
            if (!fabByMonthAndOpKey[ym]) fabByMonthAndOpKey[ym] = {};
            fabByMonthAndOpKey[ym][opMeta.canonicalKey] = (fabByMonthAndOpKey[ym][opMeta.canonicalKey] || 0) + cant;
          }

          if (iso.startsWith('2026')) {
            totalTanks2026 += cant;
            if (isPrimera) totalPrimera2026 += cant;
            if (isSegunda) totalSegunda2026 += cant;
            if (isRoto) totalRotos2026 += cant;
          }
        }
      });
    }

    // 3. Parse Assembly (Ensamblaje)
    const ensByMonthAndOpKey: Record<string, Record<string, number>> = {};
    if (ensCsv) {
      const ensLines = ensCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      ensLines.forEach(line => {
        const c = parseCsvLine(line);
        const parsedDate = parseDateToIso(c[0]);
        const cant = parseInt(c[2]?.replace(/\D/g, '') || '0', 10) || 1;
        const op = c[3]?.trim();
        if (parsedDate && c[5]?.trim() === "Ensamblado" && op) {
          const ym = parsedDate.iso.substring(0, 7);
          const opMeta = getOperatorMeta(op);
          if (opMeta) {
            if (!ensByMonthAndOpKey[ym]) ensByMonthAndOpKey[ym] = {};
            ensByMonthAndOpKey[ym][opMeta.canonicalKey] = (ensByMonthAndOpKey[ym][opMeta.canonicalKey] || 0) + cant;
          }
        }
      });
    }

    // 4. Parse Sueldos & Build Operator Cost Intelligence
    const salariesByMonthAndOpKey: Record<string, Record<string, number>> = {};
    if (sueldosCsv) {
      const sueldoLines = sueldosCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      sueldoLines.forEach(line => {
        const c = parseCsvLine(line);
        const ym = parseSueldoMonth(c[0]);
        const opMeta = getOperatorMeta(c[1]);
        const monto = parseNum(c[2]);
        if (ym && opMeta && monto > 0) {
          if (!salariesByMonthAndOpKey[ym]) salariesByMonthAndOpKey[ym] = {};
          salariesByMonthAndOpKey[ym][opMeta.canonicalKey] = (salariesByMonthAndOpKey[ym][opMeta.canonicalKey] || 0) + monto;
        }
      });
    }

    const trackedOps = [
      { key: 'RAMIREZ_RODRIGO', name: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
      { key: 'SANDOVAL_LEONARDO', name: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isEventual: false },
      { key: 'VERON_JULIO', name: 'Julio Verón', role: 'Mantenimiento & Operario Mixto', isMaintenance: true, isEventual: false, notes: 'Realiza mantenimiento preventivo y correctivo de maquinaria y soporte técnico de planta (no 100% de producción directa).' },
      { key: 'OLIVERA_MATIAS', name: 'Matías Olivera', role: 'Ensamblaje Principal & Rotomoldeo', isMaintenance: false, isEventual: false, notes: 'Responsable principal del armado de Biodigestores, Cámaras Sépticas y Desengrasadoras.' },
      { key: 'CONTRERAS_SAMUEL', name: 'Samuel Contreras', role: 'Operario Eventual (Variable)', isMaintenance: false, isEventual: true, notes: 'Operario eventual contratado según demanda productiva sin sueldo fijo mensual.' },
      { key: 'MANSILLA_ENZO', name: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isEventual: true }
    ];

    const allSalaryMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
    const operatorsData: OperatorSummary[] = [];
    let totalPureRotomoldingSalariesWithoutSAC = 0;
    let totalPureRotomoldingTanksWithoutSAC = 0;

    trackedOps.forEach(op => {
      const summary: OperatorSummary = {
        key: op.key,
        name: op.name,
        role: op.role,
        isMaintenanceSupport: op.isMaintenance,
        isEventual: op.isEventual,
        notes: op.notes,
        totalSalary: 0,
        totalSalaryWithoutAguinaldo: 0,
        totalTanksFabricated: 0,
        totalTanksAssembled: 0,
        totalTanks: 0,
        avgCostPerTank: 0,
        avgCostPerTankWithoutAguinaldo: 0,
        months: {}
      };
      allSalaryMonths.forEach(ym => {
        const isAguinaldoMonth = ym === '2026-06';
        const salary = salariesByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksFab = fabByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksEns = ensByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksTotal = tanksFab + tanksEns;
        summary.months[ym] = { 
          monthKey: ym, 
          monthName: formatMonthName(ym), 
          salary, 
          tanksFabricated: tanksFab, 
          tanksAssembled: tanksEns, 
          tanksTotal, 
          costPerTank: tanksTotal > 0 && salary > 0 ? Math.round(salary / tanksTotal) : 0, 
          isAguinaldoMonth 
        };
        summary.totalSalary += salary;
        if (!isAguinaldoMonth) summary.totalSalaryWithoutAguinaldo += salary;
        summary.totalTanksFabricated += tanksFab;
        summary.totalTanksAssembled += tanksEns;
        summary.totalTanks += tanksTotal;
        if (!op.isMaintenance && (op.key === 'RAMIREZ_RODRIGO' || op.key === 'SANDOVAL_LEONARDO') && !isAguinaldoMonth) {
          totalPureRotomoldingSalariesWithoutSAC += salary;
          totalPureRotomoldingTanksWithoutSAC += tanksTotal;
        }
      });
      summary.avgCostPerTank = summary.totalTanks > 0 && summary.totalSalary > 0 ? Math.round(summary.totalSalary / summary.totalTanks) : 0;
      const tanksWithoutSAC = summary.totalTanks - (summary.months['2026-06']?.tanksTotal || 0);
      summary.avgCostPerTankWithoutAguinaldo = tanksWithoutSAC > 0 && summary.totalSalaryWithoutAguinaldo > 0 ? Math.round(summary.totalSalaryWithoutAguinaldo / tanksWithoutSAC) : summary.avgCostPerTank;
      operatorsData.push(summary);
    });

    const baseLaborCostPerTank = totalPureRotomoldingTanksWithoutSAC > 0 ? Math.round(totalPureRotomoldingSalariesWithoutSAC / totalPureRotomoldingTanksWithoutSAC) : 5500;

    // 5. Parse Edenor (Electricidad a mes vencido)
    const electricityRecords: ElectricityRecord[] = [];
    const electricityByConsumedMonth: Record<string, number> = {};
    let totalElectricityAmount = 0;
    let totalTanksMeasuredElectricity = 0;

    if (edenorCsv) {
      const edenorLines = edenorCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      edenorLines.forEach((line, idx) => {
        const c = parseCsvLine(line);
        const parsedDate = parseDateToIso(c[0]);
        const concept = c[1]?.trim() || "Edenor - Quilmes 4550";
        const amount = parseNum(c[2]);

        if (parsedDate && amount > 0) {
          // A mes vencido: Paid in month M corresponds to electricity consumed in month M-1
          let consY = parsedDate.year;
          let consM = parsedDate.month - 1;
          if (consM === 0) {
            consM = 12;
            consY -= 1;
          }
          const pad = (n: number) => n.toString().padStart(2, '0');
          const consumedMonthKey = `${consY}-${pad(consM)}`;
          const tanksInMonth = tanksByMonth[consumedMonthKey]?.totalTanks || 0;
          const costPerTank = tanksInMonth > 0 ? Math.round(amount / tanksInMonth) : 0;

          electricityByConsumedMonth[consumedMonthKey] = amount;
          totalElectricityAmount += amount;
          totalTanksMeasuredElectricity += tanksInMonth;

          electricityRecords.push({
            id: `edenor-${idx}-${parsedDate.iso}`,
            paymentDate: parsedDate.iso,
            paymentDateFormatted: parsedDate.formatted,
            consumedMonthKey,
            consumedMonthName: formatMonthName(consumedMonthKey),
            concept,
            amount,
            tanksProducedInMonth: tanksInMonth,
            costPerTank
          });
        }
      });
    }

    // Benchmark Electricity Cost per Base Tank (Feb-Jul regular average)
    const regularElectricityAmount = electricityRecords
      .filter(r => r.consumedMonthKey >= '2026-02' && r.consumedMonthKey <= '2026-07')
      .reduce((acc, r) => acc + r.amount, 0);
    const regularElectricityTanks = electricityRecords
      .filter(r => r.consumedMonthKey >= '2026-02' && r.consumedMonthKey <= '2026-07')
      .reduce((acc, r) => acc + r.tanksProducedInMonth, 0);
    const baseElectricityCostPerTank = regularElectricityTanks > 0 
      ? Math.round(regularElectricityAmount / regularElectricityTanks) 
      : 815;

    // 6. Monthly Gas Consumption & Total Operating Cost Correlation
    const monthlyGasMap: Record<string, { gasLitros: number; inversion: number; tanques: number; litrosTransformados: number; }> = {};
    Object.entries(tanksByMonth).forEach(([ym, pData]) => { monthlyGasMap[ym] = { gasLitros: 0, inversion: 0, tanques: pData.totalTanks, litrosTransformados: pData.litersVolume }; });
    const refills = gasEvents.filter(e => e.tipo === "Recarga" && e.cargaLitros > 0);
    refills.forEach(r => {
      const ym = r.fecha.substring(0, 7);
      if (!monthlyGasMap[ym]) monthlyGasMap[ym] = { gasLitros: 0, inversion: 0, tanques: 0, litrosTransformados: 0 };
      monthlyGasMap[ym].gasLitros += r.cargaLitros;
      monthlyGasMap[ym].inversion += r.costoTotal;
    });

    const monthlyBreakdown: MonthlyCostBreakdown[] = Object.entries(monthlyGasMap).map(([ym, data]) => {
      const gasPerTank = data.tanques > 0 && data.gasLitros > 0 ? data.gasLitros / data.tanques : 0;
      const gasCostPerTank = data.tanques > 0 && data.inversion > 0 ? data.inversion / data.tanques : 0;
      
      // Sum labor salaries for this month
      let monthMdoSalary = 0;
      trackedOps.forEach(op => {
        monthMdoSalary += salariesByMonthAndOpKey[ym]?.[op.key] || 0;
      });
      const mdoCostPerTank = data.tanques > 0 && monthMdoSalary > 0 ? Math.round(monthMdoSalary / data.tanques) : 0;

      // Electricity for this consumed month
      const luzAmount = electricityByConsumedMonth[ym] || 0;
      const luzCostPerTank = data.tanques > 0 && luzAmount > 0 ? Math.round(luzAmount / data.tanques) : 0;

      const totalMonthlyOpCost = data.inversion + monthMdoSalary + luzAmount;
      const unitTotalCost = data.tanques > 0 ? Math.round(totalMonthlyOpCost / data.tanques) : 0;

      return {
        monthKey: ym,
        monthName: formatMonthName(ym),
        tanquesFabricados: data.tanques,
        litrosTransformados: data.litrosTransformados,
        gasLitros: parseFloat(data.gasLitros.toFixed(1)),
        gasInversion: parseFloat(data.inversion.toFixed(0)),
        gasCostoUnitario: parseFloat(gasCostPerTank.toFixed(0)),
        mdoTotal: monthMdoSalary,
        mdoCostoUnitario: mdoCostPerTank,
        luzTotal: luzAmount,
        luzCostoUnitario: luzCostPerTank,
        costoTotalOperativo: totalMonthlyOpCost,
        costoUnitarioTotal: unitTotalCost
      };
    }).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    // 7. Model Scores & Combined Manufacturing Cost Matrix (Gas + Mano de Obra + Electricidad)
    const baseGasLiters = (tanksByMonth['2026-08']?.totalTanks || 475) > 0 ? (monthlyGasMap['2026-08']?.gasLitros || 3594) / (tanksByMonth['2026-08']?.totalTanks || 475) : 7.57;
    const rawModelDefinitions = [
      { producto: "AquaFort - TRIC 500L Gris", tipo: "500 TRIC", puntaje: 1.0, litrosTanque: "500L" },
      { producto: "AquaFort - TRIC 500L Beige", tipo: "500 TRIC", puntaje: 1.0, litrosTanque: "500L" },
      { producto: "AquaFort - TRIC 600L Gris", tipo: "600 TRIC", puntaje: 1.2, litrosTanque: "600L" },
      { producto: "AquaFort - TRIC 600L Beige", tipo: "600 TRIC", puntaje: 1.2, litrosTanque: "600L" },
      { producto: "AquaFort - TRIC 750L Gris", tipo: "750 TRIC", puntaje: 1.5, litrosTanque: "750L" },
      { producto: "AquaFort - TRIC 750L Beige", tipo: "750 TRIC", puntaje: 1.5, litrosTanque: "750L" },
      { producto: "AquaFort - TRIC 300L Gris", tipo: "300 TRIC", puntaje: 0.6, litrosTanque: "300L" },
      { producto: "AquaFort - TRIC 300L Beige", tipo: "300 TRIC", puntaje: 0.6, litrosTanque: "300L" },
      { producto: "AquaFort - TRIC 1000L Gris", tipo: "1000 TRIC", puntaje: 2.0, litrosTanque: "1000L" },
      { producto: "AquaFort - BIC 500L", tipo: "500 BIC", puntaje: 0.90, litrosTanque: "500L" },
      { producto: "AquaFort - BIC 600L", tipo: "600 BIC", puntaje: 1.08, litrosTanque: "600L" },
      { producto: "AquaFort - BIC 750L", tipo: "750 BIC", puntaje: 1.35, litrosTanque: "750L" },
      { producto: "AquaFort - BIC 300L", tipo: "300 BIC", puntaje: 0.54, litrosTanque: "300L" },
      { producto: "AquaFort - CUATR 500L", tipo: "500 CUATR", puntaje: 1.10, litrosTanque: "500L" },
      { producto: "AquaFort - CUATR 600L", tipo: "600 CUATR", puntaje: 1.30, litrosTanque: "600L" },
      { producto: "AquaFort - CUATR 750L", tipo: "750 CUATR", puntaje: 1.60, litrosTanque: "750L" },
      { producto: "AquaFort - CISTERNA 500L", tipo: "500 CIST", puntaje: 1.0, litrosTanque: "500L" },
      { producto: "AquaFort - CISTERNA 750L", tipo: "750 CIST", puntaje: 1.5, litrosTanque: "750L" },
      { producto: "Cono Biodigestor", tipo: "Cono", puntaje: 0.40, litrosTanque: "Cono" },
      { producto: "Tacho Cámara/Bio 600L", tipo: "Cámara 600", puntaje: 1.32, litrosTanque: "600L" },
      { producto: "Tacho Cámara/Bio 500L", tipo: "Cámara 500", puntaje: 1.05, litrosTanque: "500L" },
      { producto: "Tacho Cónico 700L", tipo: "Cónico 700", puntaje: 1.40, litrosTanque: "700L" }
    ];

    const modelScores: CombinedModelCost[] = rawModelDefinitions.map(item => {
      const litrosGasEstimado = parseFloat((item.puntaje * baseGasLiters).toFixed(2));
      const costoGasEstimado = parseFloat((litrosGasEstimado * latestPrice).toFixed(0));
      const costoManoObraEstimado = parseFloat((item.puntaje * baseLaborCostPerTank).toFixed(0));
      const costoElectricidadEstimado = parseFloat((item.puntaje * baseElectricityCostPerTank).toFixed(0));
      const costoTotalFabricacion = costoGasEstimado + costoManoObraEstimado + costoElectricidadEstimado;

      return {
        producto: item.producto,
        tipo: item.tipo,
        puntaje: item.puntaje,
        litrosTanque: item.litrosTanque,
        litrosGasEstimado,
        costoGasEstimado,
        costoManoObraEstimado,
        costoElectricidadEstimado,
        costoTotalFabricacion,
        porcentajeGas: costoTotalFabricacion > 0 ? parseFloat(((costoGasEstimado / costoTotalFabricacion) * 100).toFixed(1)) : 50,
        porcentajeManoObra: costoTotalFabricacion > 0 ? parseFloat(((costoManoObraEstimado / costoTotalFabricacion) * 100).toFixed(1)) : 40,
        porcentajeElectricidad: costoTotalFabricacion > 0 ? parseFloat(((costoElectricidadEstimado / costoTotalFabricacion) * 100).toFixed(1)) : 10
      };
    });

    // 8. Tank Zeppelin Status & Intervals
    const readings = gasEvents.filter(e => e.porcentajeAntes > 0 || e.tipo === "Lectura");
    const lastReading = readings.length > 0 ? readings[readings.length - 1] : null;
    const lastRefill = refills.length > 0 ? refills[refills.length - 1] : null;
    const currentTankPercentage = lastReading ? lastReading.porcentajeAntes : 43.3;
    const currentTankLiters = (TANK_CAPACITY_LITERS * currentTankPercentage) / 100;

    const intervals: GasIntervalMeasurement[] = [];
    for (let i = 0; i < readings.length - 1; i++) {
      const start = readings[i];
      const end = readings[i + 1];
      const refillsBetween = gasEvents.filter(
        e => e.tipo === "Recarga" && e.cargaLitros > 0 && e.timestamp >= start.timestamp && e.timestamp <= end.timestamp
      );
      const refillLiters = refillsBetween.reduce((acc, r) => acc + r.cargaLitros, 0);
      const gasInitialLiters = (TANK_CAPACITY_LITERS * start.porcentajeAntes) / 100;
      const gasFinalLiters = (TANK_CAPACITY_LITERS * end.porcentajeAntes) / 100;
      const gasConsumido = Math.max(0, gasInitialLiters + refillLiters - gasFinalLiters);

      let tanksInInterval = 0;
      Object.entries(tanksByDate).forEach(([dateIso, data]) => {
        const dTime = new Date(dateIso).getTime();
        if (dTime >= start.timestamp && dTime <= end.timestamp) tanksInInterval += data.totalTanks;
      });

      const daysDiff = Math.max(1, Math.round((end.timestamp - start.timestamp) / (1000 * 60 * 60 * 24)));
      const costoIntervalo = gasConsumido * latestPrice;

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
        litrosGasPorTanque: parseFloat((tanksInInterval > 0 ? gasConsumido / tanksInInterval : 0).toFixed(2)),
        costoGasPorTanque: parseFloat((tanksInInterval > 0 ? costoIntervalo / tanksInInterval : 0).toFixed(0))
      });
    }

    // 9. 14-Day Rolling Window
    const lastTimestamp = lastReading ? lastReading.timestamp : Date.now();
    const fourteenDaysAgoTimestamp = lastTimestamp - (14 * 86400000);
    const readingsLast14 = gasEvents.filter(e => (e.porcentajeAntes > 0 || e.tipo === 'Lectura') && e.timestamp >= fourteenDaysAgoTimestamp);
    
    let gasConsumedLast14Days = 0;
    let tanksLast14Days = 0;
    let daysMeasured14 = 14;
    let avgGasPerTankLast14 = baseGasLiters;

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
    }

    const dailyGasConsumptionLast14 = daysMeasured14 > 0 && gasConsumedLast14Days > 0 
      ? gasConsumedLast14Days / daysMeasured14 
      : (tanksLast14Days / 14) * avgGasPerTankLast14;

    const daysOfAutonomyRemaining = Math.max(1, Math.round(currentTankLiters / (dailyGasConsumptionLast14 || 100)));

    // 10. Current Month (Agosto 2026) Forecast
    const currentYearMonth = "2026-08";
    const currentMonthName = formatMonthName(currentYearMonth);
    const tanksCurrentMonthMtd = tanksByMonth[currentYearMonth]?.totalTanks || 475;
    const gasConsumedCurrentMonthMtd = parseFloat((tanksCurrentMonthMtd * baseGasLiters).toFixed(1));
    const gasCostCurrentMonthMtd = parseFloat((gasConsumedCurrentMonthMtd * latestPrice).toFixed(0));

    const totalDaysInMonth = 31;
    const currentDayOfMonth = 24;
    const daysRemainingInMonth = Math.max(0, totalDaysInMonth - currentDayOfMonth);
    const projectedRemainingGasConsumption = parseFloat((daysRemainingInMonth * dailyGasConsumptionLast14).toFixed(1));
    const projectedRemainingGasCost = parseFloat((projectedRemainingGasConsumption * latestPrice).toFixed(0));

    const projectedTotalMonthGasLiters = parseFloat((gasConsumedCurrentMonthMtd + projectedRemainingGasConsumption).toFixed(1));
    const projectedTotalMonthGasCost = parseFloat((gasCostCurrentMonthMtd + projectedRemainingGasCost).toFixed(0));
    const projectedEndingTankStockLiters = parseFloat((currentTankLiters - projectedRemainingGasConsumption).toFixed(1));
    const projectedEndingTankPercentage = parseFloat(((projectedEndingTankStockLiters / TANK_CAPACITY_LITERS) * 100).toFixed(1));

    // Global 2026 Summary
    const totalGasLitros2026 = refills.filter(r => r.fecha.startsWith('2026')).reduce((acc, r) => acc + r.cargaLitros, 0);
    const totalInversionGas2026 = refills.filter(r => r.fecha.startsWith('2026')).reduce((acc, r) => acc + r.costoTotal, 0);

    return NextResponse.json({
      success: true,
      currentMonthForecast: {
        monthKey: currentYearMonth,
        monthName: currentMonthName,
        tanksProducedMtd: tanksCurrentMonthMtd,
        gasConsumedMtdLiters: gasConsumedCurrentMonthMtd,
        gasConsumedMtdCost: gasCostCurrentMonthMtd,
        currentTankStockLiters: currentTankLiters,
        currentTankStockCost: parseFloat((currentTankLiters * latestPrice).toFixed(0)),
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
        isStockSufficientForMonth: projectedEndingTankStockLiters >= 0
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
        avgCostPerTank: parseFloat((avgGasPerTankLast14 * latestPrice).toFixed(0)),
        dailyGasConsumptionLiters: parseFloat(dailyGasConsumptionLast14.toFixed(1))
      },
      costBenchmarks: {
        baseLaborCostPerTank,
        baseElectricityCostPerTank,
        baseGasCostPerTank: parseFloat((baseGasLiters * latestPrice).toFixed(0)),
        baseTotalManufacturingCost: parseFloat((baseGasLiters * latestPrice + baseLaborCostPerTank + baseElectricityCostPerTank).toFixed(0)),
        pureRotomoldingSalariesWithoutSAC: totalPureRotomoldingSalariesWithoutSAC,
        pureRotomoldingTanksWithoutSAC: totalPureRotomoldingTanksWithoutSAC
      },
      summary2026: {
        totalTanksRotomolded: totalTanks2026,
        totalPrimera: totalPrimera2026,
        totalSegunda: totalSegunda2026,
        totalRotos: totalRotos2026,
        pctPrimera: totalTanks2026 > 0 ? parseFloat(((totalPrimera2026 / totalTanks2026) * 100).toFixed(1)) : 100,
        pctScrap: totalTanks2026 > 0 ? parseFloat(((totalRotos2026 / totalTanks2026) * 100).toFixed(1)) : 0,
        litrosGasPerdidosRotos: parseFloat((totalRotos2026 * baseGasLiters).toFixed(1)),
        costoGasPerdidoRotos: parseFloat((totalRotos2026 * baseGasLiters * latestPrice).toFixed(0)),
        totalGasLitersRefilled: totalGasLitros2026,
        totalGasCost: totalInversionGas2026,
        avgGasLitersPerTank: parseFloat(baseGasLiters.toFixed(2)),
        avgCostPerTank: parseFloat((baseGasLiters * latestPrice).toFixed(0)),
        weightedAvgPricePerLiter: totalGasLitros2026 > 0 ? parseFloat((totalInversionGas2026 / totalGasLitros2026).toFixed(2)) : latestPrice
      },
      operatorsData,
      electricityRecords,
      modelScores,
      intervals,
      monthlyBreakdown,
      gasEvents: gasEvents.reverse(),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error en API /api/admin/gas-consumo-data:", error);
    return NextResponse.json({ success: false, error: error.message || "Error al consultar los datos" }, { status: 500 });
  }
}
