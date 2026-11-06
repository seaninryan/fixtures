# Opponent Names and Per-Card Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opponent names are tidied by default (team letter and COMET season code stripped), can be overridden in `teams.json`, and show everywhere through one function. The Graphics tab gets one section of rows per card, with Leave off and opponent renaming in place.

**Architecture:** Pure `src/lib/opponents.js` (clean, override, set). `seedConfig` preserves `config.opponents`. Display call sites route through `opponentName`; identity (`diff.js`, stored objects) keeps the raw name. `cardLayout` reports which rows each card holds; pure `src/lib/cardSections.js` groups rows (left-off ones included) into per-card sections. A shared `ConfigSave` component replaces the Squads tab's copy/edit block.

**Tech Stack:** React 18, Vite 5, Vitest 2 (node env, SSR smoke tests only).

**Spec:** `docs/superpowers/specs/2026-11-06-opponent-names-design.md` — read it first.

**Every shell command** must be preceded by:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

**Commit trailer** for every commit:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/opponents.js` | create | `cleanOpponent`, `opponentName`, `setOpponent`, `cleanOpponents` |
| `src/lib/teams.js` | modify | `seedConfig` keeps a validated `opponents` |
| `src/lib/announce.js` | modify | fixture line uses `opponentName` |
| `src/lib/results.js` | modify | result line uses `opponentName` |
| `src/lib/pending.js` | modify | pending line uses `opponentName` |
| `src/lib/changeReport.js` | modify | fixture description uses `opponentName`; opponent-change detail stays raw |
| `src/components/ChangesTab.jsx` | modify | fixture line uses `opponentName`; summary stays raw |
| `src/lib/cardRows.js` | modify | rows use `opponentName` and carry `meta` for the section UI |
| `src/lib/cardLayout.js` | modify | each card carries `rowIds`, `from`, `to` |
| `src/lib/cardSections.js` | create | rows → per-card sections, left-off rows included |
| `src/components/ConfigSave.jsx` | create | Copy JSON / Edit on GitHub / unsaved count / cache caveat |
| `src/components/SquadsTab.jsx` | modify | uses `ConfigSave`; lists opponent overrides |
| `src/components/GraphicsTab.jsx` | modify | per-card sections replace the Rows box |
| `src/App.jsx` | modify | keeps the loaded config; passes `savedConfig`/`onConfigChange` |
| `CLAUDE.md` | modify | module list and invariants |

---

### Task 1: `opponents.js`

**Files:**
- Create: `src/lib/opponents.js`
- Test: `test/opponents.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/opponents.test.js
import { describe, it, expect } from "vitest";
import { cleanOpponent, opponentName, setOpponent, cleanOpponents } from "../src/lib/opponents.js";

describe("cleanOpponent", () => {
  it.each([
    ["Knocknacarra D", "Knocknacarra"],
    ["Maree/Oranmore C", "Maree/Oranmore"],
    ["Cregmore/Claregalway B", "Cregmore/Claregalway"],
    ["Corofin Utd B", "Corofin Utd"],
    ["Salthill Devon C", "Salthill Devon"],
    ["Merlin Woods Reserve 2425", "Merlin Woods Reserve"],
    ["Merlin Woods B 2526", "Merlin Woods"],
    ["St Bernards", "St Bernards"],
    ["Athenry FC", "Athenry FC"],
    ["Gort", "Gort"],
  ])("%s -> %s", (raw, clean) => {
    expect(cleanOpponent(raw)).toBe(clean);
  });

  it("only strips A-H, never a letter that could be a real word or initial", () => {
    expect(cleanOpponent("Mervue U")).toBe("Mervue U");
    expect(cleanOpponent("Team I")).toBe("Team I");
  });

  it("only strips four digits that read as consecutive years", () => {
    expect(cleanOpponent("Club 2024")).toBe("Club 2024");
    expect(cleanOpponent("Club 2599")).toBe("Club 2599");
    expect(cleanOpponent("Club 9900")).toBe("Club 9900");
  });

  it("never empties a name", () => {
    expect(cleanOpponent("B")).toBe("B");
    expect(cleanOpponent("2425")).toBe("2425");
  });

  it("trims and tolerates junk", () => {
    expect(cleanOpponent("  Gort  ")).toBe("Gort");
    expect(cleanOpponent(undefined)).toBe("");
    expect(cleanOpponent(null)).toBe("");
  });
});

describe("opponentName", () => {
  const config = { opponents: { "Team X Junior Men's Team": "Team X" } };

  it("prefers the override", () => {
    expect(opponentName("Team X Junior Men's Team", config)).toBe("Team X");
  });

  it("falls back to the cleaned name", () => {
    expect(opponentName("Knocknacarra D", config)).toBe("Knocknacarra");
    expect(opponentName("Knocknacarra D", undefined)).toBe("Knocknacarra");
  });

  it("ignores an empty or non-string override", () => {
    expect(opponentName("Gort B", { opponents: { "Gort B": "" } })).toBe("Gort");
    expect(opponentName("Gort B", { opponents: { "Gort B": 7 } })).toBe("Gort");
  });
});

describe("setOpponent", () => {
  const base = { version: 1, teams: { "1": { label: "U14A Boys", color: "#123456" } } };

  it("stores a real override without touching teams", () => {
    const next = setOpponent(base, "Team X Junior Men's Team", "Team X");
    expect(next.opponents).toEqual({ "Team X Junior Men's Team": "Team X" });
    expect(next.teams).toBe(base.teams);
    expect(base.opponents).toBeUndefined();
  });

  it("removes the override when set back to the cleaned default", () => {
    const withIt = setOpponent(base, "Knocknacarra D", "Knocks");
    expect(setOpponent(withIt, "Knocknacarra D", "Knocknacarra").opponents).toEqual({});
  });

  it("removes the override when cleared", () => {
    const withIt = setOpponent(base, "Knocknacarra D", "Knocks");
    expect(setOpponent(withIt, "Knocknacarra D", "   ").opponents).toEqual({});
  });

  it("stores trimmed text", () => {
    expect(setOpponent(base, "Gort B", "  Gort Utd ").opponents).toEqual({ "Gort B": "Gort Utd" });
  });
});

describe("cleanOpponents", () => {
  it("keeps string -> non-empty string entries only", () => {
    expect(cleanOpponents({ a: "A", b: "", c: 3, d: " D " })).toEqual({ a: "A", d: "D" });
  });

  it("treats a non-object as empty", () => {
    expect(cleanOpponents(null)).toEqual({});
    expect(cleanOpponents("nope")).toEqual({});
    expect(cleanOpponents(["x"])).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/opponents.test.js`
Expected: FAIL — cannot resolve `../src/lib/opponents.js`.

- [ ] **Step 3: Implement**

```js
// src/lib/opponents.js
// Pure. How an opponent's name is SHOWN.
//
// The leagues send names with clutter: a team letter ("Knocknacarra D") and, from COMET,
// a season code ("Merlin Woods Reserve 2425"). Those are stripped by default, and the
// owner can override any name in teams.json under `opponents`, keyed on the RAW feed
// name - the only stable identity an opponent has, since neither league gives a club id.
//
// Display only. diff.js and every stored fixture and result keep the raw name, so a
// rename can never raise a change alert.

// A, B... H. Stops short of letters that could be a real word or initial ("Mervue U").
const TEAM_LETTER = / [A-H]$/;
const SEASON_CODE = / (\d{2})(\d{2})$/;

export function cleanOpponent(raw) {
  const original = String(raw ?? "").trim();
  let name = original;
  const season = SEASON_CODE.exec(name);
  // Only two CONSECUTIVE years ("2425"), so "Club 2024" keeps its number.
  if (season && (Number(season[1]) + 1) % 100 === Number(season[2])) {
    name = name.slice(0, season.index).trim();
  }
  name = name.replace(TEAM_LETTER, "").trim();
  return name || original;
}

export function opponentName(raw, config) {
  const set = config?.opponents?.[raw];
  if (typeof set === "string" && set.trim()) return set.trim();
  return cleanOpponent(raw);
}

// A new config with the override for `raw` set to `name` - or removed, when `name` is
// blank or equals the cleaned default, so teams.json never collects no-op entries.
export function setOpponent(config, raw, name) {
  const opponents = { ...cleanOpponents(config?.opponents) };
  const value = String(name ?? "").trim();
  if (!value || value === cleanOpponent(raw)) delete opponents[raw];
  else opponents[raw] = value;
  return { ...config, opponents };
}

// Validate a stored `opponents` object: string keys to non-empty strings, nothing else.
export function cleanOpponents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/opponents.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/opponents.js test/opponents.test.js
git commit -m "feat(opponents): clean names by default, overridable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `seedConfig` keeps `opponents`

**Files:**
- Modify: `src/lib/teams.js` (`seedConfig`, near line 179)
- Test: `test/teams.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/teams.test.js` (add `seedConfig` to its import if not already there; reuse the file's existing fixture builders — read the top of the file first):

```js
describe("seedConfig opponents", () => {
  it("keeps a valid opponents map through a scan", () => {
    const out = seedConfig([], { version: 1, teams: {}, opponents: { "Gort B": "Gort Utd" } });
    expect(out.opponents).toEqual({ "Gort B": "Gort Utd" });
  });

  it("drops malformed entries", () => {
    const out = seedConfig([], { version: 1, teams: {}, opponents: { a: "", b: 4, c: "C" } });
    expect(out.opponents).toEqual({ c: "C" });
  });

  it("has no opponents key when there were none", () => {
    expect(seedConfig([], null)).not.toHaveProperty("opponents");
    expect(seedConfig([], { version: 1, teams: {} })).not.toHaveProperty("opponents");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/teams.test.js`
Expected: the first two FAIL (`opponents` undefined).

- [ ] **Step 3: Implement**

In `src/lib/teams.js` add `import { cleanOpponents } from "./opponents.js";` at the top, and in `seedConfig` replace

```js
  const out = { version: CONFIG_VERSION, teams: kept };
```

with

```js
  const out = { version: CONFIG_VERSION, teams: kept };
  // Display names for opponents (see opponents.js). Carried through untouched apart from
  // validation: without this, the next scan would silently drop every rename. Absent
  // stays absent, so a config that never had renames keeps its exact shape.
  const opponents = cleanOpponents(existing?.opponents);
  if (Object.keys(opponents).length) out.opponents = opponents;
```

Check `src/lib/opponents.js` does not import `teams.js` (it must not — no cycle).

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teams.js test/teams.test.js
git commit -m "feat(teams): seedConfig keeps opponent renames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Show `opponentName` everywhere

**Files:**
- Modify: `src/lib/announce.js`, `src/lib/results.js`, `src/lib/pending.js`, `src/lib/changeReport.js`, `src/components/ChangesTab.jsx`
- Test: `test/announce.test.js`, `test/results.test.js`, `test/pending.test.js`, `test/changeReport.test.js`, `test/components.test.jsx`

This is a deliberate behaviour change: names with a team letter now print without it. Existing tests that assert a raw lettered name in DISPLAY output must be updated to the cleaned name — that is the feature, not a weakening. Tests about identity (diff.js) must not change.

- [ ] **Step 1: Write the failing tests**

Add one test per surface, each using an opponent `"Knocknacarra D"` and a config with `opponents: { "Team X Junior Men's Team": "Team X" }`:

- `test/announce.test.js`: `formatFixtureLine({...fixture, opponent: "Knocknacarra D"}, labels, config)` contains `"v Knocknacarra"` and not `"Knocknacarra D"`; with opponent `"Team X Junior Men's Team"` it contains `"Team X"`; and `announce(...)` over such a fixture shows the cleaned name (proves the config is threaded through `announceLines`).
- `test/results.test.js`: `formatResultLine` home and away both show the cleaned name; `roundup(...)` with the override shows `"Team X"`.
- `test/pending.test.js`: `pendingLines` shows `"@ Knocknacarra —"` for a pending game against `"Knocknacarra D"`.
- `test/changeReport.test.js`: a `moved` change against `"Knocknacarra D"` describes `"v Knocknacarra"`; an `opponent` change from `"Knocknacarra C"` to `"Knocknacarra D"` still prints both RAW names in its detail lines.
- `test/components.test.jsx` (ChangesTab): a change's fixture line shows the cleaned name; an `opponent` change's summary shows raw `"Knocknacarra C → Knocknacarra D"`.

Read each test file's existing builders first and follow their style.

- [ ] **Step 2: Run to verify failures**

Run: `npm test`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`src/lib/announce.js` — import `{ opponentName } from "./opponents.js"`; change

```js
export function formatFixtureLine(fixture, labels) {
```
to
```js
// `config` supplies opponent renames; without it names are still cleaned by default.
export function formatFixtureLine(fixture, labels, config) {
```
and `${fixture.opponent}` to `${opponentName(fixture.opponent, config)}`. In `announceLines`, pass `config`: `formatFixtureLine(fixture, labels, config)`.

`src/lib/results.js` — import `opponentName`; `formatResultLine(result, labels, config)` uses `opponentName(result.opponent, config)` in both branches (compute it once into a `const opp`); in `roundupLines` pass `config`.

`src/lib/pending.js` — import `opponentName`; in `pendingLines` replace `${f.opponent}` with `${opponentName(f.opponent, config)}`.

`src/lib/changeReport.js` — import `opponentName`; change `describe` to `(change, labels, config)` using `opponentName(f.opponent, config)`; thread `config` into `detail(change, labels, config)` and from `changeReport` into every `detail(...)` call. Leave lines 47-48 (`change.from.opponent` / `change.to.opponent`) RAW, and add above them:

```js
      // RAW on purpose: this change IS the feed renaming the opponent, and cleaning both
      // sides could print "Knocknacarra -> Knocknacarra".
```

`src/components/ChangesTab.jsx` — import `opponentName`; line 46 becomes `{opponentName(c.fixture.opponent, config)}`. Leave `summarise`'s `opponent` case raw with the same comment.

- [ ] **Step 4: Update lettered expectations, run the suite**

Run: `npm test`. Any remaining failure that asserts a raw lettered opponent in display text (for example from the real capture in `test/fixtures/`) is updated to the cleaned name. Any failure elsewhere is a bug — investigate.

- [ ] **Step 5: Offline scan still runs**

Run: `DATA_DIR=$(mktemp -d) FIXTURES_HTML_FILE=test/fixtures/club2960.html FAI_MATCHES_FILE=test/fixtures/fai-capture.json node scripts/check.mjs --dry-run`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/announce.js src/lib/results.js src/lib/pending.js src/lib/changeReport.js src/components/ChangesTab.jsx test/
git commit -m "feat(opponents): show cleaned or renamed opponents everywhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Card rows carry `meta`; cards carry `rowIds`

**Files:**
- Modify: `src/lib/cardRows.js`, `src/lib/cardLayout.js`
- Create: `src/lib/cardSections.js`
- Test: `test/cardRows.test.js`, `test/cardLayout.test.js`, `test/cardSections.test.js`

- [ ] **Step 1: Write the failing tests**

In `test/cardRows.test.js` — existing tests call `fixtureRows(fixtures, labels)` / `resultRows(results, labels)`; keep them passing (config is optional). Add:

```js
describe("opponent names and meta", () => {
  const config = { opponents: { "Team X Junior Men's Team": "Team X" } };

  it("fixture rows show the cleaned or renamed opponent", () => {
    expect(fixtureRows([fx({ opponent: "Knocknacarra D" })], labels, config)[0].segments[1].text)
      .toBe(" v Knocknacarra");
    expect(fixtureRows([fx({ opponent: "Team X Junior Men's Team" })], labels, config)[0].segments[1].text)
      .toBe(" v Team X");
  });

  it("result rows show the cleaned opponent on both sides", () => {
    expect(resultRows([rs({ opponent: "Gort B" })], labels, config)[0].segments[1].text).toBe("-1 Gort");
    expect(resultRows([rs({ opponent: "Gort B", isHome: false })], labels, config)[0].segments[0].text).toBe("Gort 1-");
  });

  it("a hand-entered result keeps the name as typed", () => {
    expect(resultRows([rs({ opponent: "Gort B", manual: true })], labels, config)[0].segments[1].text).toBe("-1 Gort B");
  });

  it("rows carry meta for the section UI", () => {
    expect(fixtureRows([fx({ opponent: "Knocknacarra D" })], labels, config)[0].meta).toEqual({
      label: "U15A Boys", versus: "v", opponentRaw: "Knocknacarra D", opponent: "Knocknacarra",
      score: null, editable: true,
    });
    expect(resultRows([rs({ opponent: "Gort B", manual: true })], labels, config)[0].meta).toMatchObject({
      score: "0-1", editable: false,
    });
  });
});
```

(`rs()` defaults: `isHome: true, ourScore: 0, theirScore: 1`, so its `score` is `"0-1"` ours-first. Check the builder at the top of the file.)

In `test/cardLayout.test.js` add:

```js
describe("rowIds", () => {
  it("each card lists exactly its rows, in order, covering all rows once", () => {
    for (const shape of Object.keys(SHAPES)) {
      for (const mode of ["auto", "single", "perDay"]) {
        const input = [...rows(9, "2026-11-01"), ...rows(3, "2026-11-02").map((r) => ({ ...r, id: `b${r.id}` }))];
        const cards = lay({ shape, mode, rows: input });
        const all = cards.flatMap((c) => c.rowIds);
        expect([...all].sort()).toEqual(input.map((r) => r.id).sort());
        expect(new Set(all).size).toBe(all.length);
        for (const c of cards) expect(c.from <= c.to).toBe(true);
      }
    }
  });
});
```

Create `test/cardSections.test.js`:

```js
import { describe, it, expect } from "vitest";
import { cardSections } from "../src/lib/cardSections.js";

const r = (id, date, time = "12:00") => ({ id, date, time });

describe("cardSections", () => {
  const all = [r("1", "2026-11-07"), r("2", "2026-11-07", "14:00"), r("3", "2026-11-08"), r("4", "2026-11-09")];
  const cards = [
    { fileName: "a", from: "2026-11-07", to: "2026-11-07", rowIds: ["1"] },
    { fileName: "b", from: "2026-11-08", to: "2026-11-08", rowIds: ["3"] },
  ];

  it("lists each card's rows and slots a left-off row into the card covering its date", () => {
    const { sections } = cardSections(cards, all, ["2", "4"]);
    expect(sections.map((s) => s.rows.map((x) => [x.row.id, x.leftOff]))).toEqual([
      [["1", false], ["2", true]],
      [["3", false]],
    ]);
  });

  it("puts a left-off row no card covers in orphans", () => {
    expect(cardSections(cards, all, ["2", "4"]).orphans.map((x) => x.id)).toEqual(["4"]);
  });

  it("a split day's left-off rows go under its first part", () => {
    const split = [
      { fileName: "p1", from: "2026-11-07", to: "2026-11-07", rowIds: ["1"] },
      { fileName: "p2", from: "2026-11-07", to: "2026-11-07", rowIds: ["2"] },
    ];
    const extra = [...all, r("5", "2026-11-07", "16:00")];
    const { sections } = cardSections(split, extra, ["5"]);
    expect(sections[0].rows.map((x) => x.row.id)).toEqual(["1", "5"]);
    expect(sections[1].rows.map((x) => x.row.id)).toEqual(["2"]);
  });

  it("orders a section by date, time, id", () => {
    const one = [{ fileName: "w", from: "2026-11-07", to: "2026-11-08", rowIds: ["3", "1"] }];
    const { sections } = cardSections(one, all, ["2"]);
    expect(sections[0].rows.map((x) => x.row.id)).toEqual(["1", "2", "3"]);
  });

  it("no cards: everything left off is an orphan", () => {
    expect(cardSections([], all, ["1"]).orphans.map((x) => x.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run test/cardRows.test.js test/cardLayout.test.js test/cardSections.test.js`
Expected: new tests FAIL.

- [ ] **Step 3: Implement `cardRows.js`**

Import `opponentName` from `./opponents.js`. Change signatures to `fixtureRows(fixtures, labels, config)` and `resultRows(results, labels, config)`. In each:

```js
    // A hand-entered result is shown exactly as the owner typed it.
    const opponent = r.manual ? r.opponent : opponentName(r.opponent, config);
```

(for fixtures, without the `manual` branch). Use `opponent` in the segments, and add to every row:

```js
    meta: {
      label, versus: r.isHome ? "v" : "@", opponentRaw: r.opponent, opponent,
      score: `${r.ourScore}-${r.theirScore}`,   // fixtures: null
      editable: !r.manual,                      // fixtures: true
    },
```

`score` is ours-first regardless of home/away (it's a label for the owner, not the card text).

- [ ] **Step 4: Implement `cardLayout.js`**

In `buildCard`'s return, add `rowIds: groups.flatMap((g) => g.rows.map((r) => r.id)), from, to`.

- [ ] **Step 5: Implement `cardSections.js`**

```js
// src/lib/cardSections.js
// Pure. The Graphics tab's per-card row lists.
//
// A card only holds the rows that are ON it, but the owner needs to see a left-off row
// where it would have been, or there is nothing to tick to put it back. So a left-off
// row is slotted into the first card whose date range covers it; one no card covers (a
// whole day left off) is an orphan.
const byOrder = (a, b) =>
  a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))
  || String(a.id).localeCompare(String(b.id));

// cards: [{fileName, from, to, rowIds}]; allRows: every row before leave-off;
// leftOffIds: ids (without the kind prefix) currently left off.
// -> {sections: [{fileName, rows: [{row, leftOff}]}], orphans: [row]}
export function cardSections(cards, allRows, leftOffIds) {
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const off = new Set(leftOffIds);
  const sections = cards.map((c) => ({
    fileName: c.fileName,
    rows: c.rowIds.map((id) => byId.get(id)).filter(Boolean).map((row) => ({ row, leftOff: false })),
  }));
  const orphans = [];
  for (const row of allRows) {
    if (!off.has(row.id)) continue;
    const i = cards.findIndex((c) => c.from <= row.date && row.date <= c.to);
    if (i === -1) orphans.push(row);
    else sections[i].rows.push({ row, leftOff: true });
  }
  for (const s of sections) s.rows.sort((a, b) => byOrder(a.row, b.row));
  return { sections, orphans: orphans.sort(byOrder) };
}
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cardRows.js src/lib/cardLayout.js src/lib/cardSections.js test/cardRows.test.js test/cardLayout.test.js test/cardSections.test.js
git commit -m "feat(cards): rows carry opponent meta; cards list their rows; per-card sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ConfigSave`, saved config in App, Squads opponent list

**Files:**
- Create: `src/components/ConfigSave.jsx`
- Modify: `src/components/SquadsTab.jsx`, `src/App.jsx`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `test/components.test.jsx` (import `ConfigSave`):

```jsx
describe("ConfigSave", () => {
  const saved = { version: 1, teams: {} };

  it("says nothing is unsaved when the config matches", () => {
    const html = renderToStaticMarkup(<ConfigSave config={saved} savedConfig={saved} />);
    expect(html).toContain("Copy JSON");
    expect(html).not.toContain("unsaved");
  });

  it("counts unsaved opponent renames", () => {
    const edited = { ...saved, opponents: { "Gort B": "Gort Utd", "Team X Junior": "Team X" } };
    const html = renderToStaticMarkup(<ConfigSave config={edited} savedConfig={saved} />);
    expect(html).toContain("2 unsaved name changes");
  });
});

describe("SquadsTab opponents", () => {
  it("lists opponent renames raw -> shown", () => {
    const cfg = { ...config, opponents: { "Team X Junior Men's Team": "Team X" } };
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={cfg} savedConfig={cfg} onChange={() => {}} />,
    );
    expect(html).toContain("Opponent names");
    expect(html).toContain("Team X Junior Men&#x27;s Team");
    expect(html).toContain("Team X");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/components.test.jsx`
Expected: FAIL — `ConfigSave.jsx` missing.

- [ ] **Step 3: Implement `ConfigSave.jsx`**

Move the Squads tab's copy button, GitHub link and the cache-caveat paragraph here. Squad edits still count as "changes" but the count shown is of opponent renames that differ; any other difference shows "Unsaved changes".

```jsx
// src/components/ConfigSave.jsx
// The one way teams.json is saved: copy here, paste on GitHub. The site is static and
// cannot write to the data repo. Shared by the Squads and Graphics tabs so both say the
// same thing - including the cache delay, which otherwise looks like a failed save.
import { useState } from "react";
import { EDIT_TEAMS_URL } from "../lib/dataSource.js";
import { cleanOpponents } from "../lib/opponents.js";

function renameChanges(config, saved) {
  const a = cleanOpponents(config?.opponents);
  const b = cleanOpponents(saved?.opponents);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]).length;
}

export default function ConfigSave({ config, savedConfig }) {
  const [copied, setCopied] = useState(false);
  const json = `${JSON.stringify(config, null, 2)}\n`;
  const dirty = savedConfig !== undefined && json !== `${JSON.stringify(savedConfig, null, 2)}\n`;
  const renames = renameChanges(config, savedConfig);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card save">
      {dirty && (
        <p>
          <b>{renames > 0 ? `${renames} unsaved name change${renames === 1 ? "" : "s"}` : "Unsaved changes"}</b>
          {" "}— copy the JSON and paste it over teams.json on GitHub to keep them.
        </p>
      )}
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy JSON"}</button>
        <a className="chip" href={EDIT_TEAMS_URL} target="_blank" rel="noreferrer">Edit on GitHub</a>
      </div>
      <p className="dim">
        <b>Changes take a few minutes to appear.</b> The JSON is served through GitHub’s
        CDN, which caches compressed and uncompressed copies separately, so a reload can
        keep showing the old file until that copy expires. That is not a failed save —
        wait a few minutes rather than pasting again.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Update `SquadsTab.jsx`**

- Accept `savedConfig`; remove its own `copied` state, `json`, `copy()`, the Copy/Edit row and the cache paragraph (now in `ConfigSave`); keep the other help paragraphs.
- After the squad cards, add:

```jsx
      <div className="card">
        <h3>Opponent names</h3>
        {Object.keys(cleanOpponents(config?.opponents)).length === 0
          ? <p className="dim">No renames yet. Rename an opponent on a card in the Graphics tab; team letters and season codes are removed automatically.</p>
          : Object.entries(cleanOpponents(config.opponents)).sort(([a], [b]) => a.localeCompare(b)).map(([raw, shown]) => (
            <div className="row" key={raw}>
              <span className="dim">{raw}</span> → <b>{shown}</b>
              <button className="chip" onClick={() => onChange(setOpponent(config, raw, ""))}>Remove</button>
            </div>
          ))}
      </div>
      <ConfigSave config={config} savedConfig={savedConfig} />
```

Imports: `ConfigSave`, `{ cleanOpponents, setOpponent } from "../lib/opponents.js"`. Drop the now-unused `EDIT_TEAMS_URL` / `useState` imports if unused.

- [ ] **Step 5: Update `App.jsx`**

- Add `const [savedConfig, setSavedConfig] = useState({ version: 1, teams: {} });`
- Where it does `if (base === BASE) setConfig(loaded);` make it `if (base === BASE) { setConfig(loaded); setSavedConfig(loaded); }`.
- Pass `savedConfig={savedConfig}` to `SquadsTab`, and `savedConfig={savedConfig} onConfigChange={setConfig}` to `GraphicsTab`.

- [ ] **Step 6: Styles**

Append to `src/styles.css`:

```css
.card.save p { margin: 0 0 8px; }
```

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/ConfigSave.jsx src/components/SquadsTab.jsx src/App.jsx src/styles.css test/components.test.jsx
git commit -m "feat(config): shared save control; Squads lists opponent renames

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Graphics tab — one section per card

**Files:**
- Modify: `src/components/GraphicsTab.jsx`, `src/styles.css`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `GraphicsTab` describe in `test/components.test.jsx` (two fixtures on different days so Auto/This weekend gives two cards on 4:5 only if they don't fit together — use mode-independent assertions):

```jsx
  it("lists each card's games under it, with the opponent editable", () => {
    const two = [
      { ...fixtures[0], fid: "1", date: "2026-08-29", opponent: "Knocknacarra D" },
      { ...fixtures[0], fid: "2", date: "2026-08-30", opponent: "Team X Junior Men's Team" },
    ];
    const cfg = { ...config, opponents: { "Team X Junior Men's Team": "Team X" } };
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={two} awaiting={[]} results={{ results: [] }} config={cfg} savedConfig={cfg}
                   onConfigChange={() => {}} today="2026-08-25" now={{ date: "2026-08-25", time: "10:00" }} />,
    );
    expect(html).toContain('class="cardrows"');
    expect(html).toContain('value="Knocknacarra"');
    expect(html).toContain('value="Team X"');
    expect(html).toContain('title="League name: Knocknacarra D"');
    expect(html).not.toContain(">Rows<");
  });

  it("shows the unsaved bar when renames differ from teams.json", () => {
    const cfg = { ...config, opponents: { "St Bernards": "Bernards" } };
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }} config={cfg} savedConfig={config}
                   onConfigChange={() => {}} today="2026-08-25" now={{ date: "2026-08-25", time: "10:00" }} />,
    );
    expect(html).toContain("1 unsaved name change");
  });
```

Update the existing GraphicsTab test that asserts `"Leave off"` if needed so it still passes (the per-row control stays labelled "Leave off").

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/components.test.jsx`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

In `src/components/GraphicsTab.jsx`:

1. Accept `savedConfig` and `onConfigChange` props. Import `cardSections` from `../lib/cardSections.js`, `setOpponent` from `../lib/opponents.js`, `ConfigSave` from `./ConfigSave.jsx`.
2. Pass `config` into the row builders: `resultRows(chosen, labels, config)` and `fixtureRows(chosen, cardLabels(fixtures, config, []), config)`.
3. Compute the left-off ids for this kind once (`off`, already computed inside the `rows` memo — hoist it into its own `useMemo` and reuse it in both places).
4. Compute `const { sections, orphans } = useMemo(() => cardSections(cards, allRows, off), [cards, allRows, off]);` after `cards` is known.
5. Replace the `cardgrid` contents so each preview is followed by its section, and delete the old "Rows" card:

```jsx
          <div className="cardgrid">
            {cards.map((card, i) => (
              <div key={card.fileName} className="cardcol">
                <CardPreview kind={lower} shape={shape} card={card} fontsReady={fontsReady} />
                <CardRows entries={sections[i]?.rows ?? []} onToggle={(id) => toggleLeaveOff(leaveKey(id))}
                          onRename={(raw, name) => onConfigChange?.(setOpponent(config, raw, name))} />
              </div>
            ))}
          </div>
          {orphans.length > 0 && (
            <div className="card">
              <p className="phead">Not on any card</p>
              <CardRows entries={orphans.map((row) => ({ row, leftOff: true }))}
                        onToggle={(id) => toggleLeaveOff(leaveKey(id))}
                        onRename={(raw, name) => onConfigChange?.(setOpponent(config, raw, name))} />
            </div>
          )}
          <ConfigSave config={config} savedConfig={savedConfig} />
```

(When every row of the window is left off there are no cards: make sure the `cards.length === 0` branch still renders the orphans section, so the owner can put rows back.)

6. Add the component:

```jsx
// One card's games: Leave off, and the opponent renamed in place. The input commits on
// blur or Enter, not per keystroke - each commit re-lays out and redraws every card.
function CardRows({ entries, onToggle, onRename }) {
  if (entries.length === 0) return null;
  return (
    <ul className="cardrows">
      {entries.map(({ row, leftOff }) => (
        <li key={row.id} className={leftOff ? "off" : ""}>
          <label className="leave">
            <input type="checkbox" checked={leftOff} onChange={() => onToggle(row.id)} />
            <span>Leave off</span>
          </label>
          <span className="who">
            {row.chip ? <span className="dim">{row.chip} </span> : null}
            <b>{row.meta.label}</b> {row.meta.versus}{" "}
            {row.meta.editable
              ? <OpponentInput raw={row.meta.opponentRaw} shown={row.meta.opponent} onRename={onRename} />
              : <span>{row.meta.opponent}</span>}
            {row.meta.score ? <span className="dim"> {row.meta.score}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpponentInput({ raw, shown, onRename }) {
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);
  const commit = () => { if (draft.trim() !== shown) onRename(raw, draft); };
  return (
    <input className="opp" value={draft} title={`League name: ${raw}`} placeholder={raw}
           onChange={(e) => setDraft(e.target.value)} onBlur={commit}
           onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}
```

7. Styles — append to `src/styles.css`:

```css
.cardcol { display: flex; flex-direction: column; gap: 8px; }
.cardrows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.cardrows li { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
.cardrows li.off { opacity: 0.5; }
.cardrows li.off .who { text-decoration: line-through; }
.cardrows .leave { display: flex; gap: 4px; align-items: center; white-space: nowrap; font-size: 12px; }
.cardrows .who { flex: 1; min-width: 0; }
.cardrows input.opp { width: 12em; max-width: 100%; font: inherit; }
```

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Look at it**

Re-use the screenshot harness if it still exists at `/tmp/claude-1000/-home-sean-workspace-fixtures/d14750c4-5b94-4946-99ed-fb15013ed1fc/scratchpad/harness/` — but the sections are page UI, not canvas, so for this check render `GraphicsTab` itself in the harness (owner gate bypassed — the harness imports the component directly) with realistic fixtures including lettered opponents, screenshot at ~860px wide, and confirm: one section under each preview, Leave off ticks grey a row but keep it listed, the inputs show cleaned names. Save PNGs in the scratchpad.

- [ ] **Step 6: Commit**

```bash
git add src/components/GraphicsTab.jsx src/styles.css test/components.test.jsx
git commit -m "feat(cards): one row section per card with opponent renaming

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Under **Architecture**, after the `cardRows.js, cardLayout.js, manualResults.js` bullet add:

```markdown
- `opponents.js` — how an opponent's name is SHOWN: a trailing team letter (A–H) and a
  COMET season code are stripped, and `teams.json` `opponents` (keyed on the raw feed
  name) overrides. Every display surface goes through `opponentName`; `diff.js` and the
  stored fixtures keep the raw name. `cardSections.js` groups rows, left-off ones
  included, under the card that covers their date.
```

Under **Invariants** add:

```markdown
- **Opponent renames are display only.** Identity and change detection use the raw feed
  name, so renaming never raises an alert, and an OPPONENT CHANGE prints raw names -
  cleaning both sides could print "Knocknacarra -> Knocknacarra". `seedConfig` must carry
  `opponents` through, or the next scan silently drops every rename.
```

- [ ] **Step 2: Commit and verify**

```bash
git add CLAUDE.md
git commit -m "docs: opponent names and per-card rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test && npm run build
```
