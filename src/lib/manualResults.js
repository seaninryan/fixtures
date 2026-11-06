// src/lib/manualResults.js
// Pure. Results the owner was told before the league published them, and rows the owner
// has chosen to leave off a card.
//
// Both live in the browser only and reach the GRAPHICS only. Never results.json, never
// the Form tab, never the email: a typo here must not touch the season record, and a
// forfeit 3-0 left off a card still counts in the league table.
import { addDays } from "./window.js";
import { parseScore } from "./normalize.js";

// Long enough to cover a slow league; short enough that a stale entry stops appearing.
export const MANUAL_DAYS = 14;

const usable = (e) =>
  e && typeof e === "object" && typeof e.id === "string" && typeof e.teamId === "string"
  && typeof e.date === "string" && Number.isInteger(e.ourScore) && Number.isInteger(e.theirScore);

// -> {results, conflicts}. `results` is the official list plus every live entry the
// league has not overtaken; `conflicts` names each entry the league scored differently.
export function mergeManual(official, entries, today) {
  const list = Array.isArray(official) ? official : [];
  const byFid = new Map(list.map((r) => [r.fid, r]));
  const floor = addDays(today, -MANUAL_DAYS);
  const results = [...list];
  const conflicts = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!usable(e) || e.date < floor) continue;
    // fid when the entry came from a pending game; squad and date for a free-form one.
    const match = e.fid
      ? byFid.get(e.fid)
      : list.find((r) => r.teamId === e.teamId && r.date === e.date);
    if (match) {
      if (match.ourScore !== e.ourScore || match.theirScore !== e.theirScore) {
        conflicts.push({ entry: e, official: match });
      }
      continue;
    }
    results.push({
      fid: e.id, teamId: e.teamId, date: e.date, time: e.time ?? "", isHome: e.isHome,
      ourTeam: "", opponent: e.opponent, ourScore: e.ourScore, theirScore: e.theirScore,
      venue: "", competition: "", manual: true,
    });
  }
  return { results, conflicts };
}

// From the form. `fixture` is a pending fixture (pre-filled) or a free-form
// {fid: null, teamId, date, time, isHome, opponent}. Scores arrive as input strings.
// parseScore, so a blank never becomes nil-all.
export function manualEntry({ fixture, ourScore, theirScore, newId = randomId }) {
  const ours = parseScore(ourScore);
  const theirs = parseScore(theirScore);
  if (ours === null || theirs === null) return null;
  const fid = fixture.fid ? String(fixture.fid) : null;
  return {
    id: fid ?? `manual:${newId()}`,
    fid,
    teamId: String(fixture.teamId),
    date: fixture.date,
    time: fixture.time ?? "",
    isHome: Boolean(fixture.isHome),
    opponent: fixture.opponent,
    ourScore: ours,
    theirScore: theirs,
  };
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function applyLeaveOff(rows, leaveOff) {
  const off = new Set(Array.isArray(leaveOff) ? leaveOff : []);
  return rows.filter((r) => !off.has(r.id));
}
