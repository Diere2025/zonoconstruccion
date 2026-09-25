export type CommercialBrand = 'zono' | 'aquafort';

export interface LogisticsTrip {
  zone: string;
  route: string;
  carrier: string;
  driver: string;
  vehicle: string;
  companion: string;
  departure: string;
}

export const LOGISTICS_TRIP_FIELDS = ['zone', 'route', 'carrier', 'driver', 'vehicle', 'companion', 'departure'] as const;
// La columna carrier identifica a quien ruteó, no al transportista del viaje.
const LOGISTICS_TRIP_IDENTITY_FIELDS = ['driver', 'vehicle', 'companion', 'departure'] as const;

export function normalizedDeliveryDate(value: string): string {
  const date = value.trim();
  const local = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return date;
}

export function logisticsTripKey(deliveryDate: string, trip?: Partial<LogisticsTrip>): string {
  // Un viaje puede abarcar varias zonas y recorridos; ninguno identifica una hoja distinta.
  return JSON.stringify([normalizedDeliveryDate(deliveryDate), ...LOGISTICS_TRIP_IDENTITY_FIELDS.map(field => {
    const value = (trip?.[field] || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
    return field === 'departure' ? value.replace(/^(\d):/, '0$1:') : value;
  })]);
}

export interface LogisticsPrintItem {
  name: string;
  quantity: number;
  unitPrice: number;
  category?: string;
  categoryOverride?: boolean;
}

export interface LogisticsPrintOrder {
  id: string;
  sourceRows: number[];
  codes: string[];
  legacyCode: string;
  deliveryDate: string;
  deliveryOrder?: string;
  orderDate: string;
  customerName: string;
  phonePrimary: string;
  phoneSecondary: string;
  deliveryDetail: string;
  sellerName: string;
  locality: string;
  address: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAmount: number;
  surcharge: number;
  freightType: string;
  freightCost: number;
  productsSubtotal: number;
  orderTotal: number;
  pendingBalance: number;
  items: LogisticsPrintItem[];
  commercialBrand: CommercialBrand;
  trip?: LogisticsTrip;
}

export interface LogisticsOrderMetadata {
  legacyCode: string;
  commercialBrand?: CommercialBrand | null;
  channel?: string | null;
}

const PRODUCT_START_INDEX = 30; // AE
const PRODUCT_SLOT_SIZE = 4;
const PRODUCT_SLOT_COUNT = 12;

export function parseSheetNumber(value: unknown): number {
  const raw = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;

  let normalized = raw;
  if (raw.includes(',') && raw.includes('.')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.');
  } else if ((raw.match(/\./g) || []).length > 1 || /^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function splitCodes(value: string): string[] {
  return value.split(/[/,]/).map(normalizeCode).filter(Boolean);
}

function siblingCodes(detail: string): string[] {
  if (!/VA\s+CON\s+EL\s+PEDIDO/i.test(detail)) return [];
  const prefix = detail.split(/VA\s+CON\s+EL\s+PEDIDO/i)[1]?.slice(0, 180) || '';
  return (prefix.toUpperCase().match(/\b[A-Z]{1,8}(?:-[A-Z]{1,8})?-?\d+\b/g) || [])
    .map(normalizeCode);
}

function inferredBrand(codes: string[], metadata?: LogisticsOrderMetadata): CommercialBrand {
  if (metadata?.commercialBrand) return metadata.commercialBrand;
  if (metadata?.channel === 'mayorista') return 'aquafort';
  return codes.some(code => /^(?:AQ-|AQU|POW)/.test(code)) ? 'aquafort' : 'zono';
}

export function parseLogisticsPrintRows(rows: string[][], firstRowNumber = 3): LogisticsPrintOrder[] {
  return rows.flatMap((row, index) => {
    const code = normalizeCode(row[1]);
    if (!code) return [];

    const items: LogisticsPrintItem[] = [];
    for (let slot = 0; slot < PRODUCT_SLOT_COUNT; slot++) {
      const start = PRODUCT_START_INDEX + slot * PRODUCT_SLOT_SIZE;
      const name = String(row[start] || '').trim();
      if (!name) continue;
      items.push({
        name,
        quantity: Math.max(1, parseSheetNumber(row[start + 1]) || 1),
        unitPrice: parseSheetNumber(row[start + 2])
      });
    }

    const productsSubtotal = parseSheetNumber(row[28]);
    const rawPaymentMethod = String(row[21] || '').trim();
    const paymentMethod = /diegozono\s*\.\s*mp/i.test(rawPaymentMethod)
      ? 'Transferencia'
      : rawPaymentMethod;
    const explicitSurcharge = parseSheetNumber(row[25]);
    const isVatTransfer = /transferencia[\s\S]*iva\s*21|iva\s*21[\s\S]*transferencia/i.test(paymentMethod);
    const surcharge = explicitSurcharge !== 0
      ? explicitSurcharge
      : isVatTransfer
        ? Math.round(productsSubtotal * 0.21)
        : 0;
    const freightCost = parseSheetNumber(row[27]);
    const paidAmount = parseSheetNumber(row[24]);
    const calculatedTotal = productsSubtotal + surcharge + freightCost;
    const pendingBalanceCell = String(row[29] ?? '').trim();

    return [{
      id: code,
      sourceRows: [firstRowNumber + index],
      codes: [code],
      legacyCode: code,
      deliveryDate: String(row[2] || ''),
      deliveryOrder: String(row[15] || '').trim(),
      trip: {
        zone: String(row[13] || '').trim(),
        route: String(row[14] || '').trim(),
        carrier: String(row[78] || '').trim(),
        driver: String(row[80] || '').trim(),
        vehicle: String(row[81] || '').trim(),
        companion: String(row[82] || '').trim(),
        departure: String(row[83] || '').trim()
      },
      orderDate: String(row[3] || ''),
      customerName: String(row[5] || ''),
      phonePrimary: String(row[6] || ''),
      phoneSecondary: String(row[7] || ''),
      deliveryDetail: String(row[10] || ''),
      sellerName: String(row[12] || ''),
      locality: String(row[17] || ''),
      address: String(row[18] || ''),
      paymentMethod,
      paymentStatus: String(row[23] || ''),
      paidAmount,
      surcharge,
      freightType: String(row[26] || ''),
      freightCost,
      productsSubtotal,
      orderTotal: calculatedTotal,
      pendingBalance: pendingBalanceCell
        ? parseSheetNumber(pendingBalanceCell)
        : Math.max(0, calculatedTotal - paidAmount),
      items,
      commercialBrand: inferredBrand([code])
    }];
  });
}

class CodeGroups {
  private parent = new Map<string, string>();

  add(code: string) {
    if (!this.parent.has(code)) this.parent.set(code, code);
  }

  find(code: string): string {
    this.add(code);
    const parent = this.parent.get(code)!;
    if (parent === code) return code;
    const root = this.find(parent);
    this.parent.set(code, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }
}

function firstText(orders: LogisticsPrintOrder[], field: keyof LogisticsPrintOrder): string {
  for (const order of orders) {
    const value = order[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export function mergeLogisticsPrintOrders(
  rows: LogisticsPrintOrder[],
  metadataRows: LogisticsOrderMetadata[] = []
): LogisticsPrintOrder[] {
  const groups = new CodeGroups();
  const metadataByCode = new Map<string, LogisticsOrderMetadata>();

  for (const row of rows) groups.add(row.codes[0]);

  for (const metadata of metadataRows) {
    const codes = splitCodes(metadata.legacyCode);
    codes.forEach(code => metadataByCode.set(code, metadata));
    for (let index = 1; index < codes.length; index++) groups.union(codes[0], codes[index]);
  }

  for (const row of rows) {
    for (const sibling of siblingCodes(row.deliveryDetail)) groups.union(row.codes[0], sibling);
  }

  const buckets = new Map<string, LogisticsPrintOrder[]>();
  for (const row of rows) {
    // Pedidos vinculados de distintos viajes deben conservar su propia hoja.
    const root = JSON.stringify([groups.find(row.codes[0]), logisticsTripKey(row.deliveryDate, row.trip)]);
    buckets.set(root, [...(buckets.get(root) || []), row]);
  }

  const codeTripCounts = new Map<string, number>();
  for (const bucket of buckets.values()) {
    for (const code of new Set(bucket.flatMap(order => order.codes))) {
      codeTripCounts.set(code, (codeTripCounts.get(code) || 0) + 1);
    }
  }

  return Array.from(buckets.values())
    .map(bucket => {
      bucket.sort((left, right) => left.sourceRows[0] - right.sourceRows[0]);
      const codes = Array.from(new Set(bucket.flatMap(order => order.codes)));
      const metadata = codes.map(code => metadataByCode.get(code)).find(Boolean);
      const items = bucket.flatMap(order => order.items);
      const productsSubtotal = bucket.reduce((sum, order) => sum + order.productsSubtotal, 0);
      const surcharge = bucket.reduce((sum, order) => sum + order.surcharge, 0);
      const freightCost = bucket.reduce((sum, order) => sum + order.freightCost, 0);
      const paidAmount = bucket.reduce((sum, order) => sum + order.paidAmount, 0);
      const orderTotal = productsSubtotal + surcharge + freightCost;

      return {
        ...bucket[0],
        id: codes.join('|') + (codes.some(code => (codeTripCounts.get(code) || 0) > 1) ? `@${bucket[0].sourceRows[0]}` : ''),
        sourceRows: bucket.flatMap(order => order.sourceRows),
        codes,
        legacyCode: metadata?.legacyCode || codes.join(' / '),
        deliveryDate: firstText(bucket, 'deliveryDate'),
        deliveryOrder: firstText(bucket, 'deliveryOrder'),
        orderDate: firstText(bucket, 'orderDate'),
        customerName: firstText(bucket, 'customerName'),
        phonePrimary: firstText(bucket, 'phonePrimary'),
        phoneSecondary: firstText(bucket, 'phoneSecondary'),
        deliveryDetail: bucket.map(order => order.deliveryDetail).filter(Boolean).join(' / '),
        sellerName: firstText(bucket, 'sellerName'),
        locality: firstText(bucket, 'locality'),
        address: firstText(bucket, 'address'),
        paymentMethod: firstText(bucket, 'paymentMethod'),
        paymentStatus: firstText(bucket, 'paymentStatus'),
        freightType: firstText(bucket, 'freightType'),
        paidAmount,
        surcharge,
        freightCost,
        productsSubtotal,
        orderTotal,
        pendingBalance: Math.max(0, orderTotal - paidAmount),
        items,
        commercialBrand: inferredBrand(codes, metadata)
      };
    })
    .sort((left, right) => left.sourceRows[0] - right.sourceRows[0]);
}
