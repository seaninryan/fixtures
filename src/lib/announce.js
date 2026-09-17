// Pure. The club's announcement text.
//
// Imported by BOTH the site and scripts/check.mjs, so what you copy out of the app and
// what an email quotes can never drift apart.
import { windowPredicate, windowRange } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor } from "./squadColors.js";
import { isFaiId } from "./source.js";

export const CLUB_TITLE = "CRAUGHWELL UNITED";
export const HOME_VENUE = "Craughwell";

// The heading above the squads whose league has migrated to FAI Connect.
//
// It names the SQUADS, not the system: "FAI CONNECT" would leak plumbing into a message
// pasted into a club WhatsApp group. Today the migrated squads are the two adult men's
// sides, which is what this says. As youth squads migrate the wording stops being true
// and must be revisited - which is why the heading is suppressed entirely unless BOTH
// sources have fixtures in the window, so it disappears of its own accord at the end of
// the migration rather than becoming quietly wrong.
export const FAI_SECTION_HEADING = "ADULT SQUADS";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);

// "2026-08-29" -> "SATURDAY 29 AUGUST"
function dayHeading(iso) {
  const d = asDate(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// "2026-08-29" -> "Sat 29 Aug"
//
// Exported for pending.js, which prints the same format. One builder, so the two
// cannot drift. Date is applied only to a date-only string in UTC - never to a
// kick-off, which would move it by an hour for half the year.
export function shortDate(iso) {
  const d = asDate(iso);
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function formatFixtureLine(fixture, labels) {
  const label = labels[fixture.teamId] ?? fixture.ourTeam;
  const versus = fixture.isHome ? "v" : "@";
  // v / @ already tells you whose ground it is. The ground is only worth naming when a
  // HOME game is somewhere other than home - the case that actually strands people.
  const where = fixture.isHome && fixture.venue && fixture.venue !== HOME_VENUE
    ? ` (at ${fixture.venue})`
    : "";
  // No leading whitespace. This text gets pasted into WhatsApp and Facebook, where an
  // indented line can be treated as preformatted and is a nuisance to strip on a phone.
  // The site indents fixture lines in CSS instead, so the look survives and the copy is
  // clean. The gap between the time and the squad is alignment, not indentation.
  return `${fixture.time}  ${label} ${versus} ${fixture.opponent}${where}`;
}

// The announcement as a list of lines, one entry per rendered line.
//
// The site renders these so it can put a squad's colour BESIDE a fixture rather than
// inside it: a swatch in the gutter is not text, so it cannot be copied into a WhatsApp
// message as a stray emoji. `announce()` below is just these lines joined, which is what
// keeps the copied text and the emailed text from ever drifting apart - there is one
// builder, not two.
//
// Line kinds: title | subtitle | blank | day | fixture | note.
// Only a `fixture` line carries `teamId` and `color`.
export function announceLines(fixtures, config, windowName, today) {
  const all = fixtures ?? [];
  const inWindow = windowPredicate(windowName, today);
  const { from, to } = windowRange(windowName, today);
  const chosen = all
    .filter(inWindow)
    // The fid tiebreak makes the order TOTAL. Without it two fixtures at the same date
    // and time fall back to input order, so the announcement would depend on how the
    // caller happened to sort - a guarantee this module can enforce itself instead.
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      String(a.fid).localeCompare(String(b.fid)));

  const lines = [
    { kind: "title", text: CLUB_TITLE },
    {
      kind: "subtitle",
      text: windowName === "All"
        ? "All upcoming fixtures"
        : `${shortDate(from)} - ${shortDate(to)}`,
    },
  ];

  if (chosen.length === 0) {
    lines.push({ kind: "blank", text: "" });
    lines.push({ kind: "note", text: "No fixtures in this window." });
    return lines;
  }

  // Resolved over EVERY fixture, not just the windowed ones: deriveLabels decides
  // whether to show the A/B letter by counting the club's squads at that age and
  // gender, and that count must not change with the window.
  const { labels } = resolveTeams(all, config);

  // Grouped by source, NOT resolved per source. `labels` above came from resolveTeams
  // over every fixture in the union, which is the whole reason this is one call and not
  // two: deriveLabels decides whether to show the A/B letter by COUNTING the club's
  // squads at that age and gender in the list it is given, so announcing each source
  // separately would silently rename "U14A Boys" to "U14 Boys". That bug has appeared
  // three times in this codebase; grouping after the fact is what keeps it away.
  const galway = chosen.filter((f) => !isFaiId(f.teamId));
  const fai = chosen.filter((f) => isFaiId(f.teamId));

  const pushSection = (section, heading) => {
    if (section.length === 0) return;
    if (heading) {
      lines.push({ kind: "blank", text: "" });
      lines.push({ kind: "section", text: heading });
    }
    let currentDay = null;
    for (const fixture of section) {
      if (fixture.date !== currentDay) {
        currentDay = fixture.date;
        lines.push({ kind: "blank", text: "" });
        lines.push({ kind: "day", text: dayHeading(currentDay) });
      }
      lines.push({
        kind: "fixture",
        text: formatFixtureLine(fixture, labels),
        teamId: fixture.teamId,
        color: squadColor(fixture.teamId, config).bg,
      });
    }
  };

  // No heading when only one source has fixtures: an ordinary youth-only weekend must
  // read exactly as it did before this feature existed.
  const both = galway.length > 0 && fai.length > 0;
  pushSection(galway, null);
  pushSection(fai, both ? FAI_SECTION_HEADING : null);

  return lines;
}

// The plain text: what Copy puts on the clipboard and what the alert email quotes.
export function announce(fixtures, config, windowName, today) {
  return announceLines(fixtures, config, windowName, today)
    .map((line) => line.text)
    .join("\n");
}
