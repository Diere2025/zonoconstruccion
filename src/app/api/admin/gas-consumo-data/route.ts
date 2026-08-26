import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPREADSHEET_GAS_ID = "1k112jRkUR6SqMtjHg0rWzFF3iyHNa-VBiVSs3GoEnko";
const SPREADSHEET_PRODUCTION_ID = "1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0";
const SPREADSHEET_PRICES_ID = "1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg";
const TANK_CAPACITY_LITERS = 4000; // Tanque Zeppelin de 4.000 Litros (4 m3)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
  isEstimated?: boolean;
}

export interface OperationalExpenseRecord {
  id: string;
  subCategory: string;
  category: string;
  date: string;
  dateFormatted: string;
  concept: string;
  movementType: string;
  type: string;
  amount: number;
  account: string;
  monthKey: string;
  monthName: string;
  description: string;
  isCapex: boolean;
  isInsumoDiario: boolean;
  isInstalaciones: boolean;
  isMaquinaria: boolean;
  isMdoMantenimiento?: boolean;
}

export interface CombinedModelCost {
  producto: string;
  tipo: string;
  puntaje: number;
  litrosTanque: string;
  costoInsumos: number;
  litrosGasEstimado: number;
  costoGasEstimado: number;
  costoManoObraEstimado: number;
  costoElectricidadEstimado: number;
  costoOpexEstimado: number;
  costoDirectoMarginal: number;
  costoDirectoPlanta: number;
  costoEstructuraFija: number;
  costoTotalFabricacion: number;
  porcentajeGas: number;
  porcentajeManoObra: number;
  porcentajeElectricidad: number;
  porcentajeOpex: number;
}

export interface FabricatedProductCost {
  id: string;
  sku: string;
  name: string;
  category: string;
  family: string;
  score: number;
  litrosTanque: string;
  costInsumos: number;
  gasLiters: number;
  gasCost: number;
  mdoCost: number;
  luzCost: number;
  opexCost: number;
  costoDirectoMarginal: number;
  costoDirectoPlanta: number;
  costoEstructuraFija: number;
  plantOpCost: number;
  totalIntegralCost: number;
  price: number;
  marginValue: number;
  marginPct: number;
}

export interface MonthlyCostBreakdown {
  monthKey: string;
  monthName: string;
  tanquesFabricados: number;
  litrosTransformados: number;
  gasLitros: number;
  gasLitrosPorTanque: number;
  gasInversion: number;
  gasCostoUnitario: number;
  gasLitrosRecarga?: number;
  gasInversionRecarga?: number;
  stockZeppelinPct?: number;
  mdoTotal: number;
  mdoCostoUnitario: number;
  mdoDirectaTotal?: number;
  mdoDirectaCostoUnitario?: number;
  isEstimatedMdo?: boolean;
  luzTotal: number;
  luzCostoUnitario: number;
  isEstimatedLuz?: boolean;
  opexTotal: number;
  opexCostoUnitario: number;
  opexMaquinaria: number;
  opexInstalaciones: number;
  opexInsumosDiarios: number;
  capexTotal: number;
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
  costPerFabricatedTank: number;
  costPerAssembledTank: number;
  isAguinaldoMonth: boolean;
  productiveCredit?: number;
  pureMaintenanceCost?: number;
  maintenanceCostPerPlantTank?: number;
  plantTotalTanks?: number;
}

export interface OperatorSummary {
  key: string;
  name: string;
  role: string;
  isMaintenanceSupport: boolean;
  isWarehouse: boolean;
  isEventual: boolean;
  notes?: string;
  totalSalary: number;
  totalSalaryWithoutAguinaldo: number;
  totalTanksFabricated: number;
  totalTanksAssembled: number;
  totalTanks: number;
  avgCostPerFabricatedTank: number;
  avgCostPerFabricatedTankWithoutAguinaldo: number;
  avgCostPerAssembledTank: number;
  totalProductiveCredit?: number;
  totalPureMaintenanceCost?: number;
  avgMaintenanceCostPerPlantTank?: number;
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

const canonicalOperatorMap: Record<string, { canonicalKey: string; displayName: string; role: string; isMaintenance: boolean; isWarehouse: boolean; isEventual: boolean; notes?: string }> = {
  'RODRIGO RAMIREZ': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  'RODRIGO RAMIREX': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  'RAMIREZ, RODRIGO MAXIMILIANO': { canonicalKey: 'RAMIREZ_RODRIGO', displayName: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  
  'LEONARDO SANDOVAL': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  'LEO SANDOVAL': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  'SANDOVAL, LEONARDO JUAN CARLOS': { canonicalKey: 'SANDOVAL_LEONARDO', displayName: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
  
  'SAMUEL CONTRERAS': { canonicalKey: 'CONTRERAS_SAMUEL', displayName: 'Samuel Contreras', role: 'Operario Rotomoldeo (Eventual)', isMaintenance: false, isWarehouse: false, isEventual: true, notes: 'Operario eventual de rotomoldeo contratado según picos de demanda.' },
  'CONTRERAS, SAMUEL': { canonicalKey: 'CONTRERAS_SAMUEL', displayName: 'Samuel Contreras', role: 'Operario Rotomoldeo (Eventual)', isMaintenance: false, isWarehouse: false, isEventual: true, notes: 'Operario eventual de rotomoldeo contratado según picos de demanda.' },

  'JULIO VERÓN': { canonicalKey: 'VERON_JULIO', displayName: 'Julio VerÓN', role: 'Mantenimiento de Maquinaria & Planta', isMaintenance: true, isWarehouse: false, isEventual: false, notes: 'Mantenimiento preventivo/correctivo de maquinaria y soporte técnico de planta. Su costo se descuenta del valor de horneado y se amortiza entre toda la producción.' },
  'JULIO VERON': { canonicalKey: 'VERON_JULIO', displayName: 'Julio Verón', role: 'Mantenimiento de Maquinaria & Planta', isMaintenance: true, isWarehouse: false, isEventual: false, notes: 'Mantenimiento preventivo/correctivo de maquinaria y soporte técnico de planta. Su costo se descuenta del valor de horneado y se amortiza entre toda la producción.' },
  'VERON, JULIO CESAR': { canonicalKey: 'VERON_JULIO', displayName: 'Julio Verón', role: 'Mantenimiento de Maquinaria & Planta', isMaintenance: true, isWarehouse: false, isEventual: false, notes: 'Mantenimiento preventivo/correctivo de maquinaria y soporte técnico de planta. Su costo se descuenta del valor de horneado y se amortiza entre toda la producción.' },
  
  'MATIAS OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Gestión de Depósito & Ensamblado', isMaintenance: false, isWarehouse: true, isEventual: false, notes: 'Gestión operativa de depósito, control de stock y armado/ensamblaje de Biodigestores y Cámaras.' },
  'MATÍAS OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Gestión de Depósito & Ensamblado', isMaintenance: false, isWarehouse: true, isEventual: false, notes: 'Gestión operativa de depósito, control de stock y armado/ensamblaje de Biodigestores y Cámaras.' },
  'MATI OLIVERA': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Gestión de Depósito & Ensamblado', isMaintenance: false, isWarehouse: true, isEventual: false, notes: 'Gestión operativa de depósito, control de stock y armado/ensamblaje de Biodigestores y Cámaras.' },
  'OLIVERA, MATIAS NAHUEL': { canonicalKey: 'OLIVERA_MATIAS', displayName: 'Matías Olivera', role: 'Gestión de Depósito & Ensamblado', isMaintenance: false, isWarehouse: true, isEventual: false, notes: 'Gestión operativa de depósito, control de stock y armado/ensamblaje de Biodigestores y Cámaras.' },
  
  'GABRIEL MANSILLA': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isWarehouse: true, isEventual: true },
  'ENZO MANSILLA': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isWarehouse: true, isEventual: true },
  'MANSILLA, ENZO GABRIEL': { canonicalKey: 'MANSILLA_ENZO', displayName: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isWarehouse: true, isEventual: true }
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
    const gasGastosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_GAS_ID}/gviz/tq?tqx=out:csv&sheet=GASTOS_OPERATIVOS`;
    const prodFabUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Fabricaci%C3%B3n`;
    const prodEnsUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Ensamblaje`;
    const pricesUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRICES_ID}/export?format=csv&gid=508601925`;
    const supabaseProductsUrl = `${SUPABASE_URL}/rest/v1/products?is_active=eq.true&select=id,name,sku,price&order=name.asc`;

    const [gasRes, tipoRes, sueldosRes, edenorRes, gastosRes, fabRes, ensRes, pricesRes, dbProductsRes] = await Promise.all([
      fetch(gasCargaUrl, { cache: "no-store" }),
      fetch(gasTipoUrl, { cache: "no-store" }),
      fetch(gasSueldosUrl, { cache: "no-store" }),
      fetch(gasEdenorUrl, { cache: "no-store" }),
      fetch(gasGastosUrl, { cache: "no-store" }),
      fetch(prodFabUrl, { cache: "no-store" }),
      fetch(prodEnsUrl, { cache: "no-store" }),
      fetch(pricesUrl, { cache: "no-store" }),
      fetch(supabaseProductsUrl, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        cache: "no-store"
      })
    ]);

    if (!gasRes.ok) {
      throw new Error(`Error al leer la hoja de Cargas de Gas (${gasRes.status})`);
    }

    const [gasCsv, tipoCsv, sueldosCsv, edenorCsv, gastosCsv, fabCsv, ensCsv, pricesCsv, dbProducts] = await Promise.all([
      gasRes.text(),
      tipoRes.ok ? tipoRes.text() : Promise.resolve(""),
      sueldosRes.ok ? sueldosRes.text() : Promise.resolve(""),
      edenorRes.ok ? edenorRes.text() : Promise.resolve(""),
      gastosRes.ok ? gastosRes.text() : Promise.resolve(""),
      fabRes.ok ? fabRes.text() : Promise.resolve(""),
      ensRes.ok ? ensRes.text() : Promise.resolve(""),
      pricesRes.ok ? pricesRes.text() : Promise.resolve(""),
      dbProductsRes.ok ? dbProductsRes.json() : Promise.resolve([])
    ]);

    // Build Prices and SKU Map
    const pricesMap: Record<string, { price: number; sku?: string; id?: string }> = {};
    if (pricesCsv) {
      pricesCsv.split('\n').slice(1).forEach(l => {
        const c = parseCsvLine(l);
        const name = c[1]?.trim();
        const p = parseNum(c[2]);
        if (name && p > 0) {
          pricesMap[name.toLowerCase()] = { price: p };
        }
      });
    }
    if (Array.isArray(dbProducts)) {
      dbProducts.forEach((p: any) => {
        if (p.name) {
          const norm = p.name.toLowerCase();
          pricesMap[norm] = {
            price: p.price || pricesMap[norm]?.price || 0,
            sku: p.sku || 'SIN-SKU',
            id: p.id
          };
        }
      });
    }

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

    // 2. Parse Production Fabricación (Rotomoldeo en Hornos)
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
      { key: 'RAMIREZ_RODRIGO', name: 'Rodrigo Ramirez', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
      { key: 'SANDOVAL_LEONARDO', name: 'Leonardo Sandoval', role: 'Rotomoldeo Principal', isMaintenance: false, isWarehouse: false, isEventual: false },
      { key: 'CONTRERAS_SAMUEL', name: 'Samuel Contreras', role: 'Operario Rotomoldeo (Eventual)', isMaintenance: false, isWarehouse: false, isEventual: true, notes: 'Operario eventual de rotomoldeo contratado según picos de demanda.' },
      { key: 'VERON_JULIO', name: 'Julio Verón', role: 'Mantenimiento de Maquinaria & Planta', isMaintenance: true, isWarehouse: false, isEventual: false, notes: 'Mantenimiento preventivo/correctivo de maquinaria y soporte técnico de planta. Su costo se descuenta del valor de horneado y se amortiza entre toda la producción.' },
      { key: 'OLIVERA_MATIAS', name: 'Matías Olivera', role: 'Gestión de Depósito & Ensamblado', isMaintenance: false, isWarehouse: true, isEventual: false, notes: 'Gestión operativa de depósito, control de stock y armado/ensamblaje de Biodigestores y Cámaras.' },
      { key: 'MANSILLA_ENZO', name: 'Enzo Mansilla', role: 'Ensamblaje (Enero)', isMaintenance: false, isWarehouse: true, isEventual: true }
    ];

    // Proportional Salary Estimation for August (or any unclosed current month)
    // If August salaries are not yet fully loaded in sheet, take July values scaled by days elapsed (e.g. 26/31)
    const currentDayOfMonthVal = 26;
    const totalDaysInAug = 31;
    const monthProportion = currentDayOfMonthVal / totalDaysInAug;

    if (!salariesByMonthAndOpKey['2026-08']) salariesByMonthAndOpKey['2026-08'] = {};
    trackedOps.forEach(op => {
      const actualAgo = salariesByMonthAndOpKey['2026-08']?.[op.key] || 0;
      const prevJul = salariesByMonthAndOpKey['2026-07']?.[op.key] || 0;
      if (prevJul > 0) {
        const estimatedProportional = Math.round(prevJul * monthProportion);
        if (actualAgo < estimatedProportional) {
          salariesByMonthAndOpKey['2026-08'][op.key] = estimatedProportional;
        }
      }
    });

    const allSalaryMonths = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    const operatorsData: OperatorSummary[] = [];
    let totalPureRotomoldingSalariesWithoutSAC = 0;
    let totalPureRotomoldingFabricatedWithoutSAC = 0;

    allSalaryMonths.forEach(ym => {
      const isAguinaldoMonth = ym === '2026-06';
      if (!isAguinaldoMonth) {
        ['RAMIREZ_RODRIGO', 'SANDOVAL_LEONARDO', 'CONTRERAS_SAMUEL'].forEach(k => {
          totalPureRotomoldingSalariesWithoutSAC += (salariesByMonthAndOpKey[ym]?.[k] || 0);
          totalPureRotomoldingFabricatedWithoutSAC += (fabByMonthAndOpKey[ym]?.[k] || 0);
        });
      }
    });

    const baseLaborCostPerTank = totalPureRotomoldingFabricatedWithoutSAC > 0 
      ? Math.round(totalPureRotomoldingSalariesWithoutSAC / totalPureRotomoldingFabricatedWithoutSAC) 
      : 4800;

    trackedOps.forEach(op => {
      const summary: OperatorSummary = {
        key: op.key,
        name: op.name,
        role: op.role,
        isMaintenanceSupport: op.isMaintenance,
        isWarehouse: op.isWarehouse,
        isEventual: op.isEventual,
        notes: op.notes,
        totalSalary: 0,
        totalSalaryWithoutAguinaldo: 0,
        totalTanksFabricated: 0,
        totalTanksAssembled: 0,
        totalTanks: 0,
        avgCostPerFabricatedTank: 0,
        avgCostPerFabricatedTankWithoutAguinaldo: 0,
        avgCostPerAssembledTank: 0,
        totalProductiveCredit: 0,
        totalPureMaintenanceCost: 0,
        avgMaintenanceCostPerPlantTank: 0,
        months: {}
      };

      let sumPlantTanks = 0;

      allSalaryMonths.forEach(ym => {
        const isAguinaldoMonth = ym === '2026-06';
        const salary = salariesByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksFab = fabByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksEns = ensByMonthAndOpKey[ym]?.[op.key] || 0;
        const tanksTotal = tanksFab + tanksEns;
        const plantTanksInMonth = tanksByMonth[ym]?.totalTanks || 0;
        
        const costPerFabricatedTank = tanksFab > 0 && salary > 0 ? Math.round(salary / tanksFab) : 0;
        const costPerAssembledTank = tanksEns > 0 && salary > 0 ? Math.round(salary / tanksEns) : 0;

        let productiveCredit = 0;
        let pureMaintenanceCost = 0;
        let maintenanceCostPerPlantTank = 0;

        if (op.isMaintenance) {
          productiveCredit = tanksFab * baseLaborCostPerTank;
          pureMaintenanceCost = Math.max(0, salary - productiveCredit);
          maintenanceCostPerPlantTank = plantTanksInMonth > 0 ? Math.round(pureMaintenanceCost / plantTanksInMonth) : 0;
        }

        summary.months[ym] = { 
          monthKey: ym, 
          monthName: formatMonthName(ym), 
          salary, 
          tanksFabricated: tanksFab, 
          tanksAssembled: tanksEns, 
          tanksTotal, 
          costPerFabricatedTank,
          costPerAssembledTank,
          isAguinaldoMonth,
          productiveCredit,
          pureMaintenanceCost,
          maintenanceCostPerPlantTank,
          plantTotalTanks: plantTanksInMonth
        };

        summary.totalSalary += salary;
        if (!isAguinaldoMonth) summary.totalSalaryWithoutAguinaldo += salary;
        summary.totalTanksFabricated += tanksFab;
        summary.totalTanksAssembled += tanksEns;
        summary.totalTanks += tanksTotal;
        summary.totalProductiveCredit! += productiveCredit;
        summary.totalPureMaintenanceCost! += pureMaintenanceCost;
        sumPlantTanks += plantTanksInMonth;
      });

      summary.avgCostPerFabricatedTank = summary.totalTanksFabricated > 0 && summary.totalSalary > 0 
        ? Math.round(summary.totalSalary / summary.totalTanksFabricated) 
        : 0;

      const tanksFabWithoutSAC = summary.totalTanksFabricated - (summary.months['2026-06']?.tanksFabricated || 0);
      summary.avgCostPerFabricatedTankWithoutAguinaldo = tanksFabWithoutSAC > 0 && summary.totalSalaryWithoutAguinaldo > 0 
        ? Math.round(summary.totalSalaryWithoutAguinaldo / tanksFabWithoutSAC) 
        : summary.avgCostPerFabricatedTank;

      summary.avgCostPerAssembledTank = summary.totalTanksAssembled > 0 && summary.totalSalary > 0 
        ? Math.round(summary.totalSalary / summary.totalTanksAssembled) 
        : 0;

      summary.avgMaintenanceCostPerPlantTank = sumPlantTanks > 0 && summary.totalPureMaintenanceCost! > 0 
        ? Math.round(summary.totalPureMaintenanceCost! / sumPlantTanks) 
        : 0;

      operatorsData.push(summary);
    });

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

    // Proportional Electricity Estimation for August (or any unbilled current month)
    // Edenor is billed in arrears (a mes vencido). If August is not yet billed, average recent 3 months and scale by 26/31 days
    let isAugustEdenorEstimated = false;
    if (!electricityByConsumedMonth['2026-08'] || electricityByConsumedMonth['2026-08'] === 0) {
      const recentLuzMonths = ['2026-05', '2026-06', '2026-07'];
      const recentLuzSums = recentLuzMonths.map(m => electricityByConsumedMonth[m] || 0).filter(v => v > 0);
      const avgRecentLuz = recentLuzSums.length > 0 
        ? recentLuzSums.reduce((a, b) => a + b, 0) / recentLuzSums.length 
        : 546730;
      
      const estimatedAugLuz = Math.round(avgRecentLuz * monthProportion);
      electricityByConsumedMonth['2026-08'] = estimatedAugLuz;
      isAugustEdenorEstimated = true;

      const tanksAug = tanksByMonth['2026-08']?.totalTanks || 541;
      electricityRecords.unshift({
        id: 'edenor-estimated-2026-08',
        paymentDate: '2026-08-26',
        paymentDateFormatted: 'Pendiente (Vence Septiembre)',
        consumedMonthKey: '2026-08',
        consumedMonthName: 'Agosto 2026',
        concept: 'Edenor - Quilmes 4550 (Estimado Proporcional)',
        amount: estimatedAugLuz,
        tanksProducedInMonth: tanksAug,
        costPerTank: Math.round(estimatedAugLuz / tanksAug),
        isEstimated: true
      });
    }

    const regularElectricityAmount = electricityRecords
      .filter(r => r.consumedMonthKey >= '2026-02' && r.consumedMonthKey <= '2026-07')
      .reduce((acc, r) => acc + r.amount, 0);
    const regularElectricityTanks = electricityRecords
      .filter(r => r.consumedMonthKey >= '2026-02' && r.consumedMonthKey <= '2026-07')
      .reduce((acc, r) => acc + r.tanksProducedInMonth, 0);
    const baseElectricityCostPerTank = regularElectricityTanks > 0 
      ? Math.round(regularElectricityAmount / regularElectricityTanks) 
      : 815;

    // 6. Parse GASTOS_OPERATIVOS (Mantenimiento Maquinaria + Instalaciones + Insumos de Uso Diario)
    const operationalExpenses: OperationalExpenseRecord[] = [];
    const opexByMonth: Record<string, { opexTotal: number; maq: number; inst: number; insumos: number; capex: number }> = {};
    let totalOpex2026 = 0;
    let totalCapex2026 = 0;

    allSalaryMonths.forEach(ym => {
      opexByMonth[ym] = { opexTotal: 0, maq: 0, inst: 0, insumos: 0, capex: 0 };
    });

    if (gastosCsv) {
      const gastosLines = gastosCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      gastosLines.forEach((line, idx) => {
        const c = parseCsvLine(line);
        const subCategory = c[0]?.trim() || 'General';
        const rawDate = c[1]?.trim() || '';
        const parsedDate = parseDateToIso(rawDate);
        const concept = c[2]?.trim() || '';
        const category = c[3]?.trim() || 'Gastos Operativos';
        const movementType = c[4]?.trim() || 'Egreso';
        const type = c[5]?.trim() || 'Gasto';
        const amount = parseNum(c[6]);
        const account = c[7]?.trim() || 'Caja / MP';
        const mesStr = c[9]?.trim() || '';
        const description = c[10]?.trim() || '';

        if (amount > 0) {
          let ym = '2026-01';
          if (mesStr.toLowerCase().includes('enero') || rawDate.includes('/1/2026') || rawDate.includes('/01/2026')) ym = '2026-01';
          else if (mesStr.toLowerCase().includes('febrero') || rawDate.includes('/2/2026') || rawDate.includes('/02/2026')) ym = '2026-02';
          else if (mesStr.toLowerCase().includes('marzo') || rawDate.includes('/3/2026') || rawDate.includes('/03/2026')) ym = '2026-03';
          else if (mesStr.toLowerCase().includes('abril') || rawDate.includes('/4/2026') || rawDate.includes('/04/2026')) ym = '2026-04';
          else if (mesStr.toLowerCase().includes('mayo') || rawDate.includes('/5/2026') || rawDate.includes('/05/2026')) ym = '2026-05';
          else if (mesStr.toLowerCase().includes('junio') || rawDate.includes('/6/2026') || rawDate.includes('/06/2026')) ym = '2026-06';
          else if (mesStr.toLowerCase().includes('julio') || rawDate.includes('/7/2026') || rawDate.includes('/07/2026')) ym = '2026-07';
          else if (mesStr.toLowerCase().includes('agosto') || rawDate.includes('/8/2026') || rawDate.includes('/08/2026')) ym = '2026-08';
          else if (parsedDate) ym = parsedDate.iso.substring(0, 7);

          const isCapex = subCategory.toLowerCase().includes('compra de maquinaria') || category.toLowerCase().includes('compra de maquinaria') || concept.toLowerCase().includes('compra de maquinaria');
          const isInsumoDiario = subCategory.toLowerCase().includes('insumo') || category.toLowerCase().includes('insumo');
          const isInstalaciones = subCategory.toLowerCase().includes('instalaciones');
          const isMaquinaria = !isCapex && !isInsumoDiario && !isInstalaciones;

          if (!opexByMonth[ym]) opexByMonth[ym] = { opexTotal: 0, maq: 0, inst: 0, insumos: 0, capex: 0 };

          if (isCapex) {
            opexByMonth[ym].capex += amount;
            totalCapex2026 += amount;
          } else {
            opexByMonth[ym].opexTotal += amount;
            totalOpex2026 += amount;
            if (isInsumoDiario) opexByMonth[ym].insumos += amount;
            else if (isInstalaciones) opexByMonth[ym].inst += amount;
            else opexByMonth[ym].maq += amount;
          }

          operationalExpenses.push({
            id: `opex-${idx}-${ym}`,
            subCategory,
            category,
            date: parsedDate ? parsedDate.iso : rawDate,
            dateFormatted: parsedDate ? parsedDate.formatted : rawDate,
            concept,
            movementType,
            type,
            amount,
            account,
            monthKey: ym,
            monthName: formatMonthName(ym),
            description,
            isCapex,
            isInsumoDiario,
            isInstalaciones,
            isMaquinaria
          });
        }
      });
    }

    // Add Julio Verón (Mano de Obra Mantenimiento) to OPEX
    let totalVeronSalaries2026 = 0;
    allSalaryMonths.forEach(ym => {
      const veronSal = salariesByMonthAndOpKey[ym]?.['VERON_JULIO'] || 0;
      if (veronSal > 0) {
        totalVeronSalaries2026 += veronSal;
        totalOpex2026 += veronSal;
        if (!opexByMonth[ym]) opexByMonth[ym] = { opexTotal: 0, maq: 0, inst: 0, insumos: 0, capex: 0 };
        opexByMonth[ym].opexTotal += veronSal;

        operationalExpenses.unshift({
          id: `mdo-mantenimiento-veron-${ym}`,
          subCategory: "Mano de Obra Mantenimiento",
          category: "Mantenimiento",
          date: `${ym}-01`,
          dateFormatted: `01/${ym.split('-')[1]}/${ym.split('-')[0]}`,
          concept: "Julio Verón - Sueldo Mantenimiento Planta",
          movementType: "Egreso",
          type: "Transferencia",
          amount: veronSal,
          account: "Cuenta.MP1",
          monthKey: ym,
          monthName: formatMonthName(ym),
          description: "Mantenimiento preventivo, correctivo y soporte técnico electromecánico de maquinaria",
          isCapex: false,
          isInsumoDiario: false,
          isInstalaciones: false,
          isMaquinaria: false,
          isMdoMantenimiento: true
        });
      }
    });

    const baseOpexCostPerTank = totalTanks2026 > 0 
      ? Math.round(totalOpex2026 / totalTanks2026) 
      : 4811;

    // 7. Monthly Gas Consumption & Total Operating Cost Correlation
    const monthlyGasMap: Record<string, { gasLitros: number; inversion: number; tanques: number; litrosTransformados: number; }> = {};
    
    allSalaryMonths.forEach(ym => {
      monthlyGasMap[ym] = {
        gasLitros: 0,
        inversion: 0,
        tanques: tanksByMonth[ym]?.totalTanks || 0,
        litrosTransformados: tanksByMonth[ym]?.litersVolume || 0
      };
    });

    Object.entries(tanksByMonth).forEach(([ym, pData]) => {
      if (!monthlyGasMap[ym]) {
        monthlyGasMap[ym] = { gasLitros: 0, inversion: 0, tanques: pData.totalTanks, litrosTransformados: pData.litersVolume };
      }
    });

    const refills = gasEvents.filter(e => e.tipo === "Recarga" && e.cargaLitros > 0);
    refills.forEach(r => {
      const ym = r.fecha.substring(0, 7);
      if (!monthlyGasMap[ym]) monthlyGasMap[ym] = { gasLitros: 0, inversion: 0, tanques: 0, litrosTransformados: 0 };
      monthlyGasMap[ym].gasLitros += r.cargaLitros;
      monthlyGasMap[ym].inversion += r.costoTotal;
    });

    const monthlyBreakdown: MonthlyCostBreakdown[] = Object.entries(monthlyGasMap).map(([ym, data]) => {
      const isCurrentMonth = ym === '2026-08';
      
      // For August (or current unclosed month with large remaining stock in Zeppelin):
      // Calculate real gas consumption based on standard tank benchmark (7.57 L/u)
      let gasLitrosConsumidos = data.gasLitros;
      let gasInversionConsumida = data.inversion;
      let gasPerTank = data.tanques > 0 && data.gasLitros > 0 ? parseFloat((data.gasLitros / data.tanques).toFixed(2)) : 0;
      let gasCostPerTank = data.tanques > 0 && data.inversion > 0 ? data.inversion / data.tanques : 0;

      if (isCurrentMonth && data.tanques > 0) {
        gasPerTank = 7.57;
        gasLitrosConsumidos = parseFloat((data.tanques * gasPerTank).toFixed(1));
        gasInversionConsumida = Math.round(gasLitrosConsumidos * latestPrice);
        gasCostPerTank = Math.round(gasPerTank * latestPrice);
      }
      
      let directRotomoldingSalary = 0;
      let monthMdoSalary = 0;
      trackedOps.forEach(op => {
        const sal = salariesByMonthAndOpKey[ym]?.[op.key] || 0;
        monthMdoSalary += sal;
        if (!op.isMaintenance && !op.isWarehouse) {
          directRotomoldingSalary += sal;
        }
      });
      const mdoCostPerTank = data.tanques > 0 && monthMdoSalary > 0 ? Math.round(monthMdoSalary / data.tanques) : 0;
      const mdoDirectaCostPerTank = data.tanques > 0 && directRotomoldingSalary > 0 ? Math.round(directRotomoldingSalary / data.tanques) : 0;

      const luzAmount = electricityByConsumedMonth[ym] || 0;
      const luzCostPerTank = data.tanques > 0 && luzAmount > 0 ? Math.round(luzAmount / data.tanques) : 0;

      const opexData = opexByMonth[ym] || { opexTotal: 0, maq: 0, inst: 0, insumos: 0, capex: 0 };
      const opexCostPerTank = data.tanques > 0 && opexData.opexTotal > 0 ? Math.round(opexData.opexTotal / data.tanques) : 0;

      // Note: opexData.opexTotal already includes Julio Verón. To avoid double counting in total monthly operating cost,
      // we sum non-maintenance payroll + luz + opexData.opexTotal.
      const veronSal = salariesByMonthAndOpKey[ym]?.['VERON_JULIO'] || 0;
      const totalMonthlyOpCost = gasInversionConsumida + (monthMdoSalary - veronSal) + luzAmount + opexData.opexTotal;
      const unitTotalCost = data.tanques > 0 ? Math.round(totalMonthlyOpCost / data.tanques) : 0;

      return {
        monthKey: ym,
        monthName: formatMonthName(ym),
        tanquesFabricados: data.tanques,
        litrosTransformados: data.litrosTransformados,
        gasLitros: gasLitrosConsumidos,
        gasLitrosPorTanque: gasPerTank,
        gasInversion: gasInversionConsumida,
        gasCostoUnitario: parseFloat(gasCostPerTank.toFixed(0)),
        gasLitrosRecarga: data.gasLitros,
        gasInversionRecarga: data.inversion,
        stockZeppelinPct: isCurrentMonth ? 83.5 : undefined,
        mdoTotal: monthMdoSalary,
        mdoCostoUnitario: mdoCostPerTank,
        mdoDirectaTotal: directRotomoldingSalary,
        mdoDirectaCostoUnitario: mdoDirectaCostPerTank,
        isEstimatedMdo: ym === '2026-08',
        luzTotal: luzAmount,
        luzCostoUnitario: luzCostPerTank,
        isEstimatedLuz: ym === '2026-08' && isAugustEdenorEstimated,
        opexTotal: opexData.opexTotal,
        opexCostoUnitario: opexCostPerTank,
        opexMaquinaria: opexData.maq,
        opexInstalaciones: opexData.inst,
        opexInsumosDiarios: opexData.insumos,
        capexTotal: opexData.capex,
        costoTotalOperativo: totalMonthlyOpCost,
        costoUnitarioTotal: unitTotalCost
      };
    }).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    // Operational Score Matrix based on real factory cycle times:
    // 500L: 12 u/8hs (1.00) | 600L: 11 u/8hs (1.09) | 750L: 10 u/8hs (1.20) | 300L: 10 u/8hs (1.20)
    // Cono: 0.40 | Cónico 700L: 7 u/8hs (1.71) | Bicapas: -10% tiempo de cocción
    const getOperationalScore = (prodName: string, originalScore: number): number => {
      const lower = prodName.toLowerCase();
      const isBic = lower.includes('bic');
      const isCono = lower.includes('cono') && !lower.includes('conico') && !lower.includes('cónico');
      const isConico = lower.includes('conico') || lower.includes('cónico');

      if (isCono) return 0.40;
      if (isConico) return 1.71; // 7 tanques en 8hs (12 / 7 = 1.71)

      if (lower.includes('750')) {
        return isBic ? 1.08 : 1.20;
      }
      if (lower.includes('600')) {
        return isBic ? 0.98 : 1.09;
      }
      if (lower.includes('500')) {
        return isBic ? 0.90 : 1.00;
      }
      if (lower.includes('300')) {
        return isBic ? 1.08 : 1.20;
      }

      return originalScore;
    };

    // 8. Parse Sheet 'Tipo' for Official Manufactured Models and Direct Column E (Costo Insumos)
    const baseGasLiters = (tanksByMonth['2026-08']?.totalTanks || 475) > 0 ? (monthlyGasMap['2026-08']?.gasLitros || 3594) / (tanksByMonth['2026-08']?.totalTanks || 475) : 7.57;
    
    const modelScores: CombinedModelCost[] = [];
    const fabricatedProducts: FabricatedProductCost[] = [];

    if (tipoCsv) {
      const tipoLines = tipoCsv.split('\n').filter(l => l.trim().length > 0).slice(1);
      tipoLines.forEach((l, idx) => {
        const c = parseCsvLine(l);
        const prodName = c[0]?.trim();
        if (!prodName) return;

        const tipo = c[1]?.trim() || '';
        const rawScore = parseNum(c[2]) || 1.0;
        const score = getOperationalScore(prodName, rawScore);
        const litrosTanque = c[3]?.trim() || '500L';
        const costInsumosColE = parseNum(c[4]); // COLUMNA E: Costo Insumos Real de la Planilla

        const litrosGasEstimado = parseFloat((score * baseGasLiters).toFixed(2));
        const costoGasEstimado = Math.round(litrosGasEstimado * latestPrice);
        const costoManoObraEstimado = Math.round(score * baseLaborCostPerTank);
        const costoElectricidadEstimado = Math.round(score * baseElectricityCostPerTank);
        const costoOpexEstimado = Math.round(score * baseOpexCostPerTank);
        const costoPlantaTransformacion = costoGasEstimado + costoManoObraEstimado + costoElectricidadEstimado + costoOpexEstimado;
        const costoTotalIntegral = Math.round(costInsumosColE + costoPlantaTransformacion);

        const costoDirectoMarginal = Math.round(costInsumosColE + costoGasEstimado);
        const costoDirectoPlanta = Math.round(costInsumosColE + costoGasEstimado + costoManoObraEstimado);
        const costoEstructuraFija = Math.round(costoElectricidadEstimado + costoOpexEstimado);

        // Combined model definition
        modelScores.push({
          producto: prodName,
          tipo,
          puntaje: score,
          litrosTanque,
          costoInsumos: costInsumosColE,
          litrosGasEstimado,
          costoGasEstimado,
          costoManoObraEstimado,
          costoElectricidadEstimado,
          costoOpexEstimado,
          costoDirectoMarginal,
          costoDirectoPlanta,
          costoEstructuraFija,
          costoTotalFabricacion: costoPlantaTransformacion,
          porcentajeGas: costoPlantaTransformacion > 0 ? parseFloat(((costoGasEstimado / costoPlantaTransformacion) * 100).toFixed(1)) : 45,
          porcentajeManoObra: costoPlantaTransformacion > 0 ? parseFloat(((costoManoObraEstimado / costoPlantaTransformacion) * 100).toFixed(1)) : 30,
          porcentajeElectricidad: costoPlantaTransformacion > 0 ? parseFloat(((costoElectricidadEstimado / costoPlantaTransformacion) * 100).toFixed(1)) : 5,
          porcentajeOpex: costoPlantaTransformacion > 0 ? parseFloat(((costoOpexEstimado / costoPlantaTransformacion) * 100).toFixed(1)) : 20
        });

        // Family categorization
        let family = 'AquaFort Tricapa (TRIC)';
        if (prodName.includes('BIC')) family = 'AquaFort Bicapa (BIC)';
        else if (prodName.includes('CUATR')) family = 'AquaFort Cuatricapa (CUATR)';
        else if (prodName.includes('CISTERNA')) family = 'AquaFort Cisternas';
        else if (prodName.includes('Tacho') || prodName.includes('Cono') || prodName.includes('Bio')) family = 'Tachos y Conos de Horno';

        // Catalog sale price lookup
        const normName = prodName.toLowerCase();
        let priceInfo = pricesMap[normName];
        if (!priceInfo) {
          const matchKey = Object.keys(pricesMap).find(k => k.includes(normName) || normName.includes(k));
          if (matchKey) priceInfo = pricesMap[matchKey];
        }

        let price = priceInfo?.price || 0;
        if (!price) {
          if (prodName.includes("TRIC 500L")) price = 119400;
          else if (prodName.includes("TRIC 600L")) price = 133300;
          else if (prodName.includes("TRIC 750L")) price = 159900;
          else if (prodName.includes("TRIC 300L")) price = 108100;
          else if (prodName.includes("BIC 500L")) price = 110900;
          else if (prodName.includes("BIC 600L")) price = 122300;
          else if (prodName.includes("BIC 750L")) price = 135800;
          else if (prodName.includes("BIC 300L")) price = 91900;
          else if (prodName.includes("CISTERNA 500L")) price = 131400;
          else if (prodName.includes("Tacho Cámara/Bio 600L")) price = 151900;
          else if (prodName.includes("Tacho Cámara/Bio 500L")) price = 129900;
          else if (prodName.includes("Tacho Cámara/Bio 750L")) price = 166700;
          else if (prodName.includes("Tacho Cámara/Bio 300L")) price = 108400;
          else if (prodName.includes("Tacho Cónico 700L")) price = 157100;
          else if (prodName.includes("Cono Biodigestor")) price = 35000;
        }

        const marginValue = price > 0 ? price - costoTotalIntegral : 0;
        const marginPct = price > 0 ? parseFloat(((marginValue / price) * 100).toFixed(1)) : 0;

        fabricatedProducts.push({
          id: priceInfo?.id || `fab-model-${idx}`,
          sku: priceInfo?.sku || prodName,
          name: prodName,
          category: 'Tanques Fabricados',
          family,
          score,
          litrosTanque,
          costInsumos: costInsumosColE,
          gasLiters: litrosGasEstimado,
          gasCost: costoGasEstimado,
          mdoCost: costoManoObraEstimado,
          luzCost: costoElectricidadEstimado,
          opexCost: costoOpexEstimado,
          costoDirectoMarginal,
          costoDirectoPlanta,
          costoEstructuraFija,
          plantOpCost: costoPlantaTransformacion,
          totalIntegralCost: costoTotalIntegral,
          price,
          marginValue,
          marginPct
        });
      });
    }

    // 9. Tank Zeppelin Status & Intervals
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

    // 10. 14-Day Rolling Window
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

    // 11. Current Month (Agosto 2026) Forecast
    const currentYearMonth = "2026-08";
    const currentMonthName = formatMonthName(currentYearMonth);
    const tanksCurrentMonthMtd = tanksByMonth[currentYearMonth]?.totalTanks || 541;
    const gasConsumedCurrentMonthMtd = parseFloat((tanksCurrentMonthMtd * baseGasLiters).toFixed(1));
    const gasCostCurrentMonthMtd = parseFloat((gasConsumedCurrentMonthMtd * latestPrice).toFixed(0));

    const totalDaysInMonth = 31;
    const currentDayOfMonth = 26;
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
        baseOpexCostPerTank,
        baseGasCostPerTank: parseFloat((baseGasLiters * latestPrice).toFixed(0)),
        baseTotalManufacturingCost: parseFloat((baseGasLiters * latestPrice + baseLaborCostPerTank + baseElectricityCostPerTank + baseOpexCostPerTank).toFixed(0)),
        pureRotomoldingSalariesWithoutSAC: totalPureRotomoldingSalariesWithoutSAC,
        pureRotomoldingFabricatedWithoutSAC: totalPureRotomoldingFabricatedWithoutSAC,
        totalOpex2026,
        totalCapex2026
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
      operationalExpenses,
      modelScores,
      fabricatedProducts,
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
