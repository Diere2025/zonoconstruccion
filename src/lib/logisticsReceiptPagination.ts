/**
 * Reorders only when doing so removes an otherwise avoidable half-empty sheet.
 * Full-page documents keep their relative order, as do regular documents; the
 * first regular document from a later odd run is moved before the intervening
 * full-page document(s) to complete the earlier sheet.
 */
export function optimizeTwoUpOrder<T>(
  documents: T[],
  occupiesFullPage: (document: T) => boolean
): T[] {
  if (documents.length < 2) return documents;

  const regularRuns: T[][] = [[]];
  const fullPageDocuments: T[] = [];

  for (const document of documents) {
    if (occupiesFullPage(document)) {
      fullPageDocuments.push(document);
      regularRuns.push([]);
    } else {
      regularRuns[regularRuns.length - 1].push(document);
    }
  }

  const regularDocuments = regularRuns.flat();
  const currentRegularSheets = regularRuns.reduce((sum, run) => sum + Math.ceil(run.length / 2), 0);
  const minimumRegularSheets = Math.ceil(regularDocuments.length / 2);
  if (currentRegularSheets === minimumRegularSheets) return documents;

  const originalPrefixes: number[] = [];
  regularRuns.reduce((sum, run, index) => {
    const next = sum + run.length;
    if (index < regularRuns.length - 1) originalPrefixes.push(next);
    return next;
  }, 0);

  interface Candidate {
    cost: number;
    counts: number[];
  }

  const isBetter = (candidate: Candidate, current?: Candidate) => {
    if (!current || candidate.cost !== current.cost) return !current || candidate.cost < current.cost;
    for (let index = 0; index < candidate.counts.length; index++) {
      if (candidate.counts[index] !== current.counts[index]) {
        // In a tie, bring the following order backwards, matching 1,2,3,5,4.
        return candidate.counts[index] > current.counts[index];
      }
    }
    return false;
  };

  let states = new Map<string, Candidate>();
  states.set('0|0', { cost: 0, counts: [] });

  for (let runIndex = 0; runIndex < regularRuns.length; runIndex++) {
    const nextStates = new Map<string, Candidate>();
    for (const [stateKey, candidate] of states) {
      const [usedText, oddText] = stateKey.split('|');
      const used = Number(usedText);
      const oddUsed = Number(oddText);
      for (let count = 0; used + count <= regularDocuments.length; count++) {
        const nextOddUsed = oddUsed + count % 2;
        if (nextOddUsed > regularDocuments.length % 2) continue;
        const nextUsed = used + count;
        if (runIndex === regularRuns.length - 1 && nextUsed !== regularDocuments.length) continue;
        const boundaryCost = runIndex < originalPrefixes.length
          ? Math.abs(nextUsed - originalPrefixes[runIndex])
          : 0;
        const nextCandidate = {
          cost: candidate.cost + boundaryCost,
          counts: [...candidate.counts, count]
        };
        const key = `${nextUsed}|${nextOddUsed}`;
        if (isBetter(nextCandidate, nextStates.get(key))) nextStates.set(key, nextCandidate);
      }
    }
    states = nextStates;
  }

  const allocation = states.get(`${regularDocuments.length}|${regularDocuments.length % 2}`)?.counts;
  if (!allocation) return documents;

  let regularIndex = 0;
  for (let index = 0; index < regularRuns.length; index++) {
    regularRuns[index] = regularDocuments.slice(regularIndex, regularIndex + allocation[index]);
    regularIndex += allocation[index];
  }

  const optimized: T[] = [];
  for (let index = 0; index < regularRuns.length; index++) {
    optimized.push(...regularRuns[index]);
    if (fullPageDocuments[index]) optimized.push(fullPageDocuments[index]);
  }
  return optimized;
}
