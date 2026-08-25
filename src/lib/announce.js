// Pure. The club's announcement text.
//
// Imported by BOTH the site and scripts/check.mjs, so what you copy out of the app and
// what an email quotes can never drift apart.
import { windowPredicate, windowRange } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor, colorEmoji } from "./squadColors.js";

export const CLUB_TITLE = "CRAUGHWELL UNITED";
export const HOME_VENUE = "Craughwell";

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
function shortDate(iso) {
  const d = asDate(iso);
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function formatFixtureLine(fixture, labels, config, opts = {}) {
  const label = labels[fixture.teamId] ?? fixture.ourTeam;
  const versus = fixture.isHome ? "v" : "@";
  // v / @ already tells you whose ground it is. The ground is only worth naming when a
  // HOME game is somewhere other than home - the case that actually strands people.
  const where = fixture.isHome && fixture.venue && fixture.venue !== HOME_VENUE
    ? ` (at ${fixture.venue})`
    : "";
  const swatch = opts.colors ? `${colorEmoji(squadColor(fixture.teamId, config).bg)} ` : "";
  return `  ${swatch}${fixture.time}  ${label} ${versus} ${fixture.opponent}${where}`;
}

export function announce(fixtures, config, windowName, today, opts = {}) {
  const all = fixtures ?? [];
  const inWindow = windowPredicate(windowName, today);
  const { from, to } = windowRange(windowName, today);
  const chosen = all
    .filter(inWindow)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const heading = windowName === "All"
    ? `${CLUB_TITLE}\nAll upcoming fixtures`
    : `${CLUB_TITLE}\n${shortDate(from)} - ${shortDate(to)}`;

  if (chosen.length === 0) return `${heading}\n\nNo fixtures in this window.`;

  // Resolved over EVERY fixture, not just the windowed ones: deriveLabels decides
  // whether to show the A/B letter by counting the club's squads at that age and
  // gender, and that count must not change with the window.
  const { labels } = resolveTeams(all, config);

  const sections = [];
  let currentDay = null;
  for (const fixture of chosen) {
    if (fixture.date !== currentDay) {
      currentDay = fixture.date;
      sections.push(`\n${dayHeading(currentDay)}`);
    }
    sections.push(formatFixtureLine(fixture, labels, config, opts));
  }

  return `${heading}\n${sections.join("\n")}`;
}
