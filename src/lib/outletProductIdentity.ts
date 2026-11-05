export function outletOrderName(item: { name: string; sku?: string | null; outlet_snapshot?: Record<string, unknown> | null }) {
    const code = String(item.outlet_snapshot?.code || item.sku || '').trim();
    const original = String(item.outlet_snapshot?.name || item.name).split(/ · (?:Segunda|Outlet) \[/)[0].trim();
    return code && !original.endsWith(` · ${code}`) ? `${original} · ${code}` : original;
}

/** Match unique physical units to the base cost calculation without creating duplicate recipes. */
export function withOutletCostLinks<T extends { id: string | null; equivalentIds?: string[]; name: string }>(
    current: T[], links: { product_id: string | null; base_product_id: string | null }[],
): T[] {
    const outletIds = new Set(links.flatMap(l => l.product_id ? [l.product_id] : []));
    return current.filter(p => !p.id || !outletIds.has(p.id)).map(p => ({ ...p, equivalentIds: [...new Set([
        ...(p.equivalentIds || []),
        ...links.filter(l => l.base_product_id && (l.base_product_id === p.id || p.equivalentIds?.includes(l.base_product_id))).flatMap(l => l.product_id ? [l.product_id] : []),
    ])] }));
}
