// Canonical products and normalizers for Google Sheets (DATABASE!A:A)

export const VALID_SHEET_PRODUCTS: readonly string[] = [
  "ANDINA - LATEX BIANCA INT EXT CHOCOLATE 4L",
  "ANDINA - LATEX BIANCA INT EXT GRIS CEMENTO 4L",
  "ANDINA - LATEX BIANCA INT EXT NEGRO 4L",
  "ANDINA - LATEX BIANCA INT EXT TURQUESA 4L",
  "ANDINA - LATEX BIANCA INT EXT VIOLETA 4L",
  "AUTOMATICO TANQUE/CISTERNA - MP (1,5m)",
  "Adicionales Instalación Biofort",
  "AquaFort - BIC (Slim) 500L",
  "AquaFort - BIC (Slim) 500L (CIEGO)",
  "AquaFort - BIC 1000L",
  "AquaFort - BIC 1000L (CIEGO)",
  "AquaFort - BIC 1200L",
  "AquaFort - BIC 300L",
  "AquaFort - BIC 300L (CIEGO)",
  "AquaFort - BIC 500L",
  "AquaFort - BIC 500L (CIEGO)",
  "AquaFort - BIC 600L",
  "AquaFort - BIC 600L (CIEGO)",
  "AquaFort - BIC 750L",
  "AquaFort - BIC 750L (CIEGO)",
  "AquaFort - CISTERNA (Slim) 500L",
  "AquaFort - CISTERNA 1000L",
  "AquaFort - CISTERNA 3000L",
  "AquaFort - CISTERNA 300L",
  "AquaFort - CISTERNA 500L",
  "AquaFort - CISTERNA 600L",
  "AquaFort - CISTERNA 750L",
  "AquaFort - CUATR (Slim) 500L",
  "AquaFort - CUATR (Slim) 500L (CIEGO)",
  "AquaFort - CUATR 1000L",
  "AquaFort - CUATR 1000L (CIEGO)",
  "AquaFort - CUATR 1200L",
  "AquaFort - CUATR 3000L",
  "AquaFort - CUATR 3000L (CIEGO)",
  "AquaFort - CUATR 500L",
  "AquaFort - CUATR 500L (CIEGO)",
  "AquaFort - CUATR 600L",
  "AquaFort - CUATR 600L (CIEGO)",
  "AquaFort - CUATR 750L",
  "AquaFort - CUATR 750L (CIEGO)",
  "AquaFort - CUATR 750L Beige",
  "AquaFort - Chato BIC 1000L",
  "AquaFort - Chato BIC 1000L (CIEGO)",
  "AquaFort - Chato CUATR 1000L",
  "AquaFort - Chato CUATR 1000L (CIEGO)",
  "AquaFort - Chato TRIC 1000L Beige",
  "AquaFort - Chato TRIC 1000L Beige (CIEGO)",
  "AquaFort - Chato TRIC 1000L Gris",
  "AquaFort - Chato TRIC 1000L Gris (CIEGO)",
  "AquaFort - Chato TRIC 700L Beige",
  "AquaFort - Chato TRIC 700L Beige (CIEGO)",
  "AquaFort - TAPA T FIBROCEMENTO 1,07cm",
  "AquaFort - TRIC (Slim) 500L Beige",
  "AquaFort - TRIC (Slim) 500L Beige (CIEGO)",
  "AquaFort - TRIC (Slim) 500L Gris",
  "AquaFort - TRIC (Slim) 500L Gris (CIEGO)",
  "AquaFort - TRIC 1000L Beige",
  "AquaFort - TRIC 1000L Beige (CIEGO)",
  "AquaFort - TRIC 1000L Gris",
  "AquaFort - TRIC 1000L Gris (CIEGO)",
  "AquaFort - TRIC 1200L Beige",
  "AquaFort - TRIC 1200L Gris",
  "AquaFort - TRIC 2000L Beige",
  "AquaFort - TRIC 2000L Beige (CIEGO)",
  "AquaFort - TRIC 3000L Beige",
  "AquaFort - TRIC 3000L Beige (CIEGO)",
  "AquaFort - TRIC 300L Beige",
  "AquaFort - TRIC 300L Beige (CIEGO)",
  "AquaFort - TRIC 300L Gris",
  "AquaFort - TRIC 300L Gris (CIEGO)",
  "AquaFort - TRIC 400L Gris (CIEGO)",
  "AquaFort - TRIC 500L Beige",
  "AquaFort - TRIC 500L Beige (CIEGO)",
  "AquaFort - TRIC 500L Gris",
  "AquaFort - TRIC 500L Gris (CIEGO)",
  "AquaFort - TRIC 600L Beige",
  "AquaFort - TRIC 600L Beige (CIEGO)",
  "AquaFort - TRIC 600L Gris",
  "AquaFort - TRIC 600L Gris (CIEGO)",
  "AquaFort - TRIC 750L Beige",
  "AquaFort - TRIC 750L Beige (CIEGO)",
  "AquaFort - TRIC 750L Gris",
  "AquaFort - TRIC 750L Gris (CIEGO)",
  "Awaduct - Buje 50mm con reduccion  1” ½",
  "Awaduct - Caño 110 4mts",
  "Awaduct - Caño 50mm 4mts",
  "Awaduct - Caño 63mm 4mts",
  "Awaduct - Codo 110 HH 90°",
  "Awaduct - Codo 110 MH 45°",
  "Awaduct - Codo 110 MH 90°",
  "Awaduct - Cupla 1 1/2 HH",
  "Awaduct - Cupla 110",
  "Awaduct - Cupla 50mm",
  "Awaduct - Cupla 63mm",
  "Awaduct - Curva de 90° 63mm MH",
  "Awaduct - Entrerosca 1",
  "Awaduct - Ramal T 110",
  "Awaduct - Ramal T 50mm",
  "Awaduct - Ramal T hhh 50mm",
  "Awaduct - Reduccion 1 1/2 Macho",
  "Awaduct - Reduccion de 110 a 63mm",
  "Awaduct - Sombrero 110",
  "Awaduct - Tapa 50mm",
  "Awaduct - Tapa 63mm",
  "Bandeja Pintor",
  "Base Hierro Reforzada 102 cms",
  "Base Hierro Reforzada 145 cms",
  "Base Hierro Reforzada 74 cms",
  "Base Hierro Reforzada 85 cms",
  "BioFort - Autolimpiable 700L",
  "BioFort - Biodigestor 1000L",
  "BioFort - Biodigestor 3000L",
  "BioFort - Biodigestor 500L",
  "BioFort - Biodigestor 600L",
  "BioFort - Biodigestor 750L",
  "BioFort - Desengrasadora  3000L",
  "BioFort - Desengrasadora 1000L",
  "BioFort - Desengrasadora 300L",
  "BioFort - Desengrasadora 500L",
  "BioFort - Desengrasadora 600L",
  "BioFort - Desengrasadora 70L (C110)",
  "BioFort - Desengrasadora 70L (C50)",
  "BioFort - Desengrasadora 750L",
  "BioFort - Registro Lodos",
  "BioFort - Séptica 1000L",
  "BioFort - Séptica 3000L",
  "BioFort - Séptica 300L",
  "BioFort - Séptica 500L",
  "BioFort - Séptica 600L",
  "BioFort - Séptica 750L",
  "Biolam - Concentrado Enzimático 500g",
  "Bomba Presurizadora Konan 120W – 25 L/min – 2 Baños",
  "Brida",
  "Cartucho Repuesto para Filtro (F95) Universal",
  "Caterpillar - Cargador / Mantenedor de Batería 6-12V (CATCB1500)",
  "Caño PVC 110mm 4m",
  "Colombraro - Cesto Ratan Grande Blanco (955)",
  "Colombraro - Cesto Ratan Mediano Blanco (954)",
  "Colombraro - Col Tap N.2 p/alimentos  15x15x8cm Azul (3622)",
  "Colombraro - Col Tap N.5 p/alimentos 30x15x8cm c/rejilla  Azul  (3625)",
  "Colombraro - Mesa Country Rectangular Blanca (4316)",
  "Colombraro - Mesa Country Rectangular Negra (4316)",
  "Colombraro - Posapies Country Beige (4409)",
  "Colombraro - Posapies Country Blanco (4409)",
  "Colombraro - Posapies Country Celeste (4409)",
  "Colombraro - Posapies Country Naranja (4409)",
  "Colombraro - Posapies Country Negro (4409)",
  "Colombraro - Posapies Country Verde (4409)",
  "Colombraro - Posapies Country Violeta (4409)",
  "Colombraro - Tapa Cesto Ratan Mediano Blanco (1956)",
  "Colombraro - Tapa Cesto Ratan Rectangular Blanco (6079)",
  "Colombraro - Tapa Cesto Ratan Rectangular Negro (6079)",
  "Cono Biodigestor",
  "Cooper - Termotanque ELÉCTRICO 100L (TCE100) Sup/Inf",
  "Cooper - Termotanque ELÉCTRICO 25L (TCE25) Sup/Inf",
  "Cooper - Termotanque ELÉCTRICO 50L (TCE50) Sup/Inf",
  "Cooper - Termotanque ELÉCTRICO 80L (TCE80) Sup/Inf",
  "Daewoo - Bomba Presurizadora 9M (DAEPRES100)",
  "Daewoo - Compresor 2HP 24L (DAC24D)",
  "Daewoo - Sierra Ingletedora (DAMS255C)",
  "Descuento - Barniz",
  "Descuento - Bombas",
  "Descuento - Color 4L",
  "Descuento - Combo Latex / MEP Enduído Fijador",
  "Descuento - Enduido",
  "Descuento - Escaleras",
  "Descuento - Fijador",
  "Descuento - MEP x12",
  "Descuento - MEP x2",
  "Descuento - MEP x3",
  "Descuento - MEP x6",
  "Descuento Accesorios Tanques",
  "Descuento Cliente Socio",
  "Descuento Combo Biodigestor",
  "Descuento Compra Mayorista",
  "Descuento Pack pintor 1",
  "Descuento Pack pintor 2",
  "Descuento Pack pintor 3",
  "Descuento Pack pintor 4",
  "ENTONADOR-UNIVERSAL 120CC AMARILLO",
  "ENTONADOR-UNIVERSAL 120CC AZUL",
  "ENTONADOR-UNIVERSAL 120CC BERMELLÓN",
  "ENTONADOR-UNIVERSAL 120CC CEDRO",
  "ENTONADOR-UNIVERSAL 120CC MARRÓN",
  "ENTONADOR-UNIVERSAL 120CC NARANJA",
  "ENTONADOR-UNIVERSAL 120CC NEGRO",
  "ENTONADOR-UNIVERSAL 120CC OCRE",
  "ENTONADOR-UNIVERSAL 120CC SIENA",
  "ENTONADOR-UNIVERSAL 120CC VERDE CLARO",
  "ENTONADOR-UNIVERSAL 120CC VERDE OSCURO",
  "ENTONADOR-UNIVERSAL 30CC CEDRO",
  "Entonador de regalo",
  "Equilibrio - Pintura Piso Deportivo Azul 10L",
  "Equilibrio Enduído Int /Ext (10L)",
  "Equilibrio Enduído Int /Ext (20L)",
  "Equilibrio Enduído Int /Ext (4L)",
  "Equilibrio Fijador Sellador (10L)",
  "Equilibrio Fijador Sellador (20L)",
  "Equilibrio Fijador Sellador (4L)",
  "Equilibrio MEP FRENTES Beige (10Kg)",
  "Equilibrio MEP FRENTES Beige (20Kg)",
  "Equilibrio MEP FRENTES Gris (10Kg)",
  "Equilibrio MEP FRENTES Gris (20Kg)",
  "Equilibrio MEP FRENTES Rojo (10Kg)",
  "Equilibrio MEP FRENTES Rojo (20Kg)",
  "Equilibrio MEP FRENTES Verde (10Kg)",
  "Equilibrio MEP FRENTES Verde (20Kg)",
  "Equilibrio Membrana FRENTES Blanco (10Kg)",
  "Equilibrio Membrana FRENTES Blanco (20Kg)",
  "Equilibrio Membrana Techos Beige (10Kg)",
  "Equilibrio Membrana Techos Beige (20Kg)",
  "Equilibrio Membrana Techos Blanco (10Kg)",
  "Equilibrio Membrana Techos Blanco (20Kg)",
  "Equilibrio Membrana Techos Gris (10Kg)",
  "Equilibrio Membrana Techos Gris (20Kg)",
  "Equilibrio Membrana Techos Rojo (10Kg)",
  "Equilibrio Membrana Techos Rojo (20Kg)",
  "Equilibrio Membrana Techos Verde (10Kg)",
  "Equilibrio Membrana Techos Verde (20Kg)",
  "Equilibrio Sintético (3 en 1) Blanco 1L",
  "Equilibrio Sintético (3 en 1) Blanco 4L",
  "Equilibrio Sintético (3 en 1) Negro 1L",
  "Equilibrio Sintético (3 en 1) Negro 4L",
  "Extensor de Chapa 1.5 a 3M",
  "FW - 3311MB Lavatorio Rowe Negro Mate",
  "FW - 3312BM Bidet con transferencia Rowe Negro Mate",
  "FW - 3367 Griferia Pulse Negro Mate",
  "FW - SF222-0212-5 Bidet con Transferencia Flaming",
  "Filtro completo para Tanque (F95) Universal",
  "Flotante Completo Varilla Bronce Rao 1/2",
  "Flotante Completo Varilla Bronce Rao 3/4",
  "Flotante Eco Varilla Plástica 1/2\"",
  "GM AB/NA41 - Cocina de embutir",
  "GM IMLMB/CC10 BORGOÑA - Lavatorio Cabezal C/Ceramico",
  "GardenLife - Escalera Multifunción Alum 16 escalones (TE1700)",
  "Guante Moteado",
  "KLD - Llave Impacto Neumática 310nm y 16 Acc 4Vel (KLD3065)",
  "Kit Instalación Biodigestor Autolimpiante 700L",
  "Kit Instalación Biodigestor Convencional 1000L",
  "Kit Instalación Biodigestor Convencional 3000L",
  "Kit Instalación Biodigestor Convencional 500L",
  "Kit Instalación Biodigestor Convencional 600L",
  "Kit Instalación Biodigestor Convencional 750L",
  "Konan - Bomba Periferica 1/2 HP (KBP12)",
  "Lienzo - Látex Color BORGOÑA 4L",
  "Lienzo - Látex Color MARRON 4L",
  "Lija al Agua - G100",
  "Lija al Agua - G120",
  "Lija al Agua - G150",
  "Lija al Agua - G220",
  "Lija al Agua - G80",
  "Llave de Paso p/Pegar PVC 50mm",
  "Lusqtoff - Aerosol lubricante",
  "Lusqtoff - Bomba Presurizadora 8.5M -220V (LPS15-8.5Z)",
  "Lusqtoff - Yerbera (LY1L)",
  "MACETA + ESFERAS",
  "Metro líneal extra zanjeo",
  "Omaha - Bomba Presurizadora  2 Baños 100Wts (309.WRS-15)",
  "PVC - Caño 110 x 4 mts Blanco (C-110)",
  "PVC - Codo 110(CO-110)",
  "PVC - Cupla 110 (CU-110)",
  "PVC - Curva 45 De 110 Larga (C45L-110)",
  "PVC - Desengrasadora 3 Bocas (D3B)",
  "PVC - Embudo Vertical 110 (EV-110)",
  "PVC - Ramal 90 de 110 (R90-110)",
  "PVC - Reduccion 110 x 63 (R-110x63)",
  "Pincel N°15",
  "Pincel Profesional N°30",
  "Pinceleta N°40",
  "Pintura Asfáltica 4L",
  "Pluvius - Bomba autoaspirante 1/2 hp  (jet-60)",
  "Polacrin - Látex Lavable Interior Satinado 10L",
  "Polacrin Esmalte Triple Acción 4lts Negro Brillante",
  "Rodillo Simil Lana 22x40",
  "SIN SOBRANTES",
  "ST - Calefactor Convector (STCOT)",
  "ST - Estufa Halógena Fija (STH125)",
  "Sirena - Calefactor s/Salida 3000 kcal (CA3000)",
  "Sirena - Calefactor tiro balanceado 2400 kcal (TB2400)",
  "Sirena - Termotanque Eléctrico Inf/Sup 60L (TE60)",
  "Sirena - Termotanque Eléctrico Inf/Sup 90L (TE90)",
  "TALENTO MASILLA P/PLACA DE YESO (32Kg)",
  "TALENTO MASILLA P/PLACA DE YESO (6Kg)",
  "TAPA T FIBROCEMENTO 0,96cm",
  "TAPA T FIBROCEMENTO 1,07cm",
  "TAPA T FIBROCEMENTO 1,17cm",
  "TF - Buje 25 x 20 (B2520)",
  "TF - Buje 32 x 25 (B3225)",
  "TF - Caño fusion 20 mm x 4 metros 2,8 MM (CF2028)",
  "TF - Caño fusion 25 mm x 4 metros 3,4 MM (CF2534)",
  "TF - Caño fusion 32 mm x 4 metros 4,2 MM (CF3242)",
  "TF - Codo 20 mm 90° (C2090)",
  "TF - Codo 25 mm 90° (C2590)",
  "TF - Codo 32 mm 90° (C3290)",
  "TF - Codo c/inserto metalico hembra 1/2 x 20 mm (CIM1220)",
  "TF - Codo c/inserto metalico hembra 1/2 x 25 mm (CIM1225)",
  "TF - Codo c/inserto metalico hembra 3/4 x 25 mm (CIM3425)",
  "TF - Cupla 20 mm (CU20)",
  "TF - Cupla 25 mm (CU25)",
  "TF - Cupla 32 mm (CU32)",
  "TF - Cupla c/inserto metalico hembra 1/2 x 20 mm (CUIMH1220)",
  "TF - Cupla c/inserto metalico hembra 3/4 x 25 mm (CUIMH3425)",
  "TF - Cupla c/inserto metalico hembra 3/8 x 20 mm (CUIMH3820)",
  "TF - Cupla c/inserto metalico macho 1/2 x 20 mm (CUIMM1220)",
  "TF - Cupla c/inserto metalico macho 1/2 x 25 mm (CUIMM3820)",
  "TF - Cupla c/inserto metalico macho 3/4 x 25 mm (CUIMM3425)",
  "TF - Curva 90 20 mm (CUR9020)",
  "TF - Curva 90 25 mm (CUR9025)",
  "TF - Curva 90 32 mm (CUR9032)",
  "TF - IPS Llave esferica manija corta 20 (LEMC20)",
  "TF - IPS Llave esferica manija corta 32 (LEMC32)",
  "TF - Llave esferica manija corta 25 Metalica (LEMC25M)",
  "TF - Llave esferica manija corta 25 Plastica (LEMC25)",
  "TF - Llave paso 20 mm c/campana cabezal bron (LP20CB)",
  "TF - Llave paso 25 mm c/campana cabezal bron (LP25CB)",
  "TF - Llave paso 32 mm c/campana cabezal bron (LP32CB)",
  "TF - Sobrepaso corto 20 mm (SC20)",
  "TF - Sobrepaso corto 25 mm (SC25)",
  "TF - Tapa 20 mm (TA20)",
  "TF - Tapa 25 mm (TA25)",
  "TF - Tapa 32 mm (TA32)",
  "TF - Tee 20 mm (TEE20)",
  "TF - Tee 25 mm (TEE25)",
  "TF - Tee 32 mm (TEE32)",
  "TF - Tee c/inserto metalico hembra 1/2 x 20 mm (TEEIM1220)",
  "TF - Tee c/inserto metalico hembra 3/4 x 25 mm (TIM3425)",
  "TF - Union doble fusion fusion 20 mm (UDF20)",
  "TF - Union doble fusion fusion 25 mm (UDF25)",
  "TF - Union doble fusion fusion 32 mm (UDF32)",
  "Tacho Cámara/Bio 1000L",
  "Tacho Cámara/Bio 280L",
  "Tacho Cámara/Bio 3000L",
  "Tacho Cámara/Bio 300L",
  "Tacho Cámara/Bio 500L",
  "Tacho Cámara/Bio 550L",
  "Tacho Cámara/Bio 600L",
  "Tacho Cámara/Bio 750L",
  "Tacho Cónico 700L",
  "Talento - Membrana Techos Gris 20Kg",
  "Talento Enduido Int/Ext (4L)",
  "Talento Frentes 10L Blanco",
  "Tapa Click",
  "Tapa Rosca A",
  "Tapa Rosca C/ARO",
  "Tapa Rosca F",
  "Tornado - Bandeja de Pintor con escurridor",
  "Tornado - Cinta crepe (Adhesiva) 25MM X 50M",
  "Tornado - Cinta crepe (Adhesiva) 50MM X 50M",
  "Tornado - Llana Plástica 12x30",
  "Tornado - Sellador de Grietas y Fisuras 300cc",
  "TurboFlex 3/4\" x 40cm con rosca normal - Macho fijo",
  "TurboFlex 3/4\" x 60cm con rosca normal - Macho fijo",
  "Universal - Termotanque ELÉCTRICO 130L (TUE130) S. Superior",
  "Universal - Termotanque ELÉCTRICO 40L (TUE40) S. Superior",
  "Universal - Termotanque ELÉCTRICO 60L (TUE60) S. Superior",
  "Universal - Termotanque ELÉCTRICO 90L (TUE90) S. Superior",
  "Venda Premium 10CMx25M",
  "Venda Premium 1Mx25M",
  "Venda Premium 1Mx50M",
  "Venda Premium 20CMx25M",
  "WP - Camara Desengrasadora C/canasto",
  "WP Kit cámara de inspección CII",
  "Zono Látex Pro Lavable (20L)"
] as const;

function cleanString(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SHEET_PRODUCT_MAP = new Map<string, string>();
const SHEET_PRODUCT_CLEAN_MAP = new Map<string, string>();

VALID_SHEET_PRODUCTS.forEach(p => {
  SHEET_PRODUCT_MAP.set(p.toLowerCase().trim(), p);
  SHEET_PRODUCT_CLEAN_MAP.set(cleanString(p), p);
});

/**
 * Normalizes a product name and SKU to the exact canonical dropdown entry in Google Sheets (DATABASE!A:A).
 * Prioritizes SKU when the SKU corresponds to the sheet item (or when the name is generic/varios).
 */
export function normalizeProductNameForSheet(name: string, sku?: string): string {
  const trimmedName = (name || '').trim();
  const trimmedSku = (sku || '').trim();
  const lowerName = trimmedName.toLowerCase();
  const lowerSku = trimmedSku.toLowerCase();

  // 1. Descuentos y bonificaciones especiales de planilla
  if (lowerName.includes('descuento combo biodigestor') || lowerName.includes('descuento combo bio')) {
    return 'Descuento Combo Biodigestor';
  }
  if (lowerName.includes('descuento') && lowerName.includes('bomba')) {
    return 'Descuento - Bombas';
  }
  if (lowerName.includes('descuento') && (lowerName.includes('mayorista') || lowerName.includes('general') || lowerName.includes('pedido') || lowerName.includes('compra'))) {
    return 'Descuento Compra Mayorista';
  }
  if (lowerName.includes('descuento') && lowerName.includes('mep')) {
    if (lowerName.includes('x12') || lowerName.includes('12')) return 'Descuento - MEP x12';
    if (lowerName.includes('x6') || lowerName.includes('6')) return 'Descuento - MEP x6';
    if (lowerName.includes('x3') || lowerName.includes('3')) return 'Descuento - MEP x3';
    if (lowerName.includes('x2') || lowerName.includes('2')) return 'Descuento - MEP x2';
  }

  // 2. Coincidencia exacta con ítems válidos de planilla (DATABASE!A:A)
  // Verificar primero por SKU si es válido (no AUTO-):
  if (trimmedSku && !trimmedSku.startsWith('AUTO-')) {
    const skuMatch = SHEET_PRODUCT_MAP.get(lowerSku) || SHEET_PRODUCT_CLEAN_MAP.get(cleanString(trimmedSku));
    if (skuMatch) return skuMatch;
  }

  // Verificar por Nombre:
  if (trimmedName) {
    const nameMatch = SHEET_PRODUCT_MAP.get(lowerName) || SHEET_PRODUCT_CLEAN_MAP.get(cleanString(trimmedName));
    if (nameMatch) return nameMatch;
  }

  // 3. Reglas específicas históricas de normalización (Bases, Flotantes, TurboFlex, BioFort)
  if (lowerName.includes('base') || lowerSku.includes('base')) {
    if (lowerName.includes('74') || lowerSku.includes('74')) return 'Base Hierro Reforzada 74 cms';
    if (lowerName.includes('85') || lowerSku.includes('85')) return 'Base Hierro Reforzada 85 cms';
    if (lowerName.includes('102') || lowerSku.includes('102')) return 'Base Hierro Reforzada 102 cms';
    if (lowerName.includes('145') || lowerSku.includes('145')) return 'Base Hierro Reforzada 145 cms';
    if (trimmedSku && !trimmedSku.startsWith('AUTO-')) {
      const match = SHEET_PRODUCT_MAP.get(lowerSku) || SHEET_PRODUCT_CLEAN_MAP.get(cleanString(trimmedSku));
      if (match) return match;
      return trimmedSku;
    }
  }

  if (lowerName.includes('flotante') && lowerName.includes('eco') && (lowerName.includes('1/2') || lowerSku.includes('1/2'))) {
    return 'Flotante Eco Varilla Plástica 1/2"';
  }

  if (lowerName.includes('turboflex') && lowerName.includes('40cm')) {
    return 'TurboFlex 3/4" x 40cm con rosca normal - Macho fijo';
  }
  if (lowerName.includes('turboflex') && lowerName.includes('60cm')) {
    return 'TurboFlex 3/4" x 60cm con rosca normal - Macho fijo';
  }

  if (lowerName.includes('biodigestor') && !lowerName.includes('kit')) {
    if (lowerName.includes('500')) return 'BioFort - Biodigestor 500L';
    if (lowerName.includes('600')) return 'BioFort - Biodigestor 600L';
    if (lowerName.includes('750')) return 'BioFort - Biodigestor 750L';
    if (lowerName.includes('1000')) return 'BioFort - Biodigestor 1000L';
    if (lowerName.includes('3000')) return 'BioFort - Biodigestor 3000L';
  }
  if (lowerName.includes('autolimpiable') && lowerName.includes('700') && !lowerName.includes('kit')) {
    return 'BioFort - Autolimpiable 700L';
  }
  if (lowerName.includes('lodos')) {
    return 'BioFort - Registro Lodos';
  }
  if ((lowerName.includes('séptica') || lowerName.includes('septica')) && !lowerName.includes('kit')) {
    if (lowerName.includes('500')) return 'BioFort - Séptica 500L';
    if (lowerName.includes('600')) return 'BioFort - Séptica 600L';
    if (lowerName.includes('750')) return 'BioFort - Séptica 750L';
    if (lowerName.includes('1000')) return 'BioFort - Séptica 1000L';
    if (lowerName.includes('3000')) return 'BioFort - Séptica 3000L';
  }
  if (lowerName.includes('desengrasadora') && lowerName.includes('canasto')) {
    return 'WP - Camara Desengrasadora C/canasto';
  }
  if (lowerName.includes('cámara de inspección') || lowerName.includes('camara de inspeccion') || lowerName.includes('cii')) {
    return 'WP Kit cámara de inspección CII';
  }
  if (lowerName.includes('biolam')) {
    return 'Biolam - Concentrado Enzimático 500g';
  }
  if (lowerName.includes('lusqtoff') && lowerName.includes('lubricante')) {
    return 'Lusqtoff - Aerosol lubricante';
  }
  if (lowerName.includes('sombrero') && lowerName.includes('110')) {
    return 'Awaduct - Sombrero 110';
  }

  // 4. Si el SKU es un código o nombre real no automático y el nombre es genérico (ej. "varios"), usar SKU
  if (trimmedSku && !trimmedSku.startsWith('AUTO-')) {
    if (lowerName.includes('varios') || !trimmedName) {
      return trimmedSku;
    }
  }

  return trimmedName || trimmedSku;
}
