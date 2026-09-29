type CellFormat = Record<string, unknown>;
type GridRange = { sheetId?: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
type ReferenceSheet = { properties: { title: string; sheetId: number; gridProperties: { rowCount: number; columnCount: number } }; protectedRanges?: Array<{ range: GridRange; warningOnly?: boolean; requestingUserCanEdit?: boolean; unprotectedRanges?: GridRange[] }>; data?: Array<{ rowData?: Array<{ values?: Array<{ formattedValue?: string; userEnteredFormat?: CellFormat }> }> }> };

// Formatting and validation changes need the same permissions as value edits.
// Split each row request around protected cells, preserving their existing format.
function editableMaintenanceRequests(requests: unknown[], sheet: ReferenceSheet): unknown[] {
  const contains = (range: GridRange, row: number, col: number) =>
    (range.sheetId === undefined || range.sheetId === sheet.properties.sheetId) &&
    row >= (range.startRowIndex ?? 0) && row < (range.endRowIndex ?? Infinity) &&
    col >= (range.startColumnIndex ?? 0) && col < (range.endColumnIndex ?? Infinity);
  const protections = (sheet.protectedRanges || []).filter(p => !p.warningOnly && !p.requestingUserCanEdit);
  return requests.flatMap(request => {
    const entry = request as { repeatCell?: { range: GridRange }; setDataValidation?: { range: GridRange } };
    const key = entry.repeatCell ? 'repeatCell' : entry.setDataValidation ? 'setDataValidation' : undefined;
    if (!key) return [request];
    const operation = entry[key]!;
    const range = operation.range;
    const row = range.startRowIndex!;
    const result: unknown[] = [];
    let start: number | undefined;
    const end = range.endColumnIndex!;
    for (let col = range.startColumnIndex!; col <= end; col++) {
      const editable = col < end && !protections.some(p => contains(p.range, row, col) &&
        !(p.unprotectedRanges || []).some(r => contains(r, row, col)));
      if (editable && start === undefined) start = col;
      if (!editable && start !== undefined) {
        result.push({ [key]: { ...operation, range: { ...range, startColumnIndex: start, endColumnIndex: col } } });
        start = undefined;
      }
    }
    return result;
  });
}

function columnIndex(column: string): number {
  return [...column].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function color(hex: string) {
  return { red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 };
}

/** The maintenance script uses the delivery layout; seller sheets have one extra column A. */
export function buildSellerRowMaintenanceRequests(
  sheet: ReferenceSheet,
  rowNumbers: number[],
  referenceSheets: ReferenceSheet[],
  category: string,
  zones: Map<number, string>
): unknown[] {
  const requests: unknown[] = [];
  const { sheetId, gridProperties } = sheet.properties;
  const lastRow = Math.max(...rowNumbers);
  if (lastRow > gridProperties.rowCount) {
    requests.push({ appendDimension: { sheetId, dimension: 'ROWS', length: lastRow - gridProperties.rowCount } });
  }
  const colors = referenceSheets.find(ref => ref.properties.title === 'FormatoColores')?.data?.[0]?.rowData || [];
  const lookupColor = (value: string, index: number): CellFormat => {
    const cell = colors.find(row => row.values?.[index]?.formattedValue?.trim().toUpperCase() === value.trim().toUpperCase())?.values?.[index];
    const format = cell?.userEnteredFormat;
    const text = format?.textFormat as Record<string, unknown> | undefined;
    return {
      backgroundColor: format?.backgroundColor || color('#ffffff'),
      ...(format?.backgroundColorStyle ? { backgroundColorStyle: format.backgroundColorStyle } : {}),
      textFormat: {
        foregroundColor: text?.foregroundColor || color('#000000'),
        ...(text?.foregroundColorStyle ? { foregroundColorStyle: text.foregroundColorStyle } : {}),
        bold: text?.bold || false
      }
    };
  };
  const validations: Array<[string, string, string[]]> = [
    ['Data Ads', 'A', ['I']], ['DATABASE', 'E', ['K']], ['DATABASE', 'F', ['L']],
    ['DATABASE', 'B', ['P']], ['DATABASE', 'P', ['Q']], ['DATABASE', 'H', ['T']],
    ['DATABASE', 'C', ['U']], ['DATABASE', 'M', ['W']], ['DATABASE', 'R', ['Z']],
    ['DATABASE', 'A', ['AD', 'AH', 'AL', 'AP', 'AT', 'AX', 'BB', 'BF', 'BJ', 'BN', 'BR', 'BV']],
    ['DATABASE', 'U', ['BZ']], ['DATABASE', 'I', ['CA']], ['DATABASE', 'D', ['CB']],
    ['DATABASE', 'L', ['CC']], ['DATABASE', 'K', ['CD']]
  ];
  for (const rowNumber of rowNumbers) {
    const range = (start = 0, end = gridProperties.columnCount) => ({ sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: start, endColumnIndex: end });
    const format = (start: number, end: number, value: CellFormat, fields: string) => {
      if (start < gridProperties.columnCount) requests.push({ repeatCell: { range: range(start, Math.min(end, gridProperties.columnCount)), cell: { userEnteredFormat: value }, fields } });
    };
    // Clear validations and restore only the destination row, without touching values or formulas.
    requests.push({ setDataValidation: { range: range() } });
    format(0, gridProperties.columnCount, { textFormat: { fontFamily: 'Arial', fontSize: 10 }, verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT' }, 'userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.fontSize,userEnteredFormat.verticalAlignment,userEnteredFormat.horizontalAlignment');
    format(columnIndex('E') + 1, gridProperties.columnCount, { backgroundColor: color('#ffffff'), textFormat: { foregroundColor: color('#000000'), bold: false, italic: false } }, 'userEnteredFormat.backgroundColor,userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.foregroundColorStyle,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic');
    const calculated = (column: string, background: string, foreground: string) => format(columnIndex(column) + 1, columnIndex(column) + 2, { backgroundColor: color(background), textFormat: { foregroundColor: color(foreground), bold: true }, horizontalAlignment: 'CENTER' }, 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.horizontalAlignment');
    calculated('Y', '#f1c232', '#ffffff');
    calculated('AB', '#cfe2f3', '#000000');
    calculated('AC', '#3c78d8', '#ffffff');
    ['AG', 'AO', 'AW', 'BE', 'BM', 'BU'].forEach(col => calculated(col, '#76a5af', '#ffffff'));
    ['AK', 'AS', 'BA', 'BI', 'BQ', 'BY'].forEach(col => calculated(col, '#e06666', '#ffffff'));
    ['AA', ...Array.from({ length: 12 }, (_, index) => index)].forEach(col => {
      const start = typeof col === 'string' ? columnIndex(col) + 1 : columnIndex('AE') + 1 + col * 4;
      format(start, start + (typeof col === 'string' ? 1 : 2), { horizontalAlignment: 'CENTER' }, 'userEnteredFormat.horizontalAlignment');
    });
    for (const [column, value, index] of [['T', category, 0], ['M', zones.get(rowNumber) || '', 1]] as const) {
      format(columnIndex(column) + 1, columnIndex(column) + 2, lookupColor(value, index), 'userEnteredFormat.backgroundColor,userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.foregroundColorStyle,userEnteredFormat.textFormat.bold');
    }
    format(columnIndex('C'), columnIndex('E') + 1, { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } }, 'userEnteredFormat.numberFormat');
    format(columnIndex('G'), columnIndex('H') + 1, { numberFormat: { type: 'TEXT' } }, 'userEnteredFormat.numberFormat');
    for (const [source, sourceColumn, destinations] of validations) {
      if (!referenceSheets.some(ref => ref.properties.title === source)) continue;
      for (const column of destinations) {
        const index = columnIndex(column) + 1;
        if (index >= gridProperties.columnCount) continue;
        requests.push({ setDataValidation: { range: range(index, index + 1), rule: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${source}'!$${sourceColumn}:$${sourceColumn}` }] }, strict: false, showCustomUi: true } } });
      }
    }
  }
  return editableMaintenanceRequests(requests, sheet);
}

export async function restoreSellerRowFormats(
  spreadsheetId: string, sheetName: string, rowNumbers: number[], token: string, category: string
): Promise<void> {
  if (!rowNumbers.length) return;
  const headers = { Authorization: `Bearer ${token}` };
  const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties,protectedRanges(range,warningOnly,requestingUserCanEdit,unprotectedRanges))`, { headers, cache: 'no-store' });
  if (!metadata.ok) throw new Error(`No se pudo verificar el formato de la planilla (${metadata.status})`);
  const sheets: ReferenceSheet[] = (await metadata.json()).sheets || [];
  const sheet = sheets.find(ref => ref.properties.title === sheetName);
  if (!sheet) throw new Error(`No se encontró la hoja ${sheetName}`);
  const ranges = rowNumbers.filter(row => row <= sheet.properties.gridProperties.rowCount).map(row => `'${sheetName.replace(/'/g, "''")}'!N${row}`);
  if (sheets.some(ref => ref.properties.title === 'FormatoColores')) ranges.push("'FormatoColores'!A:B");
  const zones = new Map<number, string>();
  if (ranges.length) {
    const fields = 'sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredFormat))))';
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&')}&fields=${encodeURIComponent(fields)}`, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudieron leer los colores de la planilla (${response.status})`);
    const data = await response.json();
    for (const ref of data.sheets || []) {
      if (ref.properties.title === 'FormatoColores') {
        const target = sheets.find(item => item.properties.title === 'FormatoColores');
        if (target) target.data = ref.data;
      } else {
        for (const grid of ref.data || []) {
          for (const [index, row] of (grid.rowData || []).entries()) {
            zones.set((grid.startRow || 0) + index + 1, row.values?.[0]?.formattedValue || '');
          }
        }
      }
    }
  }
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: buildSellerRowMaintenanceRequests(sheet, rowNumbers, sheets, category, zones) })
  });
  if (!response.ok) throw new Error(`No se pudieron restaurar formatos y validaciones (${response.status}): ${await response.text()}`);
}
