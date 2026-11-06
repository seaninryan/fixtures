// src/lib/cardRows.js
// Pure. One fixture or result -> one card row: what to write, and which parts are bold.
//
// The rule for bold is the owner's: OUR squad and OUR score, never the opponent's. The
// side a score sits on comes from isHome (home team first, the football convention),
// never from a team letter - a wrong letter publishes every score backwards.
import { resolveTeams, fillLabelGaps } from "./teams.js";
import { venueNote } from "./announce.js";

// Labels for a card. `fixtures` must be the FULL list (both sources), never the window:
// deriveLabels shows the A/B letter only when the club runs more than one side at that
// age and gender, so resolving over a filtered subset silently renames squads. This bug
// has appeared three times. `teamIds` only fills GAPS - squads that have left the list.
export function cardLabels(fixtures, config, teamIds) {
  const { labels } = resolveTeams(fixtures ?? [], config);
  return fillLabelGaps(labels, config, teamIds);
}

const labelOf = (item, labels) => labels[item.teamId] ?? item.ourTeam;

export function fixtureRows(fixtures, labels) {
  return (fixtures ?? []).map((f) => ({
    id: String(f.fid),
    date: f.date,
    time: f.time,
    chip: f.time,
    segments: [
      { text: labelOf(f, labels), bold: true },
      { text: ` ${f.isHome ? "v" : "@"} ${f.opponent}${venueNote(f)}`, bold: false },
    ],
  }));
}

export function resultRows(results, labels) {
  return (results ?? []).map((r) => {
    const label = labelOf(r, labels);
    const segments = r.isHome
      ? [{ text: `${label} ${r.ourScore}`, bold: true },
         { text: `-${r.theirScore} ${r.opponent}`, bold: false }]
      : [{ text: `${r.opponent} ${r.theirScore}-`, bold: false },
         { text: `${r.ourScore} ${label}`, bold: true }];
    // Results carry no kick-off time; "" sorts them by fid within a day. Hand-entered
    // ones may carry the fixture's time, which then orders them correctly.
    return { id: String(r.fid), date: r.date, time: r.time ?? "", chip: null, segments };
  });
}
