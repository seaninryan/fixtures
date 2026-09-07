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

> **SUPERSEDED** by `docs/superpowers/specs/2026-09-07-form-table-sorting-design.md`:
> the table is now sortable by any column and opens on points per game,
> descending. The reasoning below was right for the brief it had and is left
> intact; that spec records why it changed.

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

One line per selected squad, in a **stroke colour derived from that squad's own
configured colour** — same hue, lightened until it clears 3:1 against the card
surface `#182029`. The squad's colour is the identity on every other screen, so
a fresh categorical palette would actively mislead; but a chip and a line stroke
are different jobs and the same hex cannot serve both.

`squadColors.js` gains `strokeOn(hex, surface)`, the stroke counterpart of the
existing `contrastFg`. It changes nothing about chips anywhere else.

Measured 2026-09-07 against the live `teams.json`, three squads' colours are
effectively invisible as a thin line on the card, all three hand-picked as
badges rather than taken from `PALETTE`:

| Squad | Colour | Contrast vs card |
|---|---|---|
| U13 Boys | `#080080` | 1.03:1 |
| U12B Girls | `#5900b3` | 1.62:1 |
| U15B Boys | `#2b00ff` | 1.99:1 |

Deriving the stroke fixes all three without the owner having to re-pick
anything, and without the trap returning the next time a dark colour is chosen.

### Controls

| Control | Options | Default |
|---|---|---|
| Window | `Last 5 weeks`, `Full season` | `Last 5 weeks` |
| Mode | `Weekly points`, `Cumulative` | `Cumulative` |
| Squads | one checkbox each, plus `All` / `None` | the 3 squads with the most results |

The default is the three squads with the most stored results, tie-broken by
label so it is deterministic. Three lines is readable on arrival and shows the
squads with the most to show; `All` is one click away.

### Series count, and a documented deviation

**There is no cap on how many squads may be selected.** The `dataviz` guidance
is explicit that a categorical palette carries at most 8 series and that a 9th
is never a generated hue — and the palette validator fails on this one
(see below). The owner was shown that finding and chose no cap, so this is a
deliberate, recorded deviation rather than an oversight.

What the design does instead, to degrade rather than break:

- A **legend is always present** — the squad checkbox list serves as it, each
  row carrying the squad's stroke colour.
- **Hover always works**: a crosshair and tooltip naming the squad, the week and
  the value. Identity never depends on telling two colours apart.
- **Direct labels while 6 or fewer squads are selected**, at each line's
  right-hand end. Above 6 they would collide, so they are dropped and the
  legend and hover carry identity.
- **A dash pattern per series** as a secondary channel, assigned by the squad's
  stable sort position. Cycling is acceptable here precisely because it is
  secondary and it follows the entity, not its rank.
- **A visible warning past 8 selected**: "N squads selected — colour alone
  cannot separate this many lines. The table below is the reliable read."

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

### Marks

2px strokes, markers of at least 8px at each plotted week, a 2px surface-coloured
ring where marks overlap, and recessive grid and axis lines. Text wears text
tokens (`--fg`, `--dim`), never the series colour; the coloured mark beside a
label carries identity.

### What the palette validator said

Run 2026-09-07 via the `dataviz` validator against the live squad colours, dark
mode, surface `#182029`. It **fails**, and the failures are recorded here so
nobody re-litigates them from taste:

- **Contrast**: `#080080` 1.03:1, `#5900b3` 1.62:1, `#2b00ff` 1.99:1 — fixed by
  `strokeOn`.
- **Normal-vision separation**: `#4ed0da` ↔ `#3fb98a` (U15 Girls / U18 Girls)
  ΔE 11.8, below the floor of 15.
- **CVD separation**: `#3fb950` ↔ `#e5484d` (U12A Boys / U21 Men) ΔE 5.7 for
  deutan — the classic red-green collision.
- **Chroma**: `#8c6f5a` (U13 Girls) reads gray.

The separation failures are **not** fixable by deriving a stroke colour: two
squads the owner has given similar colours will draw similar lines. They are
mitigated by the secondary encoding above — direct labels, dash patterns, hover
and the table — and the table is the authoritative read when two lines are hard
to tell apart. Re-picking those squads' colours on the Squads tab would fix them
at source, and is the owner's call, not this work's.

---

## Error handling

| Situation | Behaviour |
|---|---|
| `results.json` failed to load (`null`) | Say so, as the Results tab does. Never an empty chart, which reads as "nobody has played". |
| Store readable but empty | "No results yet." True, not a failure. |
| Squad in the fixtures with no results | Listed, dashes in the table, selectable, flat at zero in the chart. |
| Squad in the results but not in the fixtures | Listed — its season has ended. Label from config, falling back to the stored feed name. |
| No squads selected | Empty plot area reading "Pick a squad to compare", not a blank box. |
| A single squad selected | A valid chart, not an error. One line is a legitimate view. No legend box needed — the title names it — but the checkbox list stays. |
| More than 8 squads selected | Renders, with the warning above. Never blocked. |
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
- **`squadColors.js`** — `strokeOn` lifts `#080080` to at least 3:1 against
  `#182029` while keeping its hue; leaves a colour that already passes
  unchanged; and is idempotent. Asserted as a ratio computed in the test, not as
  a hardcoded hex, so the function may improve without the test lying.
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
- All 19 squads in the live `teams.json` already carry a label and a colour,
  including "U21 Men" and "Championship Women" — the owner's stated comparison
  works with no config change. (An earlier draft of this spec claimed those two
  were unlabelled; that was read from a stale local copy of `teams.json` and is
  wrong.)
- The chart gets more useful as the season goes. With eight of nine squads on a
  single game, `Full season` and `Last 5 weeks` currently show nearly the same
  thing. That is expected, not a defect.
