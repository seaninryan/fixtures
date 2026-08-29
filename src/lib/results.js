// Pure. The accumulated results store, and the round-up text built from it.
import { sortResults } from "./normalize.js";

export const RESULTS_VERSION = 1;

// Add and update; NEVER delete.
//
// The league's feed carries only the last day or two of results, so the store is the
// only place a result survives. A result missing from today's feed means the feed has
// moved on, never that the game was unplayed - pruning to match the feed would erase
// the season a few days at a time. This is the direct counterpart of runCheck's rule
// that a failed fetch must never look like a cancellation.
export function mergeResults(previous, incoming, now) {
  // Array.isArray, not `?.length`: a corrupted `{results: "nope"}` must read as an
  // empty store rather than as something to iterate.
  const stored = Array.isArray(previous?.results) ? previous.results : [];
  const byFid = new Map(stored.map((r) => [r.fid, r]));
  for (const r of incoming ?? []) byFid.set(r.fid, r);
  return {
    version: RESULTS_VERSION,
    updatedAt: now,
    results: sortResults([...byFid.values()]),
  };
}
