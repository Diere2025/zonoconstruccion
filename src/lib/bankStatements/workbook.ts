import * as XLSX from 'xlsx';
import { MAX_STATEMENT_BYTES, MAX_STATEMENT_ROWS, parseStatementGrid, type SourceCell } from './model';
export function readStatementWorkbook(bytes: ArrayBuffer) {
  if (!bytes.byteLength || bytes.byteLength > MAX_STATEMENT_BYTES) throw Error('El archivo debe ser un Excel de hasta 2 MB');
  const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false, sheetRows: MAX_STATEMENT_ROWS + 12 });
  if (workbook.SheetNames.length !== 1) throw Error('Exportá el reporte original con una sola hoja');
  const name = workbook.SheetNames[0], sheet = workbook.Sheets[name];
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (range.e.r > MAX_STATEMENT_ROWS + 10 || range.e.c > 100) throw Error('El reporte supera el límite de filas o columnas');
  const grid: SourceCell[][] = [];
  for (let row = 0; row <= range.e.r; row++) {
    const cells: SourceCell[] = [];
    for (let column = 0; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      cells.push({ value: cell?.v ?? null, formula: cell?.f });
    }
    grid.push(cells);
  }
  return parseStatementGrid(name, grid);
}
