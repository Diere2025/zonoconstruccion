import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPREADSHEET_FACTORY_STOCK_ID = "1cjOzl_E8ZIhdt0jDg8aAnSc4IbRDwAeQxWZwxQMxwiI";
const SPREADSHEET_PRODUCTION_ID = "1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0";

export interface FactoryStockItem {
  id: string;
  producto: string;
  proveedor: string;
  inicial: number;
  compra: number;
  venta: number;
  fabricacion: number;
  ajusteEntrada: number;
  ajusteSalida: number;
  ensamblaje: number;
  actual: number;
  corte: number;
  piezaEnsamblaje: number;
  combo: number;
  parteCombo: number;
  sobrantesZono: number;
  categoriaTipo: "fabricacion_propia_real" | "ensamblado" | "fabricacion_propia_otro" | "terceros";
  esFabricacionPropiaReal: boolean;
  esEnsamblado: boolean;
  litraje: { label: string; litros: number };
}

// Helper to extract litraje
const extractLitraje = (productName: string): { label: string; litros: number } => {
  if (!productName) return { label: 'Otros', litros: 0 };
  const lower = productName.toLowerCase();
  const match = productName.match(/(\d+)\s*(L|litros|lts|l)\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return { label: `${num}L`, litros: num };
  }
  if (lower.includes('cono') || lower.includes('tapa') || lower.includes('accesorio') || lower.includes('brida')) {
    return { label: 'Accesorios', litros: 0 };
  }
  if (lower.includes('camara') || lower.includes('cámara') || lower.includes('desengrasadora')) {
    return { label: 'Cámaras', litros: 0 };
  }
  return { label: 'Otros', litros: 0 };
};

// Robust CSV parser supporting quotes and commas
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
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

export async function GET() {
  try {
    const stockUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_FACTORY_STOCK_ID}/gviz/tq?tqx=out:csv&sheet=Stock`;
    const fabUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_PRODUCTION_ID}/gviz/tq?tqx=out:csv&sheet=Fabricaci%C3%B3n`;

    const [stockRes, fabRes] = await Promise.all([
      fetch(stockUrl, { cache: "no-store" }),
      fetch(fabUrl, { cache: "no-store" })
    ]);

    if (!stockRes.ok) {
      throw new Error(`Error al leer la hoja Stock de Fábrica (${stockRes.status})`);
    }

    const [stockCsv, fabCsv] = await Promise.all([
      stockRes.text(),
      fabRes.ok ? fabRes.text() : Promise.resolve("")
    ]);

    // 1. Build set of products really manufactured in plant (from 2025/2026 production sheet)
    const fabProductsSet = new Set<string>();
    if (fabCsv) {
      const fabLines = fabCsv.split('\n').slice(1);
      fabLines.forEach(line => {
        const parts = parseCsvLine(line);
        const prod = parts[1]?.trim();
        if (prod) fabProductsSet.add(prod);
      });
    }

    // 2. Parse Stock Sheet
    const stockLines = stockCsv.split('\n').filter(l => l.trim().length > 0);
    if (stockLines.length < 2) {
      return NextResponse.json({
        success: true,
        items: [],
        stats: {
          totalItems: 0,
          totalStockActual: 0,
          totalFabricado: 0,
          totalVentas: 0,
          totalCompras: 0,
          sinStockCount: 0,
          totalLitrosStock: 0
        },
        timestamp: new Date().toISOString()
      });
    }

    const items: FactoryStockItem[] = [];

    stockLines.slice(1).forEach((line, idx) => {
      const cols = parseCsvLine(line);
      const prod = cols[0];
      if (!prod) return;

      const prov = cols[1] || "Sin Proveedor";
      const isFabPropiaProv = prov.trim().toLowerCase() === "fabricación propia" || prov.trim().toLowerCase() === "fabricacion propia";
      const isRealFab = fabProductsSet.has(prod);
      const isEnsamblado = prod.toLowerCase().startsWith("biofort") || prod.toLowerCase().includes("biodigestor") || prod.toLowerCase().includes("séptica") || prod.toLowerCase().includes("desengrasadora");

      let categoriaTipo: FactoryStockItem["categoriaTipo"] = "terceros";
      if (isRealFab) {
        categoriaTipo = "fabricacion_propia_real";
      } else if (isEnsamblado) {
        categoriaTipo = "ensamblado";
      } else if (isFabPropiaProv) {
        categoriaTipo = "fabricacion_propia_otro";
      }

      const lit = extractLitraje(prod);
      const actualVal = parseNum(cols[9]);

      const item: FactoryStockItem = {
        id: `stock-fab-${idx}-${prod}`,
        producto: prod,
        proveedor: prov,
        inicial: parseNum(cols[2]),
        compra: parseNum(cols[3]),
        venta: parseNum(cols[4]),
        fabricacion: parseNum(cols[5]),
        ajusteEntrada: parseNum(cols[6]),
        ajusteSalida: parseNum(cols[7]),
        ensamblaje: parseNum(cols[8]),
        actual: actualVal,
        corte: parseNum(cols[10]),
        piezaEnsamblaje: parseNum(cols[11]),
        combo: parseNum(cols[12]),
        parteCombo: parseNum(cols[13]),
        sobrantesZono: parseNum(cols[14]),
        categoriaTipo,
        esFabricacionPropiaReal: isRealFab,
        esEnsamblado: isEnsamblado,
        litraje: lit
      };

      items.push(item);
    });

    // 3. Compute Summary Statistics for Real Manufactured Products
    const realFabItems = items.filter(i => i.esFabricacionPropiaReal);
    const totalStockActualReal = realFabItems.reduce((acc, i) => acc + i.actual, 0);
    const totalFabricadoReal = realFabItems.reduce((acc, i) => acc + i.fabricacion, 0);
    const totalVentasReal = realFabItems.reduce((acc, i) => acc + i.venta, 0);
    const totalComprasReal = realFabItems.reduce((acc, i) => acc + i.compra, 0);
    const sinStockRealCount = realFabItems.filter(i => i.actual <= 0).length;
    const totalLitrosStockReal = realFabItems.reduce((acc, i) => acc + (i.actual > 0 ? i.actual * i.litraje.litros : 0), 0);

    return NextResponse.json({
      success: true,
      items,
      stats: {
        totalItems: items.length,
        totalRealFabItems: realFabItems.length,
        totalStockActual: totalStockActualReal,
        totalFabricado: totalFabricadoReal,
        totalVentas: totalVentasReal,
        totalCompras: totalComprasReal,
        sinStockCount: sinStockRealCount,
        totalLitrosStock: totalLitrosStockReal
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Error en API /api/admin/stock-fabrica-data:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al consultar los datos de stock de fábrica" },
      { status: 500 }
    );
  }
}
