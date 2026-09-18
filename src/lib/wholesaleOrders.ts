export type SalesChannel = 'web_organica' | 'mostrador_minorista' | 'mayorista' | 'vendedor_externo';

function normalized(value?: string | null): string {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isDiscountProductLine(name?: string | null, unitPrice?: number | null): boolean {
  const cleanName = normalized(name);
  return cleanName.includes('descuento') || cleanName.includes('bonificaci') || Number(unitPrice || 0) < 0;
}

export function resolveImportedOrderChannel(input: {
  orderCode?: string | null;
  advertisingSource?: string | null;
  sellerName?: string | null;
  defaultChannel?: string | null;
  deliveryDetail?: string | null;
}): SalesChannel {
  const code = String(input.orderCode || '').trim().toUpperCase();
  const source = normalized(input.advertisingSource);
  const seller = normalized(input.sellerName);
  const deliveryDetail = normalized(input.deliveryDetail);
  const defaultChannel = input.defaultChannel as SalesChannel | undefined;
  const isFacundo = seller === 'facundo' || seller === 'facundo paz';
  const wholesaleSources = new Set([
    'mayorista',
    'cliente',
    'pagina web',
    'reenviado de minorista',
    'recomendado',
    'otro'
  ]);

  // Facundo comparte la misma secuencia AQ-FP para ambos canales. En esa hoja
  // la fuente de verdad es Procedencia, no el prefijo del pedido.
  if (isFacundo && code.startsWith('AQ-')) {
    if (wholesaleSources.has(source)) return 'mayorista';
    if (source.includes('organico') || source.includes('cliente habitual') || source.includes('recomendado')) {
      return 'web_organica';
    }
    return defaultChannel === 'mostrador_minorista' ? 'mostrador_minorista' : 'web_organica';
  }

  if (
    source === 'mayorista' ||
    /^(AQU|POW|AQ-)/.test(code) ||
    deliveryDetail.includes('mayorista') ||
    defaultChannel === 'mayorista'
  ) {
    return 'mayorista';
  }

  if (defaultChannel === 'mostrador_minorista' || defaultChannel === 'vendedor_externo') {
    return defaultChannel;
  }
  return 'web_organica';
}

export function sheetDiscountAmount(row: unknown[], startIndex = 30, step = 4): number {
  let total = 0;
  for (let index = startIndex; index < row.length; index += step) {
    const name = String(row[index] || '').trim();
    const quantity = Math.max(1, Number(String(row[index + 1] || '1').replace(',', '.')) || 1);
    const price = Number(String(row[index + 2] || '0').replace(/\./g, '').replace(',', '.')) || 0;
    if (isDiscountProductLine(name, price)) total += Math.abs(price * quantity);
  }
  return Math.round(total * 100) / 100;
}
