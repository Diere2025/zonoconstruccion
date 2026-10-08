const installationServices = new Set([
  'Kit Instalación Biodigestor Convencional 500L',
  'Adicionales Instalación Biofort',
  'Terminación Instalación Biofort',
].map(name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));

export function isServiceProduct(product: { name?: string | null; is_service?: boolean | null }): boolean {
  const name = (product.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return product.is_service === true || /^kit instalacion\b/.test(name) || installationServices.has(name);
}
