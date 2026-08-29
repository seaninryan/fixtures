// Pure. The whole pipeline minus I/O: HTML in, everything the caller must persist out.
//
// Keeping the safety rules here rather than in the script is deliberate - they are the
// part that must be tested, and a script that talks to the network and the filesystem is
// the hardest place to test anything.
import { parse } from "./parse.js";
import { normalizeAll, normalizeAllResults } from "./normalize.js";
import { mergeResults } from "./results.js";
import { diff } from "./diff.js";
import { seedConfig, resolveTeams } from "./teams.js";
import { changeReport } from "./changeReport.js";

export const SNAPSHOT_VERSION = 1;

// How far the fixture list may shrink in one run before the run is treated as a parse
// failure rather than as news. Half is deliberate: the list only ever shrinks by the
// games played since the last run, and the club does not play half a season overnight.
export const SHRINK_LIMIT = 0.5;

export function runCheck({ html, previous, previousResults, config, now, today, history = [], siteUrl, allowShrink = false }) {
  const parsed = parse(html);
  const { fixtures, errors: dateErrors } = normalizeAll(parsed.fixtures);
  const errors = [...parsed.errors, ...dateErrors];

  // THE SAFETY RULE. A blocked request, a redesigned page or a truncated response all
  // arrive here as "no fixtures". Writing that snapshot would report every fixture as
  // cancelled and then leave a baseline claiming the club has no fixtures at all.
  if (fixtures.length === 0) {
    throw new Error(`aborting: no fixtures parsed from the response (${errors.length} parse errors)`);
  }

  // A partial parse failure is likelier than a total one - the league tweaks their markup
  // and most blocks stop matching. The zero-fixtures rule above does not catch it, and the
  // result is an email announcing dozens of cancellations that never happened. A real
  // fixture list shrinks gradually as games are played; it does not halve overnight.
  // Array.isArray, not `?.length`, so this agrees with the firstRun check below about
  // what counts as a baseline - a corrupted `{fixtures: "nope"}` would otherwise read
  // as a baseline of 4 here while being treated as a first run there.
  const before = Array.isArray(previous?.fixtures) ? previous.fixtures.length : 0;
  if (!allowShrink && before > 0 && fixtures.length < before * SHRINK_LIMIT) {
    throw new Error(
      `aborting: fixture count collapsed from ${before} to ${fixtures.length} ` +
      `(${errors.length} parse errors). Re-run with allowShrink if this is genuine.`,
    );
  }

  const snapshot = { version: SNAPSHOT_VERSION, fetchedAt: now, fixtures };

  // Results are merged AFTER the two guards above on purpose: if the payload was bad
  // enough to fail them, its results are not to be trusted either, and nothing is
  // written at all. Note there is deliberately NO zero-results guard - most days have
  // no games, so an empty results list is the ordinary case, not a signal of failure.
  const { results: parsedResults, errors: resultErrors } = normalizeAllResults(parsed.results);
  errors.push(...resultErrors);
  const results = mergeResults(previousResults, parsedResults, now);

  const nextConfig = seedConfig(fixtures, config);
  const { unknown } = resolveTeams(fixtures, nextConfig);

  // A first run has nothing to compare against. Diffing against an empty list would call
  // the entire season "new" and email all of it.
  const firstRun = !previous || !Array.isArray(previous.fixtures);
  const changes = firstRun ? [] : diff(previous.fixtures, fixtures, today);

  // `fixtures` is the NEW snapshot, and passing it is required: changeReport resolves
  // squad labels, and deriveLabels shows the A/B letter only when the club runs more
  // than one side at that age and gender. Letting it fall back to just the changed
  // fixtures would rename "U14B Boys" to "U14 Boys" in the alert email.
  const report = changeReport(changes, nextConfig, { unknown, siteUrl, fixtures });

  return {
    snapshot,
    results,
    config: nextConfig,
    changes,
    report,
    unknown,
    errors,
    firstRun,
    history: changes.length ? [{ checkedAt: now, changes }, ...history] : history,
  };
}
