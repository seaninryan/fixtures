// Pure. How each squad's season is going, and the shape of the week-by-week chart.
//
// Everything the chart needs - including its scales and SVG path strings - is computed
// here rather than in the component, because the geometry is the part most likely to be
// subtly wrong and this is the only place it can be unit-tested without a DOM.
import { resolveTeams, fillLabelGaps } from "./teams.js";
import { weekStart, addDays } from "./window.js";
import { squadColor, strokeOn, squadDash } from "./squadColors.js";
import { shortDate } from "./announce.js";

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

export const FORM_WINDOWS = ["Last 5 weeks", "Full season"];
export const SHORT_WINDOW_WEEKS = 5;

const nextWeek = (iso) => addDays(iso, 7);

// The chart's x values: consecutive Mondays, oldest first.
//
// The short window is clamped to the first week that has a result rather than padded
// back five weeks - an axis of empty weeks implies a season that has not happened yet.
export function weekAxis(results, windowName, today) {
  const dates = (results ?? []).map((r) => r.date).sort();
  if (dates.length === 0) return [];

  const current = weekStart(today);
  const firstPlayed = weekStart(dates[0]);
  let from = firstPlayed;
  if (windowName !== "Full season") {
    let short = current;
    for (let i = 1; i < SHORT_WINDOW_WEEKS; i++) short = addDays(short, -7);
    if (short > firstPlayed) from = short;
  }

  const weeks = [];
  for (let w = from; w <= current; w = nextWeek(w)) weeks.push(w);
  return weeks;
}

// One series per selected squad over the shared axis.
//
// `mode` is "cumulative" (running SEASON total, so points earned before the window
// opened are carried in - otherwise the two windows would disagree about the same squad)
// or "weekly" (points earned in that week alone, and a blank week is a genuine zero
// rather than missing data).
export function weekSeries(results, fixtures, config, { mode, windowName, teamIds, today }) {
  const weeks = weekAxis(results, windowName, today);
  if (weeks.length === 0) return [];

  const selected = teamIds ?? [];
  const labels = labelsFor(fixtures, config, selected);
  const meta = metaByTeam(fixtures, results);

  const first = weeks[0];
  const inWeek = new Map();   // `${teamId}|${week}` -> points
  const earlier = new Map();  // teamId -> points banked before the axis opens
  for (const r of results ?? []) {
    const points = pointsFor(r);
    const week = weekStart(r.date);
    if (week < first) {
      earlier.set(r.teamId, (earlier.get(r.teamId) ?? 0) + points);
      continue;
    }
    const key = `${r.teamId}|${week}`;
    inWeek.set(key, (inWeek.get(key) ?? 0) + points);
  }

  return selected.map((teamId) => {
    let running = mode === "cumulative" ? earlier.get(teamId) ?? 0 : 0;
    const values = weeks.map((week) => {
      const points = inWeek.get(`${teamId}|${week}`) ?? 0;
      if (mode !== "cumulative") return points;
      running += points;
      return running;
    });
    return {
      teamId,
      label: labels[teamId] ?? meta[teamId]?.ourTeam ?? String(teamId),
      // strokeOn, not the raw squad colour: three live squads' colours are invisible as
      // a line on the card. Both this and the dash are functions of the SQUAD, so
      // changing the selection never restyles the survivors.
      color: strokeOn(squadColor(teamId, config).bg),
      dash: squadDash(teamId),
      values,
    };
  });
}

// Room for the axis labels. The chart is drawn in a fixed viewBox and scaled by CSS, so
// these are viewBox units and not pixels - which is why they do not change with screen
// size.
export const CHART_PADDING = { top: 10, right: 14, bottom: 24, left: 30 };

// At most this many x labels, however long the season gets.
const MAX_X_TICKS = 6;
const Y_TICKS = 4;

const round = (n) => Math.round(n * 10) / 10;

// A y scale that ends on a whole number of points and gives Y_TICKS even steps. Points
// are integers, so a tick reading "2.5" would be meaningless.
function yScaleMax(maxValue) {
  const step = Math.max(1, Math.ceil(maxValue / Y_TICKS));
  return step * Y_TICKS;
}

// Everything the component needs, and nothing it has to calculate:
// {yMax, xTicks, yTicks, lines: [{teamId, label, color, dash, d, points}]}
export function seriesGeometry(series, weeks, width, height) {
  const plotWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;
  const columns = weeks?.length ?? 0;

  const highest = Math.max(0, ...(series ?? []).flatMap((s) => s.values));
  const yMax = yScaleMax(highest);

  // A single column has no span to divide, so centre it rather than divide by zero.
  const xAt = (i) => (columns <= 1
    ? CHART_PADDING.left + plotWidth / 2
    : CHART_PADDING.left + (i * plotWidth) / (columns - 1));
  const yAt = (v) => CHART_PADDING.top + plotHeight - (v / yMax) * plotHeight;

  // Thin to at most MAX_X_TICKS, always keeping the first and last week: a season of 30
  // weeks would otherwise print 30 overlapping dates.
  //
  // Divided by MAX_X_TICKS - 1, not MAX_X_TICKS: the last week is always kept on top of
  // the every-nth ones, so dividing by the full count yields one tick too many.
  const every = Math.max(1, Math.ceil(columns / (MAX_X_TICKS - 1)));
  const xTicks = (weeks ?? [])
    .map((week, i) => ({ week, i }))
    .filter(({ i }) => i % every === 0 || i === columns - 1)
    .map(({ week, i }) => ({ label: shortDate(week), x: round(xAt(i)) }));

  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const value = (yMax / Y_TICKS) * i;
    return { label: String(value), y: round(yAt(value)) };
  });

  const lines = (series ?? []).map((s) => {
    const points = s.values.map((value, i) => ({
      x: round(xAt(i)), y: round(yAt(value)), week: weeks[i], value,
    }));
    return {
      teamId: s.teamId,
      label: s.label,
      color: s.color,
      dash: s.dash,
      d: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "),
      points,
    };
  });

  return { yMax, xTicks, yTicks, lines };
}
