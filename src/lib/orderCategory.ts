export interface CategoryOrderItem {
  name?: string;
  product_name?: string;
  sku?: string;
  category?: string;
  quantity: number;
}

export function hasBiodigestor(items: CategoryOrderItem[]): boolean {
  return items.some(item => {
    const full = `${item.name || item.product_name || ""} ${item.sku || ""}`.toLowerCase();
    return item.quantity > 0 && /\bbiodigestor(?:es)?\b/.test(full) &&
      !/descuento|bonificaci|instalaci|mano de obra|\bcono\b/.test(full);
  });
}

export function resolveOrderCategory(items: CategoryOrderItem[], requested?: string | null): string {
  if (hasBiodigestor(items)) return "BIODIGESTOR";
  return requested?.trim() && requested !== "auto" ? requested.trim() : detectOrderCategory(items);
}

export function detectOrderCategory(orderItems: CategoryOrderItem[]): string {
  if (orderItems.length === 0) return "OTRO";
  // Volumen y facturación se atribuyen al biodigestor, cualquiera sea el resto del pedido.
  if (hasBiodigestor(orderItems)) return "BIODIGESTOR";

  // A complete BioFort installation contains many $0 accessories. Its category
  // must be defined by the installation item, not by the most numerous accessory.
  const hasBiofortInstallation = orderItems.some(item => {
    const full = `${item.name || item.product_name || ""} ${item.sku || ""} ${item.category || ""}`.toLowerCase();
    const isInstallation = full.includes("instalaci") || full.includes("mano de obra");
    const isBiofort = full.includes("biofort") || full.includes("biodigestor") || full.includes("séptic") || full.includes("septic");
    return isInstallation && isBiofort;
  });
  if (hasBiofortInstallation) return "INSTALACIÓN BIOFORT";

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
