export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const SPREADSHEET_COSTS_ID = "1q5m7T0pqlYBj9imWyTkJf5fus2eVyPtTLc74cp0Nul0";
const GID_BD_COSTO = "39870918";

// Base benchmarks de rotomoldeo de Planta (Agosto 2026)
// Base 500L (Score 1.00): Gas = $7.957, MDO = $5.148, Luz+Opex = $3.610
const BASE_GAS = 7957;
const BASE_MDO = 5148;
const BASE_FIJO = 3610;

type SavedWholesaleListConfig = {
  listNumber?: string | number;
  listDate?: string;
  globalDiscountCorralonPct?: number;
  globalDiscountDistributorPct?: number;
  items?: unknown[];
};

type WholesaleListRecord = {
  id: string;
  list_number: string;
  valid_text: string | null;
  is_active: boolean;
  global_discount_corralon_pct: number | null;
  global_discount_dist_pct: number | null;
};

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

function parseSpanishNumber(val: unknown): number {
  if (!val) return 0;
  let clean = String(val).trim().replace(/[^0-9.,-]/g, '');
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

export async function GET(request: Request) {
  try {
    const requestedListNumber = new URL(request.url).searchParams.get('listNumber')?.trim();
    // 1. Descargar BDCosto directamente desde Google Sheets
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_COSTS_ID}/gviz/tq?tqx=out:csv&gid=${GID_BD_COSTO}`;
    const csvText = await fetchSpreadsheetCsv(url);
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

    // 2. Definición del Catálogo Completo
    const catalogDefinition = [
      // TRICAPA GRIS
      { id: 'tric-300-gris', name: 'AquaFort - TRIC 300L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 35907.98 },
      { id: 'tric-500-gris', name: 'AquaFort - TRIC 500L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 49386.24, isFeatured: true },
      { id: 'tric-600-gris', name: 'AquaFort - TRIC 600L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 61401.83 },
      { id: 'tric-750-gris', name: 'AquaFort - TRIC 750L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 73417.43 },
      { id: 'tric-1000-gris', name: 'AquaFort - TRIC 1000L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 109544.40, isFeatured: true },
      { id: 'tric-1100-gris', name: 'AquaFort - TRIC 1100L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1100L', isManufactured: false, score: 0, fallbackColE: 153500.00, defaultCommercialized: false },
      { id: 'tric-1200-gris', name: 'AquaFort - TRIC 1200L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 153362.16 },
      { id: 'tric-3000-gris', name: 'AquaFort - TRIC 3000L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 314800.00 },
      { id: 'tric-slim-500-gris', name: 'AquaFort - TRIC (Slim) 500L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '500L Slim', isManufactured: false, score: 0, fallbackColE: 92851.92 },
      { id: 'tric-chato-1000-gris', name: 'AquaFort - Chato TRIC 1000L Gris', family: 'Tricapa Gris', category: 'Tricapa Gris', liters: '1000L Chato', isManufactured: false, score: 0, fallbackColE: 163794.96 },

      // TRICAPA BEIGE
      { id: 'tric-300-beige', name: 'AquaFort - TRIC 300L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 37745.37 },
      { id: 'tric-500-beige', name: 'AquaFort - TRIC 500L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 51836.10, isFeatured: true },
      { id: 'tric-600-beige', name: 'AquaFort - TRIC 600L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 64770.39 },
      { id: 'tric-750-beige', name: 'AquaFort - TRIC 750L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 77704.68 },
      { id: 'tric-1000-beige', name: 'AquaFort - TRIC 1000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 125193.60, isFeatured: true },
      { id: 'tric-1100-beige', name: 'AquaFort - TRIC 1100L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1100L', isManufactured: false, score: 0, fallbackColE: 161000.00, defaultCommercialized: false },
      { id: 'tric-1200-beige', name: 'AquaFort - TRIC 1200L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 174227.76 },
      { id: 'tric-2000-beige', name: 'AquaFort - TRIC 2000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '2000L', isManufactured: false, score: 0, fallbackColE: 297500.00 },
      { id: 'tric-3000-beige', name: 'AquaFort - TRIC 3000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 314800.00 },
      { id: 'tric-slim-500-beige', name: 'AquaFort - TRIC (Slim) 500L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '500L Slim', isManufactured: false, score: 0, fallbackColE: 98068.32 },
      { id: 'tric-chato-1000-beige', name: 'AquaFort - Chato TRIC 1000L Beige', family: 'Tricapa Beige', category: 'Tricapa Beige', liters: '1000L Chato', isManufactured: false, score: 0, fallbackColE: 185703.84 },

      // CUATRICAPA
      { id: 'cuatr-500', name: 'AquaFort - CUATR 500L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 66818.23, isFeatured: true },
      { id: 'cuatr-600', name: 'AquaFort - CUATR 600L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 79607.47 },
      { id: 'cuatr-750', name: 'AquaFort - CUATR 750L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 91768.12 },
      { id: 'cuatr-1000', name: 'AquaFort - CUATR 1000L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 147102.48, isFeatured: true },
      { id: 'cuatr-1200', name: 'AquaFort - CUATR 1200L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 185703.84 },
      { id: 'cuatr-3000', name: 'AquaFort - CUATR 3000L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 434000.00 },
      { id: 'cuatr-slim-500', name: 'AquaFort - CUATR (Slim) 500L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '500L Slim', isManufactured: false, score: 0, fallbackColE: 125193.60 },
      { id: 'cuatr-chato-1000', name: 'AquaFort - Chato CUATR 1000L', family: 'Cuatricapa', category: 'Cuatricapa', liters: '1000L Chato', isManufactured: false, score: 0, fallbackColE: 196136.64 },

      // BICAPA
      { id: 'bic-300', name: 'AquaFort - BIC 300L', family: 'Bicapa', category: 'Bicapa', liters: '300L', isManufactured: true, score: 1.00, fallbackColE: 30932.00 },
      { id: 'bic-500', name: 'AquaFort - BIC 500L', family: 'Bicapa', category: 'Bicapa', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 42176.00, isFeatured: true },
      { id: 'bic-600', name: 'AquaFort - BIC 600L', family: 'Bicapa', category: 'Bicapa', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 52548.00 },
      { id: 'bic-750', name: 'AquaFort - BIC 750L', family: 'Bicapa', category: 'Bicapa', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 64218.00 },
      { id: 'bic-1000', name: 'AquaFort - BIC 1000L', family: 'Bicapa', category: 'Bicapa', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 88500.00 },
      { id: 'bic-1200', name: 'AquaFort - BIC 1200L', family: 'Bicapa', category: 'Bicapa', liters: '1200L', isManufactured: false, score: 0, fallbackColE: 132000.00 },
      { id: 'bic-slim-500', name: 'AquaFort - BIC (Slim) 500L', family: 'Bicapa', category: 'Bicapa', liters: '500L Slim', isManufactured: false, score: 0, fallbackColE: 77202.72 },
      { id: 'bic-chato-1000', name: 'AquaFort - Chato BIC 1000L', family: 'Bicapa', category: 'Bicapa', liters: '1000L Chato', isManufactured: false, score: 0, fallbackColE: 141886.08 },

      // CISTERNAS
      { id: 'cisterna-300', name: 'AquaFort - CISTERNA 300L', family: 'Cisternas', category: 'Cisternas', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 31160.76 },
      { id: 'cisterna-500', name: 'AquaFort - CISTERNA 500L', family: 'Cisternas', category: 'Cisternas', liters: '500L', isManufactured: true, score: 1.00, fallbackColE: 45158.80, isFeatured: true },
      { id: 'cisterna-600', name: 'AquaFort - CISTERNA 600L', family: 'Cisternas', category: 'Cisternas', liters: '600L', isManufactured: true, score: 1.09, fallbackColE: 57303.34 },
      { id: 'cisterna-750', name: 'AquaFort - CISTERNA 750L', family: 'Cisternas', category: 'Cisternas', liters: '750L', isManufactured: true, score: 1.20, fallbackColE: 74790.83 },
      { id: 'cisterna-1000', name: 'AquaFort - CISTERNA 1000L', family: 'Cisternas', category: 'Cisternas', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 119977.20, isFeatured: true },
      { id: 'cisterna-3000', name: 'AquaFort - CISTERNA 3000L', family: 'Cisternas', category: 'Cisternas', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 314800.00 },
      { id: 'cisterna-slim-500', name: 'AquaFort - CISTERNA (Slim) 500L', family: 'Cisternas', category: 'Cisternas', liters: '500L Slim', isManufactured: false, score: 0, fallbackColE: 80240.00 },

      // BIODIGESTORES
      { id: 'bio-500', name: 'BioFort - Biodigestor 500L', family: 'Biodigestores', category: 'Biodigestores', liters: '500L', isManufactured: true, score: 1.20, fallbackColE: 77952.45 },
      { id: 'bio-600', name: 'BioFort - Biodigestor 600L', family: 'Biodigestores', category: 'Biodigestores', liters: '600L', isManufactured: true, score: 1.30, fallbackColE: 90359.48 },
      { id: 'bio-750', name: 'BioFort - Biodigestor 750L', family: 'Biodigestores', category: 'Biodigestores', liters: '750L', isManufactured: true, score: 1.45, fallbackColE: 108371.97 },
      { id: 'bio-1000', name: 'BioFort - Biodigestor 1000L', family: 'Biodigestores', category: 'Biodigestores', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 160997.29 },
      { id: 'bio-3000', name: 'BioFort - Biodigestor 3000L', family: 'Biodigestores', category: 'Biodigestores', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 365823.73, isFeatured: true },
      { id: 'bio-700-autolimp', name: 'BioFort - Autolimpiable 700L', family: 'Biodigestores', category: 'Biodigestores', liters: '700L', isManufactured: true, score: 1.45, fallbackColE: 125341.05, isFeatured: true },

      // CÁMARAS SÉPTICAS
      { id: 'sept-300', name: 'BioFort - Séptica 300L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 46158.94 },
      { id: 'sept-500', name: 'BioFort - Séptica 500L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '500L', isManufactured: true, score: 1.20, fallbackColE: 60550.74 },
      { id: 'sept-600', name: 'BioFort - Séptica 600L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '600L', isManufactured: true, score: 1.30, fallbackColE: 72564.02 },
      { id: 'sept-750', name: 'BioFort - Séptica 750L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '750L', isManufactured: true, score: 1.45, fallbackColE: 90707.76 },
      { id: 'sept-1000', name: 'BioFort - Séptica 1000L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 143333.08 },
      { id: 'sept-3000', name: 'BioFort - Séptica 3000L', family: 'Cámaras Sépticas', category: 'Cámaras Sépticas', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 349472.02 },

      // CÁMARAS DESENGRASADORAS
      { id: 'deseng-70-c50', name: 'BioFort - Desengrasadora 70L (C50)', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '70L', isManufactured: false, score: 0, fallbackColE: 20356.09 },
      { id: 'deseng-70-c110', name: 'BioFort - Desengrasadora 70L (C110)', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '70L', isManufactured: false, score: 0, fallbackColE: 25476.88 },
      { id: 'deseng-300', name: 'BioFort - Desengrasadora 300L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '300L', isManufactured: true, score: 1.20, fallbackColE: 47340.19 },
      { id: 'deseng-500', name: 'BioFort - Desengrasadora 500L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '500L', isManufactured: true, score: 1.20, fallbackColE: 62125.74 },
      { id: 'deseng-600', name: 'BioFort - Desengrasadora 600L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '600L', isManufactured: true, score: 1.30, fallbackColE: 74664.02 },
      { id: 'deseng-750', name: 'BioFort - Desengrasadora 750L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '750L', isManufactured: true, score: 1.45, fallbackColE: 92151.51 },
      { id: 'deseng-1000', name: 'BioFort - Desengrasadora 1000L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '1000L', isManufactured: false, score: 0, fallbackColE: 145826.83 },
      { id: 'deseng-3000', name: 'BioFort - Desengrasadora 3000L', family: 'Cámaras Desengrasadoras', category: 'Cámaras Desengrasadoras', liters: '3000L', isManufactured: false, score: 0, fallbackColE: 351965.77 },

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
        isFeatured: !!item.isFeatured,
        defaultCommercialized: item.defaultCommercialized !== false
      };
    });

    const categories = [
      'Tricapa Gris',
      'Tricapa Beige',
      'Cuatricapa',
      'Bicapa',
      'Cisternas',
      'Biodigestores',
      'Cámaras Sépticas',
      'Cámaras Desengrasadoras'
    ];

    // Archivo histórico: "Lista Mayorista N12", vigencia 1/6/2026.
    // Se ofrece como respaldo hasta que se publique una versión de Lista 12 en la base.
    const list12Prices: Record<string, number> = {
      'bic-300': 85300, 'bic-500': 101000, 'bic-600': 108900, 'bic-750': 142400, 'bic-1000': 150800, 'bic-1200': 214400,
      'tric-300-gris': 95900, 'tric-500-gris': 104700, 'tric-600-gris': 117300, 'tric-750-gris': 159200, 'tric-1000-gris': 167500, 'tric-1200-gris': 250100, 'tric-3000-gris': 563700, 'tric-slim-500-gris': 121500, 'tric-chato-1000-gris': 243400,
      'tric-300-beige': 95900, 'tric-500-beige': 112900, 'tric-600-beige': 134000, 'tric-750-beige': 175900, 'tric-1000-beige': 192600, 'tric-1200-beige': 286000, 'tric-3000-beige': 563700, 'tric-slim-500-beige': 129500, 'tric-chato-1000-beige': 243400,
      'cuatr-500': 175000, 'cuatr-600': 175900, 'cuatr-750': 192600, 'cuatr-1000': 226200, 'cuatr-1200': 314300, 'cuatr-3000': 777200,
      'cisterna-300': 95600, 'cisterna-500': 112900, 'cisterna-600': 134000, 'cisterna-750': 175900, 'cisterna-1000': 185400, 'cisterna-3000': 593500, 'cisterna-slim-500': 158100,
      'bio-500': 222700, 'bio-600': 236600, 'bio-750': 261800, 'bio-1000': 286400, 'bio-3000': 832400, 'bio-700-autolimp': 419500,
      'sept-300': 95900, 'sept-500': 112900, 'sept-600': 134000, 'sept-750': 175900, 'sept-1000': 243400,
      'deseng-70-c50': 59200, 'deseng-70-c110': 59200, 'deseng-300': 95900, 'deseng-500': 112900, 'deseng-600': 134000, 'deseng-750': 175900, 'deseng-1000': 243400
    };
    const list12Fallback: SavedWholesaleListConfig = {
      listNumber: '12',
      listDate: 'Junio 2026',
      globalDiscountCorralonPct: 5,
      globalDiscountDistributorPct: 10,
      items: products
        .filter((product) => list12Prices[product.id] !== undefined)
        .map((product) => {
          const priceList = list12Prices[product.id];
          return {
            ...product,
            priceList,
            priceCorralon: Math.round(priceList * 0.95),
            priceDistributor: Math.round(priceList * 0.90),
            isCommercialized: true
          };
        })
    };

    // Las listas publicadas se guardan completas en site_settings. Leerlas por
    // número permite cotizar con una versión anterior sin recalcular sus precios.
    const savedConfigs = new Map<string, SavedWholesaleListConfig>();
    const relationalLists = new Map<string, WholesaleListRecord>();
    let activeDbConfig: SavedWholesaleListConfig | null = null;
    try {
      const { data: listSettings } = await supabaseAdmin
        .from('site_settings')
        .select('id, value')
        .like('id', 'wholesale_price_list_%');

      listSettings?.forEach((setting: { id: string; value: string }) => {
        try {
          const config = JSON.parse(setting.value) as SavedWholesaleListConfig;
          const number = String(config.listNumber || setting.id.replace('wholesale_price_list_', ''));
          savedConfigs.set(number, config);
        } catch {
          console.warn('[API Lista Mayorista Data] Invalid saved list:', setting.id);
        }
      });

      const { data: activeDbData } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('id', 'active_wholesale_price_list')
        .maybeSingle();
      if (activeDbData?.value) {
        activeDbConfig = JSON.parse(activeDbData.value) as SavedWholesaleListConfig;
        if (activeDbConfig?.listNumber) {
          savedConfigs.set(String(activeDbConfig.listNumber), activeDbConfig);
        }
      }
    } catch (e) {
      console.warn('[API Lista Mayorista Data] Warning fetching saved config from DB:', e);
    }

    if (!savedConfigs.has('12')) {
      savedConfigs.set('12', list12Fallback);
    }

    // Las instalaciones más antiguas pueden tener listas sólo en las tablas
    // relacionales; incluirlas también mantiene disponible, por ejemplo, Lista 12.
    try {
      const { data: relationalRows, error: relationalError } = await supabaseAdmin
        .from('wholesale_price_lists')
        .select('id, list_number, valid_text, is_active, global_discount_corralon_pct, global_discount_dist_pct');
      if (!relationalError) {
        (relationalRows as WholesaleListRecord[] | null)?.forEach((list) => {
          relationalLists.set(String(list.list_number), list);
        });
      }
    } catch (e) {
      console.warn('[API Lista Mayorista Data] Warning fetching relational lists:', e);
    }

    const activeListNumber = String(activeDbConfig?.listNumber || '');
    const listNumbers = new Set([...savedConfigs.keys(), ...relationalLists.keys()]);
    const availableLists = Array.from(listNumbers)
      .map((number) => {
        const config = savedConfigs.get(number);
        const relationalList = relationalLists.get(number);
        return {
        listNumber: number,
        listDate: config?.listDate || relationalList?.valid_text || 'Sin vigencia informada',
        isActive: activeListNumber === number || (!activeListNumber && relationalList?.is_active === true),
        hasSavedPrices: (Array.isArray(config?.items) && config.items.length > 0) || Boolean(relationalList)
      };
      })
      .sort((a, b) => Number(b.listNumber) - Number(a.listNumber));

    const requestedRelationalList = requestedListNumber ? relationalLists.get(requestedListNumber) : undefined;
    const fallbackRelationalList = Array.from(relationalLists.values()).find((list) => list.is_active) || relationalLists.values().next().value;
    const selectedRelationalList = requestedRelationalList || fallbackRelationalList;
    const relationalConfig: SavedWholesaleListConfig | null = selectedRelationalList ? {
      listNumber: selectedRelationalList.list_number,
      listDate: selectedRelationalList.valid_text || undefined,
      globalDiscountCorralonPct: selectedRelationalList.global_discount_corralon_pct || undefined,
      globalDiscountDistributorPct: selectedRelationalList.global_discount_dist_pct || undefined
    } : null;
    const fallbackConfig = activeDbConfig || savedConfigs.values().next().value || relationalConfig;
    const savedDbConfig = (requestedListNumber && savedConfigs.get(requestedListNumber)) || (requestedListNumber && relationalConfig) || fallbackConfig;
    let savedItems = Array.isArray(savedDbConfig?.items) ? savedDbConfig.items : [];

    if (savedItems.length === 0 && selectedRelationalList && String(savedDbConfig?.listNumber || '') === selectedRelationalList.list_number) {
      try {
        const { data: itemRows, error: itemsError } = await supabaseAdmin
          .from('wholesale_price_list_items')
          .select('product_id, product_name, category, family, liters, is_manufactured, price_list, price_corralon, price_distributor, is_commercialized')
          .eq('price_list_id', selectedRelationalList.id);
        if (!itemsError && itemRows) {
          savedItems = itemRows.map((item: Record<string, unknown>) => ({
            ...item,
            id: item.product_id,
            name: item.product_name,
            isManufactured: item.is_manufactured,
            isCommercialized: item.is_commercialized
          }));
        }
      } catch (e) {
        console.warn('[API Lista Mayorista Data] Warning fetching relational list items:', e);
      }
    }
    const productsForSelectedList = savedItems.length > 0 ? savedItems : products;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      baseBenchmarks: {
        baseGas: BASE_GAS,
        baseMdo: BASE_MDO,
        baseFijo: BASE_FIJO
      },
      categories,
      products: productsForSelectedList,
      savedDbConfig,
      resolvedListNumber: savedDbConfig?.listNumber ? String(savedDbConfig.listNumber) : null,
      availableLists,
      isPersistedList: savedItems.length > 0
    });

  } catch (error: unknown) {
    console.error('[API Lista Mayorista Data] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error al procesar datos para la lista mayorista'
    }, { status: 500 });
  }
}
