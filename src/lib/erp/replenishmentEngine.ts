import { formatDateDDMMYYYY } from "@/lib/utils";

export type HistoryWindowMode = 'auto' | 'days' | 'range';
export type DemandTrend = 'up' | 'down' | 'stable' | 'sporadic';
export type UrgencyLevel = 'critical_shortage' | 'below_rop' | 'scheduled_replenishment' | 'covered';

export interface RawSaleRecord {
  orderKey: string;
  productId?: string | null;
  productName?: string | null;
  quantity: number;
  orderDate: string; // YYYY-MM-DD
  source: 'db' | 'sheet';
}

export interface OutlierSpikeInfo {
  hasSpike: boolean;
  maxOrderQty: number;
  normalOrderQty: number;
  excessUnits30d: number;
  excessUnits15d: number;
  excessUnits7d: number;
  ordersCount30d: number;
  spikeOrderDate?: string;
  reason: string;
}

export interface ReplenishmentSupplierOption {
  supplierId: string;
  supplierName: string;
  isPrimary: boolean;
  purchaseCost: number;
  leadTimeDays: number;
  safetyStockDays: number;
}

export interface ReplenishmentItemResult {
  productId: string;
  name: string;
  sku?: string;
  category?: string;
  supplierId: string;
  supplierName: string;
  availableSuppliers: ReplenishmentSupplierOption[];
  leadTimeDays: number;
  safetyStockDays: number;
  stockPhysical: number;
  stockReserved: number;
  dbReserved: number;
  unimportedReserved: number;
  stockAvailable: number;
  transit: number;
  backorder: number;
  netShortageAfterTransit: number;
  // Raw & Smoothed sales counts
  qty7dRaw: number;
  qty15dRaw: number;
  qty30dRaw: number;
  qtyCustomRaw: number;
  qty7dSmoothed: number;
  qty15dSmoothed: number;
  qty30dSmoothed: number;
  qtyCustomSmoothed: number;
  ordersCount7d: number;
  ordersCount15d: number;
  ordersCount30d: number;
  // Velocities (already multiplied by seasonality)
  vpd7: number;
  vpd15: number;
  vpd30: number;
  vpdAuto: number;
  vpdActive: number;
  // Trend & Window recommendation
  trend: DemandTrend;
  trendPct: number; // % diff between recent (7-15d) and 30d
  suggestedWindowDays: 7 | 15 | 30;
  windowReason: string;
  // Outlier spike info & per-row state
  outlierInfo: OutlierSpikeInfo;
  includeOutlierSpike: boolean; // false = smoothed (default), true = include full spike
  // Coverage & Order suggestion
  dca: number;
  dcaWithTransit: number;
  rop: number;
  daysUntilStockout: number;
  tentativeDateStr: string;
  tentativeDateObj: Date | null;
  quantitySuggested: number;
  quantityDefaultSuggested: number;
  unitCost: number;
  subtotal: number;
  abcClass: 'A' | 'B' | 'C';
  totalQtySold: number;
  urgencyLevel: UrgencyLevel;
  urgencyReason: string;
  priorityScore: number;
  remainder?: number;
}

export interface ReplenishmentWindowSummary {
  qty7d: number;
  qty15d: number;
  qty30d: number;
  vpd7dTotal: number;
  vpd15dTotal: number;
  vpd30dTotal: number;
  trend: DemandTrend;
  trendPct: number;
  recommendedDays: 7 | 15 | 30;
  recommendationTitle: string;
  recommendationDetail: string;
  outliersDetectedCount: number;
  outliersExcessUnits: number;
}

export interface ReplenishmentRadarConfig {
  configured: boolean;
  excludedSupplierIds: string[];
  targetDays: number;
  smoothOutliers: boolean;
  graceDays: number;
  includeUnassignedUrgent: boolean;
}

export const REPLENISHMENT_RADAR_SETTING_ID = 'replenishment_radar_config';

export const DEFAULT_RADAR_CONFIG: ReplenishmentRadarConfig = {
  configured: false,
  excludedSupplierIds: [],
  targetDays: 30,
  smoothOutliers: true,
  graceDays: 2,
  includeUnassignedUrgent: true,
};

export function normalizeProductText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getValidReceptionDate(
  baseDate: Date,
  coverageDays: number,
  graceDays: number = 2
): { targetDate: Date; displayDays: number } {
  let workingDaysToAdd = Math.max(0, Math.floor(coverageDays)) + Math.max(0, graceDays);
  const current = new Date(baseDate);

  if (current.getDay() === 0) {
    current.setDate(current.getDate() + 1);
  }

  while (workingDaysToAdd > 0) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0) {
      workingDaysToAdd--;
    }
  }

  if (current.getDay() === 0) {
    current.setDate(current.getDate() - 1);
  }

  const dMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const bMidnight = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate()).getTime();
  const displayDays = Math.max(0, Math.round((dMidnight - bMidnight) / (1000 * 60 * 60 * 24)));

  return { targetDate: current, displayDays };
}

/**
 * Re-computes metrics for a single ReplenishmentItemResult when user toggles
 * includeOutlierSpike, changes history window mode, or changes supplier.
 */
export function computeItemMetricsForMode(params: {
  baseItem: Omit<
    ReplenishmentItemResult,
    | 'vpd7'
    | 'vpd15'
    | 'vpd30'
    | 'vpdAuto'
    | 'vpdActive'
    | 'trend'
    | 'trendPct'
    | 'suggestedWindowDays'
    | 'windowReason'
    | 'dca'
    | 'dcaWithTransit'
    | 'rop'
    | 'daysUntilStockout'
    | 'tentativeDateStr'
    | 'tentativeDateObj'
    | 'quantitySuggested'
    | 'quantityDefaultSuggested'
    | 'subtotal'
    | 'abcClass'
    | 'totalQtySold'
    | 'urgencyLevel'
    | 'urgencyReason'
    | 'priorityScore'
  >;
  historyMode: HistoryWindowMode;
  customDays: number;
  seasonalityMult: number;
  targetDays: number;
  graceDays: number;
}): ReplenishmentItemResult {
  const { baseItem, historyMode, customDays, seasonalityMult, targetDays, graceDays } = params;
  const useRaw = baseItem.includeOutlierSpike || !baseItem.outlierInfo.hasSpike;

  const q7 = useRaw ? baseItem.qty7dRaw : baseItem.qty7dSmoothed;
  const q15 = useRaw ? baseItem.qty15dRaw : baseItem.qty15dSmoothed;
  const q30 = useRaw ? baseItem.qty30dRaw : baseItem.qty30dSmoothed;
  const qCustom = useRaw ? baseItem.qtyCustomRaw : baseItem.qtyCustomSmoothed;

  const vpd7 = (q7 / 7) * seasonalityMult;
  const vpd15 = (q15 / 15) * seasonalityMult;
  const vpd30 = (q30 / 30) * seasonalityMult;

  // Determine trend & suggested window
  const recentRef = vpd7 > 0 ? (vpd7 * 0.6 + vpd15 * 0.4) : vpd15;
  const trendPct = vpd30 > 0.001 ? Math.round(((recentRef - vpd30) / vpd30) * 100) : (recentRef > 0 ? 100 : 0);

  let trend: DemandTrend = 'stable';
  let suggestedWindowDays: 7 | 15 | 30 = 15;
  let windowReason = 'Demanda estable (ventana balanceada de 15d)';
  let vpdAuto = 0;

  if (baseItem.ordersCount30d <= 2 && q30 > 0) {
    trend = 'sporadic';
    suggestedWindowDays = 30;
    windowReason = `Venta esporádica (${baseItem.ordersCount30d} ped. en 30d) → conviene 30d para no sobreestimar`;
    vpdAuto = 0.15 * vpd7 + 0.25 * vpd15 + 0.60 * vpd30;
  } else if (vpd30 > 0 && recentRef >= vpd30 * 1.25 && q7 > 0) {
    trend = 'up';
    suggestedWindowDays = baseItem.ordersCount7d >= 2 ? 7 : 15;
    windowReason = `Demanda en alza (+${Math.max(25, trendPct)}% vs 30d) → prioriza últ. ${suggestedWindowDays}d`;
    vpdAuto = 0.50 * vpd7 + 0.30 * vpd15 + 0.20 * vpd30;
  } else if (vpd30 > 0 && recentRef <= vpd30 * 0.75) {
    trend = 'down';
    suggestedWindowDays = 15;
    windowReason = `Demanda en baja (${trendPct}% vs 30d) → suaviza con 15d para evitar sobrestock`;
    vpdAuto = 0.45 * vpd7 + 0.35 * vpd15 + 0.20 * vpd30;
  } else {
    trend = 'stable';
    suggestedWindowDays = 15;
    windowReason = 'Rotación regular → promedio ponderado 7/15/30d';
    vpdAuto = 0.30 * vpd7 + 0.45 * vpd15 + 0.25 * vpd30;
  }

  let vpdActive = vpdAuto;
  let totalQtySold = q30;

  if (historyMode === 'auto') {
    vpdActive = vpdAuto;
    totalQtySold = q30;
  } else {
    const safeDays = Math.max(1, customDays);
    if (historyMode === 'days' && safeDays === 7) {
      vpdActive = vpd7;
      totalQtySold = q7;
    } else if (historyMode === 'days' && safeDays === 15) {
      vpdActive = vpd15;
      totalQtySold = q15;
    } else if (historyMode === 'days' && safeDays === 30) {
      vpdActive = vpd30;
      totalQtySold = q30;
    } else {
      vpdActive = (qCustom / safeDays) * seasonalityMult;
      totalQtySold = qCustom;
    }
  }

  const { stockPhysical, stockReserved, stockAvailable, transit, leadTimeDays, safetyStockDays, unitCost } = baseItem;
  const dca = vpdActive > 0 ? stockAvailable / vpdActive : 999;
  const rop = vpdActive * (leadTimeDays + safetyStockDays);
  const projectedStockWithTransit = stockAvailable + transit;
  const dcaWithTransit = vpdActive > 0 ? projectedStockWithTransit / vpdActive : 999;

  const backorder = Math.max(0, stockReserved - stockPhysical);
  const netShortageAfterTransit = Math.max(0, stockReserved - stockPhysical - transit);

  let tentativeDateStr = 'Inmediato (Hoy)';
  let tentativeDateObj: Date | null = new Date();
  let daysUntilStockout = 0;

  if (netShortageAfterTransit > 0 || (projectedStockWithTransit <= 0 && graceDays === 0 && vpdActive > 0)) {
    tentativeDateStr = '¡Hoy! (Sin stock)';
    daysUntilStockout = 0;
    tentativeDateObj = new Date();
    if (tentativeDateObj.getDay() === 0) {
      tentativeDateObj.setDate(tentativeDateObj.getDate() + 1);
    }
  } else if (dcaWithTransit < 365) {
    const rawCoverage = Math.max(0, Math.floor(dcaWithTransit));
    const { targetDate, displayDays } = getValidReceptionDate(new Date(), rawCoverage, graceDays);
    daysUntilStockout = displayDays;
    tentativeDateObj = targetDate;
    tentativeDateStr = formatDateDDMMYYYY(targetDate);
  } else {
    tentativeDateStr = '+1 año';
    daysUntilStockout = 999;
    tentativeDateObj = null;
  }

  // Net required quantity: covers any pending delivery deficit (stockReserved - stockPhysical)
  // PLUS targetDays of projected demand (vpdActive * targetDays), minus incoming transit.
  const netInventoryPosition = stockPhysical - stockReserved + transit;
  const targetNeed = (vpdActive * targetDays) - netInventoryPosition;
  const quantitySuggested = Math.max(
    netShortageAfterTransit,
    Math.max(0, Math.ceil(targetNeed))
  );

  let abcClass: 'A' | 'B' | 'C' = 'C';
  if (q30 >= 15 || vpdActive >= 0.75) abcClass = 'A';
  else if (q30 >= 4 || vpdActive >= 0.15) abcClass = 'B';

  // Classify urgency
  let urgencyLevel: UrgencyLevel = 'covered';
  let urgencyReason = 'Stock cubierto';
  let priorityScore = 0;

  if (netShortageAfterTransit > 0) {
    urgencyLevel = 'critical_shortage';
    urgencyReason = `Faltan ${netShortageAfterTransit} u. para cubrir entregas pendientes (Res: ${stockReserved} vs Fís: ${stockPhysical}${transit > 0 ? ` + Tráns: ${transit}` : ''})`;
    priorityScore = 1000 + netShortageAfterTransit * 20 + vpdActive * 50;
  } else if (stockAvailable <= 0 && vpdActive > 0 && transit <= 0) {
    urgencyLevel = 'critical_shortage';
    urgencyReason = `Stock disponible agotado (0 u.) con demanda activa (${vpdActive.toFixed(2)} u/día)`;
    priorityScore = 850 + vpdActive * 50;
  } else if (quantitySuggested > 0 && (dcaWithTransit <= Math.max(7, leadTimeDays + safetyStockDays) || daysUntilStockout <= Math.max(7, leadTimeDays + 2))) {
    urgencyLevel = 'below_rop';
    urgencyReason = `Cobertura crítica (${Math.round(dcaWithTransit)}d) menor a plazo + seguridad (${leadTimeDays + safetyStockDays}d)`;
    priorityScore = 500 + Math.max(0, 30 - dcaWithTransit) * 10 + vpdActive * 30;
  } else if (quantitySuggested > 0) {
    urgencyLevel = 'scheduled_replenishment';
    urgencyReason = trend === 'up'
      ? `Reposición por demanda en alza (+${trendPct}%) para cubrir ${targetDays}d`
      : `Reposición preventiva para alcanzar ${targetDays} días de cobertura`;
    priorityScore = 150 + vpdActive * 25 + (trend === 'up' ? 50 : 0);
  }

  return {
    ...baseItem,
    vpd7,
    vpd15,
    vpd30,
    vpdAuto,
    vpdActive,
    trend,
    trendPct,
    suggestedWindowDays,
    windowReason,
    dca,
    dcaWithTransit,
    rop,
    daysUntilStockout,
    tentativeDateStr,
    tentativeDateObj,
    quantitySuggested,
    quantityDefaultSuggested: quantitySuggested,
    subtotal: quantitySuggested * unitCost,
    abcClass,
    totalQtySold,
    urgencyLevel,
    urgencyReason,
    priorityScore,
  };
}

export function buildReplenishmentAnalysis(params: {
  products: any[];
  suppliers: any[];
  relations: any[];
  saleRecords: RawSaleRecord[];
  unimportedReservesMap: Record<string, number>;
  unimportedReservesNormMap: Record<string, number>;
  transitMap: Record<string, number>;
  transitNormMap: Record<string, number>;
  supplierFilterId: string; // "ALL", "RADAR", or specific supplier UUID
  excludedSupplierIds?: string[];
  includeUnassignedUrgent?: boolean;
  historyMode: HistoryWindowMode;
  customDays: number;
  customStartDate?: string;
  customEndDate?: string;
  seasonalityMult: number;
  targetDays: number;
  graceDays: number;
  defaultSmoothOutliers: boolean;
  overridesByProduct?: Record<string, { includeOutlierSpike?: boolean; supplierId?: string }>;
  nowDate?: Date;
}): {
  items: ReplenishmentItemResult[];
  windowSummary: ReplenishmentWindowSummary;
} {
  const {
    products,
    suppliers,
    relations,
    saleRecords,
    unimportedReservesMap,
    unimportedReservesNormMap,
    transitMap,
    transitNormMap,
    supplierFilterId,
    excludedSupplierIds = [],
    includeUnassignedUrgent = true,
    historyMode,
    customDays,
    customStartDate,
    customEndDate,
    seasonalityMult,
    targetDays,
    graceDays,
    defaultSmoothOutliers,
    overridesByProduct = {},
    nowDate = new Date(),
  } = params;

  const excludedSet = new Set(excludedSupplierIds);
  const suppliersById = new Map<string, any>();
  suppliers.forEach(s => suppliersById.set(s.id, s));

  // Group relations by product_id
  const relationsByProduct = new Map<string, any[]>();
  relations.forEach(r => {
    if (!r.product_id) return;
    const list = relationsByProduct.get(r.product_id) || [];
    list.push(r);
    relationsByProduct.set(r.product_id, list);
  });

  // Pre-normalize saleRecords
  const todayMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const preparedSales = saleRecords
    .map(rec => {
      const qty = Number(rec.quantity) || 0;
      if (qty <= 0 || !rec.orderDate) return null;
      const dateStr = rec.orderDate.split('T')[0];
      const parts = dateStr.split('-');
      const recTime = parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime()
        : new Date(rec.orderDate).getTime();
      const daysAgo = Math.max(0, Math.floor((todayMidnight - recTime) / (1000 * 60 * 60 * 24)));
      const normName = normalizeProductText(rec.productName || '');
      const isBioOrCamara1000 =
        (normName.includes('biodigestor') || normName.includes('septica') || normName.includes('camara')) &&
        normName.includes('1000');
      return {
        orderKey: rec.orderKey || `${dateStr}_${rec.productId || normName}`,
        productId: rec.productId || null,
        normName,
        isBioOrCamara1000,
        qty,
        dateStr,
        daysAgo,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const items: ReplenishmentItemResult[] = [];

  for (const p of products) {
    const lowerName = (p.name || '').toLowerCase().trim();
    const lowerSku = (p.sku || '').toLowerCase().trim();
    const normNameCheck = normalizeProductText(p.name || '');
    if (
      lowerName.startsWith('[interno]') ||
      lowerName.includes('(out') ||
      lowerName.includes('outlet') ||
      lowerName.includes('descuento') ||
      lowerSku.includes('descuento') ||
      lowerName.includes('bonificaci') ||
      lowerName.startsWith('dto ') ||
      normNameCheck.startsWith('kit instalacion') ||
      normNameCheck.includes('adicionales instalacion') ||
      normNameCheck.includes('terminacion instalacion')
    ) {
      continue;
    }

    const prodRels = relationsByProduct.get(p.id) || [];
    const availableSuppliers: ReplenishmentSupplierOption[] = prodRels
      .map(r => {
        const sup = suppliersById.get(r.supplier_id);
        if (!sup) return null;
        if ((sup.name || '').trim().toLowerCase() === 'descuento') return null;
        return {
          supplierId: sup.id,
          supplierName: sup.name,
          isPrimary: Boolean(r.is_primary),
          purchaseCost: Number(r.purchase_cost) || 0,
          leadTimeDays: Number(sup.delivery_time_days) || 5,
          safetyStockDays: Number(sup.safety_stock_days) || 7,
        };
      })
      .filter((x): x is ReplenishmentSupplierOption => x !== null)
      .sort((a, b) => (Number(b.isPrimary) - Number(a.isPrimary)) || a.supplierName.localeCompare(b.supplierName, 'es'));

    // Determine active supplier for this product
    const overrideSupId = overridesByProduct[p.id]?.supplierId;
    let chosenSupplier: ReplenishmentSupplierOption | null = null;

    if (supplierFilterId !== 'ALL' && supplierFilterId !== 'RADAR') {
      chosenSupplier = availableSuppliers.find(s => s.supplierId === supplierFilterId) || null;
      if (!chosenSupplier) continue; // Not linked to selected supplier
    } else if (overrideSupId) {
      chosenSupplier = availableSuppliers.find(s => s.supplierId === overrideSupId) || availableSuppliers[0] || null;
    } else if (supplierFilterId === 'RADAR') {
      // Pick first non-excluded supplier (preferring primary)
      chosenSupplier = availableSuppliers.find(s => !excludedSet.has(s.supplierId)) || null;
      // If product has suppliers and ALL of them are excluded by user preconfiguration, skip it
      if (!chosenSupplier && availableSuppliers.length > 0) {
        continue;
      }
    } else {
      chosenSupplier = availableSuppliers[0] || null;
    }

    const normPName = normalizeProductText(p.name || '');
    const absorbsBio1000 = (normPName.includes('tacho') || normPName.includes('cisterna')) && normPName.includes('1000');

    // Stock & Reserves
    const stockPhys = Math.max(0, Number(p.stock_physical) || 0);
    const dbRes = Math.max(0, Number(p.stock_reserved) || 0);
    const unimportedRes = (p.id && unimportedReservesMap[p.id]) || unimportedReservesNormMap[normPName] || 0;
    const stockRes = dbRes + unimportedRes;
    const stockDisp = typeof p.stock_current === 'number'
      ? Math.max(0, p.stock_current - unimportedRes)
      : Math.max(0, stockPhys - stockRes);

    let transit = transitMap[p.id] || 0;
    for (const [tNorm, tQty] of Object.entries(transitNormMap)) {
      if (tNorm && normPName && (tNorm === normPName || tNorm.includes(normPName) || normPName.includes(tNorm))) {
        if (tQty > transit) transit = tQty;
      }
    }

    const backorder = Math.max(0, stockRes - stockPhys);
    const netShortageAfterTransit = Math.max(0, stockRes - stockPhys - transit);

    // If in RADAR mode and product has no assigned supplier at all, only include if it has an active shortage or sales
    if (supplierFilterId === 'RADAR' && !chosenSupplier && !includeUnassignedUrgent) {
      continue;
    }

    // Collect matching sales grouped by orderKey
    const orderMap = new Map<string, { qty: number; daysAgo: number; dateStr: string }>();

    for (const sale of preparedSales) {
      let matches = false;
      if (sale.productId && sale.productId === p.id) {
        matches = true;
      } else if (sale.normName && normPName && (sale.normName === normPName || sale.normName.includes(normPName) || normPName.includes(sale.normName))) {
        matches = true;
      } else if (absorbsBio1000 && sale.isBioOrCamara1000) {
        matches = true;
      }

      if (!matches) continue;

      const existing = orderMap.get(sale.orderKey);
      if (existing) {
        existing.qty += sale.qty;
        if (sale.daysAgo < existing.daysAgo) {
          existing.daysAgo = sale.daysAgo;
          existing.dateStr = sale.dateStr;
        }
      } else {
        orderMap.set(sale.orderKey, {
          qty: sale.qty,
          daysAgo: sale.daysAgo,
          dateStr: sale.dateStr,
        });
      }
    }

    const allOrders = Array.from(orderMap.values());
    const orders30d = allOrders.filter(o => o.daysAgo <= 30);

    // Skip if 0 sales in all windows AND no pending delivery shortage
    if (allOrders.length === 0 && netShortageAfterTransit <= 0 && backorder <= 0) {
      continue;
    }

    // Outlier / Spike detection across 30d orders (or allOrders if custom range)
    const refOrders = orders30d.length > 0 ? orders30d : allOrders;
    const sortedQtys = refOrders.map(o => o.qty).sort((a, b) => a - b);
    const maxOrderQty = sortedQtys.length > 0 ? sortedQtys[sortedQtys.length - 1] : 0;
    const totalRefQty = sortedQtys.reduce((a, b) => a + b, 0);

    let hasSpike = false;
    let normalOrderQty = maxOrderQty;
    let spikeReason = '';
    let spikeOrderDate: string | undefined;

    if (refOrders.length === 1 && maxOrderQty >= 4) {
      // Single isolated bulk order in 30 days
      hasSpike = true;
      normalOrderQty = Math.max(1, Math.min(2, Math.round(maxOrderQty * 0.25)));
      spikeOrderDate = refOrders[0].dateStr;
      spikeReason = `1 único pedido grande de ${maxOrderQty} u. en 30d (poca frecuencia, suavizado a ${normalOrderQty} u.)`;
    } else if (refOrders.length >= 2) {
      // Calculate baseline from all orders except the largest one
      const withoutMax = sortedQtys.slice(0, -1);
      const midIdx = Math.floor(withoutMax.length / 2);
      const medianWithoutMax = withoutMax.length % 2 !== 0
        ? withoutMax[midIdx]
        : (withoutMax[midIdx - 1] + withoutMax[midIdx]) / 2;
      const avgWithoutMax = withoutMax.reduce((a, b) => a + b, 0) / withoutMax.length;
      const baseline = Math.max(1, (medianWithoutMax + avgWithoutMax) / 2);

      const threshold = Math.max(3, baseline * 2.5, baseline + 2.5);
      if (maxOrderQty >= threshold && (maxOrderQty / Math.max(1, totalRefQty)) >= 0.35) {
        hasSpike = true;
        normalOrderQty = Math.max(1, Math.round(baseline));
        const maxOrderObj = refOrders.find(o => o.qty === maxOrderQty);
        spikeOrderDate = maxOrderObj?.dateStr;
        spikeReason = `Pedido atípico de ${maxOrderQty} u. (habitual: ~${normalOrderQty} u./pedido en ${refOrders.length} pedidos)`;
      }
    }

    // Aggregate raw and smoothed quantities across 7d, 15d, 30d, and custom window
    let qty7dRaw = 0, qty15dRaw = 0, qty30dRaw = 0, qtyCustomRaw = 0;
    let qty7dSmoothed = 0, qty15dSmoothed = 0, qty30dSmoothed = 0, qtyCustomSmoothed = 0;
    let ordersCount7d = 0, ordersCount15d = 0, ordersCount30d = 0;

    const spikeCap = hasSpike ? Math.max(normalOrderQty, Math.round(normalOrderQty * 1.5)) : Infinity;

    for (const ord of allOrders) {
      const smoothedQty = hasSpike && ord.qty > spikeCap ? normalOrderQty : ord.qty;

      if (ord.daysAgo <= 7) {
        qty7dRaw += ord.qty;
        qty7dSmoothed += smoothedQty;
        ordersCount7d++;
      }
      if (ord.daysAgo <= 15) {
        qty15dRaw += ord.qty;
        qty15dSmoothed += smoothedQty;
        ordersCount15d++;
      }
      if (ord.daysAgo <= 30) {
        qty30dRaw += ord.qty;
        qty30dSmoothed += smoothedQty;
        ordersCount30d++;
      }

      const inCustom = historyMode === 'range'
        ? (!customStartDate || ord.dateStr >= customStartDate) && (!customEndDate || ord.dateStr <= customEndDate)
        : ord.daysAgo <= Math.max(1, customDays);

      if (inCustom) {
        qtyCustomRaw += ord.qty;
        qtyCustomSmoothed += smoothedQty;
      }
    }

    // Determine unit cost
    let purchaseCost = 0;
    if (p.cost_price && Number(p.cost_price) > 0) {
      purchaseCost = Number(p.cost_price);
    } else if (chosenSupplier && chosenSupplier.purchaseCost > 0) {
      purchaseCost = chosenSupplier.purchaseCost;
    } else {
      purchaseCost = Number(p.price) * 0.7;
    }

    const includeOutlierSpike = overridesByProduct[p.id]?.includeOutlierSpike ?? !defaultSmoothOutliers;

    const outlierInfo: OutlierSpikeInfo = {
      hasSpike,
      maxOrderQty,
      normalOrderQty,
      excessUnits30d: Math.max(0, qty30dRaw - qty30dSmoothed),
      excessUnits15d: Math.max(0, qty15dRaw - qty15dSmoothed),
      excessUnits7d: Math.max(0, qty7dRaw - qty7dSmoothed),
      ordersCount30d,
      spikeOrderDate,
      reason: spikeReason,
    };

    const computed = computeItemMetricsForMode({
      baseItem: {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        supplierId: chosenSupplier?.supplierId || '',
        supplierName: chosenSupplier?.supplierName || 'Sin proveedor asignado',
        availableSuppliers,
        leadTimeDays: chosenSupplier?.leadTimeDays ?? 5,
        safetyStockDays: chosenSupplier?.safetyStockDays ?? 7,
        stockPhysical: stockPhys,
        stockReserved: stockRes,
        dbReserved: dbRes,
        unimportedReserved: unimportedRes,
        stockAvailable: stockDisp,
        transit,
        backorder,
        netShortageAfterTransit,
        qty7dRaw,
        qty15dRaw,
        qty30dRaw,
        qtyCustomRaw,
        qty7dSmoothed,
        qty15dSmoothed,
        qty30dSmoothed,
        qtyCustomSmoothed,
        ordersCount7d,
        ordersCount15d,
        ordersCount30d,
        outlierInfo,
        includeOutlierSpike,
        unitCost: purchaseCost,
      },
      historyMode,
      customDays,
      seasonalityMult,
      targetDays,
      graceDays,
    });

    items.push(computed);
  }

  // Sort items by urgency & priorityScore descending
  items.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return b.subtotal - a.subtotal;
  });

  const windowSummary = summarizeReplenishmentWindows(items);
  return { items, windowSummary };
}

export function summarizeReplenishmentWindows(items: ReplenishmentItemResult[]): ReplenishmentWindowSummary {
  let qty7d = 0;
  let qty15d = 0;
  let qty30d = 0;
  let outliersDetectedCount = 0;
  let outliersExcessUnits = 0;

  for (const it of items) {
    const useRaw = it.includeOutlierSpike || !it.outlierInfo.hasSpike;
    qty7d += useRaw ? it.qty7dRaw : it.qty7dSmoothed;
    qty15d += useRaw ? it.qty15dRaw : it.qty15dSmoothed;
    qty30d += useRaw ? it.qty30dRaw : it.qty30dSmoothed;
    if (it.outlierInfo.hasSpike) {
      outliersDetectedCount++;
      outliersExcessUnits += it.outlierInfo.excessUnits30d;
    }
  }

  const vpd7dTotal = qty7d / 7;
  const vpd15dTotal = qty15d / 15;
  const vpd30dTotal = qty30d / 30;

  const recentAvg = vpd7dTotal * 0.6 + vpd15dTotal * 0.4;
  const trendPct = vpd30dTotal > 0.001
    ? Math.round(((recentAvg - vpd30dTotal) / vpd30dTotal) * 100)
    : (recentAvg > 0 ? 100 : 0);

  let trend: DemandTrend = 'stable';
  let recommendedDays: 7 | 15 | 30 = 15;
  let recommendationTitle = 'Demanda Estable — Se sugiere ventana de 15 días (o Modo Auto Ponderado)';
  let recommendationDetail = 'El ritmo de ventas de los últimos 7 y 15 días se mantiene alineado con el promedio mensual de 30 días.';

  if (vpd30dTotal > 0 && recentAvg >= vpd30dTotal * 1.2) {
    trend = 'up';
    recommendedDays = vpd7dTotal >= vpd15dTotal * 1.15 ? 7 : 15;
    recommendationTitle = `Demanda en Alza (+${Math.max(20, trendPct)}% reciente) — Sugerido analizar ${recommendedDays} días`;
    recommendationDetail = `Las ventas aceleraron en los últimos ${recommendedDays} días (${vpd7dTotal.toFixed(1)} u/día en 7d vs ${vpd30dTotal.toFixed(1)} u/día en 30d). El modo Automático pondera este aumento para evitar quiebres.`;
  } else if (vpd30dTotal > 0 && recentAvg <= vpd30dTotal * 0.8) {
    trend = 'down';
    recommendedDays = 15;
    recommendationTitle = `Demanda en Desaceleración (${trendPct}% vs promedio mensual) — Sugerido analizar 15 días`;
    recommendationDetail = `El ritmo reciente bajó respecto a los últimos 30 días (${vpd7dTotal.toFixed(1)} u/día en 7d vs ${vpd30dTotal.toFixed(1)} u/día en 30d). Se recomienda ventana de 15d o Modo Automático para no sobre-comprar.`;
  } else if (qty30d > 0 && qty15d < qty30d * 0.35) {
    trend = 'sporadic';
    recommendedDays = 30;
    recommendationTitle = 'Rotación Intermitente — Sugerido analizar 30 días';
    recommendationDetail = 'Las ventas se concentran de forma espaciada en el mes. Una ventana de 30 días evita distorsiones por semanas sin movimiento.';
  }

  return {
    qty7d,
    qty15d,
    qty30d,
    vpd7dTotal,
    vpd15dTotal,
    vpd30dTotal,
    trend,
    trendPct,
    recommendedDays,
    recommendationTitle,
    recommendationDetail,
    outliersDetectedCount,
    outliersExcessUnits,
  };
}
