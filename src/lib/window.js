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
