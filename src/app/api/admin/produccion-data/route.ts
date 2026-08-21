import { NextResponse } from 'next/server';

const SPREADSHEET_ID = "1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0";

function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;
  const text = csvText.replace(/\r\n/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function parseDateToISO(str: string): { iso: string; formatted: string; timestamp: number } {
  if (!str) return { iso: "", formatted: "", timestamp: 0 };
  const clean = str.trim();
  const parts = clean.split(/[/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const formatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        const ts = new Date(y, m - 1, d).getTime();
        return { iso, formatted, timestamp: ts };
      }
    } else {
      // DD/MM/YYYY
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const formatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        const ts = new Date(y, m - 1, d).getTime();
        return { iso, formatted, timestamp: ts };
      }
    }
  }
  return { iso: clean, formatted: clean, timestamp: 0 };
}

function normalizeOperatorName(rawName: string): string {
  if (!rawName) return "Sin Asignar";
  const lower = rawName.toLowerCase().trim();

  if (lower.includes("rodrigo") || lower === "rr") return "Rodrigo Ramirez";
  if (lower.includes("leonardo") || lower.includes("leo")) return "Leonardo Sandoval";
  if (lower.includes("julio")) return "Julio Verón";
  if (lower.includes("samuel")) return "Samuel Contreras";
  if (lower.includes("gabriel")) return "Gabriel Mansilla";
  if (lower.includes("matias") || lower.includes("matías") || lower.includes("mati")) return "Matías Olivera";
  if (lower.includes("antonio")) return "Antonio Cardozo";
  if (lower.includes("pablo")) return "Pablo Jara";
  if (lower.includes("leandro")) return "Leandro Zeballos";

  return rawName.trim();
}

export interface ProductionItem {
  id: string;
  fecha: string;
  fechaFormatted: string;
  timestamp: number;
  producto: string;
  cantidad: number;
  turno: string;
  tipoMaquina: string;
  operario: string;
  operarioRaw: string;
  operarioSecundario?: string;
  calidad: 'De primera' | 'De segunda' | 'Roto o Inutilizable' | string;
  estado: 'Fabricado' | 'Planificado' | 'Cancelado' | string;
  prioridad: string;
  aStock: string;
  color: string;
  observaciones: string;
}

export interface AssemblyItem {
  id: string;
  fecha: string;
  fechaFormatted: string;
  timestamp: number;
  producto: string;
  cantidad: number;
  operario: string;
  operarioRaw: string;
  estado: 'Ensamblado' | 'Planificado' | 'Cancelado' | string;
  prioridad: string;
  aStock: string;
  turno: string;
}

export async function GET() {
  try {
    const fabUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Fabricaci%C3%B3n`;
    const ensUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Ensamblaje`;

    const [fabRes, ensRes] = await Promise.all([
      fetch(fabUrl, { cache: 'no-store' }),
      fetch(ensUrl, { cache: 'no-store' })
    ]);

    if (!fabRes.ok || !ensRes.ok) {
      throw new Error("No se pudo conectar con la planilla de Google Sheets de Producción.");
    }

    const [fabCsv, ensCsv] = await Promise.all([
      fabRes.text(),
      ensRes.text()
    ]);

    const fabRows = parseCSV(fabCsv);
    const ensRows = parseCSV(ensCsv);

    const fabricacion: ProductionItem[] = [];
    const ensamblaje: AssemblyItem[] = [];

    // Parse Fabricación
    for (let i = 1; i < fabRows.length; i++) {
      const row = fabRows[i];
      const dateStr = row[0]?.trim();
      const producto = row[1]?.trim();
      if (!dateStr || !producto) continue;

      const { iso, formatted, timestamp } = parseDateToISO(dateStr);
      const cantidad = parseInt(row[2]?.replace(/\D/g, '') || '0', 10) || 1;
      const turno = row[3]?.trim() || '1. Mañana';
      const tipoMaquina = row[4]?.trim() || 'DOBLE';
      const operarioRaw = row[5]?.trim() || 'Sin Asignar';
      const operario = normalizeOperatorName(operarioRaw);
      const operarioSecundario = row[6]?.trim() || '';
      const calidad = row[7]?.trim() || 'De primera';
      const estado = row[8]?.trim() || 'Fabricado';
      const prioridad = row[9]?.trim() || 'Alta';
      const aStock = row[10]?.trim() || 'SI';
      const color = row[11]?.trim() || '';
      const observaciones = row[12]?.trim() || '';

      fabricacion.push({
        id: `fab-${i}-${timestamp}`,
        fecha: iso,
        fechaFormatted: formatted,
        timestamp,
        producto,
        cantidad,
        turno,
        tipoMaquina,
        operario,
        operarioRaw,
        operarioSecundario,
        calidad,
        estado,
        prioridad,
        aStock,
        color,
        observaciones
      });
    }

    // Parse Ensamblaje
    for (let i = 1; i < ensRows.length; i++) {
      const row = ensRows[i];
      const dateStr = row[0]?.trim();
      const producto = row[1]?.trim();
      if (!dateStr || !producto) continue;

      const { iso, formatted, timestamp } = parseDateToISO(dateStr);
      const cantidad = parseInt(row[2]?.replace(/\D/g, '') || '0', 10) || 1;
      const operarioRaw = row[3]?.trim() || 'Sin Asignar';
      const operario = normalizeOperatorName(operarioRaw);
      const estado = row[5]?.trim() || 'Ensamblado';
      const prioridad = row[6]?.trim() || '';
      const aStock = row[7]?.trim() || 'SI';
      const turno = row[8]?.trim() || '1. Mañana';

      ensamblaje.push({
        id: `ens-${i}-${timestamp}`,
        fecha: iso,
        fechaFormatted: formatted,
        timestamp,
        producto,
        cantidad,
        operario,
        operarioRaw,
        estado,
        prioridad,
        aStock,
        turno
      });
    }

    // Sort descending by timestamp / date
    fabricacion.sort((a, b) => b.timestamp - a.timestamp);
    ensamblaje.sort((a, b) => b.timestamp - a.timestamp);

    // List of distinct operators across both processes
    const operatorsSet = new Set<string>();
    fabricacion.forEach(item => { if (item.operario && item.operario !== "Sin Asignar") operatorsSet.add(item.operario); });
    ensamblaje.forEach(item => { if (item.operario && item.operario !== "Sin Asignar") operatorsSet.add(item.operario); });
    const operators = Array.from(operatorsSet).sort();

    return NextResponse.json({
      success: true,
      data: {
        fabricacion,
        ensamblaje,
        operators,
        lastSync: new Date().toISOString(),
        totalFabRows: fabricacion.length,
        totalEnsRows: ensamblaje.length
      }
    });

  } catch (error: any) {
    console.error("Error in produccion-data API:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al procesar datos de producción." },
      { status: 500 }
    );
  }
}
