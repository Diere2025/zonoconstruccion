/** Cache immutable source reads within one run; a new run always refreshes. */
export function createRunReadCache<T>(ttlMs = 15 * 60 * 1000, maxEntries = 2) {
  const entries = new Map<string, { expiresAt: number; pending: Promise<T> }>();
  return {
    async read(key: unknown, loader: () => Promise<T>): Promise<{ value: T; reused: boolean }> {
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) return { value: await loader(), reused: false };
      const now = Date.now();
      for (const [id, entry] of entries) if (entry.expiresAt <= now) entries.delete(id);
      let entry = entries.get(key);
      const reused = !!entry;
      if (!entry) {
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
        entry = { expiresAt: now + ttlMs, pending: loader() };
        entries.set(key, entry);
        const created = entry;
        entry.pending.catch(() => { if (entries.get(key) === created) entries.delete(key); });
      }
      // Per-batch planning must not mutate the shared source snapshot.
      return { value: structuredClone(await entry.pending), reused };
    },
    release(key: unknown) { if (typeof key === 'string') entries.delete(key); }
  };
}
