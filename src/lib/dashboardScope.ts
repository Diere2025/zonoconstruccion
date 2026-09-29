export type DashboardChannel = 'all' | 'minorista' | 'mayorista' | 'unclassified';
export const retailOrderChannels = ['minorista', 'web_organica', 'mostrador_minorista', 'vendedor_externo'];
export const dashboardChannelLabels: Record<DashboardChannel, string> = {
  all: 'Todo el negocio', minorista: 'Minorista', mayorista: 'Mayorista', unclassified: 'Sin clasificar'
};

export function classifyDashboardChannel(channel?: string | null): Exclude<DashboardChannel, 'all'> {
  const value = (channel || '').trim().toLowerCase();
  if (value === 'mayorista') return 'mayorista';
  return retailOrderChannels.includes(value) ? 'minorista' : 'unclassified';
}

export function matchesDashboardChannel(order: { channel?: string | null } | null | undefined, channel: DashboardChannel) {
  return channel === 'all' || classifyDashboardChannel(order?.channel) === channel;
}

// A legacy code may be reused by a different seller or channel. Preserve that distinction.
export function dashboardOrderKey(order: { id: string; legacy_code?: string | null; seller_id?: string | null; channel?: string | null }) {
  const code = order.legacy_code?.trim();
  return code ? JSON.stringify([order.seller_id || '', order.channel || '', code]) : order.id;
}

export function uniqueDashboardOrders<T extends { id: string; legacy_code?: string | null; seller_id?: string | null; channel?: string | null }>(orders: T[]): T[] {
  const seen = new Set<string>();
  return orders.filter(order => {
    const key = dashboardOrderKey(order);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dashboardChannelSummary(orders: { channel?: string | null; status?: string | null; total_amount?: unknown }[]) {
  const summary = {
    minorista: { orders: 0, sales: 0 }, mayorista: { orders: 0, sales: 0 }, unclassified: { orders: 0, sales: 0 }
  };
  for (const order of orders) {
    const group = summary[classifyDashboardChannel(order.channel)];
    group.orders++;
    if (order.status !== 'Cancelado' && order.status !== 'Anulado') group.sales += Number(order.total_amount) || 0;
  }
  return summary;
}

export function dashboardRelatedOrder<T>(order: T | T[]) {
  return Array.isArray(order) ? order[0] : order;
}

// Page with a stable ID order at the call site. Counts must not stop at the API row cap.
export async function pagedDashboardQuery<T, E>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>
}, pageSize = 500): Promise<{ data: T[]; error: E | null }> {
  const rows: T[] = [];
  for (let offset = 0; ;) {
    const result = await query.range(offset, offset + pageSize - 1);
    if (result.error) return { data: [], error: result.error };
    const batch = result.data || [];
    if (batch.length === 0) return { data: rows, error: null };
    rows.push(...batch);
    // A configured API cap can be smaller than the requested page size.
    offset += batch.length;
  }
}
