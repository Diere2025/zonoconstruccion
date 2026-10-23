export interface CategoryOrderItem {
  name?: string;
  product_name?: string;
  sku?: string;
  category?: string;
  quantity: number;
  customPrice?: number | null;
  unit_price?: number | string | null;
  unitPrice?: number | null;
  isIncludedInKit?: boolean;
}

export function hasBiofortInstallation(items: CategoryOrderItem[]): boolean {
  return items.some(item => {
    const full = `${item.name || item.product_name || ""} ${item.sku || ""} ${item.category || ""}`.toLowerCase();
    return item.quantity > 0 && (full.includes("instalaci") || full.includes("mano de obra")) &&
      /biofort|biodigestor|séptic|septic/.test(full);
  });
}

export function hasBiodigestor(items: CategoryOrderItem[]): boolean {
  const installation = hasBiofortInstallation(items);
  return items.some(item => {
    const full = `${item.name || item.product_name || ""} ${item.sku || ""}`.toLowerCase();
    const price = item.customPrice ?? item.unit_price ?? item.unitPrice;
    // Kit components at $0 belong to the installation, not a separate sale.
    const included = installation && (item.isIncludedInKit === true || (price != null && Number(price) === 0));
    const physicalBiodigestor = /\bbiodigestor(?:es)?\b/.test(full) ||
      (/\bbiofort\b/.test(full) && /\bautolimpi(?:able|ante)\b/.test(full));
    return !included && item.quantity > 0 && physicalBiodigestor &&
      !/descuento|bonificaci|instalaci|mano de obra|\bcono\b/.test(full);
  });
}

export function resolveOrderCategory(items: CategoryOrderItem[], requested?: string | null): string {
  const priority = detectVolumeOrderCategory(items);
  if (priority) return priority;
  return requested?.trim() && requested !== "auto" ? requested.trim() : detectOrderCategory(items);
}

/** Prioridades de volumen logístico acordadas; no se comparan litros con kg ni accesorios por cantidad. */
export function detectVolumeOrderCategory(items: CategoryOrderItem[]): string | null {
  if (hasBiodigestor(items)) return "BIODIGESTOR";
  if (hasBiofortInstallation(items)) return "INSTALACIÓN BIOFORT";
  const names = items.filter(item => item.quantity > 0).map(item =>
    `${item.name || item.product_name || ""} ${item.sku || ""}`.toLowerCase());
  // Un tanque físico prevalece sobre membranas y accesorios de plomería/pintura.
  // La capacidad y las exclusiones evitan confundir filtros, bases o termotanques con tanques.
  if (names.some(full => /aquafort|\btanque\b|\bcisterna\b/.test(full) &&
    /\d+(?:[.,]\d+)?\s*(?:l\b|litros?\b)/.test(full) &&
    !/termotanque|descuento|bonificaci|instalaci|mano de obra|\bbase\b|flotante|flotador|filtro|autom[aá]tico|\btapa\b|\bcaño\b/.test(full))) return "TANQUES";

  const mep = (full: string) => /equilibrio|\bmeps?\b|revestimiento|membrana/.test(full) &&
    !/rollo|asfalt|aluflex|megaflex|descuento|bonificaci/.test(full);
  const applicationAccessory = (full: string) => /\brodillo\b|\bpincel\b|\bvenda\b/.test(full);
  // Regla acotada al caso aprobado: membrana/revestimiento con sus accesorios.
  // Pedidos con otros productos siguen pendientes de una regla específica.
  if (names.some(mep) && names.every(full => mep(full) || applicationAccessory(full))) return "MEP";
  return null;
}

export function detectOrderCategory(orderItems: CategoryOrderItem[]): string {
  if (orderItems.length === 0) return "OTRO";
  const priority = detectVolumeOrderCategory(orderItems);
  if (priority) return priority;

  let termotanqueCount = 0;
  let tanquesCount = 0;
  let biofortCount = 0;
  let instalacionBiofortCount = 0;
  let mepCount = 0;
  let rolloMembranaCount = 0;
  let latexCount = 0;
  let baseCount = 0;
  let escalerasCount = 0;
  let colombraroCount = 0;
  let herramientasCount = 0;
  let otrosCount = 0;

  orderItems.forEach(item => {
    const nameLower = (item.name || item.product_name || "").toLowerCase();
    const skuLower = (item.sku || "").toLowerCase();
    const full = `${nameLower} ${skuLower}`;

    if (full.includes("instalaci") || full.includes("mano de obra")) {
      instalacionBiofortCount += item.quantity;
    } else if (full.includes("termotanque") || full.includes("termo")) {
      termotanqueCount += item.quantity;
    } else if (full.includes("biodigestor") || full.includes("septic") || full.includes("séptic") || full.includes("desengrasadora") || full.includes("lodos") || full.includes("biofort")) {
      biofortCount += item.quantity;
    } else if (full.includes("base hierro") || (full.includes("base") && !full.includes("tanque") && !full.includes("revestimiento"))) {
      baseCount += item.quantity;
    } else if (full.includes("aquafort") || full.includes("tanque") || full.includes("flotante") || full.includes("flotador") || full.includes("bicapa") || full.includes("tricapa") || full.includes("cuatricapa") || full.includes("cisterna")) {
      tanquesCount += item.quantity;
    } else if (full.includes("rollo") || full.includes("asfalt") || full.includes("aluflex") || full.includes("megaflex") || full.includes("membrana en rollo")) {
      rolloMembranaCount += item.quantity;
    } else if (full.includes("látex") || full.includes("latex") || full.includes("bianca") || full.includes("andina")) {
      latexCount += item.quantity;
    } else if (full.includes("meps") || full.includes("mep") || full.includes("equilibrio") || full.includes("revestimiento") || full.includes("membrana")) {
      mepCount += item.quantity;
    } else if (full.includes("escalera")) {
      escalerasCount += item.quantity;
    } else if (full.includes("colombraro")) {
      colombraroCount += item.quantity;
    } else if (full.includes("kld") || full.includes("caterpillar") || full.includes("herramienta") || full.includes("morsa") || full.includes("taladro") || full.includes("amoladora")) {
      herramientasCount += item.quantity;
    } else {
      otrosCount += item.quantity;
    }
  });

  const counts = [
    { cat: "TANQUES", count: tanquesCount },
    { cat: "TERMOTANQUES", count: termotanqueCount },
    { cat: "BIODIGESTOR", count: biofortCount },
    { cat: "INSTALACIÓN BIOFORT", count: instalacionBiofortCount },
    { cat: "BASE", count: baseCount },
    { cat: "LATEX", count: latexCount },
    { cat: "ROLLO MEMBRANA", count: rolloMembranaCount },
    { cat: "MEP", count: mepCount },
    { cat: "ESCALERAS", count: escalerasCount },
    { cat: "COLOMBRARO", count: colombraroCount },
    { cat: "HERRAMIENTAS ELÉCTRICAS", count: herramientasCount },
    { cat: "OTRO", count: otrosCount }
  ];

  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].cat : "OTRO";
}
