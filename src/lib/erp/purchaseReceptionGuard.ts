/** A sheet cannot identify a second delivery reliably once an OC has receipts.
 * Further deliveries must use the receipt form, which validates remaining quantities. */
export function canImportPurchaseReception(order: any, hasReceipt: boolean): boolean {
  if (hasReceipt) return false;
  if (!order) return true;
  return !['Cumplido', 'Cancelado'].includes(order.status)
    && !(order.purchase_order_items || []).some((item: any) => Number(item.quantity_received || 0) > 0);
}
export function purchaseSlipKey(supplierId: string, slip: unknown): string {
  return `${supplierId}|${String(slip || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}
