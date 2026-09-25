import { LogisticsPrintItem, LogisticsPrintOrder, LogisticsTrip } from './logisticsPrintOrders';
import { buildOrderNoteGroups } from './logisticsOrderNotes';
import { DEFAULT_PRINT_CATEGORIES, isCategorizationProduct, warehouseCategory } from './warehouseCategoryConfig';

export interface WarehouseLine { name: string; quantity: number; bulky: boolean; category: string }
export interface WarehouseLoad { code: string; route: string; deliveryOrder: string; sourceRow: number; lines: WarehouseLine[] }

export function isWarehouseProduct(item: LogisticsPrintItem): boolean {
  return isCategorizationProduct(item.name) && item.quantity > 0 && item.unitPrice >= 0;
}

export function isBulkyWarehouseProduct(name: string): boolean {
  return /\b(?:aquafort|biofort|\bwp\b|tanque(?:s)?\s+(?:de\s+)?agua|biodigestor)/i.test(name);
}

export function separateWarehouseLines(orders: LogisticsPrintOrder[], categoryOrder: string[] = DEFAULT_PRINT_CATEGORIES): WarehouseLine[] {
  const grouped = new Map<string, WarehouseLine>();
  for (const order of orders) for (const item of order.items.filter(isWarehouseProduct)) {
    const key = item.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
    const existing = grouped.get(key);
    if (existing) existing.quantity += item.quantity;
    else grouped.set(key, { name: item.name.trim(), quantity: item.quantity, bulky: isBulkyWarehouseProduct(item.name), category: item.categoryOverride && item.category?.trim() ? item.category.trim() : warehouseCategory(item.name) });
  }
  return [...grouped.values()].sort((a, b) => {
    const aOrder = categoryOrder.indexOf(a.category);
    const bOrder = categoryOrder.indexOf(b.category);
    return (aOrder < 0 ? categoryOrder.length : aOrder) - (bOrder < 0 ? categoryOrder.length : bOrder)
      || a.category.localeCompare(b.category, 'es', { sensitivity: 'base' })
      || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      || a.quantity - b.quantity;
  });
}

export function warehouseTotalGroup(orders: LogisticsPrintOrder[], categoryOrder?: string[]) {
  return {
    key: 'total', deliveryDate: '',
    trip: { zone: '', route: '', carrier: '', driver: '', vehicle: '', companion: '', departure: '' },
    orders, separate: separateWarehouseLines(orders, categoryOrder), load: [] as WarehouseLoad[]
  };
}

export function warehouseGroups(orders: LogisticsPrintOrder[], fallback: Partial<LogisticsTrip> = {}, categoryOrder?: string[]) {
  return buildOrderNoteGroups(orders, fallback).map(group => {
    const separate = separateWarehouseLines(group.orders, categoryOrder);
    const load = group.orders.map((order, index) => ({
      code: order.codes.join(' / ') || order.legacyCode,
      route: order.trip?.route?.trim() || '',
      deliveryOrder: order.deliveryOrder?.trim() || '',
      sourceRow: order.sourceRows?.[0] ?? index + 1,
      lines: order.items.filter(isWarehouseProduct).map(item => ({ name: item.name, quantity: item.quantity, bulky: isBulkyWarehouseProduct(item.name), category: item.categoryOverride && item.category?.trim() ? item.category.trim() : warehouseCategory(item.name) }))
    })).filter(order => order.lines.length);
    const routeOrder = new Map<string, number>();
    for (const order of load) {
      const key = order.route.toLocaleLowerCase('es');
      if (!routeOrder.has(key)) routeOrder.set(key, routeOrder.size);
    }
    load.sort((a, b) => {
      const routeDifference = routeOrder.get(a.route.toLocaleLowerCase('es'))! - routeOrder.get(b.route.toLocaleLowerCase('es'))!;
      if (routeDifference) return routeDifference;
      const aOrder = Number.parseInt(a.deliveryOrder, 10);
      const bOrder = Number.parseInt(b.deliveryOrder, 10);
      return (Number.isNaN(aOrder) ? Infinity : aOrder) - (Number.isNaN(bOrder) ? Infinity : bOrder)
        || a.sourceRow - b.sourceRow;
    });
    return { ...group, separate, load };
  }).filter(group => group.separate.length > 0);
}
