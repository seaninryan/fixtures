// Pure. The only module that knows what "This weekend" means.
//
// All arithmetic is on ISO date STRINGS via UTC day maths. Fixture dates are Irish local
// dates with no time component, so this never crosses a DST boundary and a kick-off can
// never shift a day.
export const WINDOWS = ["This weekend", "Next 7 days", "Next 14 days", "All"];

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const asIso = (d) => d.toISOString().slice(0, 10);

// Exported: form.js steps a week at a time across the chart's axis. Keeping ISO date
// arithmetic in this one module is why weekStart lives here too.
export function addDays(iso, n) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

const dayOfWeek = (iso) => asDate(iso).getUTCDay(); // 0 Sun .. 6 Sat

// The Monday of that date's week. Monday-start because that is how a football week
// reads: a weekend's games belong to the week that just finished, not the one starting.
//
// dayOfWeek is 0 Sun .. 6 Sat, so (dow + 6) % 7 is "days since Monday" - 0 for Monday
// and 6 for Sunday, which is exactly the shift needed.
export function weekStart(iso) {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

export function windowRange(name, today) {
  if (name === "This weekend") {
    const dow = dayOfWeek(today);
    if (dow === 6) return { from: today, to: addDays(today, 1) };  // Saturday
    if (dow === 0) return { from: today, to: today };              // Sunday
    const friday = addDays(today, 5 - dow);                        // Mon..Fri -> this Friday
    return { from: friday, to: addDays(friday, 2) };
  }
  if (name === "Next 7 days") return { from: today, to: addDays(today, 6) };
  if (name === "Next 14 days") return { from: today, to: addDays(today, 13) };
  // "All", and anything unrecognised: showing everything beats showing nothing.
  return { from: today, to: "9999-12-31" };
}

export function windowPredicate(name, today) {
  const { from, to } = windowRange(name, today);
  return (fixture) => fixture.date >= from && fixture.date <= to;
}

// The season boundary. 1 August is early enough to precede every squad's first
// competitive game - most start in September - and late enough to sit clear of the
// previous season's tail.
//
// Derived from `today` rather than configured, so it rolls over on its own: there is no
// constant to forget to edit each August. Pure string arithmetic, like everything else
// here - "2026-09-17" >= "2026-08-01" is a correct comparison on ISO dates.
export const SEASON_START_MONTH_DAY = "08-01";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function seasonStart(today) {
  // A malformed `today` must degrade toward showing EVERYTHING, never nothing - the rule
  // this module states for itself in windowRange. "NaN-08-01" compares above every real
  // date, so without this guard a bad clock would silently empty "All" instead of
  // over-filling it. The regex also catches an unpadded "2026-7-5", which would otherwise
  // resolve to the wrong season without complaint.
  //
  // No live caller can produce one - clock.js zero-pads and check.mjs slices an ISO
  // string - so this is cheap insurance at a boundary, not a reachable path.
  if (!ISO_DATE.test(String(today))) return "0000-08-01";
  const year = Number(String(today).slice(0, 4));
  const thisYears = `${year}-${SEASON_START_MONTH_DAY}`;
  return today >= thisYears ? thisYears : `${year - 1}-${SEASON_START_MONTH_DAY}`;
}

// For filtering a results store, which keeps every season forever - mergeResults never
// deletes. Anything dated before the boundary belongs to a season that has ended.
//
// A FLOOR ONLY, with no upper bound, and that is deliberate: a result is by definition a
// game already played, so nothing in the store can post-date `today`. An upper bound
// would be unreachable code that reads as though it guarded something.
export function seasonPredicate(today) {
  const from = seasonStart(today);
  return (r) => r.date >= from;
}

// The backward twins, for results. Added as separate exports rather than by
// generalising windowRange: that function is load-bearing for the announcement and
// its weekend logic is subtle enough not to disturb for the sake of sharing five
// lines of arithmetic. There is deliberately no weekend window here - this club plays
// midweek evenings routinely, and a weekend-only default hid half the results store.
export const RESULT_WINDOWS = ["Last 7 days", "Last 14 days", "All"];

export function resultWindowRange(name, today) {
  if (name === "Last 7 days") return { from: addDays(today, -6), to: today };
  if (name === "Last 14 days") return { from: addDays(today, -13), to: today };
  // "All", and anything unrecognised: everything THIS SEASON, where it used to mean all
  // time. The results store keeps every season forever - mergeResults never deletes - so
  // an unbounded "All" would carry last season into this one from 1 August onwards.
  //
  // Deliberately the ONLY season-bounded window. Clamping the rolling windows too would
  // put a game played on 31 July beyond every window on 1 August - out of "Last 7 days"
  // by the clamp and out of "All" by the same boundary - with nothing saying so. A window
  // labelled by the calendar stays the calendar's answer; only "All" is the season's.
  // pending.js also reads the 14-day range as a feed floor, and must not inherit a
  // season rule it never asked for.
  return { from: seasonStart(today), to: "9999-12-31" };
}

export function resultWindowPredicate(name, today) {
  const { from, to } = resultWindowRange(name, today);
  return (result) => result.date >= from && result.date <= to;
}
