export type FinancialConcept = {
  id: string;
  concept: string;
  category: string;
  sub_category: string;
  movement_type: 'Ingreso' | 'Egreso' | 'Mov. Financiero';
  efe_category: string;
  is_active: boolean;
  source_row: number | null;
};

export type FinancialConceptInput = Pick<FinancialConcept,
  'concept' | 'category' | 'sub_category' | 'movement_type' | 'efe_category'>;

export const normalizeFinancialText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('es');

export const financialConceptKey = (item: FinancialConceptInput) => [
  item.concept, item.category, item.sub_category, item.movement_type, item.efe_category
].map(normalizeFinancialText).join('\u001f');

const cell = (value: unknown) => String(value ?? '').trim();

export function parseFinancialConceptRows(rows: unknown[][]) {
  const headers = (rows[0] || []).map(value => normalizeFinancialText(cell(value)).replace(/[^a-z0-9]+/g, ' ').trim());
  const find = (...names: string[]) => headers.findIndex(header => names.some(name => header === name));
  const conceptCol = find('concepto', 'concept');
  const subCol = find('categoria seria sub categoria', 'subcategoria', 'sub category');
  const categoryCol = find('cuenta seria categoria', 'category', 'categoria');
  const typeCol = find('tipo mov', 'movement type', 'tipo movimiento');
  const efeCol = find('efe', 'efe category');
  if ([conceptCol, categoryCol, typeCol].some(index => index < 0)) {
    throw new Error('El archivo necesita las columnas Concepto, Cuenta/Categoría y Tipo Mov.');
  }

  const items: FinancialConceptInput[] = [];
  const invalidRows: number[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index] || [];
    const concept = cell(row[conceptCol]);
    if (!concept) continue;
    const category = cell(row[categoryCol]);
    const rawType = normalizeFinancialText(cell(row[typeCol]));
    const movement_type = rawType === 'ingreso' ? 'Ingreso'
      : rawType === 'egreso' ? 'Egreso'
      : rawType === 'mov. financiero' || rawType === 'mov financiero' ? 'Mov. Financiero' : null;
    if (!category || !movement_type) {
      invalidRows.push(index + 1);
      continue;
    }
    items.push({
      concept,
      category,
      sub_category: subCol < 0 ? '' : cell(row[subCol]),
      movement_type,
      efe_category: efeCol < 0 ? '' : cell(row[efeCol])
    });
  }
  return { items, invalidRows };
}
