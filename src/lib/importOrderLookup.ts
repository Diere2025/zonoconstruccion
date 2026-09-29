import { splitOrderCodes } from './orderSync';

/** Prefer the indexed identity lookup; grouped legacy codes need a fallback. */
export async function findImportOrders(db: any, codes: string[], columns: string): Promise<any[]> {
  const targets = [...new Set(codes.flatMap(splitOrderCodes))];
  if (!targets.length) return [];

  const exact = await db.from('orders').select(columns).in('legacy_code', targets);
  if (exact.error) throw exact.error;
  const orders: any[] = exact.data || [];
  const found = new Set(orders.flatMap(order => splitOrderCodes(order.legacy_code)));
  const missing = targets.filter(code => !found.has(code));
  if (!missing.length) return orders;

  // Quote filter values and escape wildcard characters in literal order codes.
  const conditions = missing.map(code => {
    const literal = code.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"');
    return `legacy_code.ilike."%${literal}%"`;
  }).join(',');
  const grouped = await db.from('orders').select(columns).or(conditions);
  if (grouped.error) throw grouped.error;
  const wanted = new Set(missing);
  const ids = new Set(orders.map(order => order.id));
  for (const order of grouped.data || []) {
    // A substring candidate such as JS256190 is not the identity JS25619.
    if (!ids.has(order.id) && splitOrderCodes(order.legacy_code).some(code => wanted.has(code))) {
      orders.push(order);
      ids.add(order.id);
    }
  }
  return orders;
}
