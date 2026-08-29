// Pure. The only module that knows what "This weekend" means.
//
// All arithmetic is on ISO date STRINGS via UTC day maths. Fixture dates are Irish local
// dates with no time component, so this never crosses a DST boundary and a kick-off can
// never shift a day.
export const WINDOWS = ["This weekend", "Next 7 days", "Next 14 days", "All"];

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const asIso = (d) => d.toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

const dayOfWeek = (iso) => asDate(iso).getUTCDay(); // 0 Sun .. 6 Sat

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

// The backward twins, for results. Added as separate exports rather than by
// generalising windowRange: that function is load-bearing for the announcement and
// its weekend logic is subtle enough not to disturb for the sake of sharing five
// lines of arithmetic.
export const RESULT_WINDOWS = ["Last weekend", "Last 7 days", "Last 14 days", "All"];

export function resultWindowRange(name, today) {
  if (name === "Last weekend") {
    const dow = dayOfWeek(today);
    // On the weekend itself, "last weekend" is the one in progress - a Sunday-afternoon
    // round-up must include Saturday's games. Saturday's `to` runs to Sunday even though
    // Sunday has not happened: results only ever exist in the past, so the extra day
    // selects nothing, and it keeps this symmetrical with "This weekend".
    if (dow === 6) return { from: today, to: addDays(today, 1) };
    if (dow === 0) return { from: addDays(today, -1), to: today };
    // Monday to Friday: the Saturday and Sunday just gone, so a Monday-morning
    // round-up is the obvious thing to paste with no thought from whoever posts it.
    const sunday = addDays(today, -dow);
    return { from: addDays(sunday, -1), to: sunday };
  }
  if (name === "Last 7 days") return { from: addDays(today, -6), to: today };
  if (name === "Last 14 days") return { from: addDays(today, -13), to: today };
  // "All", and anything unrecognised: showing everything beats showing nothing.
  return { from: "0000-01-01", to: "9999-12-31" };
}

export function resultWindowPredicate(name, today) {
  const { from, to } = resultWindowRange(name, today);
  return (result) => result.date >= from && result.date <= to;
}
