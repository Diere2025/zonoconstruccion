import { Product } from '@/types';

export interface VisualOptionAddon {
  id: string;
  name: string;
  productId: string;
  defaultSelected?: boolean;
}

export interface VisualItemOption {
  id: string;
  label: string;
  description?: string;
  badge?: string; // e.g. "Slim", "Chato", "Oferta", "Más Vendido"
  imageUrl?: string;
  isActive: boolean;
  
  // Single product link
  productId?: string;
  allowCiego?: boolean;
  ciegoProductId?: string;

  // Combo bundle (multiple products in 1 click)
  isCombo?: boolean;
  comboItems?: Array<{
    productId: string;
    quantity: number;
  }>;

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

  // --- BIODIGESTORES ---
  const bioCombos = activeProducts.filter(p => {
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    const isBio = text.includes('biodigestor') || text.includes('séptic') || text.includes('septic') || text.includes('biofort');
    return isBio && (text.includes('kit') || text.includes('combo') || text.includes('instalaci') || text.includes('adicionales'));
  });

  const bioIndividuales = activeProducts.filter(p => {
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    const isBio = text.includes('biodigestor') || text.includes('séptic') || text.includes('septic') || text.includes('biofort') || text.includes('desengrasadora') || text.includes('lodos');
    return isBio && !text.includes('kit') && !text.includes('combo') && !text.includes('instalaci');
  });

  const bioSubgroups: VisualSubGroup[] = [
    {
      id: 'combos',
      name: 'Combos y Kits de Instalación',
      description: 'Kits completos con accesorios e insumos',
      imageUrl: 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/products/0.9509750112986566.png',
      isActive: true,
      items: bioCombos.map(prod => ({
        id: `item_${prod.id}`,
        label: prod.name,
        description: prod.name,
        badge: 'Combo',
        imageUrl: prod.image_url || 'https://ckvbyfgsbjbfaqotmeld.supabase.co/storage/v1/object/public/product-images/products/0.9509750112986566.png',
        isActive: true,
        productId: prod.id,
        isCombo: true
      }))
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
    showItemImages: false,
    itemsViewMode: 'list',
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
