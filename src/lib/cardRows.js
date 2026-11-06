// src/lib/cardRows.js
// Pure. One fixture or result -> one card row: what to write, and which parts are bold.
//
// The rule for bold is the owner's: OUR squad and OUR score, never the opponent's. The
// side a score sits on comes from isHome (home team first, the football convention),
// never from a team letter - a wrong letter publishes every score backwards.
import { resolveTeams, fillLabelGaps } from "./teams.js";
import { venueNote } from "./announce.js";
import { opponentName } from "./opponents.js";

// Labels for a card. `fixtures` must be the FULL list (both sources), never the window:
// deriveLabels shows the A/B letter only when the club runs more than one side at that
// age and gender, so resolving over a filtered subset silently renames squads. This bug
// has appeared three times. `teamIds` only fills GAPS - squads that have left the list.
export function cardLabels(fixtures, config, teamIds) {
  const { labels } = resolveTeams(fixtures ?? [], config);
  return fillLabelGaps(labels, config, teamIds);
}

const labelOf = (item, labels) => labels[item.teamId] ?? item.ourTeam;

export function fixtureRows(fixtures, labels, config) {
  return (fixtures ?? []).map((f) => {
    const label = labelOf(f, labels);
    const versus = f.isHome ? "v" : "@";
    const opponent = opponentName(f.opponent, config);
    return {
      id: String(f.fid),
      date: f.date,
      time: f.time,
      chip: f.time,
      segments: [
        { text: label, bold: true },
        { text: ` ${versus} ${opponent}${venueNote(f)}`, bold: false },
      ],
      meta: { label, versus, opponentRaw: f.opponent, opponent, score: null, editable: true },
    };
  });
}

export function resultRows(results, labels, config) {
  return (results ?? []).map((r) => {
    const label = labelOf(r, labels);
    // A hand-entered result is shown exactly as the owner typed it.
    const opponent = r.manual ? r.opponent : opponentName(r.opponent, config);
    const segments = r.isHome
      ? [{ text: `${label} ${r.ourScore}`, bold: true },
         { text: `-${r.theirScore} ${opponent}`, bold: false }]
      : [{ text: `${opponent} ${r.theirScore}-`, bold: false },
         { text: `${r.ourScore} ${label}`, bold: true }];
    // Results carry no kick-off time; "" sorts them by fid within a day. Hand-entered
    // ones may carry the fixture's time, which then orders them correctly.
    return {
      id: String(r.fid), date: r.date, time: r.time ?? "", chip: null, segments,
      // score is ours-first regardless of home/away: a label for the owner, not card text.
      meta: {
        label, versus: r.isHome ? "v" : "@", opponentRaw: r.opponent, opponent,
        score: `${r.ourScore}-${r.theirScore}`, editable: !r.manual,
      },
    };
  });
}
