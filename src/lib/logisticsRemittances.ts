import { parseSheetNumber } from '@/lib/logisticsPrintOrders';

export interface LogisticsRemittanceItem {
  name: string;
  quantity: number;
}

export interface LogisticsRemittance {
  id: string;
  sourceRow: number;
  sourceRows: number[];
  sheetLabel: string;
  orderCode: string;
  orderCodes: string[];
  remittanceNumber: number;
  partNumber: number;
  partCount: number;
  deliveryDate: string;
  customerName: string;
  address: string;
  locality: string;
  items: LogisticsRemittanceItem[];
}

interface RemittanceSourceRow {
  sourceRow: number;
  sheetLabel: string;
  orderCodes: string[];
  deliveryDetail: string;
  deliveryDate: string;
  customerName: string;
  address: string;
  locality: string;
  items: LogisticsRemittanceItem[];
}

const PRODUCT_START_INDEX = 30; // AE
const PRODUCT_SLOT_SIZE = 4;
const PRODUCT_SLOT_COUNT = 12;
const ITEMS_PER_REMITTANCE = 10;
const FIRST_REMITTANCE_NUMBER = 516;

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function splitCodes(value: unknown): string[] {
  return String(value || '').split(/[/,]/).map(normalizeCode).filter(Boolean);
}

function siblingCodes(detail: string): string[] {
  if (!/VA\s+CON\s+EL\s+PEDIDO/i.test(detail)) return [];
  const suffix = detail.split(/VA\s+CON\s+EL\s+PEDIDO/i)[1]?.slice(0, 180) || '';
  return (suffix.toUpperCase().match(/\b[A-Z]{1,8}(?:-[A-Z]{1,8})?-?\d+\b/g) || [])
    .map(normalizeCode);
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

function firstText(rows: RemittanceSourceRow[], field: keyof RemittanceSourceRow): string {
  for (const row of rows) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseSourceRows(rows: string[][], firstRowNumber: number): RemittanceSourceRow[] {
  return rows.flatMap((row, index) => {
    const sourceRow = firstRowNumber + index;
    const sheetLabel = String(row[0] || `R${sourceRow}`).trim();
    const customerName = String(row[5] || '').trim();
    const address = String(row[18] || '').trim();
    const locality = String(row[17] || '').trim();
    const orderCodes = splitCodes(row[1]);
    const items: LogisticsRemittanceItem[] = [];

    for (let slot = 0; slot < PRODUCT_SLOT_COUNT; slot++) {
      const start = PRODUCT_START_INDEX + slot * PRODUCT_SLOT_SIZE;
      const name = String(row[start] || '').trim();
      if (!name) continue;
      const unitPrice = parseSheetNumber(row[start + 2]);
      if (unitPrice < 0 || /descuento|bonificaci/i.test(name)) continue;
      items.push({
        name,
        quantity: Math.max(1, parseSheetNumber(row[start + 1]) || 1)
      });
    }

    if (!customerName && !address && !locality && orderCodes.length === 0 && items.length === 0) return [];

    return [{
      sourceRow,
      sheetLabel,
      orderCodes,
      deliveryDetail: String(row[10] || '').trim(),
      deliveryDate: String(row[2] || '').trim(),
      customerName,
      address,
      locality,
      items
    }];
  });
}

export function parseLogisticsRemittanceRows(
  rows: string[][],
  firstRowNumber = 1,
  linkedOrderCodes: string[] = []
): LogisticsRemittance[] {
  const sourceRows = parseSourceRows(rows, firstRowNumber);
  const groups = new CodeGroups();

  for (const row of sourceRows) {
    const rowKey = row.orderCodes[0] || `__ROW_${row.sourceRow}`;
    groups.add(rowKey);
    for (let index = 1; index < row.orderCodes.length; index++) {
      groups.union(rowKey, row.orderCodes[index]);
    }
  }

  for (const linkedCodes of linkedOrderCodes) {
    const codes = splitCodes(linkedCodes);
    for (let index = 1; index < codes.length; index++) groups.union(codes[0], codes[index]);
  }

  for (const row of sourceRows) {
    if (row.orderCodes.length === 0) continue;
    for (const sibling of siblingCodes(row.deliveryDetail)) groups.union(row.orderCodes[0], sibling);
  }

  const buckets = new Map<string, RemittanceSourceRow[]>();
  for (const row of sourceRows) {
    const rowKey = row.orderCodes[0] || `__ROW_${row.sourceRow}`;
    const root = groups.find(rowKey);
    buckets.set(root, [...(buckets.get(root) || []), row]);
  }

  const merged = Array.from(buckets.values())
    .map(bucket => bucket.sort((left, right) => left.sourceRow - right.sourceRow))
    .sort((left, right) => left[0].sourceRow - right[0].sourceRow);

  const remittances: LogisticsRemittance[] = [];
  let nextRemittanceNumber = FIRST_REMITTANCE_NUMBER;

  for (const bucket of merged) {
    const sourceRowNumbers = bucket.map(row => row.sourceRow);
    const orderCodes = Array.from(new Set(bucket.flatMap(row => row.orderCodes)));
    const orderCode = orderCodes.join(' / ');
    const allItems = bucket.flatMap(row => row.items);
    if (allItems.length === 0) continue;
    const itemChunks: LogisticsRemittanceItem[][] = [];

    for (let index = 0; index < allItems.length; index += ITEMS_PER_REMITTANCE) {
      itemChunks.push(allItems.slice(index, index + ITEMS_PER_REMITTANCE));
    }
    // Respeta huecos previos (R2 empieza en 502), pero cuando un pedido ocupa
    // más de un formulario desplaza los siguientes números para no repetirlos.
    nextRemittanceNumber = Math.max(
      nextRemittanceNumber,
      FIRST_REMITTANCE_NUMBER + bucket[0].sourceRow - firstRowNumber
    );

    itemChunks.forEach((items, partIndex) => {
      remittances.push({
        id: `${orderCode || bucket[0].sheetLabel}|${sourceRowNumbers.join('-')}|${partIndex + 1}`,
        sourceRow: bucket[0].sourceRow,
        sourceRows: sourceRowNumbers,
        sheetLabel: bucket.map(row => row.sheetLabel).join(' / '),
        orderCode,
        orderCodes,
        remittanceNumber: nextRemittanceNumber++,
        partNumber: partIndex + 1,
        partCount: itemChunks.length,
        deliveryDate: firstText(bucket, 'deliveryDate'),
        customerName: firstText(bucket, 'customerName'),
        address: firstText(bucket, 'address'),
        locality: firstText(bucket, 'locality'),
        items
      });
    });
  }

  return remittances;
}

export function formatLegalRemittanceNumber(number: number): string {
  return `Nº 00003-${String(number).padStart(8, '0')}`;
}
