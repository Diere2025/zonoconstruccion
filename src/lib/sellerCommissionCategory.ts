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
