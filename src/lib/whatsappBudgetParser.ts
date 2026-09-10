import type { Product } from "../types";

export interface ParsedBudgetItem {
  name: string;
  quantity: number;
  unitPrice: number;
  price?: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  isIncludedInKit?: boolean;
  isDiscountItem?: boolean;
  rawLine?: string;
}

export interface ParsedWhatsAppBudget {
  items: ParsedBudgetItem[];
  orderDiscountType?: 'percentage' | 'fixed';
  orderDiscountValue?: number;
  orderDiscountAmount?: number;
  isFreeShipping: boolean;
  shippingCost: number;
  paymentType: 'efectivo' | 'tarjeta';
  paymentMethodName?: string;
  cardInstallments: number;
  cardSurcharge: number;
  includeIVA: boolean;
  kitDetailText: string;
  totalListPrice?: number;
  totalAnnounced?: number;
  totalSavings?: number;
}

export const parsePrice = (priceStr: string | number | null | undefined): number => {
  if (typeof priceStr === 'number') return isNaN(priceStr) ? 0 : priceStr;
  if (!priceStr) return 0;
  let clean = priceStr.toString().replace(/[^\d.,]/g, '').trim();
  if (!clean) return 0;

  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes('.')) {
    const dotParts = clean.split('.');
    if (dotParts.length > 2) {
      clean = clean.replace(/\./g, '');
    } else if (dotParts.length === 2 && dotParts[1].length === 3) {
      clean = clean.replace(/\./g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

export const normalizeForMatching = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, " ")     // replace punctuation with spaces
    .replace(/\s+/g, " ")           // collapse spaces
    .trim();
};

export const getStem = (word: string): string => {
  if (!word || word.length <= 3) return word;
  return word
    .replace(/(es|s)$/, '')
    .replace(/(ante|adora|ador|dor|dora|ero|era|ito|ita)$/, '');
};

export const isDiscountItemText = (nameOrLine: string): boolean => {
  const lower = (nameOrLine || "").toLowerCase();
  return (
    lower.includes("descuento") ||
    lower.includes("bonificaci") ||
    lower.includes("bonif") ||
    lower.includes("promocion")
  );
};

export const isDiscountItem = (item: { name?: string; sku?: string }): boolean => {
  if (!item) return false;
  const name = (item.name || "").toLowerCase();
  const sku = (item.sku || "").toLowerCase();
  return name.includes("descuento") || sku.includes("descuento") || name.includes("bonificaci") || sku.includes("bonificaci");
};

/**
 * Parsea un texto de presupuesto de WhatsApp en formato actual o anterior.
 */
export const parseWhatsAppBudget = (text: string): ParsedWhatsAppBudget => {
  const lines = text.split(/\r?\n/);
  const items: ParsedBudgetItem[] = [];
  
  let isFreeShipping = true;
  let shippingCost = 0;
  let paymentType: 'efectivo' | 'tarjeta' = 'efectivo';
  let paymentMethodName = '';
  let cardInstallments = 1;
  let cardSurcharge = 0;
  let includeIVA = false;
  let kitDetailText = '';
  let orderDiscountType: 'percentage' | 'fixed' | undefined = undefined;
  let orderDiscountValue: number | undefined = undefined;
  let orderDiscountAmount: number | undefined = undefined;
  let totalListPrice: number | undefined = undefined;
  let totalAnnounced: number | undefined = undefined;
  let totalSavings: number | undefined = undefined;

  // Regex para items estándar (limpiando viñetas/emojis previos):
  // "1x *Biodigestor 1000L* a $480.000 (~$564.700~ | *15% OFF*)"
  // "2x *Cámara Desengrasante 50L* a $70.000 c/u (~$80.000~ | *12% OFF*)"
  // "1x *Tanque 1000L Aquafort* a $250.000"
  // "1x Tanque 1000L a $250.000"
  const standardItemRegex = /^(\d+)\s*[xX]\s*\*?([^*]+?)\*?\s+a\s+\$?\s*([\d.,]+)(?:\s*c\/u)?(?:\s*\((?:~?\$?\s*([\d.,]+)~?\s*(?:\||,)?\s*\*?(\d+)%\s*OFF\*?)\))?/i;

  // Regex para items incluidos en kits:
  // "1x *Kit de Instalación* (Incluido en el Kit)"
  // "1x *Flotante 3/4* (Incluido en el Kit)"
  // "1x Flotante (Incluido)"
  const kitIncludedRegex = /^(\d+)\s*[xX]\s*\*?([^*()]+?)\*?\s*\((?:incluido[^\)]*)\)/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();

    // 1. Ignorar cabeceras y separadores
    if (
      lowerLine.startsWith('*zono construcci') ||
      lowerLine.startsWith('_presupuesto detallado_') ||
      lowerLine.startsWith('➖') ||
      lowerLine.startsWith('---') ||
      lowerLine.startsWith('===')
    ) {
      continue;
    }

    // 2. Descuento Global al total del presupuesto (Formato Nuevo)
    // Ej: "🏷️ *Descuento Presupuesto (10%):* -$62.000"
    // Ej: "🏷️ *Descuento Presupuesto (Monto Fijo):* -$50.000"
    // Ej: "*Descuento Presupuesto (15%):* -$45.000"
    if (lowerLine.includes('descuento presupuesto')) {
      const matchPct = line.match(/\((\d+)%\)/);
      const matchAmount = line.match(/(?:-\$|\$|-)\s*([\d.,]+)/) || line.match(/:\s*(?:-\$|\$|-)?\s*([\d.,]+)/);
      const amount = matchAmount ? parsePrice(matchAmount[1]) : 0;

      if (matchPct) {
        orderDiscountType = 'percentage';
        orderDiscountValue = parseInt(matchPct[1], 10);
        orderDiscountAmount = amount;
      } else {
        orderDiscountType = 'fixed';
        orderDiscountValue = amount;
        orderDiscountAmount = amount;
      }
      continue;
    }

    // 3. Totales y resúmenes de pie (evitar parsear como productos)
    if (lowerLine.startsWith('*precio de lista:*') || lowerLine.startsWith('precio de lista:')) {
      const m = line.match(/\$?([\d.,]+)/);
      if (m) totalListPrice = parsePrice(m[1]);
      continue;
    }

    if (lowerLine.startsWith('🏷️ *descuento aplicado:*') || lowerLine.startsWith('*descuento aplicado:*') || lowerLine.startsWith('descuento aplicado:')) {
      continue;
    }

    if (lowerLine.startsWith('*subtotal productos:*') || lowerLine.startsWith('subtotal productos:') || lowerLine.startsWith('subtotal:') || lowerLine.startsWith('subtotal neto:') || lowerLine.startsWith('*subtotal neto:*') || lowerLine.startsWith('*subtotal con descuento:*')) {
      continue;
    }

    if (
      lowerLine.startsWith('*total a abonar:*') || 
      lowerLine.startsWith('total a abonar:') || 
      lowerLine.startsWith('*total estimado:*') || 
      lowerLine.startsWith('total estimado:') || 
      lowerLine.startsWith('*total:*') || 
      lowerLine.startsWith('total:')
    ) {
      const m = line.match(/\$?([\d.,]+)/);
      if (m) totalAnnounced = parsePrice(m[1]);
      continue;
    }

    if (lowerLine.includes('ahorro total')) {
      const m = line.match(/\$?([\d.,]+)/);
      if (m) totalSavings = parsePrice(m[1]);
      continue;
    }

    // Limpiar viñetas, emojis o guiones al inicio de la línea para facilitar el parseo
    const cleanLine = line.replace(/^[^\w\d*]+/, '').trim();

    // 4. Ítems incluidos en Kit (precio $0)
    const kitMatch = cleanLine.match(kitIncludedRegex);
    if (kitMatch) {
      const quantity = parseInt(kitMatch[1], 10) || 1;
      const productName = kitMatch[2].trim().replace(/^\*|\*$/g, '');
      items.push({
        name: productName,
        quantity,
        unitPrice: 0,
        price: 0,
        basePrice: 0,
        isIncludedInKit: true,
        rawLine: line
      });
      continue;
    }

    // 5. Ítems de Bonificación / Descuento específicos
    // Ej: "🏷️ *Descuento Combo Biodigestor*: -$45.000"
    // Ej: "🏷️ *Descuento Combo Autolimpiante*: -$60.000"
    // Ej: "*Descuento Combo*: -$30.000"
    // Ej: "Descuento: -$20.000"
    if (
      (lowerLine.includes('descuento combo') || 
       lowerLine.includes('bonificacion') || 
       lowerLine.includes('bonificación') ||
       (lowerLine.includes('descuento') && (lowerLine.includes('-$') || lowerLine.includes(':-$') || lowerLine.includes(': -')))) &&
      !lowerLine.includes('descuento presupuesto') &&
      !lowerLine.includes('descuento aplicado')
    ) {
      const matchAmount = line.match(/(?:-\$|\$|-)\s*([\d.,]+)/) || line.match(/:\s*(?:-\$|\$|-)?\s*([\d.,]+)/);
      let discPrice = 0;
      if (matchAmount) {
        discPrice = parsePrice(matchAmount[1]);
      } else {
        const anyNumber = line.match(/\$?([\d.,]+)/);
        if (anyNumber) discPrice = parsePrice(anyNumber[1]);
      }

      let label = "Descuento Combo";
      const labelMatch = line.match(/\*([^*]+)\*/);
      if (labelMatch) {
        label = labelMatch[1].replace(/:\s*$/, '').trim();
      } else {
        const cleanL = line.replace(/^[^\w\d*]+/, '').split(':')[0];
        if (cleanL) label = cleanL.trim();
      }

      const discVal = -Math.abs(discPrice);
      items.push({
        name: label,
        quantity: 1,
        unitPrice: discVal,
        price: discVal,
        basePrice: discVal,
        isDiscountItem: true,
        rawLine: line
      });
      continue;
    }

    // 6. Producto estándar (con o sin descuento en línea)
    const stdMatch = cleanLine.match(standardItemRegex);
    if (stdMatch) {
      const quantity = parseInt(stdMatch[1], 10) || 1;
      const productName = stdMatch[2].trim().replace(/^\*|\*$/g, '');
      const unitPrice = parsePrice(stdMatch[3]);
      const basePrice = stdMatch[4] ? parsePrice(stdMatch[4]) : unitPrice;
      const discountPct = stdMatch[5] ? parseInt(stdMatch[5], 10) : undefined;

      const hasDisc = basePrice > unitPrice && unitPrice > 0;
      const effectiveDiscVal = discountPct !== undefined 
        ? discountPct 
        : (hasDisc && basePrice > 0 ? Math.round(((basePrice - unitPrice) / basePrice) * 100) : undefined);

      items.push({
        name: productName,
        quantity,
        unitPrice,
        price: unitPrice,
        basePrice: hasDisc ? basePrice : unitPrice,
        discountType: hasDisc ? 'percentage' : undefined,
        discountValue: effectiveDiscVal,
        isDiscountItem: false,
        rawLine: line
      });
      continue;
    }

    // 7. Envío
    if (lowerLine.includes('*envio:*') || lowerLine.includes('*envío:*') || lowerLine.startsWith('envio:') || lowerLine.startsWith('envío:')) {
      if (lowerLine.includes('gratis') || lowerLine.includes('bonificado') || lowerLine.includes('$0')) {
        isFreeShipping = true;
        shippingCost = 0;
      } else {
        isFreeShipping = false;
        const match = line.match(/\$?([\d.,]+)/);
        if (match) {
          shippingCost = parsePrice(match[1]);
        }
      }
      continue;
    }

    // 8. Medio de pago
    if (lowerLine.includes('medio de pago:')) {
      paymentMethodName = line.split(/:\s*/)[1]?.replace(/\*/g, '').trim() || '';
      if (lowerLine.includes('tarjeta')) {
        paymentType = 'tarjeta';
      } else {
        paymentType = 'efectivo';
      }
      const installmentsMatch = line.match(/(\d+)\s*cuotas/i);
      if (installmentsMatch) {
        cardInstallments = parseInt(installmentsMatch[1], 10);
      }
      continue;
    }

    // 9. Recargo financiero
    if (lowerLine.includes('recargo por pago en cuotas:') || lowerLine.includes('recargo:')) {
      const percentMatch = line.match(/\((\d+)%\)/);
      if (percentMatch) {
        cardSurcharge = parseInt(percentMatch[1], 10);
      }
      continue;
    }

    // 10. IVA
    if (lowerLine.includes('iva (21%):') || lowerLine.includes('*iva:*') || lowerLine.includes('iva:')) {
      includeIVA = true;
      continue;
    }

    // 11. Aclaración / Notas
    if (lowerLine.includes('aclaraci[oó]n:') || lowerLine.includes('aclaracion:') || lowerLine.includes('aclaración:')) {
      const match = line.match(/aclaraci[oó]n:\*?\s*(.*)/i);
      if (match && match[1]) {
        kitDetailText = match[1].replace(/^\*|\*$/g, '').trim();
      }
      continue;
    }

    // 12. Cuotas en el pie del mensaje
    if (lowerLine.includes('cuotas fijas') || lowerLine.includes('podes pagarlo en')) {
      const cuotasMatch = line.match(/(\d+)\s*cuotas/i);
      if (cuotasMatch) {
        paymentType = 'tarjeta';
        cardInstallments = parseInt(cuotasMatch[1], 10);
      }
      continue;
    }
  }

  return {
    items,
    orderDiscountType,
    orderDiscountValue,
    orderDiscountAmount,
    isFreeShipping,
    shippingCost,
    paymentType,
    paymentMethodName,
    cardInstallments,
    cardSurcharge,
    includeIVA,
    kitDetailText,
    totalListPrice,
    totalAnnounced,
    totalSavings
  };
};

export interface MatchedOrderItem {
  product?: Product;
  parsedItem: ParsedBudgetItem;
  matchType: 'exact_sku' | 'exact_name' | 'substring' | 'token_similarity' | 'discount_item' | 'unmatched';
  confidence: number; // 0 a 1
}

/**
 * Empareja cada ítem parseado con los productos disponibles en el catálogo de Supabase.
 */
export const matchParsedItemsToProducts = (
  parsedItems: ParsedBudgetItem[],
  catalogProducts: Product[]
): MatchedOrderItem[] => {
  return parsedItems.map((item) => {
    // 1. Manejo de ítems de bonificación / descuento
    if (item.isDiscountItem || isDiscountItemText(item.name)) {
      const normLabel = normalizeForMatching(item.name);
      let discProd = catalogProducts.find(p => normalizeForMatching(p.name) === normLabel);
      if (!discProd) {
        discProd = catalogProducts.find(p => p.sku === 'DESCUENTO' || normalizeForMatching(p.name).includes('descuento'));
      }
      return {
        product: discProd,
        parsedItem: item,
        matchType: 'discount_item',
        confidence: discProd ? 1.0 : 0.85
      };
    }

    const normName = normalizeForMatching(item.name);
    if (!normName) {
      return {
        parsedItem: item,
        matchType: 'unmatched',
        confidence: 0
      };
    }

    // 2. Coincidencia exacta por SKU
    const exactSku = catalogProducts.find(p => p.sku && normalizeForMatching(p.sku) === normName);
    if (exactSku) {
      return {
        product: exactSku,
        parsedItem: item,
        matchType: 'exact_sku',
        confidence: 1.0
      };
    }

    // 3. Coincidencia exacta por Nombre
    const exactName = catalogProducts.find(p => normalizeForMatching(p.name) === normName);
    if (exactName) {
      return {
        product: exactName,
        parsedItem: item,
        matchType: 'exact_name',
        confidence: 1.0
      };
    }

    // 4. Coincidencia por Subcadena
    const substringMatches = catalogProducts.filter(p => {
      const pNorm = normalizeForMatching(p.name);
      return pNorm.includes(normName) || normName.includes(pNorm);
    });

    if (substringMatches.length === 1) {
      return {
        product: substringMatches[0],
        parsedItem: item,
        matchType: 'substring',
        confidence: 0.9
      };
    } else if (substringMatches.length > 1) {
      const best = substringMatches.reduce((closest, curr) => {
        const closestDiff = Math.abs(curr.name.length - item.name.length);
        const prevDiff = Math.abs(closest.name.length - item.name.length);
        return closestDiff < prevDiff ? curr : closest;
      }, substringMatches[0]);

      return {
        product: best,
        parsedItem: item,
        matchType: 'substring',
        confidence: 0.85
      };
    }

    // 5. Coincidencia por Palabras Clave y Raíces (Stemmed Token Overlap)
    const itemTokens = normName.split(' ').filter(t => t.length > 1);
    const itemStems = new Set(itemTokens.map(getStem));
    let bestTokenProduct: Product | undefined = undefined;
    let highestScore = 0;

    for (const prod of catalogProducts) {
      const prodTokens = normalizeForMatching(prod.name).split(' ').filter(t => t.length > 1);
      const prodStems = new Set(prodTokens.map(getStem));
      
      let stemIntersection = 0;
      itemStems.forEach(s => {
        if (prodStems.has(s)) stemIntersection++;
      });

      if (stemIntersection > 0) {
        const unionSize = new Set([...itemStems, ...prodStems]).size;
        const score = stemIntersection / unionSize;
        if (score > highestScore && score >= 0.25) {
          highestScore = score;
          bestTokenProduct = prod;
        }
      }
    }

    if (bestTokenProduct && highestScore >= 0.25) {
      return {
        product: bestTokenProduct,
        parsedItem: item,
        matchType: 'token_similarity',
        confidence: highestScore
      };
    }

    return {
      parsedItem: item,
      matchType: 'unmatched',
      confidence: 0
    };
  });
};
