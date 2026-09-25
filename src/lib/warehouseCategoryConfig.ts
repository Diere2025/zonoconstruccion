export const WAREHOUSE_CATEGORY_SETTING_ID = 'logistics_warehouse_categories';
export const DEFAULT_PRINT_CATEGORIES = ['Tanques de agua', 'Biodigestores y saneamiento', 'Pinturas', 'Accesorios', 'Termotanques', 'Sin categoría'];

export interface WarehouseCategoryConfig {
  categories: string[];
  assignments: Record<string, string>;
  classificationVersion: number;
}

const REQUESTED_CATEGORY_GROUPS = ['Termofusión', 'Accesorios pintura', 'Grifería y Sanitarios', 'Bombas y Herramientas', 'Awaduct / PVC'];

export function warehouseProductKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function isCategorizationProduct(name: string): boolean {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  return !!name.trim()
    && !/descuento|bonificaci/.test(normalized)
    && !/\bkit\b.*\binstalacion\b.*\bbiodigestor(?:es)?\b/.test(normalized);
}

export function categorizationSku(product: { sku?: unknown; name?: unknown }): string {
  const sku = typeof product.sku === 'string' ? product.sku.trim() : '';
  const name = typeof product.name === 'string' ? product.name : '';
  return isCategorizationProduct(sku) && (!name || isCategorizationProduct(name)) ? sku : '';
}

export function warehouseCategoryAssignments(value: unknown): Record<string, string> {
  const source = value && typeof value === 'object' && 'assignments' in value ? value.assignments : null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(Object.entries(source)
    .filter(([key, category]) => key.length <= 240 && typeof category === 'string' && category.trim().length > 0 && category.trim().length <= 80)
    .map(([key, category]) => [warehouseProductKey(key), (category as string).trim()]));
}

export function warehouseCategory(name: string): string {
  const requested = warehouseCategoryRule(name);
  if (requested) return requested;
  const product = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  if (/pincel|pinceleta|rodillo|bandeja pintor|espatula|brocha/.test(product)) return 'Accesorios pintura';
  if (/^awaduct\b/.test(product)) return 'Awaduct / PVC';
  if (/flotante|base hierro|filtro|repuesto|accesorio|kit camara|camara de inspeccion/.test(product)) return 'Accesorios';
  if (/termotanque/.test(product)) return 'Termotanques';
  if (/biodigest|biofort|septica|desengrasadora/.test(product)) return 'Biodigestores y saneamiento';
  if (/aquafort|tanque|cisterna/.test(product)) return 'Tanques de agua';
  if (/pintura|latex|membrana|mep|equilibrio/.test(product)) return 'Pinturas';
  return 'Sin categoría';
}

export function warehouseCategoryRule(name: string): string | null {
  const product = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  if (/\btf\b|termofusion/.test(product)) return 'Termofusión';
  if (/entonador|\blija(?:s)?\b|\bvenda(?:s)?\b|pincel|pinceleta|rodillo|bandeja pintor|espatula|brocha/.test(product)) return 'Accesorios pintura';
  if (/\bfw\b|\bgm\b|griferia|sanitario|inodoro|lavatorio|bidet|monocomando/.test(product)) return 'Grifería y Sanitarios';
  if (/\bpvc\b/.test(product)) return 'Awaduct / PVC';
  if (/lusqtoff|konan|omaha|\bbomba(?:s)?\b|presurizador|hidrolavadora|amoladora|taladro|atornillador|caladora|ingletadora|lijadora|sierra|compresor|soldadora|perforadora|herramienta/.test(product)) return 'Bombas y Herramientas';
  return null;
}

function configuredCategory(category: string, categories: string[]): string {
  const normalized = category.toLocaleLowerCase('es');
  return categories.find(existing => {
    const key = existing.toLocaleLowerCase('es');
    return key === normalized || (category === 'Accesorios pintura' && key === 'accesorios de pintura');
  }) || category;
}

export function resolveWarehouseCategory(name: string, config: WarehouseCategoryConfig): string {
  const rule = warehouseCategoryRule(name);
  if (rule && config.classificationVersion < 1) return configuredCategory(rule, config.categories);
  const assigned = config.assignments[warehouseProductKey(name)];
  if (assigned && config.categories.includes(assigned)) return assigned;
  const suggested = warehouseCategory(name);
  const resolved = configuredCategory(suggested, config.categories);
  return config.categories.includes(resolved) ? resolved : 'Sin categoría';
}

export function warehouseCategoryConfig(value: unknown): WarehouseCategoryConfig {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const classificationVersion = source.classificationVersion === 1 ? 1 : 0;
  const rawCategories = Array.isArray(source.categories) ? source.categories : DEFAULT_PRINT_CATEGORIES;
  const categories = Array.from(new Set(rawCategories
    .filter((category): category is string => typeof category === 'string')
    .map(category => category.trim())
    .filter(category => category.length > 0 && category.length <= 80)));
  const assignments = warehouseCategoryAssignments(source);
  // Old records contained assignments but no category list. Retain their labels.
  for (const category of Object.values(assignments)) {
    if (!categories.some(existing => existing.toLocaleLowerCase('es') === category.toLocaleLowerCase('es'))) categories.push(category);
  }
  if (classificationVersion < 1) {
    for (const category of REQUESTED_CATEGORY_GROUPS) {
      if (!categories.includes(configuredCategory(category, categories))) {
        const uncategorizedIndex = categories.indexOf('Sin categoría');
        categories.splice(uncategorizedIndex < 0 ? categories.length : uncategorizedIndex, 0, category);
      }
    }
  }
  if (!categories.includes('Sin categoría')) categories.push('Sin categoría');
  return { categories, assignments, classificationVersion };
}
