import type { StockPurchaseContext } from './stockPurchaseContext';

export type StockSortKey = 'supplier' | 'name' | 'physical' | 'reserved' | 'available' | 'incoming' | 'projected';
export interface SortableStockProduct {
  id?: string;
  productId?: string;
  name: string;
  sku: string;
  dbPhysical: number;
  dbCalculatedReserved: number;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function stockSupplierLabel(context?: StockPurchaseContext): string {
  return context?.suppliers.map(s => s.name).sort(collator.compare).join(' · ') || '';
}

export function sortStockProducts<T extends SortableStockProduct>(
  products: T[], context: Record<string, StockPurchaseContext> | null,
  key: StockSortKey, direction: 'asc' | 'desc',
  displayedAvailable: (product: T) => number = p => p.dbPhysical - p.dbCalculatedReserved,
): T[] {
  const value = (p: T): number | string | null => {
    const supply = context?.[p.id || p.productId || ''];
    switch (key) {
      case 'supplier': return stockSupplierLabel(supply) || null;
      case 'name': return p.sku || p.name;
      case 'physical': return p.dbPhysical;
      case 'reserved': return p.dbCalculatedReserved;
      case 'available': return displayedAvailable(p);
      case 'incoming': return supply ? supply.pendingIncoming : null;
      case 'projected': return supply ? p.dbPhysical - p.dbCalculatedReserved + supply.pendingIncoming : null;
    }
  };
  return [...products].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Unknown quantities and products without a supplier always appear last.
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av ?? ''), String(bv ?? ''));
    return comparison * (direction === 'asc' ? 1 : -1)
      || collator.compare(a.sku || a.name, b.sku || b.name)
      || collator.compare(a.id || a.productId || '', b.id || b.productId || '');
  });
}
