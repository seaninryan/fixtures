// Pure. Raw parse records -> the Fixture shape everything downstream uses.
import { CLUB_ID } from "./parse.js";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "29 Aug 2026" -> "2026-08-29". Returns null rather than guessing: a wrong date is
// worse than a reported failure.
export function isoDate(feedDate) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/.exec(String(feedDate ?? "").trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const iso = `${m[3]}-${month}-${m[1].padStart(2, "0")}`;

  // Reject a day that does not exist in that month. Without this, "32 Aug 2026" became
  // "2026-08-32": string comparisons downstream stay sane, but changeReport's date
  // formatter renders it as "undefined NaN undefined", emailing garbage instead of
  // reporting a failure. That inverts this function's contract above.
  //
  // Date is used ONLY to validate. The value returned is always the string built here —
  // a Date round-trip would move kick-offs across a DST boundary. Note the day-of-month
  // check is required, not paranoia: V8 silently rolls "2026-02-30" over into March
  // rather than reporting it invalid.
  const probe = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.getUTCDate() !== Number(m[1])) return null;
  return iso;
}

export function normalize(raw) {
  const isHome = raw.homeClubId === CLUB_ID;
  return {
    fid: raw.fid,
    teamId: raw.teamId,
    date: isoDate(raw.date),
    // Stored exactly as the feed gave it. Never converted through a Date object —
    // a UTC round-trip would move every kick-off by an hour half the year.
    time: raw.time,
    isHome,
    ourTeam: isHome ? raw.homeTeam : raw.awayTeam,
    opponent: isHome ? raw.awayTeam : raw.homeTeam,
    venue: raw.venue,
    competition: raw.competition,
    comment: raw.comment,
  };
}

export function normalizeAll(raws) {
  const fixtures = [];
  const errors = [];
  for (const raw of raws) {
    const f = normalize(raw);
    if (!f.date) {
      errors.push(`fid ${raw.fid}: unparseable date "${raw.date}"`);
      continue;
    }
    fixtures.push(f);
  }
  return { fixtures: sortFixtures(fixtures), errors };
}

// Stable order keeps the committed snapshot's git diff to the lines that actually
// changed, instead of reshuffling on every run.
export function sortFixtures(fixtures) {
  return [...fixtures].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.fid.localeCompare(b.fid),
  );
}

// A score of 0 is a real score and an empty string is not a score at all. Number("")
// is 0, so this must never go anywhere near it: coercing a blank to nil-all would
// invent a draw that was never played.
export function parseScore(raw) {
  const s = String(raw ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

export function normalizeResult(raw) {
  const isHome = raw.homeClubId === CLUB_ID;
  const home = parseScore(raw.homeScore);
  const away = parseScore(raw.awayScore);
  return {
    fid: raw.fid,
    teamId: raw.teamId,
    date: isoDate(raw.date),
    isHome,
    ourTeam: isHome ? raw.homeTeam : raw.awayTeam,
    opponent: isHome ? raw.awayTeam : raw.homeTeam,
    // Stored from OUR point of view, with isHome recording which side we were, so a
    // stored result reads correctly on its own and home-first ordering stays a
    // rendering concern rather than a storage one.
    ourScore: isHome ? home : away,
    theirScore: isHome ? away : home,
    venue: raw.venue,
    competition: raw.competition,
  };
}

export function normalizeAllResults(raws) {
  const results = [];
  const errors = [];
  for (const raw of raws ?? []) {
    const r = normalizeResult(raw);
    if (!r.date) {
      errors.push(`fid ${raw.fid}: unparseable date "${raw.date}"`);
      continue;
    }
    if (r.ourScore === null || r.theirScore === null) {
      errors.push(`fid ${raw.fid}: unreadable score "${raw.homeScore}-${raw.awayScore}"`);
      continue;
    }
    results.push(r);
  }
  return { results: sortResults(results), errors };
}

// Stable order keeps the committed results.json diff to the lines that actually
// changed. Ascending, like fixtures - the round-up reverses for display.
export function sortResults(results) {
  return [...results].sort(
    (a, b) => a.date.localeCompare(b.date) || a.fid.localeCompare(b.fid),
  );
}
