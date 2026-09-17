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

export function seasonStart(today) {
  const year = Number(String(today).slice(0, 4));
  const thisYears = `${year}-${SEASON_START_MONTH_DAY}`;
  return today >= thisYears ? thisYears : `${year - 1}-${SEASON_START_MONTH_DAY}`;
}

// For filtering a results store, which keeps every season forever - mergeResults never
// deletes. Anything dated before the boundary belongs to a season that has ended.
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

const max = (a, b) => (a >= b ? a : b);

export function resultWindowRange(name, today) {
  // Every backward window is clamped to the season, not just "All". In the first days of
  // August a 14-day window reaches into July - last season - and the round-up would show
  // results the Form tab has already stopped counting. One rule, applied once.
  const from = seasonStart(today);
  if (name === "Last 7 days") return { from: max(addDays(today, -6), from), to: today };
  if (name === "Last 14 days") return { from: max(addDays(today, -13), from), to: today };
  // "All", and anything unrecognised: everything this SEASON. A stale "Last weekend"
  // reaches here now that the window is gone, and lands on the safe answer rather than
  // on an empty range.
  return { from, to: "9999-12-31" };
}

export function resultWindowPredicate(name, today) {
  const { from, to } = resultWindowRange(name, today);
  return (result) => result.date >= from && result.date <= to;
}
