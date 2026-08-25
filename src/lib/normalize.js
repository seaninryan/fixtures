// Pure. Raw parse records -> the Fixture shape everything downstream uses.
import { CLUB_ID } from "./parse.js";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "29 Aug 2026" -> "2026-08-29". Returns null rather than guessing: a wrong date is
// worse than a reported failure.
export function isoDate(feedDate) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(String(feedDate ?? "").trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
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
