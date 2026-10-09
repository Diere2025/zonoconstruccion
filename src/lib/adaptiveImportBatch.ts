/** Keep requests small until consecutive fast batches show room to grow. */
export function createAdaptiveImportBatch() {
  const sizes = [5, 10, 20];
  let level = 0;
  let fastBatches = 0;
  return {
    get size(): number { return sizes[level]; },
    observe(durationMs: number, hadProblems: boolean, rowCount: number): number {
      if (hadProblems || !Number.isFinite(durationMs) || durationMs >= 8000) {
        level = Math.max(0, level - 1);
        fastBatches = 0;
      } else if (durationMs <= 4000 && rowCount === sizes[level]) {
        if (++fastBatches >= 2) {
          level = Math.min(sizes.length - 1, level + 1);
          fastBatches = 0;
        }
      } else {
        fastBatches = 0;
      }
      return sizes[level];
    }
  };
}
