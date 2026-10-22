export interface StockSupplier { id: string; name: string }
export interface StockPurchaseContext {
  suppliers: StockSupplier[];
  pendingIncoming: number;
  pendingOrders: { id: string; code: string; supplierId: string; supplierName: string; quantity: number }[];
}

// Only use a legacy name when it identifies exactly one catalog product.
export function buildStockPurchaseContext(
  products: { id: string; name: string; sku?: string }[],
  suppliers: StockSupplier[],
  relations: { product_id: string; supplier_id: string }[],
  items: { product_id: string | null; raw_product_name?: string; quantity_ordered: number; quantity_received: number; status: string; shortfall_closed?: boolean; purchase_orders: { id: string; oc_code: string; status: string; supplier_id: string } }[],
): Record<string, StockPurchaseContext> {
  const result: Record<string, StockPurchaseContext> = {};
  const supplierNames = new Map(suppliers.map(s => [s.id, s.name]));
  const aliases = new Map<string, Set<string>>();
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const product of products) {
    result[product.id] = { suppliers: [], pendingIncoming: 0, pendingOrders: [] };
    for (const value of [product.name, product.sku]) {
      if (!value) continue;
      const key = normalize(value);
      const ids = aliases.get(key) || new Set<string>();
      ids.add(product.id);
      aliases.set(key, ids);
    }
  }
  const addSupplier = (productId: string, supplierId: string) => {
    const context = result[productId];
    if (context && supplierId && !context.suppliers.some(s => s.id === supplierId)) {
      context.suppliers.push({ id: supplierId, name: supplierNames.get(supplierId) || 'Proveedor sin nombre' });
    }
  };
  relations.forEach(r => addSupplier(r.product_id, r.supplier_id));
  for (const item of items) {
    const order = item.purchase_orders;
    if (!order || !['Pendiente', 'Parcial'].includes(order.status) || item.status === 'Cancelado' || item.shortfall_closed) continue;
    const quantity = Math.max(0, Number(item.quantity_ordered) - Number(item.quantity_received));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const matches = aliases.get(normalize(item.raw_product_name || ''));
    const productId = item.product_id || (matches?.size === 1 ? [...matches][0] : '');
    const context = result[productId];
    if (!context) continue;
    addSupplier(productId, order.supplier_id);
    context.pendingIncoming += quantity;
    const existing = context.pendingOrders.find(o => o.id === order.id);
    if (existing) existing.quantity += quantity;
    else context.pendingOrders.push({ id: order.id, code: order.oc_code, supplierId: order.supplier_id, supplierName: supplierNames.get(order.supplier_id) || 'Proveedor sin nombre', quantity });
  }
  return result;
}
