// Pure. COMET match objects -> the Fixture and Result shapes the rest of this codebase
// already speaks. The counterpart of parse.js + normalize.js for the second source.
import { clubNow } from "./clock.js";
import { faiId } from "./source.js";
import { sortResults } from "./normalize.js";
import { seasonPredicate } from "./window.js";

// `match.team` is "H" or "A" RELATIVE TO THE REQUESTED TEAM, which is why every function
// here takes the team id it was fetched for. It is not derivable from the match alone in
// a derby between two of the club's own sides.
const isHomeSide = (match) => match.team === "H";

// A status worth telling someone about. SCHEDULED is the ordinary case and PLAYED is
// already visible as a result, so neither is news; anything else - POSTPONED today, and
// whatever else COMET adds later - rides out through the existing `comment` diff path
// rather than needing a new change type. The observed statuses are NOT the whole set, so
// this is a denylist of the boring ones, never an allowlist of the interesting ones.
const QUIET_STATUSES = new Set(["SCHEDULED", "PLAYED"]);

export function statusComment(liveStatus) {
  const s = String(liveStatus ?? "").trim();
  return s && !QUIET_STATUSES.has(s) ? s : "";
}

// `dateTimeUTC` is epoch MILLISECONDS, and it is the one field here with no safe default.
// `new Date(null)` is epoch 0, so a null kick-off would render as a perfectly plausible
// "1970-01-01" - wrong, and silently so. A missing or non-numeric one makes clubNow throw
// RangeError, which would kill the scan for EVERY squad over one bad match. normalize.js
// already has the right contract for this: isoDate returns null and normalizeAll drops
// that one record with a line in `errors`. This mirrors it.
const kickOffMs = (value) => (Number.isFinite(value) ? value : null);

// `facility` comes from a SEPARATE call - the paginated list carries no venue at all.
// It is optional because it is only fetched for home fixtures: formatFixtureLine names a
// ground only for a home game played elsewhere, so an away venue would be a request whose
// answer is never rendered. One live fixture returns a null facility, so absence is a real
// path, not a defensive flourish.
export function faiFixture(match, teamId, facility) {
  const isHome = isHomeSide(match);
  const ours = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  // clubNow returns the club's local date and time as STRINGS - this is the only new place
  // a Date is constructed, and it is handed straight to clock.js rather than unwrapped
  // here. A UTC round-trip moves every kick-off by an hour for half the year.
  //
  // A null ms means no Date is built at all: a null date is something faiFixtures can see
  // and report, where 1970 or a thrown RangeError is not.
  const ms = kickOffMs(match?.dateTimeUTC);
  const { date, time } = ms === null ? { date: null, time: null } : clubNow(new Date(ms));
  return {
    fid: faiId(match.id),
    teamId: faiId(teamId),
    date,
    time,
    isHome,
    ourTeam: ours.name,
    opponent: opponent.name,
    venue: facility?.place ?? "",
    competition: match.competition?.name ?? "",
    comment: statusComment(match.liveStatus),
  };
}

// -> {fixtures, errors}. The counterpart of normalizeAll: one bad match costs that match,
// never the scan. Collecting here rather than in runFaiCheck keeps the rule pure and
// testable, and keeps the two sources' ingest paths the same shape.
//
// `facilities` is keyed by the COMET match id (that is what the detail call was made with)
// and `previousVenues` by our prefixed fid, because that is how the previous snapshot is
// keyed.
export function faiFixtures(matches, teamId, facilities = {}, previousVenues = {}) {
  const fixtures = [];
  const errors = [];
  for (const match of matches ?? []) {
    const f = faiFixture(match, teamId, facilities?.[match?.id], previousVenues?.[faiId(match?.id)]);
    if (f.date === null) {
      errors.push(`${f.fid}: unusable kick-off "${match?.dateTimeUTC}"`);
      continue;
    }
    fixtures.push(f);
  }
  return { fixtures, errors };
}

// `.current` is the final score; `.regular` and `.half` are the same match at other
// moments and are deliberately ignored. A missing block means the match has no score yet,
// which is not the same as nil-all - hence null rather than 0.
const scoreOf = (side) => (typeof side?.current === "number" ? side.current : null);

export function faiResult(match, teamId) {
  const isHome = isHomeSide(match);
  const ours = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const ms = kickOffMs(match?.dateTimeUTC);
  const { date } = ms === null ? { date: null } : clubNow(new Date(ms));
  const home = scoreOf(match.homeTeamResult);
  const away = scoreOf(match.awayTeamResult);
  return {
    fid: faiId(match.id),
    teamId: faiId(teamId),
    date,
    isHome,
    ourTeam: ours.name,
    opponent: opponent.name,
    // Stored from OUR point of view with isHome recording which side we were, exactly as
    // normalizeResult does, so a stored result reads correctly on its own.
    ourScore: isHome ? home : away,
    theirScore: isHome ? away : home,
    venue: "",
    competition: match.competition?.name ?? "",
  };
}

// -> {results, errors}. `today` decides the season; see window.js seasonStart.
//
// THE SEASON FILTER IS THE POINT OF THIS FUNCTION. The past endpoint returns TWO YEARS of
// history in one call - the Juniors' nine past matches reach back to 2024-09-22 - while
// the Galway feed only ever carried the last day or two. mergeResults adds and updates but
// NEVER deletes, so a stale match admitted once is permanent without hand-editing the data
// repo. Filtering here, on ingest, is what keeps a 2024 cup run out of this season's form.
export function faiResults(matches, teamId, today) {
  const inSeason = seasonPredicate(today);
  const results = [];
  const errors = [];
  for (const match of matches ?? []) {
    const r = faiResult(match, teamId);
    // Before the season filter: seasonPredicate compares date strings, and a null date
    // would be silently filtered out as "not this season" with nothing said about it.
    if (r.date === null) {
      errors.push(`${r.fid}: unusable kick-off "${match?.dateTimeUTC}"`);
      continue;
    }
    if (!inSeason(r)) continue;
    if (r.ourScore === null || r.theirScore === null) {
      errors.push(`${r.fid}: no score on a past match (${r.ourTeam} v ${r.opponent})`);
      continue;
    }
    results.push(r);
  }
  return { results: sortResults(results), errors };
}
