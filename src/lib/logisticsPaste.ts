export const LOGISTICS_MAX_COLUMNS = 78; // A:BZ

const ORDER_CODE_PATTERN = /^[A-Z]{1,8}(?:-[A-Z]{1,8})?-?\d+$/i;
const DATE_PATTERN = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/;

/** Lee TSV respetando comillas, tabs y saltos de línea dentro de una celda. */
export function parseQuotedTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushCell = () => {
    row.push(cell.replace(/\r?\n+/g, ' ').trim());
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === '\t' && !quoted) {
      pushCell();
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      pushRow();
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) pushRow();
  return rows;
}

export function normalizeLogisticsPastedRows(inputRows: string[][]): string[][] {
  let rows = inputRows.map(row => row.map(cell => String(cell ?? '').replace(/\r?\n+/g, ' ').trim()));
  while (rows.length > 0 && rows[rows.length - 1].every(cell => !cell)) rows.pop();

  if (rows[0]) {
    const heading = rows[0].join(' ').toLowerCase();
    if (heading.includes('código') && heading.includes('cliente')) rows = rows.slice(1);
  }

  return rows.flatMap(row => {
    if (!row.some(Boolean)) return [];
    const normalized = [...row];
    const firstLooksLikeCode = ORDER_CODE_PATTERN.test(normalized[0] || '');
    const secondLooksLikeDate = DATE_PATTERN.test(normalized[1] || '');
    if (firstLooksLikeCode && secondLooksLikeDate) normalized.unshift('');

    // Cada fila operativa debe tener código en B. Esto descarta los fragmentos
    // creados por saltos internos de una celda cuando el portapapeles no los cita.
    if (!ORDER_CODE_PATTERN.test(normalized[1] || '')) return [];

    return [normalized
      .slice(0, LOGISTICS_MAX_COLUMNS)
      .concat(Array(LOGISTICS_MAX_COLUMNS).fill(''))
      .slice(0, LOGISTICS_MAX_COLUMNS)];
  });
}

export function parseLogisticsClipboardText(text: string): string[][] {
  return normalizeLogisticsPastedRows(parseQuotedTsv(text));
}
