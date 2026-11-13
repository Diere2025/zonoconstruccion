export const plasticPriceSheets = {
  centuma: 'Costo.Centuma',
  mundileno: 'Costo.Mundileno',
  victech: 'Costo.Victech',
} as const;

export function plasticPriceSupplier(name: string): keyof typeof plasticPriceSheets | null {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(plasticPriceSheets, key) ? key as keyof typeof plasticPriceSheets : null;
}

export const plasticPriceName = (name: string) => name.normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type PlasticPurchasePrices = { prices: Record<string, number> };

export function readPlasticPurchasePrices(rows: unknown[][], supplier: keyof typeof plasticPriceSheets): PlasticPurchasePrices {
  const datedColumns = (rows[2] || []).flatMap((date, column) => {
    const currency = String(rows[3]?.[column] ?? '').trim();
    return column > 0 && typeof date === 'number' && Number.isInteger(date) && date > 0 && /^USD\b/i.test(currency)
      ? [{ column, date }]
      : [];
  });
  if (!datedColumns.length) throw new Error('No se encontró un historial de precios en USD.');

  const latestByArticle = new Map<string, { date: number; column: number; price: number | null }>();
  for (const row of rows.slice(4)) {
    if (typeof row[0] !== 'string') continue;
    const name = plasticPriceName(row[0]);
    if (!name) continue;
    for (const { column, date } of datedColumns) {
      const price = row[column];
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;
      const current = latestByArticle.get(name);
      // The source appends revisions to the right, including revisions on the same date.
      if (!current || date > current.date || (date === current.date && column > current.column)) {
        latestByArticle.set(name, { date, column, price });
      } else if (column === current.column && price !== current.price) {
        current.price = null;
      }
    }
  }
  // Centuma OP000826 and Victech OP000831 were received as “Recuperado - Negro”.
  // Keep an explicit economic grade from the supplier's own list if one is added.
  if (supplier === 'centuma' || supplier === 'victech') {
    const economic = plasticPriceName('Recuperado - Negro económico');
    const black = latestByArticle.get(plasticPriceName('Recuperado - Negro'));
    const hasEconomicGrade = rows.slice(4).some(row => typeof row[0] === 'string' && plasticPriceName(row[0]) === economic);
    if (!hasEconomicGrade && black) latestByArticle.set(economic, black);
  }
  const prices = Object.fromEntries([...latestByArticle].flatMap(([name, entry]) =>
    entry.price === null ? [] : [[name, entry.price] as const],
  ));
  return { prices };
}
