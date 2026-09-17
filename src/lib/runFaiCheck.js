// Pure. The FAI Connect pipeline minus I/O, mirroring runCheck.js.
//
// The safety rules live here rather than in the script for the same reason they do
// there: they are the part that must be tested, and a script that talks to the network
// and the filesystem is the hardest place to test anything.
import { faiFixtures, faiResults } from "./faiConnect.js";
import { sortFixtures } from "./normalize.js";
import { mergeResults } from "./results.js";
import { diff } from "./diff.js";
import { seedConfig, resolveTeams } from "./teams.js";
import { changeReport } from "./changeReport.js";

export const FAI_SNAPSHOT_VERSION = 1;

// `matches` is {teamId: {future, past}} and `facilities` is {matchId: facility|null},
// both assembled by the caller - this module performs no I/O.
export function runFaiCheck({
  teams, matches, facilities = {}, previous, previousResults, config,
  now, today, history = [], siteUrl, allowShrink = false,
}) {
  // THE FIRST SAFETY RULE. An empty team list is a broken api_key, a User-Agent that has
  // been added to the denylist, or a moved endpoint. It is never a club with no teams.
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("aborting: FAI Connect returned no teams for the club");
  }

  // `today` decides the season floor, and that floor is applied on INGEST where
  // mergeResults never deletes. seasonStart deliberately fails OPEN on a malformed date -
  // right when reading, permanent when writing - so this is the one caller that must
  // refuse it rather than inherit it.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) {
    throw new Error(`aborting: today must be an ISO date, got "${today}"`);
  }

  // Keyed by fid, for faiFixtures' venue fallback: a facility lookup that FAILED leaves
  // no entry in `facilities`, and rendering that absence as "" would report a venue being
  // removed. Yesterday's venue is the only value that does not invent a change.
  const previousVenues = {};
  for (const f of previous?.fixtures ?? []) previousVenues[f.fid] = f.venue;

  const fixtures = [];
  const rawResults = [];
  const errors = [];
  for (const team of teams) {
    // Most of the 25 teams are stale entries that have not played in two years. A team
    // with no matches is skipped, not reported: that is the ordinary case during the
    // migration, not a failure.
    //
    // `team.id` is a NUMBER off the JSON; `matches` keys as written by the caller are
    // themselves plain numbers or numeric strings. Either way this is an ordinary
    // property lookup, and JS coerces a numeric key to its string form for both writing
    // and reading a plain object - `{61270: x}[61270]` and `{61270: x}["61270"]` reach
    // the same slot. Nothing here needs the id to be a particular type.
    const found = matches?.[team.id];
    if (!found) continue;
    const { fixtures: teamFixtures, errors: fixtureErrors } =
      faiFixtures(found.future, team.id, facilities, previousVenues);
    fixtures.push(...teamFixtures);
    errors.push(...fixtureErrors);
    const { results, errors: resultErrors } = faiResults(found.past, team.id, today);
    rawResults.push(...results);
    errors.push(...resultErrors);
  }

  // THE SECOND SAFETY RULE, and the counterpart of runCheck's zero-fixtures abort. Every
  // team going quiet at once is what a blocked or rerouted API looks like; writing that
  // snapshot would report both squads' fixtures as cancelled.
  //
  // Conditioned on the PREVIOUS snapshot having had fixtures, because an empty result is
  // legitimate before any squad has migrated - and will be again at the end of a season.
  // runCheck's 50% shrink rule is deliberately NOT reused: the Juniors have five upcoming
  // fixtures, so playing three in a fortnight would trip it. At this scale the guard would
  // cry wolf far more often than it caught anything.
  const before = Array.isArray(previous?.fixtures) ? previous.fixtures.length : 0;
  if (fixtures.length === 0 && before > 0) {
    throw new Error(
      `aborting: no fixtures from FAI Connect, but the previous snapshot had ${before}`,
    );
  }

  const snapshot = {
    version: FAI_SNAPSHOT_VERSION,
    fetchedAt: now,
    fixtures: sortFixtures(fixtures),
  };

  // THE THIRD SAFETY RULE: a PARTIAL outage. The zero-fixtures rule above only catches
  // total silence, but one squad's feed going empty while another still reports is both
  // likelier and just as damaging - every one of that squad's upcoming fixtures diffs as
  // `cancelled`, gets emailed, and is dropped from the baseline.
  //
  // Scoped to fixtures dated AFTER today, which is exactly diff.js's test for a
  // cancellation. A squad whose season has simply ended has no future-dated fixtures to
  // lose, so the ordinary end of a campaign never trips this - only the disappearance of
  // games that had not been played yet.
  const upcomingBySquad = new Map();
  for (const f of previous?.fixtures ?? []) {
    if (f.date > today) upcomingBySquad.set(f.teamId, (upcomingBySquad.get(f.teamId) ?? 0) + 1);
  }
  const nowBySquad = new Set(snapshot.fixtures.map((f) => f.teamId));
  const vanished = [...upcomingBySquad.keys()].filter((id) => !nowBySquad.has(id));
  if (!allowShrink && vanished.length > 0 && nowBySquad.size > 0) {
    throw new Error(
      `aborting: ${vanished.join(", ")} lost every upcoming fixture while other squads `
      + "still report. Re-run with allowShrink if this is genuine.",
    );
  }

  const results = mergeResults(previousResults, rawResults, now);
  const nextConfig = seedConfig(snapshot.fixtures, config);
  const { unknown } = resolveTeams(snapshot.fixtures, nextConfig);

  // A first run has nothing to compare against. Diffing against an empty list would call
  // both squads' whole seasons "new" and email all of it.
  const firstRun = !previous || !Array.isArray(previous.fixtures);
  const changes = firstRun ? [] : diff(previous.fixtures, snapshot.fixtures, today);

  // `snapshot.fixtures` is the NEW snapshot, and passing it is required: changeReport
  // resolves squad labels, and deriveLabels shows the A/B letter only when the club runs
  // more than one side at that age and gender. Letting it fall back to just the changed
  // fixtures would rename "U14B Boys" to "U14 Boys" in the alert email.
  const report = changeReport(changes, nextConfig, {
    unknown, siteUrl, fixtures: snapshot.fixtures,
  });

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
