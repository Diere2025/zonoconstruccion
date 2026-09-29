/** Read only the items needed by this logistics batch, including large orders. */
export async function loadLogisticsBatchItems(db: any, orderIds: string[]): Promise<any[]> {
  const ids = [...new Set(orderIds)];
  const items: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    for (let page = 0; ; page++) {
      const { data, error } = await db.from('order_items')
        .select('order_id, product_name, quantity, unit_price')
        .in('order_id', batch)
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      items.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }
  return items;
}
