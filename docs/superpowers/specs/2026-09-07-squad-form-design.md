# Squad form — design

Written 2026-09-07. Extends the results capture
(`docs/superpowers/specs/2026-08-29-results-capture-design.md`), which listed
"League tables. Standings, form or streaks" as non-goals. This spec lifts the
form half of that item and leaves the rest where it is: league position needs
other clubs' results, and the endpoint is club-scoped.

## Goal

A new **Form** tab answering two questions for each of the club's squads, with
nothing ranked against anything else:

- **How is their season going** — played, won, drawn, lost, goals, points,
  points per game.
- **How are they playing lately** — a week-by-week chart the owner drives, with
  a window toggle, a weekly/cumulative toggle, and per-squad selection.

The framing matters and came from the owner directly: *"It's not really meant to
compare teams to each other. Just to know what teams are having a good time."*
Nothing in this feature should read as a standings table.

## Non-goals

League position, and any other club's results — the `admin-ajax.php` endpoint is
scoped to club 2960, so this is not a scope decision but a data one. Any change
to the announcement, the round-up, the alert email, or `scripts/check.mjs`.
Anything newly persisted. Editing or correcting a score by hand. A charting
library.

---

## Points

**3 for a win, 1 for a draw, 0 for a loss.** Stated flatly rather than made
configurable: it is the standard, and a config knob nobody turns is a knob that
rots. If the GFA ever differs, this is the one constant to change.

Points per game is `points / played`, and is **undefined rather than zero** when
a squad has not played. A squad that has yet to kick a ball must never render as
`0.00`, which reads as "lost everything".

---

## What the live data looks like

Measured 2026-09-07 against the committed data repo, so the design is anchored
to reality rather than to a hypothetical mid-season.

- 11 results stored, across 9 squads. 18 squads in the current fixture list, so
  **half have not played yet**.
- Eight of the nine have played exactly once. On one game PPG is only ever
  `0.00` or `3.00`.
- Coverage is complete: a reconstruction of all 58 fixtures ever recorded found
  **no past fixture missing a result** that was not explicitly cancelled. Points
  totals are therefore trustworthy today.

Two consequences the design has to respect. First, the chart must survive being
almost empty without looking broken. Second, the "has not played" state is the
common case right now, not an edge case.

---

## Architecture

Pure logic in `src/lib/form.js`, a thin component in
`src/components/FormTab.jsx`, matching the existing split.

```js
export function squadRecords(results, fixtures, config)
export function weekAxis(results, windowName, today)
export function weekSeries(results, fixtures, config, { mode, windowName, teamIds, today })
export function seriesGeometry(series, axis, width, height)
```

`squadRecords` returns one row per squad:
`{teamId, label, competition, played, won, drawn, lost, goalsFor, goalsAgainst,
goalDifference, points, pointsPerGame}`, with `pointsPerGame: null` when
`played === 0`.

**Squads are the union of the results and the fixtures.** `teamsFromFixtures`
alone would lose a squad whose season has ended — it has left the fixture list
while its results stay in the store forever, which is exactly the squad a
"how was their season" view most needs to show.

`seriesGeometry` returns
`{yMax, xTicks: [{label, x}], yTicks: [{label, y}], lines: [{teamId, color, d,
points: [{x, y, week, value}]}]}` — everything the component needs and nothing
it has to calculate. `d` is an SVG path; `points` exists so each mark can carry
a title for hover.

Its living in lib is deliberate. The scales and the `d` attributes are the part
most likely to be subtly wrong, and the component becomes a mapping from
geometry to `<path>` elements — testable in the node environment with no DOM,
matching the existing testing conventions.

`windowName` rather than `window`, matching `announce.js` and `results.js` and
avoiding a parameter that shadows a browser global in code the site runs.

### Two small additions elsewhere

**`window.js` exports `weekStart(iso)`** — the Monday of that ISO date's week.
It belongs there because `addDays` and `dayOfWeek` already live there as private
helpers; a second copy of ISO date arithmetic is how two copies drift. All
string arithmetic via UTC day maths, as the rest of that module does.

**`teams.js` gains `fillLabelGaps(labels, config, teamIds)`.** `resolveTeams`
only builds entries for squads in the fixture list it is given, because that is
the list `deriveLabels` counts, so a retired squad falls through to its raw feed
name even when `teams.json` explicitly names it. `results.js:103-107` already
hand-rolls this fix inline; `form.js` needs the same thing. That is the third
occurrence, so extract it and point `results.js` at the shared helper. A pure
refactor, already covered by the existing retired-squad test.

---

## Labels

Resolved over **every fixture**, never over a selected or filtered subset, then
gap-filled from config for squads no longer in the fixture list, then falling
back to the stored `ourTeam`.

This is the invariant that has now bitten `announce.js`, `changeReport.js`,
`runCheck`'s call site and `roundupLines`: `deriveLabels` shows the A/B letter
only when the club runs more than one side at that age and gender, so labels
resolved over a chart selection of one squad would silently rename "U14A Boys"
to "U14 Boys". The squad selector makes filtered subsets a first-class feature
here, which makes this the highest-risk place in the codebase for that bug.
**Never resolve labels over the selection.**

---

## The table

One row per squad: colour swatch, label, competition in dim text, then
`P W D L`, `GF-GA`, `GD`, `Pts`, `PPG`.

The competition comes from the current fixture list where the squad is still in
it, and otherwise from that squad's most recent stored result — a retired squad
has no fixture left to read it from, and its last division is the honest answer.

**Ordered alphabetically by label**, with `teamId` as a tiebreak to make the
order total. Not by points or PPG: a PPG-sorted list is a standings table, and
the owner was explicit that this is not one. Alphabetical also puts a club's
squads in a stable, guessable order that does not reshuffle week to week.

A squad with no results shows **em dashes, not zeros**, in every column
including PPG.

---

## The chart

Inline SVG, hand-rolled. No charting library: the project has three runtime
dependencies and a 158 KB bundle, and recharts or chart.js would be a large
fraction of that again for one chart. Hand-rolling also keeps the geometry in a
pure, unit-tested function rather than inside a component.

One line per selected squad, drawn in **that squad's own configured colour**
from `squadColors.js` — the owner has already assigned those, and they are the
legend on every other screen, so a fresh categorical palette would actively
mislead.

### Controls

| Control | Options | Default |
|---|---|---|
| Window | `Last 5 weeks`, `Full season` | `Last 5 weeks` |
| Mode | `Weekly points`, `Cumulative` | `Cumulative` |
| Squads | one checkbox each, plus `All` / `None` | every squad that has played |

### The axis

X is **week-commencing Monday**, shared by every series. `Last 5 weeks` is the
current week and the four before it; `Full season` runs from the week of the
earliest stored result to the current week.

A week in which a squad did not play is **not missing data**: on `Cumulative`
the line holds flat, and on `Weekly points` it is a genuine zero. This is what
makes a shared calendar axis work despite squads playing different numbers of
games, and it is why the window is measured in weeks rather than in matches —
per-squad match windows would start each series at a different x, which reads
as missing data.

Y starts at zero in both modes. `Weekly points` is bounded by the most points
any selected squad took in one week (a squad playing twice can exceed 3).

The `dataviz` skill is **required reading before any chart code is written**,
for the axis, mark and legend specifics. One question it has to settle:
`squadColors.js` records that 6 of its 24 palette colours sit between 3:1 and
4.5:1 against their best foreground, which is acceptable for a bold chip and
marginal for a thin stroke on `#0f1419`. Expect lines thicker than 1px, point
markers, or both.

---

## Error handling

| Situation | Behaviour |
|---|---|
| `results.json` failed to load (`null`) | Say so, as the Results tab does. Never an empty chart, which reads as "nobody has played". |
| Store readable but empty | "No results yet." True, not a failure. |
| Squad in the fixtures with no results | Listed, dashes in the table, selectable, flat at zero in the chart. |
| Squad in the results but not in the fixtures | Listed — its season has ended. Label from config, falling back to the stored feed name. |
| No squads selected | Empty plot area reading "Pick a squad to compare", not a blank box. |
| A single squad selected | A valid chart, not an error. One line is a legitimate view. |
| Fewer weeks of data than the window | Axis shows only the weeks that exist. Never pads with empty weeks to fill five. |

---

## Testing

Vitest, node environment, matching existing conventions.

- **`form.js`** — a win, a draw and a loss each score correctly; `0-0` is a
  draw and scores 1, not 0; PPG is `null` on zero games and never divides by
  zero; goal difference including negatives; the fixtures ∪ results union
  includes a retired squad; `Weekly points` reports 6 for a squad that won
  twice in one week; `Cumulative` holds flat across a blank week while
  `Weekly points` shows zero; the 5-week window selects the right weeks;
  `seriesGeometry` produces expected scales and `d` strings for pinned input.
- **`window.js`** — `weekStart` on a Monday returns that Monday, on a Sunday
  returns the Monday six days earlier, and across a month and a year boundary.
- **`teams.js`** — `fillLabelGaps` names a retired squad from config and leaves
  a squad still in the fixture list untouched. The existing retired-squad test
  in `results.test.js` must still pass unchanged after the refactor.
- **Components** — SSR smoke tests via `renderToStaticMarkup`: the table
  renders a squad's record; a squad with no results renders dashes rather than
  `0.00`; the chart emits one `<path>` per selected squad; the null-store
  message; the no-selection message.
- **A label test with a one-squad selection**, asserting the A/B letter
  survives. This is the invariant most at risk here.
- `npm run build`, which catches JSX errors the tests cannot.

Counts are measured, never hardcoded — the league adds and renames squads
mid-season, so these assert rules, not totals.

---

## Consequences

- A fifth tab. `TABS` in `App.jsx` becomes
  `["Fixtures", "Results", "Form", "Changes", "Squads"]` — Form next to
  Results, since both read the results store.
- `FormTab` needs `results`, `fixtures`, `config` and `today`, all of which
  `App.jsx` already holds.
- Nothing new is fetched, written or persisted. `scripts/check.mjs` and the
  data repo's workflow are untouched.
- The `U21` and `Women's Championship` squads both resolve to the bare feed
  name "Craughwell United" today — two of the nine squads still needing a label
  in `teams.json`. Comparing them, which is the owner's stated use case, needs
  those set first. `teams.json` lives in the **data** repo, so this work cannot
  set them: they are entered on the Squads tab and pasted to GitHub, per the
  existing edit-here / copy / paste flow.
- The chart gets more useful as the season goes. With eight of nine squads on a
  single game, `Full season` and `Last 5 weeks` currently show nearly the same
  thing. That is expected, not a defect.
