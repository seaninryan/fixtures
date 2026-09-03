// Pure given an instant. The only module that knows where the club plays.
//
// Everything else compares ISO date strings and raw "HH:MM" kick-off strings, never
// Date objects - a UTC round-trip moves every kick-off by an hour for half the year.
// So this returns STRINGS, and is the one place a Date is unwrapped.
//
// Deliberately NOT part of window.js: that module declares itself pure date arithmetic
// over ISO strings, and a clock is not that.
export const CLUB_TZ = "Europe/Dublin";

// hourCycle: "h23" rather than hour12: false. Both give "00" for midnight on Node 20,
// but h23 is the option that guarantees it - hour12: false has historically produced
// "24:00" in some ICU builds, and a "24:00" here would sort above every kick-off and
// make an evening game look permanently unplayed.
const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// -> { date: "2026-09-03", time: "18:30" }
//
// formatToParts rather than a formatted string: nothing then depends on the locale's
// field order or punctuation, only on the part names, which are fixed by the spec.
export function clubNow(instant) {
  const p = {};
  for (const part of FORMAT.formatToParts(instant)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
