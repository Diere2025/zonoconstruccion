import { Product } from '@/types';

export interface VisualOptionAddon {
  id: string;
  name: string;
  productId: string;
  defaultSelected?: boolean;
}

export interface VisualComboItem {
  productId: string;
  quantity: number;
  customPrice?: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

export interface VisualItemOption {
  id: string;
  label: string;
  description?: string;
  badge?: string; // e.g. "Slim", "Chato", "Oferta", "Más Vendido", "Combo"
  imageUrl?: string;
  isActive: boolean;
  price?: number; // displayed price for combo or custom item
  
  // Single product link
  productId?: string;
  allowCiego?: boolean;
  ciegoProductId?: string;

  // Combo bundle (multiple products in 1 click)
  isCombo?: boolean;
  comboItems?: VisualComboItem[];

  // Base and accessory recommendations
  recommendedBaseCm?: number; // 74, 85, 102, 145
  addons?: VisualOptionAddon[];
}

export interface VisualSubGroup {
  id: string;
  name: string; // e.g. "Tricapa Gris", "Universal", "Combos BioFort"
  description?: string;
  badgeColor?: string;
  imageUrl?: string;
  isActive: boolean;
  itemsViewMode?: 'list' | 'grid';
  showItemImages?: boolean;
  items: VisualItemOption[];
}

export interface VisualFamily {
  id: string;
  name: string; // e.g. "Tanques de Agua", "Termotanques", "Biodigestores"
  description?: string;
  icon?: string;
  imageUrl?: string;
  isActive: boolean;
  subgroups: VisualSubGroup[];
}

export interface VisualCatalogConfig {
  version: number;
  updatedAt: string;
  showItemImages?: boolean; // default false (show list without images for litrajes)
  itemsViewMode?: 'list' | 'grid'; // default 'list'
  families: VisualFamily[];
}

export const DEFAULT_FAMILY_IMAGES: Record<string, string> = {
  tanques: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.20177720182888725.jpg',
  termotanques: 'https://placehold.co/400x400/f59e0b/ffffff?text=Termotanques',
  biodigestores: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
  pinturas: 'https://placehold.co/400x400/10b981/ffffff?text=Pinturas',
  otros: 'https://placehold.co/400x400/64748b/ffffff?text=Otros+Productos'
};

export function extractLitros(name: string): number {
  const match = name.match(/(\d+)\s*(?:l\b|litros?|lt)/i);
  if (match) return parseInt(match[1], 10);
  const numMatch = name.match(/\b(\d{3,4})\b/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
}

export function getRecommendedBaseCm(litros: number): number {
  if (litros <= 300) return 74;
  if (litros <= 600) return 85;
  if (litros <= 1200) return 102;
  return 145;
}

/**
 * Finds the recommended Base de Hierro product for a given diameter in cm.
 */
export function findRecommendedBase(products: Product[], recommendedBaseCm?: number): Product | undefined {
  if (!recommendedBaseCm) return undefined;
  const cmStr = `${recommendedBaseCm}`;

  const bases = products.filter(p => {
    if (p.is_active === false) return false;
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    return text.includes('base') && text.includes('hierro') && text.includes(cmStr);
  });

  return bases[0];
}

/**
 * Finds the standard Flotante Eco 1/2" product.
 */
export function findFlotanteProduct(products: Product[]): Product | undefined {
  return products.find(p => {
    if (p.is_active === false) return false;
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    return text.includes('flotante') && text.includes('eco');
  }) || products.find(p => {
    if (p.is_active === false) return false;
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    return text.includes('flotante');
  });
}

/**
 * Generates an initial, fully-populated, dynamic visual catalog config
 * based on what actually exists in the active product database.
 * This guarantees zero "ghost" or non-existing options (e.g. no 3000L for Bicapa).
 */
export function generateDefaultVisualConfig(products: Product[]): VisualCatalogConfig {
  const activeProducts = products.filter(p => p.is_active !== false && p.category !== 'Interno');

  // --- TANQUES ---
  const tankColorDefs = [
    {
      id: 'tricapa_gris',
      name: 'Tricapa Gris',
      description: '3 Capas con Protección UV y Antibacterial',
      badgeColor: 'bg-slate-700 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.20177720182888725.jpg',
      matchFn: (name: string) => name.includes('tric') && name.includes('gris')
    },
    {
      id: 'tricapa_beige',
      name: 'Tricapa Beige',
      description: '3 Capas Térmicas y Estéticas Arena',
      badgeColor: 'bg-amber-100 text-amber-900 border border-amber-300',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/products/0.31942131611064806.jpg',
      matchFn: (name: string) => name.includes('tric') && name.includes('beige')
    },
    {
      id: 'cuatricapa_blanco',
      name: 'Cuatricapa Blanco',
      description: '4 Capas de Máxima Durabilidad e Higiene',
      badgeColor: 'bg-slate-100 text-slate-800 border border-slate-300',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.3675341311280603.jpg',
      matchFn: (name: string) => name.includes('cuatr')
    },
    {
      id: 'bicapa_negro',
      name: 'Bicapa Negro',
      description: '2 Capas Económicas de Gran Resistencia',
      badgeColor: 'bg-neutral-900 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4898699852366949.jpg',
      matchFn: (name: string) => (name.includes('bic ') || name.includes('bicapa')) && !name.includes('tric') && !name.includes('cuatr')
    },
    {
      id: 'cisternas',
      name: 'Cisternas',
      description: 'Cisternas reforzadas para enterrar',
      badgeColor: 'bg-emerald-800 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/visual-selector/1788809405398_cisterna_aquafort.jpg',
      matchFn: (name: string) => name.includes('cisterna')
    }
  ];

  const tanquesSubgroups: VisualSubGroup[] = tankColorDefs.map(colorDef => {
    // Find all products for this color
    const colorProducts = activeProducts.filter(p => {
      const text = `${p.name} ${p.sku || ''}`.toLowerCase();
      if (colorDef.id !== 'cisternas' && text.includes('cisterna')) return false;
      if (text.includes('base') || text.includes('flotante')) return false;
      return colorDef.matchFn(text);
    });

    const nonCiego = colorProducts.filter(p => !p.name.toLowerCase().includes('ciego'));
    const ciegoProds = colorProducts.filter(p => p.name.toLowerCase().includes('ciego'));

    const items: VisualItemOption[] = nonCiego.map(prod => {
      const litros = extractLitros(prod.name);
      const isSlim = prod.name.toLowerCase().includes('slim');
      const isChato = prod.name.toLowerCase().includes('chato');

      let label = `${litros}L`;
      let badge: string | undefined = undefined;
      if (isSlim) {
        label = `Slim ${litros}L`;
        badge = 'Slim';
      } else if (isChato) {
        label = `Chato ${litros}L`;
        badge = 'Chato';
      }

      // Find matching ciego variant
      const ciegoMatch = ciegoProds.find(cp => 
        cp.parent_id === prod.id ||
        cp.name.toLowerCase().includes(`${prod.name.toLowerCase()} (ciego)`) ||
        (extractLitros(cp.name) === litros && cp.name.toLowerCase().includes(isSlim ? 'slim' : (isChato ? 'chato' : '')))
      );

      return {
        id: `item_${prod.id}`,
        label,
        description: prod.name,
        badge,
        imageUrl: prod.image_url || colorDef.imageUrl,
        isActive: true,
        productId: prod.id,
        allowCiego: Boolean(ciegoMatch),
        ciegoProductId: ciegoMatch?.id,
        recommendedBaseCm: getRecommendedBaseCm(litros)
      };
    }).sort((a, b) => {
      const litA = extractLitros(a.label);
      const litB = extractLitros(b.label);
      if (litA !== litB) return litA - litB;
      return a.label.localeCompare(b.label);
    });

    return {
      id: colorDef.id,
      name: colorDef.name,
      description: colorDef.description,
      badgeColor: colorDef.badgeColor,
      imageUrl: colorDef.imageUrl,
      isActive: true,
      items
    };
  });

  // --- TERMOTANQUES ---
  const termoBrandDefs = [
    {
      id: 'universal',
      name: 'Universal',
      description: 'Línea Universal de Alta Eficiencia',
      imageUrl: 'https://placehold.co/400x400/3b82f6/ffffff?text=Termotanque+Universal',
      matchFn: (name: string) => name.includes('universal') && (name.includes('termo') || name.includes('tue'))
    },
    {
      id: 'cooper',
      name: 'Cooper',
      description: 'Línea Cooper de Gran Rendimiento',
      imageUrl: 'https://placehold.co/400x400/0ea5e9/ffffff?text=Termotanque+Cooper',
      matchFn: (name: string) => name.includes('cooper') && (name.includes('termo') || name.includes('tce'))
    }
  ];

  const termoSubgroups: VisualSubGroup[] = termoBrandDefs.map(brandDef => {
    const brandProducts = activeProducts.filter(p => {
      const text = `${p.name} ${p.sku || ''}`.toLowerCase();
      return brandDef.matchFn(text);
    });

    const items: VisualItemOption[] = brandProducts.map(prod => {
      const litros = extractLitros(prod.name);
      return {
        id: `item_${prod.id}`,
        label: litros > 0 ? `${litros}L` : prod.name,
        description: prod.name,
        badge: litros > 0 ? `${litros}L` : undefined,
        imageUrl: prod.image_url || brandDef.imageUrl,
        isActive: true,
        productId: prod.id,
        allowCiego: false
      };
    }).sort((a, b) => {
      const litA = extractLitros(a.label);
      const litB = extractLitros(b.label);
      return litA - litB;
    });

    return {
      id: brandDef.id,
      name: brandDef.name,
      description: brandDef.description,
      imageUrl: brandDef.imageUrl,
      isActive: true,
      items
    };
  });

  const bioKitsInstalacion = activeProducts.filter(p => {
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    return text.includes('kit instalaci') || text.includes('adicionales instalaci');
  });

  const bioCombos = activeProducts.filter(p => {
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    const isBio = text.includes('biodigestor') || text.includes('séptic') || text.includes('septic') || text.includes('biofort');
    return isBio && text.includes('combo') && !text.includes('kit instalaci');
  });

  const bioIndividuales = activeProducts.filter(p => {
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    const isBio = text.includes('biodigestor') || text.includes('séptic') || text.includes('septic') || text.includes('biofort') || text.includes('desengrasadora') || text.includes('lodos');
    return isBio && !text.includes('kit instalaci') && !text.includes('combo') && !text.includes('adicionales');
  });

  const pDesengrasadora = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('desengrasadora') || p.name.toLowerCase().includes('desgrasadora')));
  const pInspeccion = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('cámara de inspección') || p.name.toLowerCase().includes('camara de inspeccion') || p.name.toLowerCase().includes('cii')));
  const pCano110 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('awaduct') && p.name.toLowerCase().includes('110') && p.name.toLowerCase().includes('4mts'));
  const pRamalT = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('ramal t') && p.name.toLowerCase().includes('110'));
  const pCodo90 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('codo 110') && p.name.toLowerCase().includes('90'));
  const pCodo45 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('codo 110') && p.name.toLowerCase().includes('45'));
  const pBiolam = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biolam'));
  const pSombrero = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('sombrero') && p.name.toLowerCase().includes('110'));
  const pLusqtoff = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('lusqtoff') && p.name.toLowerCase().includes('lubricante'));
  const pDescuento = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('descuento combo biodigestor'));

  const createDiscountedComboItem = (prod?: Product, defaultPrice?: number, discountPct: number = 15): VisualComboItem[] => {
    if (!prod) return [];
    const base = prod.price || defaultPrice || 0;
    const custom = Math.round(base * (1 - discountPct / 100));
    return [{
      productId: prod.id,
      quantity: 1,
      customPrice: custom,
      basePrice: base,
      discountType: 'percentage',
      discountValue: discountPct
    }];
  };

  const pBio500 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biodigestor') && p.name.toLowerCase().includes('500'));
  const pSep500 = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('séptica') || p.name.toLowerCase().includes('septica')) && p.name.toLowerCase().includes('500'));
  const pBio600 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biodigestor') && p.name.toLowerCase().includes('600'));
  const pSep600 = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('séptica') || p.name.toLowerCase().includes('septica')) && p.name.toLowerCase().includes('600'));
  const pBio750 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biodigestor') && p.name.toLowerCase().includes('750'));
  const pSep750 = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('séptica') || p.name.toLowerCase().includes('septica')) && p.name.toLowerCase().includes('750'));
  const pBio1000 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biodigestor') && p.name.toLowerCase().includes('1000'));
  const pSep1000 = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('séptica') || p.name.toLowerCase().includes('septica')) && p.name.toLowerCase().includes('1000'));
  const pBio3000 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('biodigestor') && p.name.toLowerCase().includes('3000'));
  const pSep3000 = products.find(p => p.is_active !== false && (p.name.toLowerCase().includes('séptica') || p.name.toLowerCase().includes('septica')) && p.name.toLowerCase().includes('3000'));
  const pBioAuto700 = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('autolimpiable') && p.name.toLowerCase().includes('700'));
  const pRegLodos = products.find(p => p.is_active !== false && p.name.toLowerCase().includes('lodos'));

  const buildKitComboItems = (kitProd: Product): VisualComboItem[] | undefined => {
    const name = kitProd.name.toLowerCase();
    if (name.includes('adicional')) return undefined;

    const items: VisualComboItem[] = [
      { productId: kitProd.id, quantity: 1, customPrice: kitProd.price }
    ];

    if (name.includes('autolimpiante') || name.includes('autolimpiable')) {
      if (pBioAuto700) items.push({ productId: pBioAuto700.id, quantity: 1, customPrice: 0 });
      if (pRegLodos) items.push({ productId: pRegLodos.id, quantity: 1, customPrice: 0 });
      if (pDesengrasadora) items.push({ productId: pDesengrasadora.id, quantity: 1, customPrice: 0 });
      if (pInspeccion) items.push({ productId: pInspeccion.id, quantity: 1, customPrice: 0 });
      if (pCano110) items.push({ productId: pCano110.id, quantity: 3, customPrice: 0 });
      if (pRamalT) items.push({ productId: pRamalT.id, quantity: 1, customPrice: 0 });
      if (pCodo90) items.push({ productId: pCodo90.id, quantity: 2, customPrice: 0 });
      if (pCodo45) items.push({ productId: pCodo45.id, quantity: 2, customPrice: 0 });
      if (pBiolam) items.push({ productId: pBiolam.id, quantity: 1, customPrice: 0 });
      if (pLusqtoff) items.push({ productId: pLusqtoff.id, quantity: 1, customPrice: 0 });
      return items;
    }

    let bProd = pBio500;
    let sProd = pSep500;
    let canoQty = 3;

    if (name.includes('600')) {
      bProd = pBio600;
      sProd = pSep600;
      canoQty = 3;
    } else if (name.includes('750')) {
      bProd = pBio750;
      sProd = pSep750;
      canoQty = 3;
    } else if (name.includes('1000')) {
      bProd = pBio1000;
      sProd = pSep1000;
      canoQty = 4;
    } else if (name.includes('3000')) {
      bProd = pBio3000;
      sProd = pSep3000;
      canoQty = 5;
    }

    if (bProd) items.push({ productId: bProd.id, quantity: 1, customPrice: 0 });
    if (sProd) items.push({ productId: sProd.id, quantity: 1, customPrice: 0 });
    if (pDesengrasadora) items.push({ productId: pDesengrasadora.id, quantity: 1, customPrice: 0 });
    if (pInspeccion) items.push({ productId: pInspeccion.id, quantity: 1, customPrice: 0 });
    if (pCano110) items.push({ productId: pCano110.id, quantity: canoQty, customPrice: 0 });
    if (pRamalT) items.push({ productId: pRamalT.id, quantity: 1, customPrice: 0 });
    if (pCodo90) items.push({ productId: pCodo90.id, quantity: 2, customPrice: 0 });
    if (pCodo45) items.push({ productId: pCodo45.id, quantity: 2, customPrice: 0 });
    if (pBiolam) items.push({ productId: pBiolam.id, quantity: 1, customPrice: 0 });
    if (pSombrero) items.push({ productId: pSombrero.id, quantity: 1, customPrice: 0 });
    if (pLusqtoff) items.push({ productId: pLusqtoff.id, quantity: 1, customPrice: 0 });

    return items;
  };

  const bioSubgroups: VisualSubGroup[] = [
    {
      id: 'kits_instalacion',
      name: 'Kits de Instalación Completa',
      description: 'Incluye Biodigestor, Cámaras, Cañería Awaduct, Accesorios e Instalación',
      badgeColor: 'bg-emerald-600 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/products/0.9509750112986566.png',
      isActive: true,
      items: bioKitsInstalacion.map(prod => {
        const comboItems = buildKitComboItems(prod);
        return {
          id: `item_${prod.id}`,
          label: prod.name,
          description: prod.name,
          badge: comboItems ? 'Kit Completo' : 'Adicional',
          imageUrl: prod.image_url || 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/products/0.9509750112986566.png',
          isActive: true,
          productId: prod.id,
          price: prod.price,
          isCombo: Boolean(comboItems),
          comboItems
        };
      })
    },
    {
      id: 'combos_biofort',
      name: 'Combos Estándar',
      description: 'Sistemas sépticos completos BioFort sin desengrasadora (15% OFF)',
      badgeColor: 'bg-blue-600 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
      isActive: true,
      items: [
        {
          id: 'combo_bio_500_sin_desengrasante',
          label: 'Combo Bio 500L (Sin desengrasante)',
          description: 'Biodigestor 500L + Séptica 500L + Kit Cámara Inspección + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 391850,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio500, 258600, 15),
            ...createDiscountedComboItem(pSep500, 129900, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        },
        {
          id: 'combo_bio_600_sin_desengrasante',
          label: 'Combo Bio 600L (Sin desengrasante)',
          description: 'Biodigestor 600L + Séptica 600L + Kit Cámara Inspección + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 424405,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio600, 274900, 15),
            ...createDiscountedComboItem(pSep600, 151900, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        },
        {
          id: 'combo_bio_750_sin_desengrasante',
          label: 'Combo Bio 750L (Sin desengrasante)',
          description: 'Biodigestor 750L + Séptica 750L + Kit Cámara Inspección + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 461550,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio750, 303800, 15),
            ...createDiscountedComboItem(pSep750, 166700, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        },
        {
          id: 'combo_bio_1000_sin_desengrasante',
          label: 'Combo Bio 1000L (Sin desengrasante)',
          description: 'Biodigestor 1000L + Séptica 1000L + Kit Cámara Inspección + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 535330,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio1000, 336300, 15),
            ...createDiscountedComboItem(pSep1000, 221000, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        },
        {
          id: 'combo_bio_3000_sin_desengrasante',
          label: 'Combo Bio 3000L (Sin desengrasante)',
          description: 'Biodigestor 3000L + Séptica 3000L + Kit Cámara Inspección + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 1291405,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio3000, 851800, 15),
            ...createDiscountedComboItem(pSep3000, 595000, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        },
        {
          id: 'combo_autolimpiante_completo',
          label: 'Combo Autolimpiable 700L (Sin desengrasante)',
          description: 'Biodigestor Autolimpiante 700L + Reg. Lodos + Kit Cámara + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 525980,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBioAuto700, 489600, 15),
            ...createDiscountedComboItem(pRegLodos, 56700, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15)
          ]
        }
      ]
    },
    {
      id: 'combos_desengrasadora',
      name: 'Combos con Desengrasadora',
      description: 'Kits completos BioFort con Cámara Desengrasante c/ Canasto (15% OFF)',
      badgeColor: 'bg-emerald-600 text-white',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
      isActive: true,
      items: [
        {
          id: 'combo_bio_500_con_desengrasante',
          label: 'Combo Bio 500L (Con desengrasadora)',
          description: 'Biodigestor 500L + Séptica 500L + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 481100,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio500, 258600, 15),
            ...createDiscountedComboItem(pSep500, 129900, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        },
        {
          id: 'combo_bio_600_con_desengrasante',
          label: 'Combo Bio 600L (Con desengrasadora)',
          description: 'Biodigestor 600L + Séptica 600L + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 513655,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio600, 274900, 15),
            ...createDiscountedComboItem(pSep600, 151900, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        },
        {
          id: 'combo_bio_750_con_desengrasante',
          label: 'Combo Bio 750L (Con desengrasadora)',
          description: 'Biodigestor 750L + Séptica 750L + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 550800,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio750, 303800, 15),
            ...createDiscountedComboItem(pSep750, 166700, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        },
        {
          id: 'combo_bio_1000_con_desengrasante',
          label: 'Combo Bio 1000L (Con desengrasadora)',
          description: 'Biodigestor 1000L + Séptica 1000L + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 624580,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio1000, 336300, 15),
            ...createDiscountedComboItem(pSep1000, 221000, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        },
        {
          id: 'combo_bio_3000_con_desengrasante',
          label: 'Combo Bio 3000L (Con desengrasadora)',
          description: 'Biodigestor 3000L + Séptica 3000L + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 1380655,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBio3000, 851800, 15),
            ...createDiscountedComboItem(pSep3000, 595000, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        },
        {
          id: 'combo_autolimpiable_700_con_desengrasante',
          label: 'Combo Autolimpiable 700L (Con desengrasadora)',
          description: 'Biodigestor Autolimpiante 700L + Reg. Lodos + Kit Cámara + Cám. Desengrasante c/canasto + Biolam (15% OFF)',
          badge: 'Combo 15% OFF',
          imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          price: 615230,
          isCombo: true,
          comboItems: [
            ...createDiscountedComboItem(pBioAuto700, 489600, 15),
            ...createDiscountedComboItem(pRegLodos, 56700, 15),
            ...createDiscountedComboItem(pInspeccion, 54000, 15),
            ...createDiscountedComboItem(pBiolam, 18500, 15),
            ...createDiscountedComboItem(pDesengrasadora, 105000, 15)
          ]
        }
      ]
    },
    {
      id: 'individuales',
      name: 'Biodigestores y Cámaras Individuales',
      description: 'Tanques Biodigestores, Cámaras Sépticas y Desengrasadoras unitarias',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
      isActive: true,
      items: bioIndividuales.map(prod => {
        const litros = extractLitros(prod.name);
        return {
          id: `item_${prod.id}`,
          label: prod.name,
          description: prod.name,
          badge: litros > 0 ? `${litros}L` : undefined,
          imageUrl: prod.image_url || 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/0.4963342225093239.webp',
          isActive: true,
          productId: prod.id
        };
      })
    }
  ];

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    showItemImages: true,
    itemsViewMode: 'grid',
    families: [
      {
        id: 'tanques',
        name: 'Tanques de Agua',
        description: 'Tricapa Gris, Beige, Cuatricapa y Bicapa en todos los litrajes',
        imageUrl: DEFAULT_FAMILY_IMAGES.tanques,
        isActive: true,
        subgroups: tanquesSubgroups
      },
      {
        id: 'termotanques',
        name: 'Termotanques',
        description: 'Líneas Universal y Cooper de alto rendimiento',
        imageUrl: DEFAULT_FAMILY_IMAGES.termotanques,
        isActive: true,
        subgroups: termoSubgroups
      },
      {
        id: 'biodigestores',
        name: 'Biodigestores BioFort',
        description: 'Sistemas sépticos individuales y combos completos',
        imageUrl: DEFAULT_FAMILY_IMAGES.biodigestores,
        isActive: true,
        subgroups: bioSubgroups
      }
    ]
  };
}
