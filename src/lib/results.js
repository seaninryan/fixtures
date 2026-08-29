// Pure. The accumulated results store, and the round-up text built from it.
import { sortResults } from "./normalize.js";
import { resultWindowPredicate } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor } from "./squadColors.js";

export const RESULTS_VERSION = 1;

// Add and update; NEVER delete.
//
// The league's feed carries only the last day or two of results, so the store is the
// only place a result survives. A result missing from today's feed means the feed has
// moved on, never that the game was unplayed - pruning to match the feed would erase
// the season a few days at a time. This is the direct counterpart of runCheck's rule
// that a failed fetch must never look like a cancellation.
export function mergeResults(previous, incoming, now) {
  // Array.isArray, not `?.length`: a corrupted `{results: "nope"}` must read as an
  // empty store rather than as something to iterate.
  const stored = Array.isArray(previous?.results) ? previous.results : [];
  const byFid = new Map(stored.map((r) => [r.fid, r]));
  for (const r of incoming ?? []) byFid.set(r.fid, r);
  return {
    version: RESULTS_VERSION,
    updatedAt: now,
    results: sortResults([...byFid.values()]),
  };
}

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// "2026-08-29" -> "SATURDAY 29 AUGUST". Same shape as the announcement's heading, so a
// results block and a fixtures block look like siblings pasted into the same thread.
function dayHeading(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Home team first, always - the football convention. Our side is written as its squad
// label and never alongside the club name, exactly as the fixtures announcement writes
// "U14A Boys v St Bernards".
export function formatResultLine(result, labels) {
  const label = labels[result.teamId] ?? result.ourTeam;
  return result.isHome
    ? `${label} ${result.ourScore}-${result.theirScore} ${result.opponent}`
    : `${result.opponent} ${result.theirScore}-${result.ourScore} ${label}`;
}

// The round-up as a list of lines, one entry per rendered line. Mirrors announceLines
// so the site can put a squad's colour BESIDE a result rather than inside it: a swatch
// in the gutter is not text, so it cannot be copied into a WhatsApp message.
//
// Line kinds: blank | day | result | note. Only a `result` line carries teamId/color.
//
// `fixtures` is how labels are resolved and matters for correctness - see below. It
// defaults to `results` itself so a caller with no separate fixtures list still gets
// configured labels applied (results carry `ourTeam`/`competition` too), but that
// default is only a fallback: a caller that actually has the fixture list - the site,
// check.mjs - must pass it explicitly, because deriving the A/B letter from a windowed
// subset of results is exactly the bug described below.
export function roundupLines(results, config, windowName, today, fixtures = []) {
  const all = results ?? [];
  const chosen = all
    .filter(resultWindowPredicate(windowName, today))
    // Newest day first, then by squad label so the same squad lands in the same place
    // week to week. The fid tiebreak makes the order TOTAL, so the round-up never
    // depends on how the caller happened to sort.
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(a.teamId).localeCompare(String(b.teamId)) ||
      String(a.fid).localeCompare(String(b.fid)));

  if (chosen.length === 0) {
    return [{ kind: "note", text: "No results in this window." }];
  }

  // Resolved over every FIXTURE, not over the results: deriveLabels shows the A/B
  // letter only when the club runs more than one side at that age and gender, and
  // resolving over a weekend's results alone would count one U14 side and silently
  // rename "U14A Boys" to "U14 Boys". Squads whose season has ended have left the
  // fixture list entirely, which is why teams.json - config, and persistent - is
  // passed too, and why formatResultLine falls back to the stored team name.
  // NEVER pass `results` here, and never default this parameter to them. deriveLabels
  // decides whether to show the A/B letter by COUNTING the club's squads at that age and
  // gender in the list it is given, so resolving over a weekend's results would count one
  // U14 side on a weekend only one played and silently rename "U14A Boys" to "U14 Boys".
  // A configured label happens to mask this (config beats derivation), which is exactly
  // what makes it dangerous: it looks correct until an unconfigured squad plays.
  //
  // The `[]` default is deliberately the USELESS answer rather than a plausible one:
  // omit fixtures and every line falls back to the raw feed name, visibly unfinished.
  // That is this codebase's standing trade - never silently wrong.
  const { labels } = resolveTeams(fixtures, config);

  const lines = [];
  let currentDay = null;
  for (const result of chosen) {
    if (result.date !== currentDay) {
      if (currentDay !== null) lines.push({ kind: "blank", text: "" });
      currentDay = result.date;
      lines.push({ kind: "day", text: dayHeading(currentDay) });
      lines.push({ kind: "blank", text: "" });
    }
    lines.push({
      kind: "result",
      text: formatResultLine(result, labels),
      teamId: result.teamId,
      color: squadColor(result.teamId, config).bg,
    });
  }
  return lines;
}

// The plain text: what Copy puts on the clipboard.
export function roundup(results, config, windowName, today, fixtures = []) {
  return roundupLines(results, config, windowName, today, fixtures)
    .map((line) => line.text)
    .join("\n");
}
