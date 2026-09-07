// Pure. How each squad's season is going, and the shape of the week-by-week chart.
//
// Everything the chart needs - including its scales and SVG path strings - is computed
// here rather than in the component, because the geometry is the part most likely to be
// subtly wrong and this is the only place it can be unit-tested without a DOM.
import { resolveTeams, fillLabelGaps } from "./teams.js";

// 3 for a win, 1 for a draw, 0 for a loss. Stated flatly rather than configured: it is
// the standard, and a knob nobody turns is a knob that rots. If the GFA ever differs,
// this is the one constant to change.
export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;

// How many squads the chart selects on arrival.
export const DEFAULT_SELECTED = 3;

export function pointsFor(result) {
  if (result.ourScore > result.theirScore) return WIN_POINTS;
  if (result.ourScore === result.theirScore) return DRAW_POINTS;
  return 0;
}

// The competition and feed name to show for a squad. A fixture wins over a result - it is
// the CURRENT division - and among results the most recent wins. A retired squad has no
// fixture left to read either from, and its last division is the honest answer.
function metaByTeam(fixtures, results) {
  const meta = {};
  for (const r of [...(results ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    meta[r.teamId] = { competition: r.competition ?? "", ourTeam: r.ourTeam ?? "" };
  }
  for (const f of fixtures ?? []) {
    meta[f.teamId] = { competition: f.competition ?? "", ourTeam: f.ourTeam ?? "" };
  }
  return meta;
}

// Labels for every squad we are about to name.
//
// resolveTeams is given the FULL fixture list and never a subset: deriveLabels shows the
// A/B letter only when the club runs more than one side at that age and gender, so
// resolving over a selection would silently rename "U14A Boys" to "U14 Boys". This tab
// has a squad selector, which makes it the easiest place in the codebase to get this
// wrong. Retired squads are then filled in from config, which is the only thing that can
// help them.
function labelsFor(fixtures, config, teamIds) {
  const { labels } = resolveTeams(fixtures ?? [], config);
  return fillLabelGaps(labels, config, teamIds);
}

// One row per squad: every squad in the fixture list, UNIONED with every squad that has a
// result. The union is the point - a squad whose season has ended has left the fixture
// list while its results stay in the store forever, and that is exactly the squad a
// "how was their season" view most needs to show.
export function squadRecords(results, fixtures, config) {
  const stats = new Map();
  const of = (teamId) => {
    if (!stats.has(teamId)) {
      stats.set(teamId, {
        teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
      });
    }
    return stats.get(teamId);
  };

  for (const f of fixtures ?? []) of(f.teamId);
  for (const r of results ?? []) {
    const s = of(r.teamId);
    s.played += 1;
    s.goalsFor += r.ourScore;
    s.goalsAgainst += r.theirScore;
    if (r.ourScore > r.theirScore) s.won += 1;
    else if (r.ourScore === r.theirScore) s.drawn += 1;
    else s.lost += 1;
  }

  const meta = metaByTeam(fixtures, results);
  const labels = labelsFor(fixtures, config, [...stats.keys()]);

  return [...stats.values()]
    .map((s) => {
      const points = s.won * WIN_POINTS + s.drawn * DRAW_POINTS;
      return {
        ...s,
        label: labels[s.teamId] ?? meta[s.teamId]?.ourTeam ?? String(s.teamId),
        competition: meta[s.teamId]?.competition ?? "",
        points,
        goalDifference: s.goalsFor - s.goalsAgainst,
        // null, NEVER 0: a squad that has yet to kick a ball must not render as 0.00,
        // which reads as "lost everything".
        pointsPerGame: s.played ? points / s.played : null,
      };
    })
    // Alphabetical, deliberately NOT by points: a points-sorted list is a standings
    // table, and this is explicitly not one. teamId breaks ties so the order is total.
    .sort((a, b) =>
      a.label.localeCompare(b.label) || String(a.teamId).localeCompare(String(b.teamId)));
}

// What the chart selects on arrival: the squads with the most results, so the first view
// shows the lines with the most to show. Tie-broken by label to stay deterministic.
export function defaultSelection(records, n = DEFAULT_SELECTED) {
  return (records ?? [])
    .filter((r) => r.played > 0)
    .sort((a, b) => b.played - a.played || a.label.localeCompare(b.label))
    .slice(0, n)
    .map((r) => r.teamId);
}
