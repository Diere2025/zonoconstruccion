/** Codes are identities, never substring matches (DB1 must not match DB10). */
export function isLogisticsOrderCode(value: string): boolean {
  return /^(?:[A-Z]+\d+|AQ-\d+)$/.test(value.trim().toUpperCase());
}

export function splitOrderCodes(value: string | null | undefined): string[] {
  return (value || '').split(/[/,]/).map(code => code.trim().toUpperCase()).filter(Boolean);
}

export function activeOrderCodes(orders: Array<{ legacy_code?: string | null; status?: string }>): Set<string> {
  const result = new Set<string>();
  for (const order of orders) {
    if (!['Pendiente', 'Confirmado', 'Entregando'].includes(order.status || '')) continue;
    for (const code of splitOrderCodes(order.legacy_code)) result.add(code);
  }
  return result;
}

export function hasActiveOrder(code: string, activeCodes: Set<string>): boolean {
  return splitOrderCodes(code).some(part => activeCodes.has(part));
}

export function syncOutcome(cancelled: boolean, problems: number): 'cancelled' | 'partial' | 'success' {
  return cancelled ? 'cancelled' : problems > 0 ? 'partial' : 'success';
}

/** Share downloads for sources that reference the same sheet during one run. */
export function oncePerKey<T>(loader: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key: string) => {
    let pending = cache.get(key);
    if (!pending) {
      pending = loader(key).catch(error => { cache.delete(key); throw error; });
      cache.set(key, pending);
    }
    return pending;
  };
}

/**
 * Run network mutations concurrently without exceeding Cloudflare's six
 * simultaneous outgoing-connection limit.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}
