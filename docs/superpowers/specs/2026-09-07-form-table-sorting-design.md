# Form table sorting — design

Written 2026-09-07, the same day as
`docs/superpowers/specs/2026-09-07-squad-form-design.md` and immediately after
it shipped. **This spec supersedes that one's ordering decision.** That spec
ordered the table alphabetically and said so emphatically:

> **Ordered alphabetically by label** [...] Not by points or PPG: a PPG-sorted
> list is a standings table, and the owner was explicit that this is not one.

The owner has since asked for click-to-sort on every column and for the table to
open on points per game, descending. That is a reversal, recorded here rather
than edited into the older spec so the reasoning stays legible.

## Goal

Sort the Form tab's table by any column, opening on points per game descending —
so the owner can see at a glance which squads are on a run.

## Why the reversal is not a contradiction

The original framing came from the owner's own words: *"It's not really meant to
compare teams to each other."* It still is not. What changed is the mechanism:

- An **alphabetical table with no controls** avoids implying a ranking, but
  answers "who is playing well" only by making the reader scan a column by eye.
- A **sortable table** makes ranking an explicit act. The owner's restated
  intent — *"it's not a competition between teams but I'd like to see which
  teams are playing 🔥"* — is a request to spot form, not to crown a winner.

The cost is that the tab now **opens** on a ranking. That makes the existing
"squads play in different divisions" note load-bearing rather than a footnote: a
squad topping the table on 3.00 PPG in Division 4 is not outperforming one on
1.50 in a Championship. The note stays, and moves above the table.

**Division of labour worth stating**, because PPG cannot answer the question the
emoji asks: points per game ranks the **whole season**. For "playing well *right
now*" the chart's `Last 5 weeks` + `Weekly points` view is the tool. No
recent-form column is added to the table; that would duplicate the chart.

## Non-goals

A recent-form column or streak indicator — the chart covers it. Sorting the
chart's squad list. Persisting the chosen sort across reloads. Multi-column
sorting. Any change to `squadRecords`' own output order, which stays
alphabetical as the stable base.

---

## Architecture

`src/lib/form.js` gains, pure and unit-tested like the rest of the module:

```js
// One entry per rendered column, in render order. `numeric` drives both the
// comparison and which direction a first click sorts.
export const SORT_COLUMNS = [
  { key: "label",          label: "Squad", numeric: false },
  { key: "played",         label: "P",     numeric: true },
  { key: "won",            label: "W",     numeric: true },
  { key: "drawn",          label: "D",     numeric: true },
  { key: "lost",           label: "L",     numeric: true },
  { key: "goalsFor",       label: "GF",    numeric: true },
  { key: "goalsAgainst",   label: "GA",    numeric: true },
  { key: "goalDifference", label: "GD",    numeric: true },
  { key: "points",         label: "Pts",   numeric: true },
  { key: "pointsPerGame",  label: "PPG",   numeric: true },
];

export const DEFAULT_SORT = { key: "pointsPerGame", direction: "desc" };
export function sortRecords(records, key, direction);
```

`SORT_COLUMNS` is the single source of both the header and the sort, so a column
can never be rendered without being sortable or sortable without being
rendered.

`squadRecords` is **not** changed. It keeps returning alphabetical order as the
stable base, and `sortRecords` is a separate display pass over it. Keeping the
two apart means the base order cannot drift with a UI preference, and it is why
`sortRecords` can be tested against a fixed input.

**The order is total.** Every comparison falls back to label and then `teamId`,
so no row shuffles between renders on equal values — the same rule
`roundupLines`, `pendingFixtures` and `squadRecords` already follow. Without it,
sorting eighteen squads by a column where fourteen of them tie on `0` would give
a different order each render.

## How unplayed squads sort

**A squad with `played === 0` sorts last on every column except P**, in both
directions.

This follows what is already on screen rather than inventing a rule: those rows
render em dashes for W/D/L/GF/GA/GD/Pts/PPG because the values are not
meaningful, so they cannot be ranked by them either. Sorting them as zero would
file "has not played" among "lost everything" — the exact confusion the dashes
exist to prevent, and the same reason `pointsPerGame` is `null` and not `0`.

P is the single exception, because `0` is a real and displayed value there.
Sorting by P ascending therefore puts the unplayed squads first, which is what
anyone clicking that column expects.

Nine of eighteen squads had not played when the Form tab was designed; six of
eighteen still had not when this was written (Championship Women, U12A Boys,
U12A Girls, U12B Boys, U12B Girls, U21 Men). This is a third of the table, not
an edge case.

## The header

Each `<th>` becomes a button carrying `aria-sort` — `ascending`, `descending` or
`none` — with an arrow marking the active column.

| Action | Result |
|---|---|
| Click a numeric column | Sorts descending. Higher is the interesting end. |
| Click Squad | Sorts ascending, A–Z. |
| Click the active column again | Flips direction. |

Sorting is view state and resets on reload, per the non-goals.

---

## Error handling

| Situation | Behaviour |
|---|---|
| `results.json` failed to load | Unchanged: the load-failure card, no table. |
| Store empty but readable | The table renders with every squad dashed. Sorting still works, and by PPG they are all equal, so the total order makes it alphabetical. |
| An unrecognised sort key | Falls back to `DEFAULT_SORT` rather than returning an unsorted or empty list. Showing everything in a defensible order beats showing nothing. |
| A single squad | Renders. Sorting one row is a no-op, not an error. |

---

## Testing

Vitest, node environment, matching existing conventions.

- **`sortRecords`** — every column in `SORT_COLUMNS` sorts, ascending and
  descending; ties break by label then `teamId` so the order is total; a squad
  with `played === 0` sorts last on PPG, Pts and GD in **both** directions, and
  sorts by its real `0` on P; an unrecognised key falls back to the default; the
  input array is not mutated.
- **`DEFAULT_SORT`** — is `pointsPerGame` descending, asserted directly, because
  it is the decision this spec exists to record.
- **Component** — the header renders a button per column; `aria-sort` reflects
  the active column and direction; the default DOM row order is PPG descending
  with the dashed rows last.

Counts are measured, never hardcoded.

---

## Consequences

- The Form tab opens on a ranking. The divisions caveat moves above the table.
- `squadRecords`' contract and tests are untouched, so nothing else that
  consumes it can be affected.
- One superseded line in `2026-09-07-squad-form-design.md` gets a pointer to
  this spec. Its reasoning is left intact — it was right for the brief it had.
