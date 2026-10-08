export function normalizeCommissionCategory(rawCat?: string): string {
  const c = (rawCat || '').trim();
  const lower = c.toLowerCase();
  if (lower.includes('instalaci') || lower.includes('colocaci')) return 'Instalaciones';
  // Termotanques must be checked before the broader "tanque" match.
  if (lower.includes('termotanque')) return 'Termotanques';
  if (lower.includes('tanque') || lower.includes('cisterna')) return 'Tanques de Agua';
  if (lower.includes('biodigestor') || lower.includes('séptica') || lower.includes('septica') || lower.includes('desengrasadora')) return 'Biodigestores';
  if (lower.includes('membrana') || lower.includes('meps')) return 'MEPS';
  if (lower.includes('pintura')) return 'Pinturas';
  if (lower.includes('herramienta')) return 'Herramientas';
  if (lower.includes('termofusión') || lower.includes('termofusion') || lower.includes('caño')) return 'Caños Termofusión';
  if (lower.includes('escalera')) return 'Escaleras';
  if (lower.includes('insumo')) return 'Insumos';
  if (c && c !== 'otro' && c !== 'Otros' && c !== 'Interno') return c;
  return 'Otros';
}

export function resolveCommissionProductCategory(name: string, productCategory?: string, orderCategory?: string): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('adicional') && n.includes('instalacion') && n.includes('biofort')) return 'Adicionales sin comisión';
  if (n.includes('instalaci') || n.includes('colocaci')) return 'Instalaciones';
  if (n.includes('konan') && (n.includes('bomba') || n.includes('kbp12'))) return 'Herramientas';
  if (n.includes('equilibrio') && (n.includes('membrana techos') || /mep\s+frentes/.test(n))) return 'Pinturas';
  if (/^biolam\b/.test(n)) return 'Biodigestores';
  if (/^wp\b/.test(n)) return /tanque|cisterna/.test(n) ? 'Tanques de Agua' : 'Biodigestores';
  return normalizeCommissionCategory(productCategory || orderCategory);
}
