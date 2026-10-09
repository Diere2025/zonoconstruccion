export function receiptGroups(items: any[]) {
  const groups = new Map<string, any>();
  items.forEach((item, index) => {
    const key = item.productId || item.sku || item.poItemId || `custom-${index}`;
    if (!groups.has(key)) groups.set(key, { key, sku: item.sku || 'Sin SKU', name: item.productName, lines: [] });
    groups.get(key).lines.push({ ...item, index });
  });
  return [...groups.values()].map(group => ({ ...group,
    ordered: group.lines.reduce((sum: number, line: any) => sum + line.quantityOrdered, 0),
    prior: group.lines.reduce((sum: number, line: any) => sum + line.quantityReceivedPrior, 0),
    quantity: group.lines.reduce((sum: number, line: any) => sum + line.quantityReceivedNew, 0),
    subtotal: group.lines.reduce((sum: number, line: any) => sum + line.quantityReceivedNew * line.unitCost, 0),
    cost: group.lines.every((line: any) => line.unitCost === group.lines[0].unitCost) ? group.lines[0].unitCost : null,
  }));
}
export function distributeReceiptQuantity(items: any[], indexes: number[], quantity: number) {
  let remaining = Math.max(0, quantity);
  const result = items.map(item => ({ ...item }));
  for (const index of indexes) {
    const item = result[index];
    const pending = item.poItemId ? Math.max(0, item.quantityOrdered - item.quantityReceivedPrior) : remaining;
    item.quantityReceivedNew = Math.min(remaining, pending);
    remaining = Math.max(0, remaining - item.quantityReceivedNew);
  }
  return result;
}

