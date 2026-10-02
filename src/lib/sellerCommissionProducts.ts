export interface CommissionProductLine {
  product_id?: string | null;
  product_name: string;
  category: string;
  group_id: string;
  group_name: string;
  quantity: number;
  net_sales: number;
}

export interface CommissionProductSummary extends CommissionProductLine {
  key: string;
  rate_pct: number;
  commission: number;
}

export function summarizeCommissionProducts(
  lines: CommissionProductLine[],
  rates: { group_id: string; applied_rate_pct: number }[],
): CommissionProductSummary[] {
  const products = new Map<string, CommissionProductSummary>();
  for (const line of lines) {
    const identity = line.product_id || line.product_name.trim().toLowerCase();
    // Keep different commission groups separate so each row has one unambiguous rate.
    const key = JSON.stringify([identity, line.group_id]);
    const existing = products.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.net_sales += line.net_sales;
    } else {
      products.set(key, { ...line, key, rate_pct: rates.find(r => r.group_id === line.group_id)?.applied_rate_pct ?? 0, commission: 0 });
    }
  }
  return [...products.values()].map(product => ({
    ...product, commission: product.net_sales * product.rate_pct / 100,
  })).sort((a, b) => b.net_sales - a.net_sales || a.product_name.localeCompare(b.product_name));
}
