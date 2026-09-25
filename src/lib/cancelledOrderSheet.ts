export type SheetCellValue = string | number | boolean;

export function cancellationMonthSerial(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const month = value('month');
  // Cancelados muestra el número del mes como día: 09septiembre, 10octubre.
  return Math.round((Date.UTC(value('year'), month - 1, month) - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Maps the current delivery row (A onward) into Cancelados (D onward). */
export function cancelledRowCells(
  sourceValues: SheetCellValue[],
  sourceFormulas: SheetCellValue[],
  destinationFormulas: SheetCellValue[],
  code: string,
  reason: string,
  monthSerial: number
): Array<{ columnIndex: number; value: SheetCellValue }> {
  const cells: Array<{ columnIndex: number; value: SheetCellValue }> = [
    { columnIndex: 0, value: 'Ventas' },
    { columnIndex: 1, value: reason.trim() || 'Sin motivo' },
    { columnIndex: 2, value: monthSerial }
  ];
  for (let index = 0; index < sourceValues.length; index++) {
    const destinationIndex = index + 3;
    const formula = String(sourceFormulas[index] || '');
    const destinationFormula = String(destinationFormulas[destinationIndex] || '');
    if (formula.startsWith('=') || destinationFormula.startsWith('=')) continue;
    const value = index === 0 ? code : index === 15 ? '❌ Anulado' : sourceValues[index];
    if (value === undefined || value === null || value === '') continue;
    cells.push({ columnIndex: destinationIndex, value });
  }
  return cells;
}
