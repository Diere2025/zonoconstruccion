/** Keep large ID filters small while limiting simultaneous database reads. */
export async function readBatches<T>(rows: readonly T[], read: (chunk: T[]) => Promise<void>) {
  const size = 100;
  const concurrency = 2;
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const offset = next;
      next += size;
      await read(rows.slice(offset, offset + size));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.ceil(rows.length / size)) }, worker));
}
