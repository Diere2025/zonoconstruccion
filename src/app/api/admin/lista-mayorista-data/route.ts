export const runtime = 'edge';
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPREADSHEET_COSTS_ID = "1q5m7T0pqlYBj9imWyTkJf5fus2eVyPtTLc74cp0Nul0";
const GID_BD_COSTO = "39870918";

// Base benchmarks de rotomoldeo de Planta (Agosto 2026)
// Base 500L (Score 1.00): Gas = $7.957, MDO = $5.148, Luz+Opex = $3.610
const BASE_GAS = 7957;
const BASE_MDO = 5148;
const BASE_FIJO = 3610;

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

function parseSpanishNumber(val: any): number {
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
}

export async function GET() {
  try {
    // 1. Descargar BDCosto directamente desde Google Sheets
    const url = `https://docs.google.com/spreadsheets/d/1q5m7T0pqlYBj9imWyTkJf5fus2eVyPtTLc74cp0Nul0/gviz/tq?tqx=out:csv&gid=${GID_BD_COSTO}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Error al descargar BDCosto (HTTP ${res.status})`);
    }
    const csvText = await res.text();
    const lines = csvText.split('\n');

    // Mapeo de Columna E por producto
    const colEMap: Record<string, number> = {};
    lines.forEach((line) => {
      if (!line.trim()) return;
      const cols = parseCsvLine(line);
      const prodName = cols[0]?.trim();
      if (!prodName) return;
      const costColE = parseSpanishNumber(cols[4]);
      if (costColE > 0) {
        colEMap[prodName.toLowerCase()] = costColE;
      }
    });

    const getColE = (name: string, fallback: number): number => {
      const norm = name.toLowerCase();
      if (colEMap[norm]) return colEMap[norm];
      const match = Object.keys(colEMap).find(k => k.includes(norm) || norm.includes(k));
      if (match) return colEMap[match];
      return fallback;
    };

    // 2. Definición del Catálogo Completo y su regla de fabricación vs terminado
    const catalogDefinition = [
      // TRICAPA GRIS
      { id: 'tric-300-gris', name: 'AquaFort TRIC 300L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 35614.03 },
      { id: 'tric-500-gris', name: 'AquaFort TRIC 500L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 48960.58, isFeatured: true },
      { id: 'tric-600-gris', name: 'AquaFort TRIC 600L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 60858.76 },
      { id: 'tric-750-gris', name: 'AquaFort TRIC 750L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 72756.94 },
      { id: 'tric-1000-gris', name: 'AquaFort TRIC 1000L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 109544.40, isFeatured: true },
      { id: 'tric-1100-gris', name: 'AquaFort TRIC 1100L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1100L', isManufactured: false, score: 0, fallbackColE: 153500.00 },
      { id: 'tric-1200-gris', name: 'AquaFort TRIC 1200L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 153362.16 },
      { id: 'tric-3000-gris', name: 'AquaFort TRIC 3000L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 314800.00 },

      // TRICAPA BEIGE
      { id: 'tric-300-beige', name: 'AquaFort TRIC 300L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 37433.47 },
      { id: 'tric-500-beige', name: 'AquaFort TRIC 500L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 51386.50, isFeatured: true },
      { id: 'tric-600-beige', name: 'AquaFort TRIC 600L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 64194.40 },
      { id: 'tric-750-beige', name: 'AquaFort TRIC 750L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 77002.30 },
      { id: 'tric-1000-beige', name: 'AquaFort TRIC 1000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 125193.60, isFeatured: true },
      { id: 'tric-1100-beige', name: 'AquaFort TRIC 1100L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1100L', isManufactured: false, score: 0, fallbackColE: 161000.00 },
      { id: 'tric-1200-beige', name: 'AquaFort TRIC 1200L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 174227.76 },
      { id: 'tric-3000-beige', name: 'AquaFort TRIC 3000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 314800.00 },

      // BICAPA
      { id: 'bic-300', name: 'AquaFort BIC 300L', family: 'Bicapa', category: 'Bicapa', liters: '300L', isManufactured: true, score: 1.00, fallbackColE: 30932.00 },
      { id: 'bic-500', name: 'AquaFort BIC 500L', family: 'Bicapa', category: 'Bicapa', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 42176.00, isFeatured: true },
      { id: 'bic-600', name: 'AquaFort BIC 600L', family: 'Bicapa', category: 'Bicapa', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 52548.00 },
      { id: 'bic-750', name: 'AquaFort BIC 750L', family: 'Bicapa', category: 'Bicapa', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 64218.00 },
      { id: 'bic-1000', name: 'AquaFort BIC 1000L', family: 'Bicapa', category: 'Bicapa', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 88500.00 },
      { id: 'bic-1200', name: 'AquaFort BIC 1200L', family: 'Bicapa', category: 'Bicapa', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 132000.00 },

      // CISTERNAS
      { id: 'cisterna-500', name: 'AquaFort Cisterna 500L', family: 'Cisternas', category: 'Cisternas', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 44726.92 },
      { id: 'cisterna-600', name: 'AquaFort Cisterna 600L', family: 'Cisternas', category: 'Cisternas', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 56752.78 },
      { id: 'cisterna-750', name: 'AquaFort Cisterna 750L', family: 'Cisternas', category: 'Cisternas', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 74069.38 },

      // BIODIGESTORES & SANEAMIENTO
      { id: 'bio-500', name: 'BioFort 500L', family: 'Biodigestores', category: 'Biodigestores', liters: '500L', isManufactured: true, score: 1.20, fallbackColE: 77425.53 },
      { id: 'bio-600', name: 'BioFort 600L', family: 'Biodigestores', category: 'Biodigestores', liters: '600L', isManufactured: true, score: 1.30, fallbackColE: 89713.89 },
      { id: 'bio-750', name: 'BioFort 750L', family: 'Biodigestores', category: 'Biodigestores', liters: '750L', isManufactured: true, score: 1.45, fallbackColE: 107555.49 },
      { id: 'bio-1000', name: 'BioFort 1000L', family: 'Biodigestores', category: 'Biodigestores', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 160897.59 },
      { id: 'bio-700-autolimp', name: 'BioFort 700L Autolimpiable', family: 'Biodigestores', category: 'Biodigestores', liters: '700L', isManufactured: true, score: 1.45, fallbackColE: 124543.54, isFeatured: true },

      // ACCESORIOS Y REVENTA
      { id: 'tapa-096', name: 'Tapa Fibrocemento 0,96m', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Tapa', isManufactured: false, score: 0, fallbackColE: 22640 },
      { id: 'tapa-107', name: 'Tapa Fibrocemento 1,07m', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Tapa', isManufactured: false, score: 0, fallbackColE: 26160 },
      { id: 'tapa-117', name: 'Tapa Fibrocemento 1,17m', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Tapa', isManufactured: false, score: 0, fallbackColE: 28320 },
      { id: 'base-500-600', name: 'Base Tanque Reforzada 500/600L', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Base', isManufactured: false, score: 0, fallbackColE: 21500 },
      { id: 'base-1000', name: 'Base Tanque Reforzada 1000L', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Base', isManufactured: false, score: 0, fallbackColE: 32000 },
      { id: 'filtro-univ', name: 'Filtro Tanque Completo Universal', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Filtro', isManufactured: false, score: 0, fallbackColE: 25000 },
      { id: 'auto-mp', name: 'Automático Tanque MP (1,5m)', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Acc.', isManufactured: false, score: 0, fallbackColE: 7850 },
      { id: 'cam-insp', name: 'Cámara Inspección BioFort', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Cámara', isManufactured: false, score: 0, fallbackColE: 34080 },
      { id: 'cam-lodos', name: 'Cámara Registro Lodos', family: 'Accesorios y Reventa', category: 'Accesorios y Reventa', liters: 'Cámara', isManufactured: false, score: 0, fallbackColE: 15340 }
    ];

    const products = catalogDefinition.map(item => {
      const rawInsumos = getColE(item.name, item.fallbackColE);
      
      let costBaseReal = rawInsumos;
      let costGas = 0;
      let costMdo = 0;
      let costFijo = 0;
      let plantCost = 0;

      if (item.isManufactured) {
        costGas = Math.round(BASE_GAS * item.score);
        costMdo = Math.round(BASE_MDO * item.score);
        costFijo = Math.round(BASE_FIJO * item.score);
        plantCost = costGas + costMdo + costFijo;
        costBaseReal = Math.round(rawInsumos + plantCost);
      }

      return {
        id: item.id,
        name: item.name,
        family: item.family,
        category: item.category,
        liters: item.liters,
        isManufactured: item.isManufactured,
        originType: item.isManufactured ? 'Planta Zono (300-750L)' : 'Terminado / Reventa (Col E)',
        rawInsumosColE: rawInsumos,
        plantCost,
        costGas,
        costMdo,
        costFijo,
        costBaseReal,
        isFeatured: !!item.isFeatured
      };
    });

    const categories = [
      'Tricapa Gris',
      'Tricapa Beige',
      'Bicapa',
      'Cisternas',
      'Biodigestores',
      'Accesorios y Reventa'
    ];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      baseBenchmarks: {
        baseGas: BASE_GAS,
        baseMdo: BASE_MDO,
        baseFijo: BASE_FIJO
      },
      categories,
      products
    });

  } catch (error: any) {
    console.error('[API Lista Mayorista Data] Error:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Error al procesar datos para la lista mayorista'
    }, { status: 500 });
  }
}
