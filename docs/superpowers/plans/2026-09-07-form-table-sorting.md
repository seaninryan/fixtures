# Form Table Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Form tab's table sortable by any column, opening on points per game descending, so the owner can see at a glance which squads are on a run.

**Architecture:** A pure `sortRecords` in `src/lib/form.js` sorts a copy of what `squadRecords` returns — `squadRecords` itself is untouched and keeps its alphabetical order as the stable base. A single `SORT_COLUMNS` table drives both the rendered header and the sort, so a column can never be one without the other. `FormTab` holds the chosen column and direction as view state.

**Tech Stack:** JavaScript (ES modules), React 18, Vitest (node environment, no jsdom), Vite.

**Spec:** `docs/superpowers/specs/2026-09-07-form-table-sorting-design.md`

---

## Before you start

**Node v14 is the system default and silently breaks Vite and Vitest.** Run this in every shell:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

`node --version` must print `v20.20.2`. Then confirm a green baseline:

```bash
npm test
```

Expected: 561 passing, 18 files. Do not start on a red tree.

## Things that will get you into trouble

- **Do not change `squadRecords`.** It stays alphabetical as the stable base, and `sortRecords` is a separate display pass. Its existing tests — including `orders alphabetically by label, not by points` — must pass untouched. If you find yourself editing them, you have changed the wrong function.
- **A squad with `played === 0` is not a squad on zero.** It sorts last on every column *except* P, in both directions. Sorting it as zero files "hasn't played" among "lost everything", which is why the table shows em dashes and why `pointsPerGame` is `null`. Six of eighteen live squads are in this state.
- **The order must be total.** Every comparison falls back to label then `teamId`. Fourteen squads tie on `0` for several columns; without the fallback the order differs between renders.
- **`sortRecords` must not mutate its input.** `Array.prototype.sort` sorts in place, so copy first. `squadRecords`' output is rendered in the same pass.
- **Commit after every task**, with the suite green.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/form.js` (modify) | Add `SORT_COLUMNS`, `DEFAULT_SORT`, `sortRecords`. | 1 |
| `test/form.test.js` (modify) | The sort rules. | 1 |
| `src/components/FormTab.jsx` (modify) | Sortable header, sort state, caveat moved above the table. | 2 |
| `src/styles.css` (modify) | Header button styling. | 2 |
| `test/components.test.jsx` (modify) | SSR smoke tests for the header and default order. | 2 |

---

### Task 1: `SORT_COLUMNS`, `DEFAULT_SORT` and `sortRecords`

**Files:**
- Modify: `src/lib/form.js`
- Modify: `test/form.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/form.test.js`, and add `SORT_COLUMNS`, `DEFAULT_SORT` and `sortRecords` to the `form.js` import at the top of the file:

```js
describe("sorting", () => {
  // Built by hand rather than via squadRecords, so a change in squadRecords cannot
  // quietly alter what these assert about sortRecords.
  const row = (over) => ({
    teamId: "0", label: "Z", competition: "", played: 1, won: 0, drawn: 0, lost: 1,
    goalsFor: 0, goalsAgainst: 1, goalDifference: -1, points: 0, pointsPerGame: 0, ...over,
  });
  const unplayed = (over) => row({
    played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
    goalDifference: 0, points: 0, pointsPerGame: null, ...over,
  });
  const labels = (rows) => rows.map((r) => r.label);

  it("offers a column for every field the table renders", () => {
    expect(SORT_COLUMNS.map((c) => c.key)).toEqual([
      "label", "played", "won", "drawn", "lost",
      "goalsFor", "goalsAgainst", "goalDifference", "points", "pointsPerGame",
    ]);
  });

  it("marks Squad as the only non-numeric column", () => {
    expect(SORT_COLUMNS.filter((c) => !c.numeric).map((c) => c.key)).toEqual(["label"]);
  });

  // The decision this whole spec exists to record.
  it("defaults to points per game, descending", () => {
    expect(DEFAULT_SORT).toEqual({ key: "pointsPerGame", direction: "desc" });
  });

  it("sorts a numeric column descending and ascending", () => {
    const rows = [
      row({ teamId: "1", label: "A", points: 1 }),
      row({ teamId: "2", label: "B", points: 7 }),
      row({ teamId: "3", label: "C", points: 4 }),
    ];
    expect(labels(sortRecords(rows, "points", "desc"))).toEqual(["B", "C", "A"]);
    expect(labels(sortRecords(rows, "points", "asc"))).toEqual(["A", "C", "B"]);
  });

  it("sorts the squad column alphabetically both ways", () => {
    const rows = [
      row({ teamId: "1", label: "U16 Boys" }),
      row({ teamId: "2", label: "U12A Boys" }),
      row({ teamId: "3", label: "U14 Girls" }),
    ];
    expect(labels(sortRecords(rows, "label", "asc")))
      .toEqual(["U12A Boys", "U14 Girls", "U16 Boys"]);
    expect(labels(sortRecords(rows, "label", "desc")))
      .toEqual(["U16 Boys", "U14 Girls", "U12A Boys"]);
  });

  it("sorts every numeric column", () => {
    for (const { key } of SORT_COLUMNS.filter((c) => c.numeric)) {
      const rows = [
        row({ teamId: "1", label: "low", [key]: 1 }),
        row({ teamId: "2", label: "high", [key]: 9 }),
      ];
      expect(labels(sortRecords(rows, key, "desc"))).toEqual(["high", "low"]);
    }
  });

  // Fourteen squads tie on 0 for several columns. Without a fallback the order differs
  // between renders, and rows appear to shuffle on their own.
  it("breaks ties by label, then teamId, so the order is total", () => {
    const rows = [
      row({ teamId: "9", label: "Same", points: 3 }),
      row({ teamId: "2", label: "Same", points: 3 }),
      row({ teamId: "5", label: "Other", points: 3 }),
    ];
    const sorted = sortRecords(rows, "points", "desc");
    expect(sorted.map((r) => `${r.label}/${r.teamId}`)).toEqual(["Other/5", "Same/2", "Same/9"]);
  });

  it("gives the same answer whatever order it is handed", () => {
    const a = row({ teamId: "1", label: "A", points: 3 });
    const b = row({ teamId: "2", label: "B", points: 3 });
    const c = row({ teamId: "3", label: "C", points: 9 });
    expect(labels(sortRecords([a, b, c], "points", "desc")))
      .toEqual(labels(sortRecords([c, b, a], "points", "desc")));
  });

  // THE RULE. A squad that has not played renders em dashes because its W/D/L/goals/
  // points are not meaningful - so it cannot be ranked by them either. Sorting it as
  // zero would file "has not played" among "lost everything".
  it("sinks an unplayed squad on PPG in both directions", () => {
    const rows = [
      unplayed({ teamId: "1", label: "NotPlayed" }),
      row({ teamId: "2", label: "Lost", pointsPerGame: 0 }),
      row({ teamId: "3", label: "Won", pointsPerGame: 3 }),
    ];
    expect(labels(sortRecords(rows, "pointsPerGame", "desc")))
      .toEqual(["Won", "Lost", "NotPlayed"]);
    expect(labels(sortRecords(rows, "pointsPerGame", "asc")))
      .toEqual(["Lost", "Won", "NotPlayed"]);
  });

  it("sinks an unplayed squad on points and goal difference too", () => {
    for (const key of ["points", "goalDifference", "won", "goalsFor"]) {
      const rows = [
        unplayed({ teamId: "1", label: "NotPlayed" }),
        row({ teamId: "2", label: "Played", [key]: -5 }),
      ];
      expect(labels(sortRecords(rows, key, "asc"))).toEqual(["Played", "NotPlayed"]);
      expect(labels(sortRecords(rows, key, "desc"))).toEqual(["Played", "NotPlayed"]);
    }
  });

  // P is the one exception: 0 is a real, displayed value there, so anyone clicking P
  // ascending expects the unplayed squads first.
  it("sorts an unplayed squad by its real zero on P", () => {
    const rows = [
      row({ teamId: "1", label: "Played", played: 2 }),
      unplayed({ teamId: "2", label: "NotPlayed" }),
    ];
    expect(labels(sortRecords(rows, "played", "asc"))).toEqual(["NotPlayed", "Played"]);
    expect(labels(sortRecords(rows, "played", "desc"))).toEqual(["Played", "NotPlayed"]);
  });

  it("keeps unplayed squads in a total order among themselves", () => {
    const rows = [
      unplayed({ teamId: "9", label: "B" }),
      unplayed({ teamId: "1", label: "A" }),
    ];
    expect(labels(sortRecords(rows, "pointsPerGame", "desc"))).toEqual(["A", "B"]);
  });

  it("falls back to the default sort for an unrecognised key", () => {
    const rows = [
      row({ teamId: "1", label: "A", pointsPerGame: 1 }),
      row({ teamId: "2", label: "B", pointsPerGame: 3 }),
    ];
    expect(labels(sortRecords(rows, "nonsense", "asc"))).toEqual(["B", "A"]);
    expect(labels(sortRecords(rows, undefined, undefined))).toEqual(["B", "A"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [
      row({ teamId: "1", label: "A", points: 1 }),
      row({ teamId: "2", label: "B", points: 9 }),
    ];
    const before = labels(rows);
    sortRecords(rows, "points", "desc");
    expect(labels(rows)).toEqual(before);
  });

  it("survives an empty or missing list", () => {
    expect(sortRecords([], "points", "desc")).toEqual([]);
    expect(sortRecords(null, "points", "desc")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/form.test.js
```

Expected: FAIL — `SORT_COLUMNS is not defined` / `sortRecords is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/form.js`:

```js
// One entry per rendered column, in render order. This is the single source of both the
// table header and the sort, so a column can never be rendered without being sortable
// or sortable without being rendered. `numeric` drives the comparison and which
// direction a first click sorts.
export const SORT_COLUMNS = [
  { key: "label", label: "Squad", numeric: false },
  { key: "played", label: "P", numeric: true },
  { key: "won", label: "W", numeric: true },
  { key: "drawn", label: "D", numeric: true },
  { key: "lost", label: "L", numeric: true },
  { key: "goalsFor", label: "GF", numeric: true },
  { key: "goalsAgainst", label: "GA", numeric: true },
  { key: "goalDifference", label: "GD", numeric: true },
  { key: "points", label: "Pts", numeric: true },
  { key: "pointsPerGame", label: "PPG", numeric: true },
];

export const DEFAULT_SORT = { key: "pointsPerGame", direction: "desc" };

// The columns whose value is meaningless for a squad that has not played - exactly the
// ones the table renders as an em dash. P is deliberately absent: 0 games is a real,
// displayed value, so sorting by P puts the unplayed squads where you would expect.
const MEANINGLESS_WHEN_UNPLAYED = new Set(
  SORT_COLUMNS.map((c) => c.key).filter((key) => key !== "label" && key !== "played"),
);

// A squad that has not played cannot be ranked by a column it shows a dash for, so it
// sinks to the bottom - in BOTH directions, which is why this is applied before the
// direction is. Sorting it as zero would file "has not played" among "lost everything",
// the exact confusion the dashes and the null pointsPerGame exist to prevent.
function sinks(record, key) {
  return record.played === 0 && MEANINGLESS_WHEN_UNPLAYED.has(key);
}

// Sorts a COPY. squadRecords' output is rendered in the same pass, and Array.sort works
// in place - so sorting the original would reorder the caller's list under it.
//
// squadRecords itself is untouched and stays alphabetical: that is the stable base, and
// this is a display pass over it.
export function sortRecords(records, key, direction) {
  const column = SORT_COLUMNS.find((c) => c.key === key);
  const { key: sortKey, direction: sortDirection } = column
    ? { key, direction }
    : DEFAULT_SORT;
  const numeric = (SORT_COLUMNS.find((c) => c.key === sortKey) ?? {}).numeric;
  const sign = sortDirection === "asc" ? 1 : -1;

  return [...(records ?? [])].sort((a, b) => {
    const aSinks = sinks(a, sortKey);
    const bSinks = sinks(b, sortKey);
    // Before the direction is applied, so a sunk row stays at the bottom either way.
    if (aSinks !== bSinks) return aSinks ? 1 : -1;

    if (!aSinks) {
      const ordered = numeric
        ? (a[sortKey] ?? 0) - (b[sortKey] ?? 0)
        : String(a[sortKey]).localeCompare(String(b[sortKey]));
      if (ordered !== 0) return sign * ordered;
    }

    // Always, so the order is TOTAL. Fourteen squads tie on 0 for several columns, and
    // without this the order differs between renders and rows look like they shuffle on
    // their own. Never reversed by `sign`: the tiebreak is stability, not data.
    return a.label.localeCompare(b.label) || String(a.teamId).localeCompare(String(b.teamId));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/form.test.js
```

Expected: PASS, 59 tests. If `sinks an unplayed squad on PPG in both directions` fails, the sink check is being multiplied by `sign` — it must be applied before the direction.

- [ ] **Step 5: Confirm `squadRecords` is untouched**

```bash
npx vitest run test/form.test.js -t "orders alphabetically by label, not by points"
```

Expected: PASS. This is the assertion that `squadRecords` still returns its stable alphabetical base. If it fails, the wrong function was changed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/form.js test/form.test.js
git commit -F - <<'MSG'
feat(form): sortRecords, defaulting to points per game

SORT_COLUMNS is the single source of both the header and the sort. squadRecords
is untouched and stays alphabetical as the stable base; this is a display pass
over a copy of it.

A squad that has not played sinks to the bottom on every column it renders as a
dash, in both directions - sorting it as zero would file "has not played" among
"lost everything". P is the exception, where 0 games is a real value.

Ties break by label then teamId so the order is total: fourteen squads tie on 0
for several columns, and without it rows appear to shuffle between renders.
MSG
```

---

### Task 2: The sortable header

**Files:**
- Modify: `src/components/FormTab.jsx:162-202`
- Modify: `src/styles.css`
- Modify: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `FormTab` describe block in `test/components.test.jsx`:

```js
  it("renders a sort button for every column", () => {
    const html = render();
    const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(header.match(/<button/g)).toHaveLength(10);
    expect(header).toContain("Squad");
    expect(header).toContain("PPG");
  });

  // The default this feature exists for: best points-per-game first.
  it("opens sorted by points per game, descending", () => {
    const html = render();
    const body = html.slice(html.indexOf("<tbody"));
    // U14A Boys 3.00 beats U13 Boys 0.00; U14B Boys has not played and sinks last.
    expect(body.indexOf("U14A Boys")).toBeLessThan(body.indexOf("U13 Boys"));
    expect(body.indexOf("U14B Boys")).toBeGreaterThan(body.indexOf("U13 Boys"));
  });

  // Identity of the sorted column must not be conveyed by an arrow glyph alone.
  it("marks the sorted column with aria-sort and leaves the others none", () => {
    const html = render();
    const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(header.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(header.match(/aria-sort="none"/g)).toHaveLength(9);
  });

  // Now that the tab opens on a ranking, the caveat has to be readable before the
  // numbers rather than after them.
  it("puts the divisions caveat above the table", () => {
    const html = render();
    expect(html.indexOf("different divisions")).toBeLessThan(html.indexOf("form-table"));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run test/components.test.jsx
```

Expected: FAIL — `renders a sort button for every column` finds no buttons in the header.

- [ ] **Step 3: Make the header sortable**

In `src/components/FormTab.jsx`, extend the `form.js` import to add the three new names:

```jsx
import {
  squadRecords, defaultSelection, weekAxis, weekSeries, seriesGeometry, FORM_WINDOWS,
  SORT_COLUMNS, DEFAULT_SORT, sortRecords,
} from "../lib/form.js";
```

Add the sort state alongside the existing `useState` calls, immediately after the `mode` state:

```jsx
  const [sort, setSort] = useState(DEFAULT_SORT);
```

Add this just after `const records = squadRecords(stored, fixtures, config);`:

```jsx
  // A display pass over squadRecords' stable alphabetical base - see sortRecords.
  const sorted = sortRecords(records, sort.key, sort.direction);

  // Clicking the active column flips it. A new column starts at the interesting end:
  // descending for a number, A-Z for the squad name.
  function sortBy(column) {
    setSort(sort.key === column.key
      ? { key: column.key, direction: sort.direction === "asc" ? "desc" : "asc" }
      : { key: column.key, direction: column.numeric ? "desc" : "asc" });
  }
```

Note the chart and legend keep using `records`, not `sorted` — the legend's order is not
a ranking and must not move when the table is sorted.

Then replace the block from `<div className="card">` containing the table through the
closing `</p>` of the caveat (lines 162-202) with:

```jsx
      {/* Above the table, not below it: the tab now opens on a ranking, so the reader
          needs this before the numbers rather than after them. */}
      <p className="dim caveat">
        Points are 3 for a win, 1 for a draw. Squads play in different divisions, so
        these are each squad&apos;s own record — a squad top on points per game in a
        lower division is not outplaying one below it in a championship.
      </p>
      <div className="card">
        <table className="form-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((column) => (
                <th key={column.key} className={column.key === "label" ? "squad" : undefined}
                    aria-sort={sort.key === column.key
                      ? (sort.direction === "asc" ? "ascending" : "descending")
                      : "none"}>
                  <button className="sort" onClick={() => sortBy(column)}>
                    {column.label}
                    {/* The arrow is decorative - aria-sort above is what conveys state. */}
                    <span aria-hidden="true">
                      {sort.key === column.key ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.teamId}>
                <td className="squad">
                  <span className="swatch inline" style={{ background: squadColor(r.teamId, config).bg }}
                        aria-hidden="true" />
                  <span>{r.label}</span>
                  <div className="dim">{r.competition}</div>
                </td>
                {r.played === 0 ? (
                  // One dash per column rather than a row of zeros.
                  <>
                    <td>0</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td>
                    <td>{DASH}</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td>
                  </>
                ) : (
                  <>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                    <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td>
                    <td>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                    <td>{r.points}</td><td>{ppg(r)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/components.test.jsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Style the header buttons**

Append to `src/styles.css`:

```css
/* The header cell is the button, so the whole cell is the hit target rather than just
   the few characters of the label. */
.form-table thead th { padding: 0; }
.form-table .sort { width: 100%; background: transparent; border: 0; cursor: pointer;
  color: var(--dim); font: inherit; font-weight: 600; font-size: 12px;
  padding: 6px 4px; text-align: right; }
.form-table th.squad .sort { text-align: left; padding-left: 20px; }
.form-table .sort:hover { color: var(--fg); }
/* The sorted column reads as active in the header as well as by its arrow. */
.form-table th[aria-sort="ascending"] .sort,
.form-table th[aria-sort="descending"] .sort { color: var(--fg); }
.caveat { margin: 12px 0 0; }
```

- [ ] **Step 6: Run the full suite and the build**

```bash
npm test && npm run build
```

Expected: both PASS.

- [ ] **Step 7: Check the default order against the live data**

```bash
cd /home/sean/workspace/fixtures
mkdir -p /tmp/sort-check
for f in latest.json results.json teams.json; do
  curl -sS -o /tmp/sort-check/$f https://raw.githubusercontent.com/seaninryan/fixtures-data/main/$f
done
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { squadRecords, sortRecords, DEFAULT_SORT, SORT_COLUMNS }
  from "/home/sean/workspace/fixtures/src/lib/form.js";
const D = "/tmp/sort-check/";
const records = squadRecords(
  JSON.parse(readFileSync(D + "results.json", "utf8")).results,
  JSON.parse(readFileSync(D + "latest.json", "utf8")).fixtures,
  JSON.parse(readFileSync(D + "teams.json", "utf8")));
const sorted = sortRecords(records, DEFAULT_SORT.key, DEFAULT_SORT.direction);
console.log("default order (PPG desc):");
for (const r of sorted) {
  console.log("  ", r.label.padEnd(22), r.played,
    (r.pointsPerGame === null ? "  -" : r.pointsPerGame.toFixed(2)).padStart(6));
}
const unplayedAtEnd = sorted.slice(-records.filter(r => r.played === 0).length)
  .every(r => r.played === 0);
console.log("\nall unplayed squads last?", unplayedAtEnd);
console.log("stable across input order?",
  JSON.stringify(sortRecords([...records].reverse(), DEFAULT_SORT.key, DEFAULT_SORT.direction).map(r => r.teamId))
  === JSON.stringify(sorted.map(r => r.teamId)));
for (const c of SORT_COLUMNS) {
  const out = sortRecords(records, c.key, "desc");
  if (out.length !== records.length) throw new Error("lost rows sorting by " + c.key);
}
console.log("every column sorts without losing rows: true");
'
```

Expected: the six unplayed squads last, `all unplayed squads last? true`, `stable across
input order? true`, and no row loss on any column.

- [ ] **Step 8: Commit**

```bash
git add src/components/FormTab.jsx src/styles.css test/components.test.jsx
git commit -F - <<'MSG'
feat(form): sortable table header

Click any column; the active one flips direction. A new column starts at the
interesting end - descending for a number, A-Z for the squad name. State is
carried by aria-sort, with the arrow decorative.

Opens on points per game descending. The divisions caveat moves above the
table and says more: the tab now opens on a ranking, so the qualifier has to
be readable before the numbers rather than after them.

The chart legend keeps squadRecords' alphabetical order - it is not a ranking
and must not move when the table is sorted.
MSG
```

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-09-07-form-table-sorting-design.md`:

| Spec section | Task |
|---|---|
| `SORT_COLUMNS` (all ten, `numeric` flag), single source of header and sort | 1 |
| `DEFAULT_SORT` = PPG descending, asserted directly | 1 |
| `sortRecords` pure, sorts a copy, total order | 1 |
| `squadRecords` unchanged, alphabetical base | 1 (Step 5 asserts it) |
| Unplayed sinks on every column except P, both directions | 1 |
| Unrecognised key falls back to the default | 1 |
| Header buttons, `aria-sort`, click behaviour per column type | 2 |
| Caveat moves above the table | 2 |
| Sorting is view state, resets on reload | 2 (plain `useState`, nothing persisted) |
| Error handling: null store, empty store, single squad | Unchanged from the existing tab; the null-store early return precedes all sorting, and the existing tests cover it |

**Two notes on decisions the spec left to the plan:**

1. **The whole header cell becomes the button**, not just the label text — a 12px "D" is
   otherwise a very small hit target on a phone. This is why `thead th` padding moves onto
   the button.
2. **The chart's legend keeps `records`, not `sorted`.** The spec's non-goals say not to
   sort the chart's squad list; using the sorted array there would have done it by
   accident, so the plan says so explicitly at the call site.

**One spec line needs no task:** "Sorting the chart's squad list" is a non-goal, and the
legend keeps reading `records` — there is nothing to build.
