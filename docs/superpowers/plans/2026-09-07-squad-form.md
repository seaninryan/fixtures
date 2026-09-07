# Squad Form Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Form tab showing each squad's season record and an owner-driven week-by-week points chart, so the owner can see at a glance which squads are having a good season and which are playing well lately.

**Architecture:** All derivation is pure and lives in `src/lib/form.js`, including the chart's scales and SVG path strings — so the geometry is unit-tested in the node environment and `src/components/FormTab.jsx` is a mapping from geometry to `<path>` elements. Three small helpers are added to existing modules where they belong: `weekStart`/`addDays` in `window.js` (ISO date arithmetic), `fillLabelGaps` in `teams.js` (extracted from a pattern `results.js` already hand-rolls), and `strokeOn`/`squadDash` in `squadColors.js` (per-squad visual identity). No charting library.

**Tech Stack:** JavaScript (ES modules), React 18, inline SVG, Vitest (node environment, no jsdom), Vite.

**Spec:** `docs/superpowers/specs/2026-09-07-squad-form-design.md`

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

Expected: all suites pass. Do not start on a red tree.

## Things that will get you into trouble

- **Labels resolve over ALL fixtures, never a filtered subset.** `deriveLabels` shows the A/B letter only when the club runs more than one side at that age and gender. This tab has a squad *selector*, so filtered subsets are a first-class feature — making it the highest-risk place in the codebase for this bug, which has already hit `announce.js`, `changeReport.js`, `runCheck` and `roundupLines`. Never pass the selection to `resolveTeams`.
- **Colour follows the squad, never its position in the selection.** Deselecting a squad must not repaint the others. The same goes for the dash pattern, which is why it is derived from `teamId` and not from an array index.
- **A squad that has not played is not a squad on zero points.** `pointsPerGame` is `null` and the table shows em dashes. Nine of eighteen squads are in this state today.
- **Times and dates are strings.** `Date` may only ever touch a date-only string in UTC.
- **Do not touch `roundup`/`roundupLines` behaviour.** Task 2 refactors the internals of one loop in `results.js`; its output must not change, and the existing tests are the proof.
- **Commit after every task**, with the suite green.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/window.js` (modify) | Export `weekStart` and `addDays` — ISO date arithmetic already lives here. | 1 |
| `src/lib/teams.js` (modify) | Add `fillLabelGaps`. | 2 |
| `src/lib/results.js` (modify) | Use `fillLabelGaps` instead of its inline copy. | 2 |
| `src/lib/squadColors.js` (modify) | Add `CHART_SURFACE`, `strokeOn`, `SQUAD_DASHES`, `squadDash`. | 3 |
| `src/lib/form.js` (create) | `squadRecords`, `defaultSelection`, `weekAxis`, `weekSeries`, `seriesGeometry`. | 4, 5, 6 |
| `test/form.test.js` (create) | The rules, the windows, the geometry. | 4, 5, 6 |
| `src/components/FormTab.jsx` (create) | The table, then the chart and controls. | 7, 8 |
| `src/App.jsx` (modify) | Fifth tab. | 7 |
| `src/styles.css` (modify) | Table and chart styling. | 7, 8 |
| `test/components.test.jsx` (modify) | SSR smoke tests. | 7, 8 |
| `CLAUDE.md` (modify) | Record the new module and the chart's recorded deviation. | 9 |

---

### Task 1: `weekStart` and `addDays` in `window.js`

The chart's x-axis is week-commencing Monday. `addDays` and `dayOfWeek` already exist in `window.js` as private helpers; a second copy of ISO date arithmetic is how two copies drift.

**Files:**
- Modify: `src/lib/window.js:11-17`
- Modify: `test/window.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/window.test.js`:

```js
// 2026-09-07 is a Monday, 09-13 the Sunday that ends its week.
describe("weekStart", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStart("2026-09-07")).toBe("2026-09-07");
  });

  it("returns the Monday just gone for a Sunday", () => {
    expect(weekStart("2026-09-13")).toBe("2026-09-07");
  });

  it("returns the Monday just gone for a mid-week day", () => {
    expect(weekStart("2026-09-10")).toBe("2026-09-07"); // Thursday
    expect(weekStart("2026-09-12")).toBe("2026-09-07"); // Saturday
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-09-02")).toBe("2026-08-31"); // Wed -> Mon in August
  });

  it("crosses a year boundary", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // Fri -> Mon in December
  });

  it("is idempotent", () => {
    expect(weekStart(weekStart("2026-09-13"))).toBe(weekStart("2026-09-13"));
  });
});

describe("addDays", () => {
  it("moves forward and backward across a month boundary", () => {
    expect(addDays("2026-08-31", 7)).toBe("2026-09-07");
    expect(addDays("2026-09-07", -7)).toBe("2026-08-31");
    expect(addDays("2026-09-07", 0)).toBe("2026-09-07");
  });
});
```

Add `weekStart` and `addDays` to the import list at the top of `test/window.test.js` (it already imports `WINDOWS`, `windowRange`, `windowPredicate`, `RESULT_WINDOWS`, `resultWindowRange`, `resultWindowPredicate`).

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/window.test.js
```

Expected: FAIL — `weekStart is not a function`, because it is not exported yet.

- [ ] **Step 3: Export both helpers**

In `src/lib/window.js`, change `function addDays` (line 11) to `export function addDays`, and extend its comment:

```js
// Exported: form.js steps a week at a time across the chart's axis. Keeping ISO date
// arithmetic in this one module is why weekStart lives here too.
export function addDays(iso, n) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}
```

Then add `weekStart` immediately after the `dayOfWeek` line (line 17):

```js
// The Monday of that date's week. Monday-start because that is how a football week
// reads: a weekend's games belong to the week that just finished, not the one starting.
//
// dayOfWeek is 0 Sun .. 6 Sat, so (dow + 6) % 7 is "days since Monday" - 0 for Monday
// and 6 for Sunday, which is exactly the shift needed.
export function weekStart(iso) {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/window.test.js
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window.js test/window.test.js
git commit -F - <<'MSG'
feat(window): weekStart, and export addDays

The form chart's x-axis is week-commencing Monday. Both live here because
addDays and dayOfWeek already do, and a second copy of ISO date arithmetic is
how two copies drift.
MSG
```

---

### Task 2: `fillLabelGaps` in `teams.js`

`resolveTeams` only builds entries for squads in the fixture list it is given, because that is the list `deriveLabels` counts. A squad whose season has ended has left that list, so it falls through to its raw feed name even when `teams.json` explicitly names it. `results.js:103-107` hand-rolls the fix inline; `form.js` needs the same thing. Extract it, and point `results.js` at it.

**Files:**
- Modify: `src/lib/teams.js`
- Modify: `src/lib/results.js:96-107`
- Modify: `test/teams.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/teams.test.js`:

```js
describe("fillLabelGaps", () => {
  const config = { version: 1, teams: { "99": { label: "U16 Boys" }, "98": { label: "  " } } };

  it("names a squad that resolveTeams could not reach", () => {
    const labels = {};
    fillLabelGaps(labels, config, ["99"]);
    expect(labels["99"]).toBe("U16 Boys");
  });

  // Config beats derivation, but a squad still in the fixture list has already been
  // resolved WITH its collision handling - overwriting that would undo it.
  it("leaves an already-resolved label alone", () => {
    const labels = { "99": "U16A Boys" };
    fillLabelGaps(labels, config, ["99"]);
    expect(labels["99"]).toBe("U16A Boys");
  });

  it("leaves a gap as a gap when config has nothing usable", () => {
    const labels = {};
    fillLabelGaps(labels, config, ["98", "97"]);
    expect(labels["98"]).toBeUndefined();
    expect(labels["97"]).toBeUndefined();
  });

  it("returns the same object it was given", () => {
    const labels = {};
    expect(fillLabelGaps(labels, config, ["99"])).toBe(labels);
  });
});
```

Add `fillLabelGaps` to the import list at the top of `test/teams.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/teams.test.js
```

Expected: FAIL — `fillLabelGaps is not a function`.

- [ ] **Step 3: Add the helper**

In `src/lib/teams.js`, add after `resolveTeams` (whose closing brace is line 130):

```js
// Fill label gaps from config for squads resolveTeams could not reach.
//
// resolveTeams only builds entries for squads in the fixture list it is given, because
// that is the list deriveLabels counts. A squad whose season has ended has left that
// list, but its results live in the store forever - so without this it falls through to
// the raw feed name ("Craughwell United U16") even though teams.json names it.
// Derivation genuinely cannot help a retired squad; config still can, and config beating
// derivation is a hard rule here.
//
// Only fills GAPS. A squad still in the fixture list keeps whatever resolveTeams
// decided, collision handling included. Mutates and returns `labels`.
export function fillLabelGaps(labels, config, teamIds) {
  for (const teamId of teamIds ?? []) {
    if (labels[teamId]) continue;
    const set = cleanLabel(config?.teams?.[teamId]?.label);
    if (set) labels[teamId] = set;
  }
  return labels;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/teams.test.js
```

Expected: PASS.

- [ ] **Step 5: Point `results.js` at the shared helper**

In `src/lib/results.js`, add `fillLabelGaps` to the existing `teams.js` import (currently `import { resolveTeams, cleanLabel } from "./teams.js";`):

```js
import { resolveTeams, fillLabelGaps } from "./teams.js";
```

`cleanLabel` is no longer used in this file — remove it from the import, or the build will still pass but the reader will wonder why it is there.

Then replace the inline loop (lines 96-107, the comment block beginning "resolveTeams only produces entries" through the closing brace) with:

```js
  // A squad whose season has ended has left the fixture list, so resolveTeams cannot
  // reach it, but its results remain forever. Config still can - see fillLabelGaps.
  fillLabelGaps(labels, config, chosen.map((r) => r.teamId));
```

- [ ] **Step 6: Run the results and announce suites**

```bash
npx vitest run test/results.test.js test/announce.test.js
```

Expected: PASS, unchanged. The existing retired-squad test in `results.test.js` is the proof this refactor did not change behaviour — if it fails, the extraction is wrong, not the test.

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: PASS, every suite.

- [ ] **Step 8: Commit**

```bash
git add src/lib/teams.js src/lib/results.js test/teams.test.js
git commit -F - <<'MSG'
refactor(teams): extract fillLabelGaps

resolveTeams only builds entries for squads in the fixture list it is given, so
a retired squad falls through to its raw feed name even when teams.json names
it. results.js hand-rolled the fix inline and form.js needs the same thing -
this would have been the third copy.

Pure extraction. The existing retired-squad test is unchanged and passing,
which is the proof.
MSG
```

---

### Task 3: `strokeOn` and `squadDash` in `squadColors.js`

A chip and a line stroke are different jobs and the same hex cannot serve both. Measured against the live `teams.json`, three squads' colours are effectively invisible as a 2px line on the card: `#080080` at 1.03:1, `#5900b3` at 1.62:1, `#2b00ff` at 1.99:1.

`squadColors.js` is the right home: it already owns per-squad visual identity and has the private `hashIndex` that `squadDash` needs.

**Files:**
- Modify: `src/lib/squadColors.js`
- Modify: `test/squadColors.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/squadColors.test.js`:

```js
// The WCAG contrast ratio, recomputed here rather than imported: a test that shares the
// implementation's maths cannot catch the implementation's maths being wrong.
function ratio(a, b) {
  const lin = (c) => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

describe("strokeOn", () => {
  // Asserted as a computed ratio, never as a hardcoded hex, so the function may improve
  // without the test lying about what it guarantees.
  it("lifts a colour that is invisible on the card to at least 3:1", () => {
    expect(ratio("#080080", CHART_SURFACE)).toBeLessThan(3); // the premise
    expect(ratio(strokeOn("#080080"), CHART_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it("lifts every squad colour the live config had failing", () => {
    for (const hex of ["#080080", "#5900b3", "#2b00ff"]) {
      expect(ratio(strokeOn(hex), CHART_SURFACE)).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves a colour that already passes untouched", () => {
    expect(strokeOn("#d0ff00")).toBe("#d0ff00");
    expect(strokeOn("#e5a94d")).toBe("#e5a94d");
  });

  it("is idempotent", () => {
    const once = strokeOn("#080080");
    expect(strokeOn(once)).toBe(once);
  });

  it("keeps the hue recognisable rather than washing to white", () => {
    const out = strokeOn("#080080");
    const n = parseInt(out.slice(1), 16);
    // Navy: blue must still dominate red and green.
    expect(n & 255).toBeGreaterThan((n >> 16) & 255);
    expect(out).not.toBe("#ffffff");
  });

  // Never return something invisible for junk input - a missing line is worse than an
  // ugly one, and config is hand-edited JSON.
  it("falls back to white for input that is not a hex colour", () => {
    expect(strokeOn("nonsense")).toBe("#ffffff");
    expect(strokeOn(undefined)).toBe("#ffffff");
    expect(strokeOn("#fff")).toBe("#ffffff");
  });
});

describe("squadDash", () => {
  it("is stable for a given squad", () => {
    expect(squadDash("235380")).toBe(squadDash("235380"));
  });

  // Secondary encoding follows the ENTITY, not its position in a selection: deselecting
  // one squad must not restyle the others.
  it("does not depend on any surrounding selection", () => {
    const alone = squadDash("254061");
    expect(squadDash("254061")).toBe(alone);
  });

  it("returns an SVG dasharray string or the solid sentinel", () => {
    for (const id of ["1", "2", "3", "235380", "254061", "238155"]) {
      expect(typeof squadDash(id)).toBe("string");
    }
  });
});
```

Add `CHART_SURFACE`, `strokeOn` and `squadDash` to the import list at the top of `test/squadColors.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/squadColors.test.js
```

Expected: FAIL — `strokeOn is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/squadColors.js`:

```js
// The chart's card surface. Must match --card in styles.css; there is no way for a pure
// module to read a CSS variable, so this is the one duplicated value and it is named
// loudly for that reason.
export const CHART_SURFACE = "#182029";

// 3:1, the WCAG floor for non-text graphics. A line below it is not a subtle line, it is
// an absent one.
const STROKE_CONTRAST = 3;
const MIX_STEPS = 21;
const HEX6 = /^#[0-9a-f]{6}$/i;

// WCAG relative luminance. NOTE this is deliberately NOT the ITU-601 approximation used
// by contrastFg above: that one is tuned for picking a foreground over a filled chip and
// its green weighting makes teals read as light. For "can I see this line at all" the
// linearised WCAG maths is the honest measure.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// Toward white in sRGB. This desaturates as it lightens, which is why the tests assert
// the hue still dominates rather than assert an exact hex.
function towardWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  const out = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// A squad's colour, made visible as a LINE on the chart surface. Same hue, lightened
// only as far as it takes to clear 3:1 - so a colour that already passes is returned
// byte-identical, which is what makes this idempotent and what keeps the chart's colours
// recognisably the squad's own.
//
// Chips are NOT affected. squadColor stays the identity everywhere else; this is the
// stroke counterpart of contrastFg.
export function strokeOn(hex, surface = CHART_SURFACE) {
  if (!HEX6.test(hex ?? "")) return "#ffffff";
  for (let step = 0; step < MIX_STEPS; step++) {
    const candidate = towardWhite(hex, step / (MIX_STEPS - 1));
    if (contrast(candidate, surface) >= STROKE_CONTRAST) return candidate;
  }
  return "#ffffff";
}

// Secondary encoding, because colour alone cannot separate many lines - and the owner
// chose not to cap how many may be selected. Keyed off teamId via the same hash as the
// colour fallback, so it follows the SQUAD and never its position in the selection:
// deselecting one squad must not restyle the others.
//
// "" is solid. Cycling is acceptable here where it would not be for hue, because this is
// a secondary channel and a collision costs a little clarity rather than an identity.
export const SQUAD_DASHES = ["", "6 3", "1 3", "9 3 2 3", "4 2 1 2"];

export function squadDash(teamId) {
  return SQUAD_DASHES[hashIndex(teamId, SQUAD_DASHES.length)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/squadColors.test.js
```

Expected: PASS. If `leaves a colour that already passes untouched` fails, `step === 0` is not returning the input unchanged — `towardWhite(hex, 0)` must round-trip the hex exactly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/squadColors.js test/squadColors.test.js
git commit -F - <<'MSG'
feat(colors): strokeOn and squadDash for the form chart

Measured against the live teams.json, three squads' colours are effectively
invisible as a 2px line on the card - #080080 at 1.03:1, #5900b3 at 1.62:1,
#2b00ff at 1.99:1. All three were hand-picked as badges, where a filled chip
with contrasting text is legible and a thin stroke is not.

strokeOn lifts a colour toward white only as far as 3:1 requires, so a passing
colour is returned unchanged and the result stays recognisably the squad's. It
is the stroke counterpart of contrastFg; chips are untouched.

squadDash adds a secondary channel keyed off teamId, since the owner chose not
to cap the number of selected squads.
MSG
```

---

### Task 4: `squadRecords` and `defaultSelection`

**Files:**
- Create: `src/lib/form.js`
- Test: `test/form.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/form.test.js`:

```js
import { describe, it, expect } from "vitest";
import { squadRecords, defaultSelection } from "../src/lib/form.js";

const config = {
  version: 1,
  teams: {
    "11": { label: "U14A Boys", color: "#d9c53c" },
    "22": { label: "U14B Boys", color: "#b95ad9" },
    "33": { label: "U16 Boys", color: "#e5a94d" },
  },
};

const fixture = (over = {}) => ({
  fid: "f1", teamId: "11", date: "2026-09-12", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "", ...over,
});

const result = (over = {}) => ({
  fid: "r1", teamId: "11", date: "2026-09-05", isHome: true,
  ourTeam: "Craughwell United", opponent: "X",
  ourScore: 1, theirScore: 0, venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", ...over,
});

const find = (rows, teamId) => rows.find((r) => r.teamId === teamId);

describe("squadRecords", () => {
  it("scores a win, a draw and a loss", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 2, theirScore: 1 }),
      result({ fid: "b", ourScore: 1, theirScore: 1 }),
      result({ fid: "c", ourScore: 0, theirScore: 3 }),
    ], [fixture()], config);
    const row = find(rows, "11");
    expect(row.played).toBe(3);
    expect(row.won).toBe(1);
    expect(row.drawn).toBe(1);
    expect(row.lost).toBe(1);
    expect(row.points).toBe(4); // 3 + 1 + 0
  });

  // Number("") is 0 and a 0-0 is a real draw. Scoring it as a loss would be silent.
  it("treats 0-0 as a draw worth one point", () => {
    const rows = squadRecords([result({ ourScore: 0, theirScore: 0 })], [fixture()], config);
    expect(find(rows, "11").drawn).toBe(1);
    expect(find(rows, "11").points).toBe(1);
  });

  it("sums goals for and against, and gives a negative goal difference", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 1, theirScore: 3 }),
      result({ fid: "b", ourScore: 0, theirScore: 2 }),
    ], [fixture()], config);
    const row = find(rows, "11");
    expect(row.goalsFor).toBe(1);
    expect(row.goalsAgainst).toBe(5);
    expect(row.goalDifference).toBe(-4);
  });

  it("computes points per game", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 2, theirScore: 1 }),
      result({ fid: "b", ourScore: 0, theirScore: 1 }),
    ], [fixture()], config);
    expect(find(rows, "11").pointsPerGame).toBeCloseTo(1.5);
  });

  // A squad that has yet to kick a ball must never render as 0.00, which reads as
  // "lost everything". Nine of eighteen live squads are in this state.
  it("reports pointsPerGame as null for a squad that has not played", () => {
    const rows = squadRecords([], [fixture({ teamId: "33" })], config);
    const row = find(rows, "33");
    expect(row.played).toBe(0);
    expect(row.pointsPerGame).toBe(null);
    expect(row.points).toBe(0);
  });

  it("includes every squad in the fixture list, even with no results", () => {
    const rows = squadRecords([result()], [fixture(), fixture({ fid: "f2", teamId: "22" })], config);
    expect(rows.map((r) => r.teamId).sort()).toEqual(["11", "22"]);
  });

  // A squad whose season has ended has left the fixture list while its results stay in
  // the store forever - and it is exactly the squad a "how was their season" view needs.
  it("includes a retired squad, present in the results but not the fixtures", () => {
    const rows = squadRecords([result({ teamId: "33" })], [fixture()], config);
    expect(find(rows, "33")).toBeTruthy();
    expect(find(rows, "33").label).toBe("U16 Boys");
  });

  it("takes the competition from the fixtures, and from the last result when retired", () => {
    const rows = squadRecords(
      [result({ teamId: "33", competition: "GFA U16 Boys Division 1" })],
      [fixture()],
      config,
    );
    expect(find(rows, "11").competition).toBe("GFA Boys U14 Championship 1");
    expect(find(rows, "33").competition).toBe("GFA U16 Boys Division 1");
  });

  it("falls back to the feed name when nothing names the squad", () => {
    const bare = { version: 1, teams: {} };
    const rows = squadRecords([], [fixture({ teamId: "77", competition: "GFA Cup" })], bare);
    expect(find(rows, "77").label).toBe("Craughwell United");
  });

  // THE INVARIANT. deriveLabels shows the A/B letter only when the club runs more than
  // one side at that age and gender, so labels resolved over anything less than the full
  // fixture list silently rename a squad.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "f1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({ fid: "f2", teamId: "B1", ourTeam: "Craughwell United B" });
    const rows = squadRecords([result({ teamId: "A1" })], [aSide, bSide], bare);
    expect(find(rows, "A1").label).toBe("U14A Boys");
  });

  it("orders alphabetically by label, not by points", () => {
    const rows = squadRecords([
      result({ fid: "a", teamId: "33", ourScore: 9, theirScore: 0 }),
      result({ fid: "b", teamId: "11", ourScore: 0, theirScore: 9 }),
    ], [fixture(), fixture({ fid: "f3", teamId: "33" })], config);
    expect(rows.map((r) => r.label)).toEqual(["U14A Boys", "U16 Boys"]);
  });

  it("treats a missing store or fixture list as empty rather than throwing", () => {
    expect(squadRecords(null, null, config)).toEqual([]);
    expect(squadRecords(undefined, [fixture()], config)).toHaveLength(1);
  });
});

describe("defaultSelection", () => {
  const rows = [
    { teamId: "11", label: "U14A Boys", played: 3 },
    { teamId: "22", label: "U14B Boys", played: 1 },
    { teamId: "33", label: "U16 Boys", played: 2 },
    { teamId: "44", label: "U18 Boys", played: 0 },
  ];

  it("picks the three squads with the most results", () => {
    expect(defaultSelection(rows)).toEqual(["11", "33", "22"]);
  });

  it("never picks a squad that has not played", () => {
    expect(defaultSelection([{ teamId: "44", label: "U18 Boys", played: 0 }])).toEqual([]);
  });

  it("breaks ties by label, so the default is deterministic", () => {
    const tied = [
      { teamId: "99", label: "U17 Boys", played: 2 },
      { teamId: "88", label: "U12A Boys", played: 2 },
    ];
    expect(defaultSelection(tied)).toEqual(["88", "99"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/form.test.js
```

Expected: FAIL — `src/lib/form.js` does not exist, so the import cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/lib/form.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/form.test.js
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form.js test/form.test.js
git commit -F - <<'MSG'
feat(form): per-squad season records

3-1-0, goals, goal difference and points per game. Squads are the union of the
fixture list and the results store, so a squad whose season has ended still
appears - it has left the fixtures while its results live on forever.

pointsPerGame is null rather than 0 for a squad that has not played: nine of
eighteen live squads are in that state, and 0.00 reads as "lost everything".

Ordered alphabetically, deliberately not by points - the owner was explicit
that this is not a standings table.
MSG
```

---

### Task 5: `weekAxis` and `weekSeries`

**Files:**
- Modify: `src/lib/form.js`
- Modify: `test/form.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/form.test.js`, and add `weekAxis`, `weekSeries` and `FORM_WINDOWS` to the import at the top of the file:

```js
// 2026-08-31, 09-07, 09-14, 09-21, 09-28 and 10-05 are consecutive Mondays.
describe("weekAxis", () => {
  const on = (date) => result({ fid: date, date });

  it("offers exactly the two windows", () => {
    expect(FORM_WINDOWS).toEqual(["Last 5 weeks", "Full season"]);
  });

  it("runs from the first result's week to the current week for the full season", () => {
    const axis = weekAxis([on("2026-08-31"), on("2026-09-16")], "Full season", "2026-09-21");
    expect(axis).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("takes the current week and the four before it for the short window", () => {
    const axis = weekAxis([on("2026-08-03")], "Last 5 weeks", "2026-09-28");
    expect(axis).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  // Never pad to fill five: an axis of empty weeks implies a season that has not
  // happened yet.
  it("shows only the weeks that exist when there are fewer than five", () => {
    const axis = weekAxis([on("2026-09-14")], "Last 5 weeks", "2026-09-21");
    expect(axis).toEqual(["2026-09-14", "2026-09-21"]);
  });

  it("is empty when nothing has been played", () => {
    expect(weekAxis([], "Full season", "2026-09-21")).toEqual([]);
  });
});

describe("weekSeries", () => {
  const opts = (over = {}) => ({
    mode: "cumulative", windowName: "Full season", teamIds: ["11"], today: "2026-09-21", ...over,
  });
  const win = (date, fid) => result({ fid, date, ourScore: 2, theirScore: 0 });
  const loss = (date, fid) => result({ fid, date, ourScore: 0, theirScore: 2 });

  it("returns one series per selected squad, and only those", () => {
    const series = weekSeries(
      [win("2026-09-07", "a"), win("2026-09-07", "b")],
      [fixture(), fixture({ fid: "f2", teamId: "22" })], config,
      opts({ teamIds: ["11", "22"] }),
    );
    expect(series.map((s) => s.teamId)).toEqual(["11", "22"]);
  });

  it("accumulates points across weeks in cumulative mode", () => {
    const series = weekSeries(
      [win("2026-08-31", "a"), win("2026-09-14", "b")],
      [fixture()], config, opts(),
    );
    expect(series[0].values).toEqual([3, 3, 6, 6]);
  });

  it("reports the points earned that week in weekly mode", () => {
    const series = weekSeries(
      [win("2026-08-31", "a"), win("2026-09-14", "b")],
      [fixture()], config, opts({ mode: "weekly" }),
    );
    expect(series[0].values).toEqual([3, 0, 3, 0]);
  });

  // A squad playing twice in one week can take more than 3. Both games fall in the week
  // commencing 2026-09-07, and the axis runs to the week of `today`.
  it("adds up two games in the same week", () => {
    const series = weekSeries(
      [win("2026-09-07", "a"), win("2026-09-09", "b")],
      [fixture()], config, opts({ mode: "weekly" }),
    );
    expect(series[0].values).toEqual([6, 0, 0]);
  });

  it("holds flat on a blank week in cumulative mode and shows zero in weekly", () => {
    const results = [win("2026-08-31", "a"), loss("2026-09-14", "b")];
    expect(weekSeries(results, [fixture()], config, opts())[0].values)
      .toEqual([3, 3, 3, 3]);
    expect(weekSeries(results, [fixture()], config, opts({ mode: "weekly" }))[0].values)
      .toEqual([3, 0, 0, 0]);
  });

  // Cumulative means SEASON total. Restarting at zero because the window opened later
  // would understate every squad and make the two windows disagree.
  it("carries points earned before the window into cumulative mode", () => {
    const series = weekSeries(
      [win("2026-08-03", "a"), win("2026-09-21", "b")],
      [fixture()], config, opts({ windowName: "Last 5 weeks" }),
    );
    expect(series[0].values.at(0)).toBe(3);
    expect(series[0].values.at(-1)).toBe(6);
  });

  it("does not carry earlier points into weekly mode", () => {
    const series = weekSeries(
      [win("2026-08-03", "a"), win("2026-09-21", "b")],
      [fixture()], config, opts({ mode: "weekly", windowName: "Last 5 weeks" }),
    );
    expect(series[0].values.at(0)).toBe(0);
    expect(series[0].values.at(-1)).toBe(3);
  });

  it("gives a selected squad with no results a flat zero line", () => {
    const series = weekSeries([win("2026-09-07", "a")], [fixture(), fixture({ fid: "f2", teamId: "22" })],
      config, opts({ teamIds: ["22"] }));
    expect(series[0].values.every((v) => v === 0)).toBe(true);
  });

  it("carries a visible stroke colour and a dash pattern", () => {
    const dark = { version: 1, teams: { "11": { label: "U14A Boys", color: "#080080" } } };
    const [s] = weekSeries([win("2026-09-07", "a")], [fixture()], dark, opts());
    expect(s.color).not.toBe("#080080"); // lifted to be visible on the card
    expect(typeof s.dash).toBe("string");
  });

  // Colour follows the squad, not its position in the selection: dropping one squad must
  // not repaint the others.
  it("gives a squad the same colour and dash whatever else is selected", () => {
    const results = [win("2026-09-07", "a"), win("2026-09-07", "b")];
    const fixtures = [fixture(), fixture({ fid: "f2", teamId: "22" })];
    const alone = weekSeries(results, fixtures, config, opts({ teamIds: ["22"] }))[0];
    const together = weekSeries(results, fixtures, config, opts({ teamIds: ["11", "22"] }))
      .find((s) => s.teamId === "22");
    expect(together.color).toBe(alone.color);
    expect(together.dash).toBe(alone.dash);
  });

  it("keeps the A/B letter even when one squad is selected", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "f1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({ fid: "f2", teamId: "B1", ourTeam: "Craughwell United B" });
    const [s] = weekSeries([result({ teamId: "A1", date: "2026-09-07" })], [aSide, bSide], bare,
      opts({ teamIds: ["A1"] }));
    expect(s.label).toBe("U14A Boys");
  });

  it("is empty when nothing has been played", () => {
    expect(weekSeries([], [fixture()], config, opts())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/form.test.js
```

Expected: FAIL — `weekAxis is not a function`.

- [ ] **Step 3: Write the implementation**

Add to the imports at the top of `src/lib/form.js`:

```js
import { weekStart, addDays } from "./window.js";
import { squadColor, strokeOn, squadDash } from "./squadColors.js";
```

Then append to `src/lib/form.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/form.test.js
```

Expected: PASS, 32 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form.js test/form.test.js
git commit -F - <<'MSG'
feat(form): weekly and cumulative points series

X is week-commencing Monday, shared by every squad, so unequal fixture counts
need no special handling: a blank week holds flat on cumulative and is a
genuine zero on weekly.

Cumulative carries points banked before a short window opens - restarting at
zero would understate every squad and make the two windows disagree.

Colour and dash are functions of the squad, never of its position in the
selection, so deselecting one squad does not repaint the others.
MSG
```

---

### Task 6: `seriesGeometry`

The scales and SVG path strings. This is in lib precisely so it can be tested without a DOM.

**Files:**
- Modify: `src/lib/form.js`
- Modify: `test/form.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/form.test.js`, adding `seriesGeometry` and `CHART_PADDING` to the import at the top:

```js
describe("seriesGeometry", () => {
  const weeks = ["2026-08-31", "2026-09-07", "2026-09-14"];
  const series = [
    { teamId: "11", label: "U14A Boys", color: "#d9c53c", dash: "", values: [3, 3, 6] },
    { teamId: "22", label: "U14B Boys", color: "#b95ad9", dash: "6 3", values: [0, 1, 1] },
  ];
  const geo = () => seriesGeometry(series, weeks, 600, 200);

  it("returns one line per series, keeping identity, colour and dash", () => {
    const { lines } = geo();
    expect(lines.map((l) => l.teamId)).toEqual(["11", "22"]);
    expect(lines[0].color).toBe("#d9c53c");
    expect(lines[1].dash).toBe("6 3");
  });

  it("gives each line an SVG path with one point per week", () => {
    const { lines } = geo();
    expect(lines[0].points).toHaveLength(3);
    expect(lines[0].d.startsWith("M")).toBe(true);
    expect(lines[0].d.match(/L/g)).toHaveLength(2);
  });

  it("puts the first week at the left edge and the last at the right", () => {
    const { lines } = geo();
    expect(lines[0].points[0].x).toBeCloseTo(CHART_PADDING.left);
    expect(lines[0].points[2].x).toBeCloseTo(600 - CHART_PADDING.right);
  });

  // Y grows upward on screen, so a bigger value is a SMALLER y.
  it("puts a higher value higher up", () => {
    const { lines } = geo();
    expect(lines[0].points[2].y).toBeLessThan(lines[0].points[0].y);
  });

  it("starts the y scale at zero and covers the largest value", () => {
    const { yMax, yTicks } = geo();
    expect(yMax).toBeGreaterThanOrEqual(6);
    expect(yTicks[0].label).toBe("0");
  });

  it("keeps a zero value on the baseline", () => {
    const { lines } = geo();
    expect(lines[1].points[0].y).toBeCloseTo(200 - CHART_PADDING.bottom);
  });

  it("labels every tick with whole points, never a fraction", () => {
    const { yTicks } = seriesGeometry(series, weeks, 600, 200);
    for (const tick of yTicks) expect(tick.label).toMatch(/^\d+$/);
  });

  it("carries the week and the value on each point, for the hover title", () => {
    const { lines } = geo();
    expect(lines[0].points[2].week).toBe("2026-09-14");
    expect(lines[0].points[2].value).toBe(6);
  });

  it("thins the x ticks rather than printing all of a long season", () => {
    // Real consecutive Mondays: shortDate is applied to these, so non-ISO placeholders
    // would silently render "undefined NaN undefined" and the test would still pass.
    const many = Array.from({ length: 30 }, (_, i) => {
      const d = new Date("2026-08-31T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i * 7);
      return d.toISOString().slice(0, 10);
    });
    const long = [{ teamId: "11", label: "L", color: "#fff", dash: "", values: many.map(() => 1) }];
    const { xTicks } = seriesGeometry(long, many, 600, 200);
    expect(xTicks.length).toBeLessThanOrEqual(6);
    expect(xTicks.length).toBeGreaterThan(1);
    expect(xTicks[0].label).toMatch(/Mon/);
  });

  it("centres a single week rather than dividing by zero", () => {
    const one = [{ teamId: "11", label: "L", color: "#fff", dash: "", values: [3] }];
    const { lines } = seriesGeometry(one, ["2026-09-07"], 600, 200);
    expect(Number.isFinite(lines[0].points[0].x)).toBe(true);
    expect(lines[0].points[0].x).toBeGreaterThan(CHART_PADDING.left);
  });

  it("survives an empty selection", () => {
    const { lines, yMax } = seriesGeometry([], weeks, 600, 200);
    expect(lines).toEqual([]);
    expect(yMax).toBeGreaterThan(0);
  });

  it("never produces NaN in a path", () => {
    for (const { d } of geo().lines) expect(d).not.toMatch(/NaN/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/form.test.js
```

Expected: FAIL — `seriesGeometry is not a function`.

- [ ] **Step 3: Write the implementation**

Add to the imports at the top of `src/lib/form.js`:

```js
import { shortDate } from "./announce.js";
```

Then append to `src/lib/form.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/form.test.js
```

Expected: PASS, 44 tests. If `labels every tick with whole points` fails, `yScaleMax` is not producing a multiple of `Y_TICKS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/form.js test/form.test.js
git commit -F - <<'MSG'
feat(form): chart scales and SVG paths

In lib, not the component: the geometry is the part most likely to be subtly
wrong, and this is the only place it can be tested without a DOM.

Y ends on a whole number of points so no tick reads "2.5"; x ticks thin to at
most six so a long season does not print overlapping dates; a single week
centres rather than dividing by zero.
MSG
```

---

### Task 7: The Form tab and its table

The table first, on its own tab, with no chart. This lands a working, useful screen before the chart's complexity arrives.

**Files:**
- Create: `src/components/FormTab.jsx`
- Modify: `src/App.jsx:13` (the `TABS` list) and the tab render block
- Modify: `src/styles.css`
- Modify: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to `test/components.test.jsx`, after the `ResultsTab` describe block. Add `import FormTab from "../src/components/FormTab.jsx";` to the imports at the top:

```js
const formFixtures = [
  { fid: "f1", teamId: "11", date: "2026-09-12", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "" },
  { fid: "f2", teamId: "22", date: "2026-09-12", time: "14:00", isHome: true,
    ourTeam: "Craughwell United B", opponent: "Y", venue: "Craughwell",
    competition: "GFA Boys U14 Division 4", comment: "" },
  { fid: "f3", teamId: "33", date: "2026-09-13", time: "11:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "Z", venue: "Craughwell",
    competition: "GFA Boys U13 Championship 1", comment: "" },
];

const formResults = [
  { fid: "r1", teamId: "11", date: "2026-09-05", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", ourScore: 2, theirScore: 1,
    venue: "Craughwell", competition: "GFA Boys U14 Championship 1" },
  { fid: "r2", teamId: "33", date: "2026-09-05", isHome: false,
    ourTeam: "Craughwell United", opponent: "Z", ourScore: 0, theirScore: 4,
    venue: "Away", competition: "GFA Boys U13 Championship 1" },
];

// Squad 33 carries #080080 AND has a result, so it lands in the default selection - which
// is what makes the "no invisible stroke" test in Task 8 meaningful rather than vacuous.
// Squad 22 is the never-played one, for the dashes test.
const formConfig = { version: 1, teams: {
  "11": { label: "U14A Boys", color: "#d9c53c" },
  "22": { label: "U14B Boys", color: "#b95ad9" },
  "33": { label: "U13 Boys", color: "#080080" },
} };

describe("FormTab", () => {
  const render = (over = {}) => renderToStaticMarkup(
    <FormTab results={{ version: 1, results: formResults }} fixtures={formFixtures}
             config={formConfig} today="2026-09-07" {...over} />,
  );

  it("renders a squad's season record", () => {
    const html = render();
    expect(html).toContain("U14A Boys");
    expect(html).toContain("3.00"); // one win, one game
  });

  // A squad that has not played must never render as 0.00, which reads as
  // "lost every game".
  it("renders dashes, not zeros, for a squad that has not played", () => {
    const html = render();
    expect(html).toContain("U14B Boys");
    expect(html).not.toContain("0.00");
  });

  it("says the store could not be loaded rather than claiming nobody played", () => {
    const html = render({ results: null });
    expect(html).toMatch(/could not/i);
  });

  it("distinguishes an empty store from a failed one", () => {
    const html = render({ results: { version: 1, results: [] } });
    expect(html).toMatch(/No results yet/i);
    expect(html).not.toMatch(/could not/i);
  });

  // The invariant, at the component boundary.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const html = render({ config: bare });
    expect(html).toContain("U14A Boys");
    expect(html).toContain("U14B Boys");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run test/components.test.jsx
```

Expected: FAIL — cannot resolve `../src/components/FormTab.jsx`.

- [ ] **Step 3: Write the component**

Create `src/components/FormTab.jsx`:

```jsx
import { squadRecords } from "../lib/form.js";
import { squadColor } from "../lib/squadColors.js";

// An em dash, not a zero. A squad that has yet to kick a ball must not render as 0.00,
// which reads as "lost every game" - and nine of eighteen squads are in that state.
const DASH = "—";

function ppg(record) {
  return record.pointsPerGame === null ? DASH : record.pointsPerGame.toFixed(2);
}

// `results` is the parsed results.json, or null when it could not be loaded. An empty
// store means nobody has played; a null one means we do not know, and rendering them
// identically would turn a load failure into a confident "no games".
export default function FormTab({ results, fixtures, config, today }) {
  if (results === null) {
    return (
      <section>
        <div className="card">
          <p>Could not load the results.</p>
          <p className="dim">
            This is not the same as no games having been played — the results file could
            not be read. Reload, or check the data repo.
          </p>
        </div>
      </section>
    );
  }

  const stored = results?.results ?? [];
  const records = squadRecords(stored, fixtures, config);

  return (
    <section>
      {stored.length === 0 ? (
        <div className="card"><p>No results yet.</p></div>
      ) : null}
      <div className="card">
        <table className="form-table">
          <thead>
            <tr>
              <th className="squad">Squad</th>
              <th>P</th><th>W</th><th>D</th><th>L</th>
              <th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>PPG</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
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
      <p className="dim">
        Points are 3 for a win, 1 for a draw. Squads play in different divisions, so
        these are each squad&apos;s own record rather than a table to rank them by.
      </p>
    </section>
  );
}
```

`today` is unused in this task and is wired now because Task 8's chart needs it — leaving it out here would mean editing `App.jsx` twice.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/components.test.jsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Add the tab to `App.jsx`**

In `src/App.jsx`, add the import after the `ResultsTab` import:

```js
import FormTab from "./components/FormTab.jsx";
```

Change the `TABS` list (line 13):

```js
const TABS = ["Fixtures", "Results", "Form", "Changes", "Squads"];
```

And add the render, after the `Results` block:

```jsx
      {tab === "Form" && (
        <FormTab results={results} fixtures={fixtures} config={config} today={today} />
      )}
```

- [ ] **Step 6: Style the table**

Append to `src/styles.css`:

```css
/* The form table. Numbers are tabular so columns line up without a monospace font for
   the squad names, which are prose. */
.form-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.form-table th, .form-table td { padding: 6px 4px; text-align: right;
  font-variant-numeric: tabular-nums; border-top: 1px solid var(--line); }
.form-table thead th { border-top: 0; color: var(--dim); font-weight: 600; font-size: 12px; }
.form-table th.squad, .form-table td.squad { text-align: left; padding-left: 20px;
  position: relative; }
/* The row swatch sits in the gutter, like the announcement's - never in the text. */
.swatch.inline { top: .55em; }
.form-table td.squad .dim { font-size: 12px; }
```

- [ ] **Step 7: Run the full suite and the build**

```bash
npm test && npm run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/FormTab.jsx src/App.jsx src/styles.css test/components.test.jsx
git commit -F - <<'MSG'
feat(form): a Form tab with each squad's season record

P/W/D/L, goals, goal difference, points and points per game, one row per
squad. Alphabetical rather than ranked, with a note that the squads play in
different divisions - the owner was explicit this is not a standings table.

A squad that has not played shows dashes, not zeros.
MSG
```

---

### Task 8: The chart and its controls

**Files:**
- Modify: `src/components/FormTab.jsx`
- Modify: `src/styles.css`
- Modify: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `FormTab` describe block in `test/components.test.jsx`:

```js
  it("draws one path per selected squad", () => {
    const html = render();
    // Two squads have played, so the default selection is those two.
    expect(html.match(/<path[^>]*class="series"/g)).toHaveLength(2);
  });

  it("offers both windows and both modes", () => {
    const html = render();
    expect(html).toContain("Last 5 weeks");
    expect(html).toContain("Full season");
    expect(html).toContain("Weekly points");
    expect(html).toContain("Cumulative");
  });

  it("lists every squad as a checkbox, so the list doubles as the legend", () => {
    const html = render();
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain("U14A Boys");
    expect(html).toContain("U14B Boys");
  });

  // Identity must not rest on colour alone: every point carries a native tooltip.
  it("gives each plotted point a title naming the squad, the week and the value", () => {
    const html = render();
    expect(html).toMatch(/<title>U14A Boys/);
  });

  // A dark squad colour is invisible as a line on the card, so the chart must not use
  // the raw chip colour. #080080 is 1.03:1 against #182029. Squad 33 owns it and has a
  // result, so it IS selected by default - without that this test would pass vacuously.
  it("does not stroke a line in a colour that is invisible on the card", () => {
    const html = render();
    expect(html).toContain("U13 Boys");           // the squad is on the chart
    expect(html).not.toContain('stroke="#080080"'); // but not in its chip colour
  });

  it("renders no chart when the store is empty", () => {
    const html = render({ results: { version: 1, results: [] } });
    expect(html).not.toContain('class="series"');
    expect(html).toMatch(/No results yet/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run test/components.test.jsx
```

Expected: FAIL — `draws one path per selected squad` finds no `<path class="series">`.

- [ ] **Step 3: Add the chart**

In `src/components/FormTab.jsx`, extend the imports:

```jsx
import { useState } from "react";
import {
  squadRecords, defaultSelection, weekAxis, weekSeries, seriesGeometry, FORM_WINDOWS,
} from "../lib/form.js";
import { squadColor } from "../lib/squadColors.js";
```

Add these constants above the component:

```jsx
// viewBox units. The SVG scales to its container by CSS, so this is an aspect ratio
// rather than a pixel size.
const CHART_W = 640;
const CHART_H = 220;

// Above this many lines, colour cannot carry identity - the dataviz guidance caps a
// categorical palette at 8 series. The owner chose no cap, so this warns instead of
// blocking, and the direct labels drop away before it (see DIRECT_LABEL_LIMIT).
const CROWDED = 8;

// Direct labels are the thing that makes many series readable, but they collide with
// each other past a handful. Below this many, label every line; above it, the checkbox
// list and the hover titles carry identity.
const DIRECT_LABEL_LIMIT = 6;

const MODES = [
  { key: "cumulative", label: "Cumulative" },
  { key: "weekly", label: "Weekly points" },
];
```

Replace the component body from `const stored = ...` to the end with:

```jsx
  const stored = results?.results ?? [];
  const records = squadRecords(stored, fixtures, config);

  // null means "not chosen yet", so the default is computed from the data rather than
  // pinned in an effect - which keeps this component renderable on the server.
  const [picked, setPicked] = useState(null);
  const [windowName, setWindowName] = useState(FORM_WINDOWS[0]);
  const [mode, setMode] = useState("cumulative");

  const selected = picked ?? defaultSelection(records);
  const weeks = weekAxis(stored, windowName, today);
  const series = weekSeries(stored, fixtures, config, { mode, windowName, teamIds: selected, today });
  const { xTicks, yTicks, lines } = seriesGeometry(series, weeks, CHART_W, CHART_H);
  const labelDirectly = lines.length > 0 && lines.length <= DIRECT_LABEL_LIMIT;

  function toggle(teamId) {
    setPicked(selected.includes(teamId)
      ? selected.filter((id) => id !== teamId)
      : [...selected, teamId]);
  }

  return (
    <section>
      {stored.length === 0 ? (
        <div className="card"><p>No results yet.</p></div>
      ) : (
        <>
          <div className="row">
            {FORM_WINDOWS.map((w) => (
              <button key={w} className={w === windowName ? "chip on" : "chip"}
                      onClick={() => setWindowName(w)}>{w}</button>
            ))}
          </div>
          <div className="row">
            {MODES.map((m) => (
              <button key={m.key} className={m.key === mode ? "chip on" : "chip"}
                      onClick={() => setMode(m.key)}>{m.label}</button>
            ))}
          </div>

          <div className="card">
            {lines.length === 0 ? (
              <p className="dim">Pick a squad to compare.</p>
            ) : (
              <svg className="chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                   role="img" aria-label="Points by week, per squad">
                {yTicks.map((t) => (
                  <g key={t.label}>
                    <line className="grid" x1="30" y1={t.y} x2={CHART_W - 14} y2={t.y} />
                    <text className="tick" x="24" y={t.y + 4} textAnchor="end">{t.label}</text>
                  </g>
                ))}
                {xTicks.map((t) => (
                  <text key={t.label} className="tick" x={t.x} y={CHART_H - 6}
                        textAnchor="middle">{t.label}</text>
                ))}
                {lines.map((line) => (
                  <g key={line.teamId}>
                    <path className="series" d={line.d} fill="none" stroke={line.color}
                          strokeWidth="2" strokeDasharray={line.dash || undefined}
                          strokeLinecap="round" strokeLinejoin="round" />
                    {line.points.map((p) => (
                      // A 5px marker with a 2px surface ring, so overlapping series stay
                      // separable. The <title> is the hover tooltip - native, no JS.
                      <circle key={`${line.teamId}-${p.week}`} cx={p.x} cy={p.y} r="5"
                              fill={line.color} stroke="#182029" strokeWidth="2">
                        <title>{`${line.label} — ${p.week}: ${p.value}`}</title>
                      </circle>
                    ))}
                    {labelDirectly ? (
                      <text className="series-label"
                            x={line.points.at(-1).x - 6} y={line.points.at(-1).y - 10}
                            textAnchor="end" fill={line.color}>{line.label}</text>
                    ) : null}
                  </g>
                ))}
              </svg>
            )}
          </div>

          {selected.length > CROWDED ? (
            <p className="dim">
              {selected.length} squads selected — colour alone cannot separate this many
              lines. The table below is the reliable read.
            </p>
          ) : null}

          {/* The checkbox list is also the legend: every row carries its squad's stroke
              colour, so identity is never colour-in-the-chart alone. */}
          <div className="card">
            <div className="row">
              <button className="chip" onClick={() => setPicked(records.map((r) => r.teamId))}>All</button>
              <button className="chip" onClick={() => setPicked([])}>None</button>
            </div>
            {records.map((r) => (
              <label className="legend-row" key={r.teamId}>
                <input type="checkbox" checked={selected.includes(r.teamId)}
                       onChange={() => toggle(r.teamId)} />
                <span className="swatch inline" style={{ background: squadColor(r.teamId, config).bg }}
                      aria-hidden="true" />
                <span>{r.label}</span>
                <span className="dim">{r.played === 0 ? "no games" : `${r.played} played`}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="card">
        <table className="form-table">
```

Leave the rest of the table markup exactly as Task 7 wrote it, through the closing `</section>`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/components.test.jsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Style the chart**

Append to `src/styles.css`:

```css
/* Grid and axes are recessive - the data is the foreground. */
.chart { width: 100%; height: auto; display: block; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
/* Ticks and labels wear text tokens, never the series colour. */
.chart .tick { fill: var(--dim); font-size: 11px;
  font-family: ui-sans-serif, system-ui, sans-serif; }
/* The one exception: a direct label IS the legend entry for its line, so it carries the
   line's colour - and every such colour has been lifted to at least 3:1 by strokeOn. */
.chart .series-label { font-size: 11px; font-weight: 600;
  font-family: ui-sans-serif, system-ui, sans-serif; }
.legend-row { display: flex; align-items: center; gap: 8px; padding: 4px 0 4px 20px;
  position: relative; font-size: 14px; cursor: pointer; }
.legend-row .dim { margin-left: auto; }
.legend-row .swatch.inline { top: 50%; transform: translateY(-50%); }
```

- [ ] **Step 6: Run the full suite and the build**

```bash
npm test && npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/FormTab.jsx src/styles.css test/components.test.jsx
git commit -F - <<'MSG'
feat(form): week-by-week points chart

Hand-rolled inline SVG - no charting library for one chart in a project with
three runtime dependencies. Window and mode toggles, and a checkbox per squad
that doubles as the legend.

Identity never rests on colour alone: strokeOn lifts every line to at least
3:1 on the card, each squad carries a stable dash pattern, every point has a
native <title> tooltip, and lines are direct-labelled up to six selected.
Past eight a warning points at the table, which is the reliable read - the
owner chose no cap on selection.
MSG
```

---

### Task 9: Verify against the live data, and record it

- [ ] **Step 1: Check the derivations against the live store**

```bash
cd /home/sean/workspace/fixtures
mkdir -p /tmp/form-check
for f in latest.json results.json teams.json; do
  curl -sS -o /tmp/form-check/$f https://raw.githubusercontent.com/seaninryan/fixtures-data/main/$f
done
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { squadRecords, defaultSelection, weekAxis, weekSeries, seriesGeometry }
  from "/home/sean/workspace/fixtures/src/lib/form.js";
import { clubNow } from "/home/sean/workspace/fixtures/src/lib/clock.js";
const D = "/tmp/form-check/";
const snap = JSON.parse(readFileSync(D + "latest.json", "utf8"));
const res = JSON.parse(readFileSync(D + "results.json", "utf8"));
const config = JSON.parse(readFileSync(D + "teams.json", "utf8"));
const today = clubNow(new Date()).date;
const records = squadRecords(res.results, snap.fixtures, config);
console.log("squads:", records.length, " results:", res.results.length, " today:", today);
console.log("\nsquad".padEnd(24), "P  Pts  PPG");
for (const r of records) {
  console.log(r.label.padEnd(24), r.played, String(r.points).padStart(4),
    (r.pointsPerGame === null ? "  -" : r.pointsPerGame.toFixed(2)).padStart(6));
}
const sel = defaultSelection(records);
console.log("\ndefault selection:", sel.map(id => records.find(r => r.teamId === id).label));
for (const w of ["Last 5 weeks", "Full season"]) {
  const weeks = weekAxis(res.results, w, today);
  const series = weekSeries(res.results, snap.fixtures, config,
    { mode: "cumulative", windowName: w, teamIds: sel, today });
  const geo = seriesGeometry(series, weeks, 640, 220);
  console.log(`\n${w}: ${weeks.length} weeks, ${geo.lines.length} lines, yMax ${geo.yMax}`);
  for (const l of geo.lines) console.log("   ", l.label, "stroke", l.color, "dash", JSON.stringify(l.dash));
  console.log("    NaN in any path?", geo.lines.some(l => /NaN/.test(l.d)));
}
'
```

Expected: it runs without throwing. Every squad with `played: 0` shows `-` for PPG. No path contains `NaN`. The default selection is three squads (or fewer if fewer have played).

Sanity-check by hand: total `played` across all squads must equal the number of stored results.

- [ ] **Step 2: Confirm every stroke colour is visible**

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { squadRecords } from "/home/sean/workspace/fixtures/src/lib/form.js";
import { squadColor, strokeOn, CHART_SURFACE } from "/home/sean/workspace/fixtures/src/lib/squadColors.js";
const D = "/tmp/form-check/";
const snap = JSON.parse(readFileSync(D + "latest.json", "utf8"));
const res = JSON.parse(readFileSync(D + "results.json", "utf8"));
const config = JSON.parse(readFileSync(D + "teams.json", "utf8"));
const lin = c => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = h => { const n = parseInt(h.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let worst = Infinity;
for (const r of squadRecords(res.results, snap.fixtures, config)) {
  const chip = squadColor(r.teamId, config).bg;
  const stroke = strokeOn(chip);
  const got = ratio(stroke, CHART_SURFACE);
  worst = Math.min(worst, got);
  const moved = chip !== stroke ? " lifted from " + chip + " (" + ratio(chip, CHART_SURFACE).toFixed(2) + ":1)" : "";
  console.log(r.label.padEnd(24), stroke, got.toFixed(2) + ":1" + moved);
}
console.log("\nworst stroke contrast:", worst.toFixed(2) + ":1", worst >= 3 ? "PASS" : "FAIL");
'
```

Expected: **every** squad at 3:1 or better, and the three known offenders (U13 Boys `#080080`, U12B Girls `#5900b3`, U15B Boys `#2b00ff`) reported as lifted. A `FAIL` on the last line means `strokeOn` is wrong — stop and fix it.

- [ ] **Step 3: Look at it**

The validator checks colour, not layout. Start the dev server and open the Form tab:

```bash
npm run dev
```

Open `http://localhost:5173/fixtures/`, sign in, and go to Form. Check by eye: no overlapping x labels, direct labels not colliding with each other or the right edge, the chart not overflowing its card on a narrow window, and the `All` button producing something that still reads as a chart. Then stop the server.

- [ ] **Step 4: Update `CLAUDE.md`**

In the **Architecture** section, after the `pending.js` / `clock.js` bullet, add:

```markdown
- `form.js` — each squad's season record, and the Form tab's chart series and SVG
  geometry. Pure, so the scales and path strings are unit-tested without a DOM.
  `squadColors.js` gained `strokeOn` (a squad's colour made visible as a *line*,
  which its chip colour often is not) and `squadDash`.
```

In the **Invariants** section, after the labels invariant, add:

```markdown
- **The Form chart has no cap on selected squads, deliberately.** The dataviz
  guidance caps a categorical palette at 8 series and the palette validator
  fails past that; the owner chose no cap after seeing the finding. Identity is
  therefore carried by four channels and not by hue alone — direct labels up to
  six lines, a per-squad dash, a native `<title>` on every point, and the table.
  Do not "fix" this by reassigning colours per selection: colour follows the
  squad, never its position in a filter.
```

- [ ] **Step 5: Final verification**

```bash
npm test && npm run build
git status --short
```

Expected: both PASS; `git status` shows only `CLAUDE.md` modified.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -F - <<'MSG'
docs: record form.js and the chart's series-count deviation

Verified against the live store: every squad's stroke colour clears 3:1 on the
card, no path contains NaN, and total games played matches the stored result
count.
MSG
```

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-09-07-squad-form-design.md`:

| Spec section | Task |
|---|---|
| Points (3-1-0, PPG null on zero games) | 4 |
| `squadRecords` shape, fixtures ∪ results union | 4 |
| `weekAxis` / `weekSeries`, weekly vs cumulative, blank weeks | 5 |
| `seriesGeometry` return shape | 6 |
| `window.js` gains `weekStart` | 1 |
| `teams.js` gains `fillLabelGaps`, `results.js` refactored onto it | 2 |
| Labels over all fixtures, never a subset | 4, 5, 7 (three separate tests) |
| The table: columns, alphabetical order, dashes not zeros, competition source | 4, 7 |
| The chart: `strokeOn`, controls, defaults, no cap, warning past 8, direct labels ≤6, dash, marks | 3, 8 |
| Error handling: null store, empty store, no selection, one squad, >8 selected | 7, 8 |
| Testing, including the `strokeOn` ratio-not-hex assertion | 1-8 |
| Consequences: fifth tab, nothing newly persisted | 7 |

**Two deliberate departures from the spec, both narrowing rather than widening:**

1. **Hover is a native SVG `<title>` per point, not a crosshair.** The spec says "a crosshair and tooltip". A `<title>` gives a real hover tooltip naming the squad, the week and the value with zero JavaScript and no pointer tracking, and it is assertable in an SSR test. A crosshair needs mouse-move state and a DOM the test environment does not have. If the tooltip proves too fiddly on a phone, a crosshair is a follow-up, not a prerequisite.
2. **The `dataviz` "run the validator before shipping" step was performed during design**, not deferred to implementation: its findings are recorded in the spec and drove `strokeOn`, the dash channel and the crowding warning. No task re-runs it, because the palette is per-squad config that the owner can change at any time — Task 9 Step 2 checks the thing that actually matters, that every squad's *stroke* clears 3:1.

**One spec line needs no work:** it notes the owner may want to re-pick the colours of U15 Girls / U18 Girls (ΔE 11.8) and U12A Boys / U21 Men (ΔE 5.7 deutan). That is config in the data repo and explicitly the owner's call, not this work's.
