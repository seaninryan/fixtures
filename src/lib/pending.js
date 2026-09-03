// Pure. Games whose kick-off has passed but whose result has not arrived.
//
// Derived at READ time from the snapshot and the results store, with nothing persisted.
// The reason it works at all: the league's endpoint returns only upcoming fixtures, so
// a played game leaves the feed - but every fixture window starts at `today`, "All"
// included, so a past-dated fixture still sitting in latest.json is filtered out of the
// Fixtures tab while having no result to show under Results. That hole is about 16 hours
// wide for an evening kick-off, and this fills it.
//
// What this deliberately does NOT cover: once a run happens after the game the fixture
// leaves the snapshot too, and if the league still has not published, the game vanishes
// again. Only a persisted store keyed off diff.js's disappearance branch fixes that, and
// the spec defers it - the live data has no instance of it.
import { resultWindowRange } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor } from "./squadColors.js";
import { shortDate } from "./announce.js";

// How far back a pending game is still worth showing. The snapshot only holds what the
// league still lists, so this bounds the one failure mode that outlives a run: a fixture
// stranded in the feed with a past date would otherwise sit in the list for months.
const PENDING_WINDOW = "Last 14 days";

const HH_MM = /^\d{2}:\d{2}$/;

// String comparison throughout, which is only valid for zero-padded 24-hour times. All
// 14 distinct times in the live snapshot are strict HH:MM, but a single "9:00" would
// compare ABOVE "18:30" and make a morning game look permanently unplayed - so an
// unrecognised time falls back to the date alone. That reports not-yet-kicked-off for
// today and picks the game up tomorrow: late, never wrong.
export function hasKickedOff(fixture, now) {
  if (fixture.date < now.date) return true;
  if (fixture.date > now.date) return false;
  if (!HH_MM.test(fixture.time) || !HH_MM.test(now.time)) return false;
  return fixture.time <= now.time;
}

// `now` is {date, time} from clock.js - the club's local clock, not UTC.
export function pendingFixtures(fixtures, results, now) {
  // Identity is fid, never a name or a date: a result for another game on the same day
  // must not clear this one.
  const scored = new Set((results ?? []).map((r) => r.fid));
  const floor = resultWindowRange(PENDING_WINDOW, now.date).from;
  return (fixtures ?? [])
    .filter((f) => f.date >= floor && hasKickedOff(f, now) && !scored.has(f.fid))
    // Newest day first, then by squad so the same squad lands in the same place, then
    // fid to make the order TOTAL - the list never depends on how the caller sorted.
    // The same rule roundupLines follows.
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(a.teamId).localeCompare(String(b.teamId)) ||
      String(a.fid).localeCompare(String(b.fid)));
}

// Mirrors roundupLines' shape - {kind, text, teamId, color} - so the tab renders these
// through the same swatch markup. Every line is a `pending` line carrying a colour;
// unlike the round-up there are no day or blank lines to interleave.
export function pendingLines(fixtures, results, config, now) {
  const chosen = pendingFixtures(fixtures, results, now);
  if (chosen.length === 0) return [];

  // Resolved over EVERY fixture, never over `chosen`. deriveLabels shows the A/B letter
  // only when the club runs more than one side at that age and gender, so resolving over
  // a one-game pending list silently renames "U14A Boys" to "U14 Boys". The pending list
  // is a filtered subset and therefore exactly the shape that causes this. It has
  // happened three times. NEVER pass `chosen` here.
  const { labels } = resolveTeams(fixtures ?? [], config);

  return chosen.map((f) => ({
    kind: "pending",
    // v / @ and the date format both come from announce.js, so a pending line and a
    // fixture line read the same way.
    text: `${labels[f.teamId] ?? f.ourTeam} ${f.isHome ? "v" : "@"} ${f.opponent}` +
      ` — ${shortDate(f.date)}, ${f.time}`,
    teamId: f.teamId,
    color: squadColor(f.teamId, config).bg,
  }));
}
