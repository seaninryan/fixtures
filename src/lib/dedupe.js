// src/lib/dedupe.js
// Pure. Which Galway FA entries are the same game as an FAI Connect one.
//
// The two leagues share no ids, and the club is migrating between them, so a game can be
// listed by both - on 2026-11-02 Galway FA filed the adult Juniors' FAI Junior Cup tie
// under the U21 team id, and FAI Connect then listed it correctly. FAI Connect is the
// system that replaces Galway FA, so it wins and the Galway copy is hidden.
//
// DISPLAY ONLY. This is the one place a fixture is matched on date and name rather than
// fid, and it decides only what the site shows. The scan never calls it: dropping the row
// there would diff it as a CANCELLED alert for a game that is still on.
import { cleanOpponent } from "./opponents.js";

// Words that differ between the two leagues' spellings of the same club. "Jun" because
// COMET names the adult side "Mervue United FC Jun A" where Galway FA says "Mervue Utd".
const NOISE = new Set(["fc", "afc", "jun", "junior", "juniors"]);

export function dupeKey(raw) {
  return cleanOpponent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === "utd" ? "united" : w))
    .filter((w) => !NOISE.has(w))
    .join(" ");
}

// An entry without a date or an opponent never matches: hiding a game on half a key
// would be a guess, and showing a doubtful row is the safe failure.
const keyOf = (x) =>
  x && typeof x.date === "string" && x.date ? dupeKey(x.opponent) : "";

// -> { kept, hidden }. `kept` keeps the order of `galway`. Each FAI entry hides at most
// one Galway entry.
//
// Results: withTime false, because they carry no kick-off time, and withScore true. Without
// a time, the key alone cannot tell a double-header apart - team letters and "Jun" are
// dropped, so a youth game v "Mervue Utd B" and the Juniors v "Mervue United FC Jun A"
// on one day share a key - and a hidden result is never listed anywhere. The same game
// has the same score; a result with no score never matches.
const scored = (x) => Number.isInteger(x.ourScore) && Number.isInteger(x.theirScore);

export function dropGalwayDuplicates(galway, fai, { withTime = true, withScore = false } = {}) {
  const pool = (fai ?? []).map((f) => ({ f, key: keyOf(f), used: false }));
  const kept = [];
  const hidden = [];
  for (const g of galway ?? []) {
    const key = keyOf(g);
    const match = key && pool.find((p) =>
      !p.used &&
      p.key === key &&
      p.f.date === g.date &&
      p.f.isHome === g.isHome &&
      (!withTime || p.f.time === g.time) &&
      (!withScore || (scored(g) &&
        p.f.ourScore === g.ourScore &&
        p.f.theirScore === g.theirScore)));
    if (match) {
      match.used = true;
      hidden.push(g);
    } else {
      kept.push(g);
    }
  }
  return { kept, hidden };
}
