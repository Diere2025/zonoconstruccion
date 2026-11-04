import { extractLitros, getRecommendedBaseCm } from './visualSelectorConfig';

type Item = { name: string; sku?: string; quantity: number };

export function getBaseDiameterCm(item: Pick<Item, 'name' | 'sku'>): number | undefined {
  const text = `${item.name} ${item.sku || ''}`.toLowerCase();
  if (!/\bbase\b/.test(text) || !text.includes('hierro')) return undefined;
  const match = text.match(/\b(74|85|90|102|145)(?:\s*cms?\b|\b)/);
  return match ? Number(match[1]) : undefined;
}

/** Uses the same size recommendations as the visual selector. A base can be
 * sold separately; only warn when the order also contains a recognized tank.
 * Special tank shapes need their own measurements, so do not infer them here. */
export function getTankBaseWarnings(items: readonly Item[]) {
  const tanks = items.flatMap(item => {
    const text = `${item.name} ${item.sku || ''}`.toLowerCase();
    if (item.quantity <= 0 || /base|flotante|biodigestor|termotanque|cisterna|slim|chato|instalaci[oó]n/.test(text)) return [];
    if (!/\b(tanque|tanq|tricapa|tric|bicapa|bic|cuatricapa|cuatr)\b/.test(text)) return [];
    const litros = extractLitros(item.name) || extractLitros(item.sku || '');
    return litros > 0 ? [{ name: item.name, diameter: getRecommendedBaseCm(litros) }] : [];
  });
  if (!tanks.length) return [];
  const recommended = [...new Set(tanks.map(tank => tank.diameter))];
  return items.flatMap((item, index) => {
    const diameter = getBaseDiameterCm(item);
    if (item.quantity <= 0 || !diameter || recommended.includes(diameter)) return [];
    return [{
      key: index,
      message: `La base «${item.name}» (${diameter} cm) no coincide con la medida recomendada para los tanques del pedido: ${tanks.map(tank => `${tank.name}: base de ${tank.diameter} cm`).join('; ')}. Revisá el cambio de base antes de guardar.`,
    }];
  });
}
