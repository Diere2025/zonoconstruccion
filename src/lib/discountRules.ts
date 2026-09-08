import { Product } from "@/types";

export interface AutomaticDiscountRule {
  id: string;
  name: string;
  description: string;
  productKeywords: string[];
  minQuantity: number;
  maxQuantity?: number;
  targetDiscountName: string;
  defaultUnitDiscount: number;
}

export const DEFAULT_DISCOUNT_RULES: AutomaticDiscountRule[] = [
  {
    id: "mep-x2",
    name: "Descuento - MEP x2",
    description: "Descuento de $2.000/u al llevar 2 unidades de Membrana en Pasta",
    productKeywords: ["membrana", "mep"],
    minQuantity: 2,
    maxQuantity: 2,
    targetDiscountName: "Descuento - MEP x2",
    defaultUnitDiscount: 2000
  },
  {
    id: "mep-x3",
    name: "Descuento - MEP x3",
    description: "Descuento de $3.000/u al llevar de 3 a 5 unidades de Membrana en Pasta",
    productKeywords: ["membrana", "mep"],
    minQuantity: 3,
    maxQuantity: 5,
    targetDiscountName: "Descuento - MEP x3",
    defaultUnitDiscount: 3000
  },
  {
    id: "mep-x6",
    name: "Descuento - MEP x6",
    description: "Descuento de $5.000/u al llevar de 6 a 11 unidades de Membrana en Pasta",
    productKeywords: ["membrana", "mep"],
    minQuantity: 6,
    maxQuantity: 11,
    targetDiscountName: "Descuento - MEP x6",
    defaultUnitDiscount: 5000
  },
  {
    id: "mep-x12",
    name: "Descuento - MEP x12",
    description: "Descuento de $10.000/u al llevar 12 o más unidades de Membrana en Pasta",
    productKeywords: ["membrana", "mep"],
    minQuantity: 12,
    targetDiscountName: "Descuento - MEP x12",
    defaultUnitDiscount: 10000
  }
];

export interface DiscountSuggestion {
  ruleId: string;
  ruleName: string;
  description: string;
  qualifyingQty: number;
  suggestedQty: number;
  targetProduct?: Product;
  unitDiscount: number;
  totalDiscount: number;
  action: 'apply' | 'upgrade';
  existingDiscountItemId?: string;
  itemDiscountAction?: {
    itemIds: string[];
    discountPct: number;
  };
}

export function evaluateDiscountSuggestions(
  orderItems: Array<{ id: string; name: string; sku?: string; quantity: number; customPrice: number }>,
  allProducts: Product[],
  customRules: AutomaticDiscountRule[] = DEFAULT_DISCOUNT_RULES
): DiscountSuggestion[] {
  if (!orderItems || orderItems.length === 0 || !allProducts || allProducts.length === 0) {
    return [];
  }

  const suggestions: DiscountSuggestion[] = [];

  const keywordGroups = [
    {
      groupKey: 'mep',
      keywords: ['membrana', 'mep'],
      rules: customRules.filter(r => r.productKeywords.includes('mep') || r.productKeywords.includes('membrana'))
    }
  ];

  for (const group of keywordGroups) {
    let qualifyingQty = 0;
    for (const item of orderItems) {
      const nameLower = (item.name || "").toLowerCase();
      const skuLower = (item.sku || "").toLowerCase();
      const isDiscountItem = nameLower.includes("descuento") || skuLower.includes("descuento") || nameLower.includes("bonificaci");
      if (isDiscountItem) continue;

      const matches = group.keywords.some(kw => nameLower.includes(kw) || skuLower.includes(kw));
      if (matches) {
        qualifyingQty += item.quantity;
      }
    }

    if (qualifyingQty < 2) {
      continue;
    }

    const matchedRule = group.rules.find(r => {
      if (qualifyingQty < r.minQuantity) return false;
      if (r.maxQuantity !== undefined && qualifyingQty > r.maxQuantity) return false;
      return true;
    });

    if (!matchedRule) continue;

    const targetProd = allProducts.find(p => {
      const pName = (p.name || "").toLowerCase();
      const pSku = (p.sku || "").toLowerCase();
      const targetLower = matchedRule.targetDiscountName.toLowerCase();
      return pName === targetLower || pSku === targetLower || pName.includes(targetLower);
    });

    if (!targetProd) continue;

    const unitDiscount = Math.abs(targetProd.price) || matchedRule.defaultUnitDiscount;
    const totalDiscount = unitDiscount * qualifyingQty;

    const existingMepDiscount = orderItems.find(i => {
      const n = (i.name || "").toLowerCase();
      const s = (i.sku || "").toLowerCase();
      return (n.includes("descuento") || s.includes("descuento")) && (n.includes("mep") || s.includes("mep"));
    });

    if (!existingMepDiscount) {
      suggestions.push({
        ruleId: matchedRule.id,
        ruleName: matchedRule.name,
        description: matchedRule.description,
        qualifyingQty,
        suggestedQty: qualifyingQty,
        targetProduct: targetProd,
        unitDiscount,
        totalDiscount,
        action: 'apply'
      });
    } else {
      const isSameDiscountProduct = existingMepDiscount.id === targetProd.id || (existingMepDiscount.name || "").toLowerCase() === (targetProd.name || "").toLowerCase();
      const hasCorrectQty = existingMepDiscount.quantity === qualifyingQty;

      if (!isSameDiscountProduct || !hasCorrectQty) {
        suggestions.push({
          ruleId: matchedRule.id,
          ruleName: matchedRule.name,
          description: matchedRule.description,
          qualifyingQty,
          suggestedQty: qualifyingQty,
          targetProduct: targetProd,
          unitDiscount,
          totalDiscount,
          action: 'upgrade',
          existingDiscountItemId: existingMepDiscount.id
        });
      }
    }
  }

  // 2. Evaluar combinación de Combo BioFort (Biodigestor + Séptica/Lodos + Cámara Inspección + Biolam)
  const bioProd = orderItems.find(i => {
    const n = (i.name || "").toLowerCase();
    return (n.includes("biodigestor") || n.includes("autolimpiable")) && !n.includes("descuento");
  });
  const sepProd = orderItems.find(i => {
    const n = (i.name || "").toLowerCase();
    return (n.includes("séptica") || n.includes("septica") || n.includes("lodos")) && !n.includes("descuento");
  });
  const inspProd = orderItems.find(i => {
    const n = (i.name || "").toLowerCase();
    return (n.includes("inspección") || n.includes("inspeccion") || n.includes("cii")) && !n.includes("descuento");
  });
  const biolamProd = orderItems.find(i => {
    const n = (i.name || "").toLowerCase();
    return n.includes("biolam") && !n.includes("descuento");
  });
  const desengrasadoraProd = orderItems.find(i => {
    const n = (i.name || "").toLowerCase();
    return (n.includes("desengrasadora") || n.includes("desgrasadora")) && !n.includes("descuento");
  });

  if (bioProd && sepProd && inspProd && biolamProd) {
    const comboItemIds = [bioProd.id, sepProd.id, inspProd.id, biolamProd.id];
    if (desengrasadoraProd) comboItemIds.push(desengrasadoraProd.id);

    const existingComboDiscount = orderItems.find(i => {
      const n = (i.name || "").toLowerCase();
      const s = (i.sku || "").toLowerCase();
      return (n.includes("descuento") || s.includes("descuento")) && (n.includes("combo") || n.includes("bio"));
    });

    const comboItems = [bioProd, sepProd, inspProd, biolamProd, ...(desengrasadoraProd ? [desengrasadoraProd] : [])];
    const needsDiscount = existingComboDiscount || comboItems.some(i => !((i as any).discountValue && (i as any).discountValue >= 15));

    if (needsDiscount) {
      const totalSaving = comboItems.reduce((acc, i) => {
        const base = (i as any).basePrice !== undefined ? (i as any).basePrice : i.customPrice;
        return acc + Math.round(base * 0.15) * (i.quantity || 1);
      }, 0);

      suggestions.push({
        ruleId: 'combo-biofort-15',
        ruleName: 'Combo BioFort: 15% OFF en cada producto',
        description: 'Aplica 15% OFF directamente a cada componente de esta combinación',
        qualifyingQty: comboItems.length,
        suggestedQty: comboItems.length,
        unitDiscount: totalSaving,
        totalDiscount: totalSaving,
        action: 'apply',
        existingDiscountItemId: existingComboDiscount?.id,
        itemDiscountAction: {
          itemIds: comboItemIds,
          discountPct: 15
        }
      });
    }
  }

  // 3. Evaluar regla "Descuento - Bombas": Al comprar 1 bomba con otro producto principal (tanque, termotanque, biodigestor, séptica, cisterna)
  let pumpUnits = 0;
  let mainProductUnits = 0;

  for (const item of orderItems) {
    const nameLower = (item.name || "").toLowerCase();
    const skuLower = (item.sku || "").toLowerCase();
    const isDiscountItem = nameLower.includes("descuento") || skuLower.includes("descuento") || nameLower.includes("bonificaci");
    if (isDiscountItem) continue;

    // Detectar si es Bomba
    const isPump = nameLower.includes("bomba") || skuLower.includes("bomba") || nameLower.includes("electrobomba") || skuLower.includes("electrobomba");
    if (isPump) {
      pumpUnits += (item.quantity || 1);
      continue;
    }

    // Detectar si es Producto Principal (tanques, termotanques, biodigestores, sépticas, cisternas)
    // Excluir accesorios menores (flotantes, teflón, caños, etc.)
    const accessoryKeywords = ['flotante', 'teflon', 'teflón', 'valvula', 'válvula', 'llave de paso', 'cano', 'caño', 'tubo', 'codo', 'cupla', 'biolam', 'aerosol', 'lubricante', 'tapa', 'sombrero'];
    const isAccessory = accessoryKeywords.some(kw => nameLower.includes(kw) || skuLower.includes(kw));
    if (isAccessory) continue;

    const itemCategory = ((item as any).category || allProducts.find(p => p.id === item.id)?.category || "").toLowerCase();
    const isMainCategory = itemCategory.includes("tanque") || itemCategory.includes("termo") || itemCategory.includes("bio") || itemCategory.includes("séptica") || itemCategory.includes("septica");

    const isMain = isMainCategory ||
                   nameLower.includes("tanque") || skuLower.includes("tanque") ||
                   nameLower.includes("tric") || skuLower.includes("tric") ||
                   nameLower.includes("bic") || skuLower.includes("bic") ||
                   nameLower.includes("termotanque") || skuLower.includes("termotanque") ||
                   nameLower.includes("biodigestor") || skuLower.includes("biodigestor") ||
                   nameLower.includes("séptica") || skuLower.includes("séptica") ||
                   nameLower.includes("septica") || skuLower.includes("septica") ||
                   nameLower.includes("cisterna") || skuLower.includes("cisterna") ||
                   nameLower.includes("autolimpiable") || skuLower.includes("autolimpiable");
    if (isMain) {
      mainProductUnits += (item.quantity || 1);
    }
  }

  if (pumpUnits > 0 && mainProductUnits > 0) {
    const qualifyingPumpQty = Math.min(pumpUnits, mainProductUnits);

    const targetPumpDiscount = allProducts.find(p => {
      const pId = p.id;
      const pName = (p.name || "").toLowerCase();
      const pSku = (p.sku || "").toLowerCase();
      return pId === '1280bc2a-e6b2-4cd9-89c2-f449395717fd' ||
             (pName.includes('descuento') && pName.includes('bomba')) ||
             (pSku.includes('descuento') && pSku.includes('bomba'));
    }) || ({
      id: '1280bc2a-e6b2-4cd9-89c2-f449395717fd',
      name: 'Descuento - Bombas',
      sku: 'Descuento - Bombas',
      price: -6000,
      category: 'Descuentos',
      is_active: true
    } as Product);

    const unitDiscount = Math.abs(targetPumpDiscount.price) || 6000;
    const totalDiscount = unitDiscount * qualifyingPumpQty;

    const existingPumpDiscount = orderItems.find(i => {
      const n = (i.name || "").toLowerCase();
      const s = (i.sku || "").toLowerCase();
      return (n.includes("descuento") || s.includes("descuento")) && (n.includes("bomba") || s.includes("bomba"));
    });

    if (!existingPumpDiscount) {
      suggestions.push({
        ruleId: 'descuento-bombas',
        ruleName: 'Descuento - Bombas',
        description: `Bonificación de $${unitDiscount.toLocaleString('es-AR')} por bomba al combinar con producto principal`,
        qualifyingQty: qualifyingPumpQty,
        suggestedQty: qualifyingPumpQty,
        targetProduct: targetPumpDiscount,
        unitDiscount,
        totalDiscount,
        action: 'apply'
      });
    } else if (existingPumpDiscount.quantity !== qualifyingPumpQty) {
      suggestions.push({
        ruleId: 'descuento-bombas',
        ruleName: 'Descuento - Bombas',
        description: `Actualizar a ${qualifyingPumpQty} ${qualifyingPumpQty === 1 ? 'bonificación' : 'bonificaciones'} de $${unitDiscount.toLocaleString('es-AR')} por bomba`,
        qualifyingQty: qualifyingPumpQty,
        suggestedQty: qualifyingPumpQty,
        targetProduct: targetPumpDiscount,
        unitDiscount,
        totalDiscount,
        action: 'upgrade',
        existingDiscountItemId: existingPumpDiscount.id
      });
    }
  }

  return suggestions;
}
