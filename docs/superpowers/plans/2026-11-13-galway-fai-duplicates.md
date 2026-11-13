# Galway FA / FAI Connect duplicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide a Galway FA fixture or result that duplicates an FAI Connect one, at read time, and show a visible note listing what was hidden.

**Architecture:** A pure `src/lib/dedupe.js` decides what counts as a duplicate. `combine()` moves out of `App.jsx` into `src/lib/combine.js`, so it can be unit-tested in node, and applies the dedupe to fixtures, awaiting and results. `AnnouncementTab` renders a note for upcoming hidden fixtures. Scan, stored data, diff and email are untouched.

**Tech Stack:** React 18, Vite, Vitest (node environment, SSR smoke tests via `renderToStaticMarkup`).

Spec: `docs/superpowers/specs/2026-11-13-galway-fai-duplicates-design.md`.

**Every shell command needs Node 20 first** (system Node 14 silently breaks Vitest):

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

---

### Task 1: `dedupe.js` - the duplicate rule

**Files:**
- Create: `src/lib/dedupe.js`
- Test: `test/dedupe.test.js`

- [ ] **Step 1: Write the failing tests**

`test/dedupe.test.js`:

```js
import { describe, it, expect } from "vitest";
import { dupeKey, dropGalwayDuplicates } from "../src/lib/dedupe.js";

// The real pair from fixtures-data on 2026-11-13. Galway FA filed the adult Juniors'
// FAI Junior Cup tie under the U21 team id; FAI Connect has it under the right squad.
const galway = {
  fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
  competition: "FAI Junior Cup", comment: "",
};
const fai = {
  fid: "fai:56104529", teamId: "fai:61270", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United Juniors", opponent: "Mervue United FC Jun A", venue: "Craughwell",
  competition: "FAI Junior Cup 2026/27 - Galway", comment: "",
};

describe("dupeKey", () => {
  it("gives both spellings of Mervue the same key", () => {
    expect(dupeKey("Mervue Utd")).toBe("mervue united");
    expect(dupeKey("Mervue United FC Jun A")).toBe("mervue united");
  });

  it("drops FC, AFC, junior words, punctuation and case", () => {
    expect(dupeKey("St. Bernards AFC")).toBe("st bernards");
    expect(dupeKey("Salthill Devon FC A")).toBe("salthill devon");
    expect(dupeKey("Renmore Juniors")).toBe("renmore");
  });

  it("strips a COMET season code the way the display does", () => {
    expect(dupeKey("Merlin Woods Reserve 2425")).toBe("merlin woods reserve");
  });

  it("keys a missing opponent as empty", () => {
    expect(dupeKey(undefined)).toBe("");
  });
});

describe("dropGalwayDuplicates", () => {
  it("hides the Galway copy of the real Mervue cup tie", () => {
    const out = dropGalwayDuplicates([galway], [fai]);
    expect(out.hidden).toEqual([galway]);
    expect(out.kept).toEqual([]);
  });

  it.each([
    ["a different time", { time: "15:00" }],
    ["a different date", { date: "2026-11-15" }],
    ["the other side's ground", { isHome: false }],
    ["a different opponent", { opponent: "Moyne Villa" }],
  ])("keeps a Galway fixture with %s", (_, change) => {
    const out = dropGalwayDuplicates([{ ...galway, ...change }], [fai]);
    expect(out.kept).toHaveLength(1);
    expect(out.hidden).toEqual([]);
  });

  // One FAI game is one game. Two Galway rows matching it are not both the same game,
  // so only one may disappear.
  it("lets each FAI entry hide at most one Galway entry", () => {
    const twin = { ...galway, fid: "7035326" };
    const out = dropGalwayDuplicates([galway, twin], [fai]);
    expect(out.hidden).toEqual([galway]);
    expect(out.kept).toEqual([twin]);
  });

  // Results carry no time.
  it("ignores time when withTime is false", () => {
    const { time: _g, ...g } = galway;
    const { time: _f, ...f } = fai;
    expect(dropGalwayDuplicates([g], [f], { withTime: false }).hidden).toEqual([g]);
  });

  it("keeps an entry with no opponent or no date rather than matching it", () => {
    const noOpp = { ...galway, opponent: "" };
    const noDate = { ...galway, date: undefined };
    const out = dropGalwayDuplicates([noOpp, noDate], [{ ...fai, opponent: "" }, { ...fai, date: undefined }]);
    expect(out.kept).toEqual([noOpp, noDate]);
  });

  it("keeps Galway order and copes with missing lists", () => {
    const a = { ...galway, fid: "1", time: "10:00" };
    const b = { ...galway, fid: "2", time: "11:00" };
    expect(dropGalwayDuplicates([a, b], undefined).kept).toEqual([a, b]);
    expect(dropGalwayDuplicates(undefined, [fai])).toEqual({ kept: [], hidden: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/dedupe.test.js`
Expected: FAIL, cannot resolve `../src/lib/dedupe.js`.

- [ ] **Step 3: Implement**

`src/lib/dedupe.js`:

```js
// src/lib/dedupe.js
// Pure. Which Galway FA entries are the same game as an FAI Connect one.
//
// The two leagues share no ids, and the club is migrating between them, so a game can be
// listed by both - on 2026-11-02 Galway FA filed the adult Juniors' FAI Junior Cup tie
// under the U21 team id, and FAI Connect then listed it correctly. FAI Connect is the
// system that replaces Galway FA, so it wins and the Galway copy is hidden.
//
// DISPLAY ONLY. This is the one place a fixture is matched on date and name rather than
// fid, and it decides only what the site shows. The scan never calls it: dropping the row
// there would diff it as a CANCELLED alert for a game that is still on.
import { cleanOpponent } from "./opponents.js";

// Words that differ between the two leagues' spellings of the same club. "Jun" because
// COMET names the adult side "Mervue United FC Jun A" where Galway FA says "Mervue Utd".
const NOISE = new Set(["fc", "afc", "jun", "junior", "juniors"]);

export function dupeKey(raw) {
  return cleanOpponent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === "utd" ? "united" : w))
    .filter((w) => !NOISE.has(w))
    .join(" ");
}

// An entry without a date or an opponent never matches: hiding a game on half a key
// would be a guess, and showing a doubtful row is the safe failure.
const keyOf = (x) =>
  x && typeof x.date === "string" && x.date ? dupeKey(x.opponent) : "";

// -> { kept, hidden }. `kept` keeps the order of `galway`. Each FAI entry hides at most
// one Galway entry. withTime: false for results, which carry no kick-off time.
export function dropGalwayDuplicates(galway, fai, { withTime = true } = {}) {
  const pool = (fai ?? []).map((f) => ({ f, key: keyOf(f), used: false }));
  const kept = [];
  const hidden = [];
  for (const g of galway ?? []) {
    const key = keyOf(g);
    const match = key && pool.find((p) =>
      !p.used &&
      p.key === key &&
      p.f.date === g.date &&
      p.f.isHome === g.isHome &&
      (!withTime || p.f.time === g.time));
    if (match) {
      match.used = true;
      hidden.push(g);
    } else {
      kept.push(g);
    }
  }
  return { kept, hidden };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/dedupe.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dedupe.js test/dedupe.test.js
git commit -m "feat: detect Galway FA fixtures that duplicate an FAI Connect one"
```

---

### Task 2: `combine.js` - apply it where the sources merge

**Files:**
- Create: `src/lib/combine.js` (the body of `combine()` moved out of `src/App.jsx:45-69`)
- Modify: `src/App.jsx` (delete the local `combine`, import it, pass `allFixtures` and `hidden`)
- Test: `test/combine.test.js`

- [ ] **Step 1: Write the failing tests**

`test/combine.test.js`:

```js
import { describe, it, expect } from "vitest";
import { combine } from "../src/lib/combine.js";

const g = {
  fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
  competition: "FAI Junior Cup", comment: "",
};
const f = {
  fid: "fai:56104529", teamId: "fai:61270", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United Juniors", opponent: "Mervue United FC Jun A", venue: "Craughwell",
  competition: "FAI Junior Cup 2026/27 - Galway", comment: "",
};
const other = { ...g, fid: "6958003", teamId: "284049", opponent: "Loughrea", time: "09:30" };
const score = (x) => {
  const { time: _t, comment: _c, ...rest } = x;
  return { ...rest, ourScore: 2, theirScore: 1 };
};

describe("combine", () => {
  it("hides the Galway duplicate from fixtures and lists it in hidden", () => {
    const out = combine({ snapshot: { fixtures: [g, other] }, faiSnapshot: { fixtures: [f] } });
    expect(out.fixtures.map((x) => x.fid)).toEqual(["6958003", "fai:56104529"]);
    expect(out.hidden).toEqual([g]);
  });

  // Squads and Changes describe the feeds themselves, and labels resolve over ALL
  // fixtures - so the undeduped list must still be available.
  it("keeps every fixture in allFixtures", () => {
    const out = combine({ snapshot: { fixtures: [g, other] }, faiSnapshot: { fixtures: [f] } });
    expect(out.allFixtures).toEqual([g, other, f]);
  });

  it("hides a Galway awaiting entry that FAI also has, upcoming or awaiting", () => {
    const out = combine({ snapshot: { fixtures: [], awaiting: [g] }, faiSnapshot: { awaiting: [f] } });
    expect(out.awaiting).toEqual([f]);
  });

  it("hides a Galway result that FAI also has, ignoring time", () => {
    const out = combine({
      snapshot: { fixtures: [] },
      results: { results: [score(g), score(other)] },
      faiResults: { results: [score(f)] },
    });
    expect(out.results.results.map((x) => x.fid)).toEqual(["6958003", "fai:56104529"]);
  });

  it("keeps results null only when both stores failed", () => {
    expect(combine({ snapshot: { fixtures: [] }, results: null, faiResults: null }).results).toBeNull();
    expect(combine({ snapshot: { fixtures: [] }, results: null, faiResults: { results: [] } }).results)
      .toEqual({ results: [] });
  });

  it("works with no FAI snapshot at all", () => {
    const out = combine({ snapshot: { fixtures: [g] } });
    expect(out.fixtures).toEqual([g]);
    expect(out.hidden).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/combine.test.js`
Expected: FAIL, cannot resolve `../src/lib/combine.js`.

- [ ] **Step 3: Create `src/lib/combine.js`**

Move the existing comments from `App.jsx`'s `combine` along with the code:

```js
// src/lib/combine.js
// Pure. The loaded files merged across both sources. Memoised in App on `state`, so a
// render that changes nothing loaded (a sync poll tick, a tab switch) hands the tabs the
// same arrays and the Graphics tab does not rebuild every card.
import { dropGalwayDuplicates } from "./dedupe.js";

export function combine(state) {
  const { snapshot, faiSnapshot } = state;
  // Every tab sees BOTH sources. The files are separate; the app is not. Labels and
  // colours come from the one shared teams.json, so a squad keeps its identity across the
  // announcement, the round-up, the chart and the table whichever system it is on.
  const galwayFixtures = snapshot.fixtures ?? [];
  const faiFixtures = faiSnapshot?.fixtures ?? [];
  const faiAwaiting = faiSnapshot?.awaiting ?? [];

  // A game both leagues list is shown once, as FAI Connect's - see dedupe.js. Matched
  // against FAI's upcoming AND awaiting games, because the two scans need not agree on
  // whether a game has left the feed yet.
  const faiGames = [...faiFixtures, ...faiAwaiting];
  const upcoming = dropGalwayDuplicates(galwayFixtures, faiGames);
  const played = dropGalwayDuplicates(snapshot.awaiting ?? [], faiGames);

  const fixtures = [...upcoming.kept, ...faiFixtures];
  // Undeduped, for the tabs that describe the feeds themselves (Squads, Changes).
  const allFixtures = [...galwayFixtures, ...faiFixtures];
  // Played games each scan is still waiting on a result for - see awaiting.js.
  const awaiting = [...played.kept, ...faiAwaiting];

  // ResultsTab and FormTab both read `results?.results ?? []` and both branch on
  // `results === null`, so this must stay the WRAPPER shape and must keep null meaning
  // "could not load" - which they render differently from "nobody played". A bare array
  // here would silently break both tabs.
  //
  // null only when BOTH failed: a club whose squads have not migrated has no
  // results-fai.json at all, and that must not blank the Results tab. The cost is that if
  // exactly one of the two fails we show a partial store without saying so - accepted,
  // because catch(() => null) cannot tell "absent" from "failed" across origins.
  //
  // Results carry no kick-off time, so they match without one.
  const faiResults = state.faiResults?.results ?? [];
  const results = state.results === null && state.faiResults === null
    ? null
    : {
      results: [
        ...dropGalwayDuplicates(state.results?.results ?? [], faiResults, { withTime: false }).kept,
        ...faiResults,
      ],
    };
  return { fixtures, allFixtures, hidden: upcoming.hidden, awaiting, results };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/combine.test.js`
Expected: PASS.

- [ ] **Step 5: Wire it into `src/App.jsx`**

1. Delete the whole local `function combine(state) { ... }` and the comment block above it (`src/App.jsx:45-69`, from `// The loaded files merged across both sources.` to the closing `}` after `return { fixtures, awaiting, results };`).
2. Add the import next to the other lib imports:
   ```js
   import { combine } from "./lib/combine.js";
   ```
3. Replace `const { fixtures, awaiting, results } = combined;` with:
   ```js
   const { fixtures, allFixtures, hidden, awaiting, results } = combined;
   ```
4. Replace the three tab lines:
   ```jsx
   {tab === "Fixtures" && <AnnouncementTab fixtures={fixtures} hidden={hidden} config={config} today={today} />}
   ```
   ```jsx
   {tab === "Changes" && <ChangesTab history={history} fixtures={allFixtures} config={config} />}
   {tab === "Squads" && <SquadsTab fixtures={allFixtures} config={config} savedConfig={savedConfig} onChange={setConfig} />}
   ```

- [ ] **Step 6: Run everything and build**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds. (`hidden` is unused by AnnouncementTab until Task 3, which React ignores.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/combine.js test/combine.test.js src/App.jsx
git commit -m "feat: show a game both leagues list once, as FAI Connect's"
```

---

### Task 3: the note on the Fixtures tab

**Files:**
- Modify: `src/components/AnnouncementTab.jsx`
- Modify: `src/styles.css` (one rule)
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `test/components.test.jsx`:

```jsx
describe("AnnouncementTab duplicate note", () => {
  const dup = {
    fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
    competition: "FAI Junior Cup", comment: "",
  };
  const cfg = { version: 1, teams: { "234323": { label: "U21 Men", color: "#e5484d" } } };

  it("says which Galway FA fixture was hidden", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-13" />,
    );
    expect(html).toContain("Hidden 1 Galway FA fixture that duplicates an FAI Connect one");
    expect(html).toContain("Sat 14 Nov 14:00  U21 Men v Mervue Utd");
  });

  it("pluralises", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup, { ...dup, fid: "2", time: "16:00" }]}
                       config={cfg} today="2026-11-13" />,
    );
    expect(html).toContain("Hidden 2 Galway FA fixtures that duplicate FAI Connect ones");
  });

  it("leaves out a hidden game that has already been played", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-15" />,
    );
    expect(html).not.toContain("Hidden");
  });

  it("renders no note when nothing was hidden", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).not.toContain("Hidden");
  });

  // The note explains the page; it is not part of what gets posted.
  it("keeps the note out of the announcement card", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-13" />,
    );
    const card = html.slice(html.indexOf('class="card announcement"'));
    expect(card).not.toContain("Hidden");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/components.test.jsx -t "duplicate note"`
Expected: FAIL on "says which" and "pluralises". The other three pass already; they are guards that must keep passing.

- [ ] **Step 3: Implement**

In `src/components/AnnouncementTab.jsx`:

Change the imports to:

```jsx
import { useState } from "react";
import { announceLines, formatFixtureLine, shortDate } from "../lib/announce.js";
import { resolveTeams } from "../lib/teams.js";
import { WINDOWS } from "../lib/window.js";
```

Change the signature to `export default function AnnouncementTab({ fixtures, hidden = [], config, today }) {` and add, after `const text = ...`:

```jsx
  // Galway FA copies of FAI Connect games, hidden by combine() - see dedupe.js. Said out
  // loud, so a wrong match can never take a real game off the announcement silently.
  // Only games still to come: a hidden game already played is no longer news. Labels
  // resolve over every fixture, hidden ones included, never a subset.
  const upcomingHidden = hidden.filter((f) => typeof f.date === "string" && f.date >= today);
  const { labels } = resolveTeams([...(fixtures ?? []), ...hidden], config);
  const n = upcomingHidden.length;
```

Render it between the window chips row and the announcement card:

```jsx
      {n > 0 && (
        <div className="dim dupnote">
          <p>
            {n === 1
              ? "Hidden 1 Galway FA fixture that duplicates an FAI Connect one:"
              : `Hidden ${n} Galway FA fixtures that duplicate FAI Connect ones:`}
          </p>
          <ul>
            {upcomingHidden.map((f) => (
              <li key={f.fid}>{`${shortDate(f.date)} ${formatFixtureLine(f, labels, config)}`}</li>
            ))}
          </ul>
        </div>
      )}
```

Add to `src/styles.css`:

```css
.dupnote p, .dupnote ul { margin: 4px 0; }
.dupnote li { white-space: pre-wrap; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/components.test.jsx`
Expected: PASS, including the existing AnnouncementTab tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/AnnouncementTab.jsx test/components.test.jsx src/styles.css
git commit -m "feat: say which Galway FA fixtures were hidden as duplicates"
```

---

### Task 4: docs and end-to-end check

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-11-13-galway-fai-duplicates-design.md`

- [ ] **Step 1: CLAUDE.md**

Under `## Architecture`, after the `opponents.js` bullet, add:

```markdown
- `dedupe.js` — a game BOTH leagues list (a migrating squad, or a cup tie Galway FA files
  under the wrong team) is shown once, as FAI Connect's. Matched on date, time, home/away
  and a normalised opponent, in `combine.js` at read time; the Fixtures tab names what it
  hid. Squads and Changes get `allFixtures`, undeduped.
```

Under `## Invariants`, add:

```markdown
- **Galway/FAI duplicates are hidden at read time, never in the scan.** It is the one
  match on date and name rather than `fid`, and it only decides what is shown. Dropping
  the row in the scan would diff it as a CANCELLED alert for a game that is still on.
  The hidden list is always shown, so a false match cannot pass silently.
```

- [ ] **Step 2: Spec**

Bring the spec in line with what was built: `dropGalwayDuplicates(galway, fai, { withTime })` takes no `config` (matching uses `cleanOpponent`, plus dropping `jun`/`junior`/`juniors`, so it does not depend on an owner's rename); `combine` lives in `src/lib/combine.js`; the note lists only hidden games dated today or later.

- [ ] **Step 3: Full suite and build**

Run: `npm test && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 4: Check against the real data**

```bash
node --input-type=module -e '
import { readFileSync } from "fs"; import { combine } from "./src/lib/combine.js";
const D = process.argv[1]; const j = (f) => JSON.parse(readFileSync(`${D}/${f}`, "utf8"));
const out = combine({ snapshot: j("latest.json"), faiSnapshot: j("latest-fai.json"),
  results: j("results.json"), faiResults: j("results-fai.json") });
console.log("hidden:", out.hidden.map((f) => `${f.fid} ${f.date} ${f.time} ${f.opponent}`));
console.log("fixtures", out.allFixtures.length, "->", out.fixtures.length);' \
  "$DATA_DIR_CLONE"
```

with `DATA_DIR_CLONE` pointing at a fresh clone of `seaninryan/fixtures-data`.
Expected: exactly one hidden entry, `7035325 2026-11-14 14:00 Mervue Utd`; the fixture count drops by one. Any other hidden entry must be checked by hand before going on.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-13-galway-fai-duplicates-design.md
git commit -m "docs: Galway/FAI duplicates are hidden at read time"
```
