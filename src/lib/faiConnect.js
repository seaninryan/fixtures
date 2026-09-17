// Pure. COMET match objects -> the Fixture and Result shapes the rest of this codebase
// already speaks. The counterpart of parse.js + normalize.js for the second source.
import { clubNow } from "./clock.js";
import { faiId } from "./source.js";

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

// `facility` comes from a SEPARATE call - the paginated list carries no venue at all.
// It is optional because it is only fetched for home fixtures: formatFixtureLine names a
// ground only for a home game played elsewhere, so an away venue would be a request whose
// answer is never rendered. One live fixture returns a null facility, so absence is a real
// path, not a defensive flourish.
export function faiFixture(match, teamId, facility) {
  const isHome = isHomeSide(match);
  const ours = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  // dateTimeUTC is epoch MILLISECONDS. clubNow returns the club's local date and time as
  // STRINGS - this is the only new place a Date is constructed, and it is handed straight
  // to clock.js rather than unwrapped here. A UTC round-trip moves every kick-off by an
  // hour for half the year.
  const { date, time } = clubNow(new Date(match.dateTimeUTC));
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
