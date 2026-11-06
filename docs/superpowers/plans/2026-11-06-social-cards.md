# Social Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Graphics tab that turns a window's fixtures or results into downloadable 4:5 and 4:3 PNGs over the owner's Canva backgrounds, plus a Sync-now link, played-but-unscored games that survive a sync, hand-entered results and a per-row Leave off.

**Architecture:** Pure layout in `src/lib/` (`cardRows.js` → segments, `cardLayout.js` → plain-data draw ops, `manualResults.js` → merge/expiry/conflicts, `awaiting.js` → the scan's carry-forward list). The component only executes ops on a `<canvas>` (`src/components/cardCanvas.js`). The scan change lives inside `latest.json` / `latest-fai.json` so the data repo's workflow is untouched.

**Tech Stack:** React 18, Vite 5, Vitest 2 (node env, no jsdom), Canvas 2D, Google Fonts.

**Spec:** `docs/superpowers/specs/2026-11-06-social-cards-design.md` — read it first.

**Every shell command** must be preceded by:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

System Node is v14 and silently breaks Vite and Vitest.

**Commit trailer** for every commit:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/awaiting.js` | create | Which played-but-unscored fixtures the snapshot carries forward |
| `src/lib/runCheck.js` | modify | Write `snapshot.awaiting` (Galway) |
| `src/lib/runFaiCheck.js` | modify | Write `snapshot.awaiting` (FAI) |
| `src/lib/pending.js` | modify | Read `awaiting` alongside the snapshot |
| `src/lib/dataSource.js` | modify | Pinned-commit raw URL, head-commit URL, workflow URL |
| `src/lib/announce.js` | modify | Export `venueNote` so cards and text share the rule |
| `src/lib/cardRows.js` | create | Fixture/result → `{id, date, time, chip, segments}` |
| `src/lib/manualResults.js` | create | Hand-entered results: merge, expiry, conflicts |
| `src/lib/cardLayout.js` | create | Rows → cards of draw ops; fonts, shapes, palettes, fitting |
| `src/components/cardCanvas.js` | create | Execute ops on a canvas; measure; download |
| `src/components/GraphicsTab.jsx` | create | The tab |
| `src/App.jsx` | modify | Graphics tab, Sync now, `awaiting`, pinned reload |
| `src/components/ResultsTab.jsx` | modify | Pass `awaiting` to `pendingLines` |
| `src/styles.css` | modify | Graphics tab styles |
| `index.html` | modify | Google Fonts link |
| `test/*.test.js(x)` | create/modify | One per lib module, plus SSR smoke |
| `CLAUDE.md` | modify | New modules and invariants |

---

### Task 1: `awaiting.js` — the carry-forward rule

**Files:**
- Create: `src/lib/awaiting.js`
- Test: `test/awaiting.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/awaiting.test.js
import { describe, it, expect } from "vitest";
import { nextAwaiting, AWAITING_DAYS } from "../src/lib/awaiting.js";

const fx = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Gort", venue: "Craughwell",
  competition: "GFA", comment: "", ...over,
});
const TODAY = "2026-11-02";

describe("nextAwaiting", () => {
  it("keeps a played fixture that left the feed with no result", () => {
    const previous = { fixtures: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toEqual([fx()]);
  });

  it("treats a fixture dated today that left the feed as played, as diff.js does", () => {
    const previous = { fixtures: [fx({ date: TODAY })] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toHaveLength(1);
  });

  it("never keeps a future fixture - that is a cancellation, not a played game", () => {
    const previous = { fixtures: [fx({ date: "2026-11-03" })] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY })).toEqual([]);
  });

  it("drops it once its fid has a result", () => {
    const previous = { fixtures: [], awaiting: [fx()] };
    const results = [{ fid: "1" }];
    expect(nextAwaiting({ previous, fixtures: [], results, today: TODAY })).toEqual([]);
  });

  it("drops it while it is still in the feed - pending.js already sees it there", () => {
    const previous = { fixtures: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [fx()], results: [], today: TODAY }))
      .toEqual([]);
  });

  it("carries the previous awaiting list forward", () => {
    const previous = { fixtures: [], awaiting: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toEqual([fx()]);
  });

  it(`expires an entry dated more than ${AWAITING_DAYS} days ago`, () => {
    const previous = { fixtures: [], awaiting: [fx({ date: "2026-10-18" }), fx({ fid: "2", date: "2026-10-19" })] };
    const out = nextAwaiting({ previous, fixtures: [], results: [], today: TODAY });
    expect(out.map((f) => f.fid)).toEqual(["2"]);
  });

  it("dedupes on fid when a game is in both previous lists", () => {
    const previous = { fixtures: [fx()], awaiting: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY })).toHaveLength(1);
  });

  it("is empty on a first run", () => {
    expect(nextAwaiting({ previous: null, fixtures: [], results: [], today: TODAY })).toEqual([]);
    expect(nextAwaiting({ previous: { fixtures: "nope" }, fixtures: [], results: [], today: TODAY }))
      .toEqual([]);
  });

  it("orders by date, time, fid like the snapshot", () => {
    const previous = { fixtures: [fx({ fid: "b", time: "10:00" }), fx({ fid: "a", time: "10:00" }), fx({ fid: "c", date: "2026-10-31" })] };
    const out = nextAwaiting({ previous, fixtures: [], results: [], today: TODAY });
    expect(out.map((f) => f.fid)).toEqual(["c", "a", "b"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/awaiting.test.js`
Expected: FAIL — cannot resolve `../src/lib/awaiting.js`.

- [ ] **Step 3: Implement**

```js
// src/lib/awaiting.js
// Pure. Played games that have left the league's feed with no result yet.
//
// The feed lists only UPCOMING fixtures, and diff.js deliberately ignores a past-dated
// departure (it is a played game, not a cancellation). So once a run happens after
// kick-off, a game the league has not scored yet vanished from the data entirely - the
// gap pending.js used to document. A Sunday-evening "Sync now" makes that the ordinary
// case, so the snapshot now carries such games in `awaiting` until their result lands.
//
// Kept INSIDE latest.json / latest-fai.json because the data repo's workflow `git add`s
// a fixed list of files; a new file would need an edit in the other repo.
//
// Never counted by the zero-fixtures or shrink guards and never diffed: these games have
// already left the feed, and the guards are about the feed.
import { addDays } from "./window.js";
import { sortFixtures } from "./normalize.js";

// Long enough to outlast any league's delay in publishing; short enough that a game the
// league never scores (a walkover recorded elsewhere) stops showing as pending.
export const AWAITING_DAYS = 14;

export function nextAwaiting({ previous, fixtures, results, today }) {
  // Same first-run test as runCheck: no baseline, nothing to carry.
  if (!previous || !Array.isArray(previous.fixtures)) return [];
  const inFeed = new Set((fixtures ?? []).map((f) => f.fid));
  const scored = new Set((results ?? []).map((r) => r.fid));
  const floor = addDays(today, -AWAITING_DAYS);
  const byFid = new Map();
  const carried = Array.isArray(previous.awaiting) ? previous.awaiting : [];
  for (const f of [...carried, ...previous.fixtures]) {
    // `<= today`, matching diff.js: a departure dated today is a played game.
    if (f.date > today || f.date < floor) continue;
    if (inFeed.has(f.fid) || scored.has(f.fid)) continue;
    byFid.set(f.fid, f);
  }
  return sortFixtures([...byFid.values()]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/awaiting.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/awaiting.js test/awaiting.test.js
git commit -m "feat(awaiting): carry played-but-unscored fixtures forward

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Write `awaiting` from both scans

**Files:**
- Modify: `src/lib/runCheck.js` (snapshot is built before results are merged — move the `awaiting` field to after `mergeResults`)
- Modify: `src/lib/runFaiCheck.js` (same)
- Test: `test/runCheck.test.js`, `test/runFaiCheck.test.js`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("runCheck", ...)` block of `test/runCheck.test.js`:

```js
  describe("awaiting", () => {
    // A played game the feed has dropped. Its fid is not in the capture, so it can only
    // reach `awaiting` through the previous snapshot.
    const played = () => ({ ...first.snapshot.fixtures[0], fid: "999999", date: "2026-08-24" });

    it("carries a played, unscored fixture that left the feed", () => {
      const previous = prevWith((fs) => [...fs, played()]);
      const out = runCheck({ html, previous, config: first.config, now: NOW, today: TODAY });
      expect(out.snapshot.awaiting.map((f) => f.fid)).toEqual(["999999"]);
      // Not a cancellation - diff.js still ignores a past-dated departure.
      expect(out.changes).toEqual([]);
    });

    it("drops it once the results store has it", () => {
      const previous = { ...first.snapshot, awaiting: [played()] };
      const previousResults = { version: 1, results: [{ fid: "999999", date: "2026-08-24" }] };
      const out = runCheck({ html, previous, previousResults, config: first.config, now: NOW, today: TODAY });
      expect(out.snapshot.awaiting).toEqual([]);
    });

    it("is empty on a first run", () => {
      expect(first.snapshot.awaiting).toEqual([]);
    });

    it("is not counted by the shrink guard", () => {
      const many = Array.from({ length: 500 }, (_, i) => ({ ...played(), fid: `a${i}` }));
      const previous = { ...first.snapshot, awaiting: many };
      expect(() => runCheck({ html, previous, config: first.config, now: NOW, today: TODAY }))
        .not.toThrow();
    });
  });
```

Append inside `describe("runFaiCheck", ...)` in `test/runFaiCheck.test.js`:

```js
  it("carries a played, unscored fixture that left the feed in `awaiting`", () => {
    const previous = runFaiCheck(base).snapshot;
    const played = { ...previous.fixtures[0], fid: "fai:999999", date: "2026-09-16" };
    const out = runFaiCheck({ ...base, previous: { ...previous, fixtures: [...previous.fixtures, played] } });
    expect(out.snapshot.awaiting.map((f) => f.fid)).toEqual(["fai:999999"]);
  });

  it("starts `awaiting` empty on a first run", () => {
    expect(runFaiCheck(base).snapshot.awaiting).toEqual([]);
  });
```

Before writing the FAI test, open `test/runFaiCheck.test.js` and confirm FAI fids carry the `fai:` prefix (`grep -n '"fai:' test/fixtures/*.json src/lib/faiConnect.js`). If fixture fids are bare numbers there, use a bare id the capture does not contain instead — never add or strip a prefix to make a test pass.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/runCheck.test.js test/runFaiCheck.test.js`
Expected: FAIL — `out.snapshot.awaiting` is undefined.

- [ ] **Step 3: Implement**

In `src/lib/runCheck.js`, add the import:

```js
import { nextAwaiting } from "./awaiting.js";
```

and immediately after `const results = mergeResults(previousResults, parsedResults, now);` add:

```js
  // After the guards (a bad payload writes nothing) and after the merge (a result that
  // arrived in THIS run clears its game). Keyed on fid against this source's own store.
  snapshot.awaiting = nextAwaiting({ previous, fixtures, results: results.results, today });
```

In `src/lib/runFaiCheck.js`, add the same import, and immediately after `const results = mergeResults(previousResults, rawResults, now);` add:

```js
  snapshot.awaiting = nextAwaiting({
    previous, fixtures: snapshot.fixtures, results: results.results, today,
  });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. If `test/runCheck.test.js:239` (`expect(second.snapshot).toEqual(first.snapshot)`) fails, it is because both now carry `awaiting: []` — they should still be equal; investigate rather than loosen it.

- [ ] **Step 5: Offline end-to-end check**

Run: `DATA_DIR=$(mktemp -d) FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs --dry-run`
Expected: exits 0, prints a fixture count. (`--dry-run` writes nothing.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/runCheck.js src/lib/runFaiCheck.js test/runCheck.test.js test/runFaiCheck.test.js
git commit -m "feat(scan): write awaiting into both snapshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `pending.js` reads `awaiting`

**Files:**
- Modify: `src/lib/pending.js`
- Modify: `src/components/ResultsTab.jsx`
- Test: `test/pending.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/pending.test.js`:

```js
describe("awaiting", () => {
  it("includes a game that has left the feed but is awaiting a result", () => {
    const out = pendingFixtures([], [], now, [fixture()]);
    expect(out.map((f) => f.fid)).toEqual(["1"]);
  });

  it("dedupes on fid, preferring the snapshot's copy", () => {
    const out = pendingFixtures([fixture({ opponent: "Colga" })], [], now,
      [fixture({ opponent: "Stale" })]);
    expect(out).toHaveLength(1);
    expect(out[0].opponent).toBe("Colga");
  });

  it("labels an awaiting squad that has left the fixture list from config", () => {
    const lines = pendingLines([], [], config, now, [fixture()]);
    expect(lines[0].text).toMatch(/^U14A Boys @ Colga/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/pending.test.js`
Expected: FAIL — the new cases return `[]`.

- [ ] **Step 3: Implement**

In `src/lib/pending.js`:

Replace the paragraph in the header comment that begins `What this deliberately does NOT cover:` (through `the live data has no instance of it.`) with:

```js
// Once a run happens after the game, the fixture leaves the snapshot. The scan now
// carries such games in `snapshot.awaiting` (see awaiting.js) until their result lands,
// and the caller passes that list here as `awaiting`.
```

Change the import line to:

```js
import { resolveTeams, fillLabelGaps } from "./teams.js";
```

Replace `pendingFixtures` and the first lines of `pendingLines` with:

```js
// `now` is {date, time} from clock.js - the club's local clock, not UTC.
// `awaiting` is the snapshots' carried list. The snapshot's copy of a fid wins: it is
// the league's current word on that game.
export function pendingFixtures(fixtures, results, now, awaiting = []) {
  // Identity is fid, never a name or a date: a result for another game on the same day
  // must not clear this one.
  const scored = new Set((results ?? []).map((r) => r.fid));
  const floor = resultWindowRange(PENDING_WINDOW, now.date).from;
  const byFid = new Map();
  for (const f of [...(awaiting ?? []), ...(fixtures ?? [])]) byFid.set(f.fid, f);
  return [...byFid.values()]
    .filter((f) => f.date >= floor && hasKickedOff(f, now) && !scored.has(f.fid))
    // Newest day first, then by squad so the same squad lands in the same place, then
    // fid to make the order TOTAL - the list never depends on how the caller sorted.
    // The same rule roundupLines follows.
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(a.teamId).localeCompare(String(b.teamId)) ||
      String(a.fid).localeCompare(String(b.fid)));
}

// Mirrors roundupLines' shape - {kind, text, teamId, color} - so the tab renders these
// through the same swatch markup. Every line is a `pending` line carrying a colour;
// unlike the round-up there are no day or blank lines to interleave.
export function pendingLines(fixtures, results, config, now, awaiting = []) {
  const chosen = pendingFixtures(fixtures, results, now, awaiting);
  if (chosen.length === 0) return [];
```

Keep the existing `resolveTeams(fixtures ?? [], config)` comment block exactly, and directly after `const { labels } = resolveTeams(fixtures ?? [], config);` add:

```js
  // An awaiting game's squad may have left the fixture list entirely (its last game of
  // the season). Config still names it - see fillLabelGaps. Never resolve over `chosen`.
  fillLabelGaps(labels, config, chosen.map((f) => f.teamId));
```

In `src/components/ResultsTab.jsx`, change the signature to accept `awaiting`:

```jsx
export default function ResultsTab({ results, fixtures, awaiting = [], config, today, now }) {
```

and the pending line to:

```jsx
  const pending = now ? pendingLines(fixtures, results?.results ?? [], config, now, awaiting) : [];
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pending.js src/components/ResultsTab.jsx test/pending.test.js
git commit -m "feat(pending): include games the scan is carrying as awaiting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sync now — URLs and pinned reload

**Files:**
- Modify: `src/lib/dataSource.js`
- Modify: `src/App.jsx`
- Test: `test/dataSource.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/dataSource.test.js` (add the new names to its existing import from `../src/lib/dataSource.js`):

```js
describe("sync URLs", () => {
  it("pins raw reads to a commit, which the CDN cannot serve stale", () => {
    expect(rawBaseAt("abc123"))
      .toBe("https://raw.githubusercontent.com/seaninryan/fixtures-data/abc123/");
  });

  it("reads the branch head from the API host, which sends CORS headers", () => {
    expect(HEAD_COMMIT_URL)
      .toBe("https://api.github.com/repos/seaninryan/fixtures-data/commits/main");
  });

  it("links the workflow page where Run workflow lives", () => {
    expect(WORKFLOW_URL)
      .toBe("https://github.com/seaninryan/fixtures-data/actions/workflows/daily-check.yml");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/dataSource.test.js`
Expected: FAIL — `rawBaseAt` is not exported.

- [ ] **Step 3: Implement `dataSource.js`**

Append:

```js
// "Sync now". The cron runs at 06:17 UTC, so a Sunday's results would otherwise land on
// Monday. The site cannot run the scan itself (no CORS from either league, and the FAI
// key is a secret), so it links to the workflow and the owner presses Run workflow.
export const WORKFLOW_URL =
  `https://github.com/${DATA_REPO}/actions/workflows/daily-check.yml`;

// Unauthenticated, CORS-enabled, 60 requests an hour per IP. The poll below stays far
// under that.
export const HEAD_COMMIT_URL =
  `https://api.github.com/repos/${DATA_REPO}/commits/${DATA_BRANCH}`;

// The branch URL is CDN-cached for about five minutes, so straight after a sync it can
// serve the OLD file. A commit-pinned URL is a different cache key and is never stale.
export function rawBaseAt(sha) {
  return `https://raw.githubusercontent.com/${DATA_REPO}/${sha}/`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/dataSource.test.js`
Expected: PASS.

- [ ] **Step 5: Wire App.jsx**

In `src/App.jsx`:

1. Change the import to `import { dataUrl, DEFAULT_DATA_URL, DATA_REPO, HEAD_COMMIT_URL, WORKFLOW_URL, rawBaseAt } from "./lib/dataSource.js";`

2. Change `loadJson` to take the base:

```js
async function loadJson(name, base) {
  const res = await fetch(dataUrl(name, base), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

async function headSha() {
  const res = await fetch(HEAD_COMMIT_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`head commit: HTTP ${res.status}`);
  return (await res.json()).sha;
}

const SYNC_POLL_MS = 15_000;
const SYNC_POLL_LIMIT = 40; // ten minutes
```

3. Inside `App`, add state next to the others:

```js
  // Where the JSON is read from. BASE normally; a commit-pinned base after a sync.
  const [base, setBase] = useState(BASE);
  // "idle" | "waiting" | "timeout" | "failed"
  const [sync, setSync] = useState("idle");
```

4. In the data-loading effect, pass `base` to every `loadJson(...)` call (seven calls: `loadJson("latest.json", base)` etc.) and change the dependency array from `[gate]` to `[gate, base]`.

5. Add the sync handler after `check`:

```js
  // Opens the workflow page, then watches the data repo's head. The scan always commits
  // (fetchedAt moves every run), so a new head means the run finished.
  const startSync = useCallback(async () => {
    window.open(WORKFLOW_URL, "_blank", "noopener");
    let start;
    try { start = await headSha(); } catch { return setSync("failed"); }
    setSync("waiting");
    for (let i = 0; i < SYNC_POLL_LIMIT; i += 1) {
      await new Promise((r) => setTimeout(r, SYNC_POLL_MS));
      let sha;
      try { sha = await headSha(); } catch { continue; }
      if (sha !== start) {
        setSync("idle");
        return setBase(rawBaseAt(sha));
      }
    }
    return setSync("timeout");
  }, []);
```

6. Replace the footer with:

```jsx
      <footer className="dim row">
        <span>Updated {updated?.slice(0, 10)}</span>
        <button className="chip" onClick={startSync} disabled={sync === "waiting"}>
          {sync === "waiting" ? "Waiting for the scan…" : "Sync now"}
        </button>
        {sync === "timeout" && <span>No new data yet — the run may still be going. Reload later.</span>}
        {sync === "failed" && <span>Could not reach GitHub to watch for the run.</span>}
      </footer>
```

Note: when `VITE_DATA_URL` points at a local copy, a sync will switch to the remote repo. That is acceptable for a dev-only override; do not add code for it.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dataSource.js src/App.jsx test/dataSource.test.js
git commit -m "feat(sync): Sync now links the workflow and reloads at the new commit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `cardRows.js` — rows and segments

**Files:**
- Modify: `src/lib/announce.js` (export `venueNote`)
- Create: `src/lib/cardRows.js`
- Test: `test/cardRows.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/cardRows.test.js
import { describe, it, expect } from "vitest";
import { fixtureRows, resultRows, cardLabels } from "../src/lib/cardRows.js";

const labels = { "11": "U15A Boys", "12": "U15B Boys", "20": "U15 Girls" };

const fx = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-10-31", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Knocknacarra", venue: "Craughwell",
  competition: "GFA Boys U15", comment: "", ...over,
});
const rs = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-10-31", isHome: true,
  ourTeam: "Craughwell United", opponent: "Knocknacarra", ourScore: 0, theirScore: 1,
  venue: "Craughwell", competition: "GFA Boys U15", ...over,
});

describe("fixtureRows", () => {
  it("bolds the squad and writes v for home", () => {
    expect(fixtureRows([fx()], labels)[0]).toEqual({
      id: "1", date: "2026-10-31", time: "12:00", chip: "12:00",
      segments: [{ text: "U15A Boys", bold: true }, { text: " v Knocknacarra", bold: false }],
    });
  });

  it("writes @ for away", () => {
    const row = fixtureRows([fx({ isHome: false, opponent: "Oughterard" })], labels)[0];
    expect(row.segments[1].text).toBe(" @ Oughterard");
  });

  it("names the ground when a home game is played elsewhere", () => {
    const row = fixtureRows([fx({ venue: "Athenry" })], labels)[0];
    expect(row.segments[1].text).toBe(" v Knocknacarra (at Athenry)");
  });

  it("falls back to the feed name for an unlabelled squad", () => {
    expect(fixtureRows([fx({ teamId: "99" })], labels)[0].segments[0].text)
      .toBe("Craughwell United");
  });
});

describe("resultRows", () => {
  it("home: our label and OUR score bold, home side first", () => {
    expect(resultRows([rs({ ourScore: 5, theirScore: 0, opponent: "Gort" })], labels)[0].segments)
      .toEqual([{ text: "U15A Boys 5", bold: true }, { text: "-0 Gort", bold: false }]);
  });

  it("away: opponent first, our score and label bold", () => {
    const row = resultRows([rs({ teamId: "20", isHome: false, opponent: "Gort", ourScore: 1, theirScore: 1 })], labels)[0];
    expect(row.segments).toEqual([{ text: "Gort 1-", bold: false }, { text: "1 U15 Girls", bold: true }]);
  });

  it("has no time chip", () => {
    expect(resultRows([rs()], labels)[0].chip).toBeNull();
  });
});

describe("cardLabels", () => {
  // The bug that has happened three times: labels resolved over a filtered subset drop
  // the A/B letter. cardLabels takes ALL fixtures and only ever fills gaps.
  it("keeps the A/B letter when only one of the pair is in the window", () => {
    const all = [
      fx({ fid: "1", teamId: "11", competition: "GFA Boys U15 Div 1" }),
      fx({ fid: "2", teamId: "12", competition: "GFA Boys U15 Div 2" }),
    ];
    const config = { version: 1, teams: {} };
    const l = cardLabels(all, config, ["11"]);
    expect(l["11"]).not.toBe(cardLabels([all[0]], config, ["11"])["11"]);
  });

  it("names a squad that has left the fixture list from config", () => {
    const config = { version: 1, teams: { "77": { label: "U18 Girls" } } };
    expect(cardLabels([], config, ["77"])["77"]).toBe("U18 Girls");
  });
});
```

The A/B test asserts the two resolutions differ rather than a literal: what `deriveLabels` produces from these competition names is its business. If they come out equal, the competition strings do not trigger derivation — read `deriveLabels` in `src/lib/teams.js` and use competition names it recognises (look at `test/teams.test.js` for real examples). Do not weaken the assertion.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/cardRows.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Export `venueNote` from announce.js**

In `src/lib/announce.js`, replace the body of `formatFixtureLine` so the rule lives once:

```js
// v / @ already tells you whose ground it is. The ground is only worth naming when a
// HOME game is somewhere other than home - the case that actually strands people.
// Exported so the social cards apply the identical rule.
export function venueNote(fixture) {
  return fixture.isHome && fixture.venue && fixture.venue !== HOME_VENUE
    ? ` (at ${fixture.venue})`
    : "";
}

export function formatFixtureLine(fixture, labels) {
  const label = labels[fixture.teamId] ?? fixture.ourTeam;
  const versus = fixture.isHome ? "v" : "@";
  // No leading whitespace. This text gets pasted into WhatsApp and Facebook, where an
  // indented line can be treated as preformatted and is a nuisance to strip on a phone.
  // The site indents fixture lines in CSS instead, so the look survives and the copy is
  // clean. The gap between the time and the squad is alignment, not indentation.
  return `${fixture.time}  ${label} ${versus} ${fixture.opponent}${venueNote(fixture)}`;
}
```

- [ ] **Step 4: Implement `cardRows.js`**

```js
// src/lib/cardRows.js
// Pure. One fixture or result -> one card row: what to write, and which parts are bold.
//
// The rule for bold is the owner's: OUR squad and OUR score, never the opponent's. The
// side a score sits on comes from isHome (home team first, the football convention),
// never from a team letter - a wrong letter publishes every score backwards.
import { resolveTeams, fillLabelGaps } from "./teams.js";
import { venueNote } from "./announce.js";

// Labels for a card. `fixtures` must be the FULL list (both sources), never the window:
// deriveLabels shows the A/B letter only when the club runs more than one side at that
// age and gender, so resolving over a filtered subset silently renames squads. This bug
// has appeared three times. `teamIds` only fills GAPS - squads that have left the list.
export function cardLabels(fixtures, config, teamIds) {
  const { labels } = resolveTeams(fixtures ?? [], config);
  return fillLabelGaps(labels, config, teamIds);
}

const labelOf = (item, labels) => labels[item.teamId] ?? item.ourTeam;

export function fixtureRows(fixtures, labels) {
  return (fixtures ?? []).map((f) => ({
    id: String(f.fid),
    date: f.date,
    time: f.time,
    chip: f.time,
    segments: [
      { text: labelOf(f, labels), bold: true },
      { text: ` ${f.isHome ? "v" : "@"} ${f.opponent}${venueNote(f)}`, bold: false },
    ],
  }));
}

export function resultRows(results, labels) {
  return (results ?? []).map((r) => {
    const label = labelOf(r, labels);
    const segments = r.isHome
      ? [{ text: `${label} ${r.ourScore}`, bold: true },
         { text: `-${r.theirScore} ${r.opponent}`, bold: false }]
      : [{ text: `${r.opponent} ${r.theirScore}-`, bold: false },
         { text: `${r.ourScore} ${label}`, bold: true }];
    // Results carry no kick-off time; "" sorts them by fid within a day. Hand-entered
    // ones may carry the fixture's time, which then orders them correctly.
    return { id: String(r.fid), date: r.date, time: r.time ?? "", chip: null, segments };
  });
}
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS (announce tests still pass — the output is byte-identical).

- [ ] **Step 6: Commit**

```bash
git add src/lib/announce.js src/lib/cardRows.js test/cardRows.test.js
git commit -m "feat(cards): rows with bold segments for fixtures and results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `manualResults.js` — hand-entered results and Leave off

**Files:**
- Create: `src/lib/manualResults.js`
- Test: `test/manualResults.test.js`

Entry shape (what the tab stores): `{id, fid, teamId, date, time, isHome, opponent, ourScore, theirScore}`. `fid` is the league fid for a pre-filled pending game, or `null` for a free-form one; `id` is `fid` when present, else `"manual:" + <random>`.

- [ ] **Step 1: Write the failing test**

```js
// test/manualResults.test.js
import { describe, it, expect } from "vitest";
import { mergeManual, manualEntry, applyLeaveOff, MANUAL_DAYS } from "../src/lib/manualResults.js";

const TODAY = "2026-11-01";
const official = (over = {}) => ({
  fid: "500", teamId: "11", date: "2026-11-01", isHome: true, ourTeam: "Craughwell United",
  opponent: "Gort", ourScore: 2, theirScore: 1, venue: "", competition: "", ...over,
});
const entry = (over = {}) => ({
  id: "500", fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true,
  opponent: "Gort", ourScore: 2, theirScore: 1, ...over,
});

describe("mergeManual", () => {
  it("adds a hand-entered result the league has not published", () => {
    const { results, conflicts } = mergeManual([], [entry()], TODAY);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ fid: "500", ourScore: 2, theirScore: 1, time: "14:00", manual: true });
    expect(conflicts).toEqual([]);
  });

  it("official wins when the fid arrives, silently if the scores agree", () => {
    const { results, conflicts } = mergeManual([official()], [entry()], TODAY);
    expect(results).toEqual([official()]);
    expect(conflicts).toEqual([]);
  });

  it("flags a disagreement so a wrong posted card is visible", () => {
    const { results, conflicts } = mergeManual([official({ ourScore: 3 })], [entry()], TODAY);
    expect(results).toEqual([official({ ourScore: 3 })]);
    expect(conflicts).toEqual([{ entry: entry(), official: official({ ourScore: 3 }) }]);
  });

  it("matches a free-form entry on squad and date", () => {
    const free = entry({ id: "manual:x", fid: null, opponent: "Gort FC" });
    const { results } = mergeManual([official()], [free], TODAY);
    expect(results).toEqual([official()]);
  });

  it("does not match a free-form entry to another squad's result that day", () => {
    const free = entry({ id: "manual:x", fid: null, teamId: "12" });
    expect(mergeManual([official()], [free], TODAY).results).toHaveLength(2);
  });

  it(`drops entries dated more than ${MANUAL_DAYS} days ago`, () => {
    const old = entry({ id: "manual:o", fid: null, date: "2026-10-17" });
    expect(mergeManual([], [old], TODAY).results).toEqual([]);
  });

  it("tolerates a corrupted store", () => {
    expect(mergeManual([], "nope", TODAY).results).toEqual([]);
    expect(mergeManual([], [null, { id: 1 }], TODAY).results).toEqual([]);
  });
});

describe("manualEntry", () => {
  it("keys a pre-filled entry on the league fid", () => {
    const fixture = { fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true, opponent: "Gort" };
    expect(manualEntry({ fixture, ourScore: "2", theirScore: "1" }))
      .toEqual(entry());
  });

  it("rejects a blank or non-numeric score rather than inventing 0", () => {
    const fixture = { fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true, opponent: "Gort" };
    expect(manualEntry({ fixture, ourScore: "", theirScore: "1" })).toBeNull();
    expect(manualEntry({ fixture, ourScore: "x", theirScore: "1" })).toBeNull();
  });

  it("gives a free-form entry a manual id", () => {
    const fixture = { fid: null, teamId: "11", date: "2026-11-01", time: "", isHome: false, opponent: "Gort" };
    const e = manualEntry({ fixture, ourScore: "0", theirScore: "0", newId: () => "abc" });
    expect(e.id).toBe("manual:abc");
    expect(e.fid).toBeNull();
  });
});

describe("applyLeaveOff", () => {
  it("removes rows whose id is left off", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    expect(applyLeaveOff(rows, ["2"])).toEqual([{ id: "1" }]);
  });

  it("treats a corrupted list as nothing left off", () => {
    expect(applyLeaveOff([{ id: "1" }], "nope")).toEqual([{ id: "1" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/manualResults.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/lib/manualResults.js
// Pure. Results the owner was told before the league published them, and rows the owner
// has chosen to leave off a card.
//
// Both live in the browser only and reach the GRAPHICS only. Never results.json, never
// the Form tab, never the email: a typo here must not touch the season record, and a
// forfeit 3-0 left off a card still counts in the league table.
import { addDays } from "./window.js";
import { parseScore } from "./normalize.js";

// Long enough to cover a slow league; short enough that a stale entry stops appearing.
export const MANUAL_DAYS = 14;

const usable = (e) =>
  e && typeof e === "object" && typeof e.id === "string" && typeof e.teamId === "string"
  && typeof e.date === "string" && Number.isInteger(e.ourScore) && Number.isInteger(e.theirScore);

// -> {results, conflicts}. `results` is the official list plus every live entry the
// league has not overtaken; `conflicts` names each entry the league scored differently.
export function mergeManual(official, entries, today) {
  const list = Array.isArray(official) ? official : [];
  const byFid = new Map(list.map((r) => [r.fid, r]));
  const floor = addDays(today, -MANUAL_DAYS);
  const results = [...list];
  const conflicts = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!usable(e) || e.date < floor) continue;
    // fid when the entry came from a pending game; squad and date for a free-form one.
    const match = e.fid
      ? byFid.get(e.fid)
      : list.find((r) => r.teamId === e.teamId && r.date === e.date);
    if (match) {
      if (match.ourScore !== e.ourScore || match.theirScore !== e.theirScore) {
        conflicts.push({ entry: e, official: match });
      }
      continue;
    }
    results.push({
      fid: e.id, teamId: e.teamId, date: e.date, time: e.time ?? "", isHome: e.isHome,
      ourTeam: "", opponent: e.opponent, ourScore: e.ourScore, theirScore: e.theirScore,
      venue: "", competition: "", manual: true,
    });
  }
  return { results, conflicts };
}

// From the form. `fixture` is a pending fixture (pre-filled) or a free-form
// {fid: null, teamId, date, time, isHome, opponent}. Scores arrive as input strings.
// parseScore, so a blank never becomes nil-all.
export function manualEntry({ fixture, ourScore, theirScore, newId = randomId }) {
  const ours = parseScore(ourScore);
  const theirs = parseScore(theirScore);
  if (ours === null || theirs === null) return null;
  const fid = fixture.fid ? String(fixture.fid) : null;
  return {
    id: fid ?? `manual:${newId()}`,
    fid,
    teamId: String(fixture.teamId),
    date: fixture.date,
    time: fixture.time ?? "",
    isHome: Boolean(fixture.isHome),
    opponent: fixture.opponent,
    ourScore: ours,
    theirScore: theirs,
  };
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function applyLeaveOff(rows, leaveOff) {
  const off = new Set(Array.isArray(leaveOff) ? leaveOff : []);
  return rows.filter((r) => !off.has(r.id));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/manualResults.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/manualResults.js test/manualResults.test.js
git commit -m "feat(cards): hand-entered results, official-wins merge, leave off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `cardLayout.js` — rows to draw ops

**Files:**
- Create: `src/lib/cardLayout.js`
- Test: `test/cardLayout.test.js`

Ops are plain data:

- `{op: "image"}` — the background, drawn at 0,0 at natural size
- `{op: "text", x, y, text, family, size, weight, color, align}` — baseline is always middle
- `{op: "rule", x1, x2, y, color, width}`
- `{op: "box", x, y, w, h, r, fill, stroke}` — `stroke` may be null

`measure(text, {family, size, weight}) → width`. Tests use the exported `approxMeasure`.

- [ ] **Step 1: Write the failing test**

```js
// test/cardLayout.test.js
import { describe, it, expect } from "vitest";
import {
  layoutCards, approxMeasure, SHAPES, FLOOR, rangeHeading, fileName,
} from "../src/lib/cardLayout.js";

const row = (i, date = "2026-11-01", over = {}) => ({
  id: String(i), date, time: `1${i % 10}:00`, chip: `1${i % 10}:00`,
  segments: [{ text: `U1${i % 10} Boys`, bold: true }, { text: " v Knocknacarra", bold: false }],
  ...over,
});
const rows = (n, date) => Array.from({ length: n }, (_, i) => row(i, date));
const lay = (over) => layoutCards({ kind: "fixtures", rows: rows(2, "2026-10-31"), mode: "auto",
  shape: "4x5", measure: approxMeasure, ...over });
const texts = (card) => card.ops.filter((o) => o.op === "text").map((o) => o.text);

// The bounds a text op occupies, by its alignment.
function span(o) {
  const w = approxMeasure(o.text, o);
  return o.align === "center" ? [o.x - w / 2, o.x + w / 2] : [o.x, o.x + w];
}

describe("headings", () => {
  it("a single day reads FIXTURES / SATURDAY / 31 OCTOBER", () => {
    const [card] = lay();
    expect(texts(card).slice(0, 3)).toEqual(["FIXTURES", "SATURDAY", "31 OCTOBER"]);
  });

  it("results say RESULTS", () => {
    expect(texts(lay({ kind: "results" })[0])[0]).toBe("RESULTS");
  });

  it("same-month range", () => {
    expect(rangeHeading("2026-08-29", "2026-08-30")).toBe("29–30 AUGUST");
  });

  it("cross-month range", () => {
    expect(rangeHeading("2026-08-30", "2026-09-03")).toBe("30 AUG – 3 SEP");
  });

  it("several days get the range and a sub-heading per day", () => {
    const [card] = lay({ rows: [row(1, "2026-08-29"), row(2, "2026-08-30")] });
    const t = texts(card);
    expect(t.slice(0, 2)).toEqual(["FIXTURES", "29–30 AUGUST"]);
    expect(t).toContain("SATURDAY");
    expect(t).toContain("SUNDAY");
  });
});

describe("grouping", () => {
  const twoDays = [...rows(2, "2026-10-31"), ...rows(2, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];

  it("auto: one card when everything fits at full size", () => {
    expect(lay({ rows: twoDays })).toHaveLength(1);
  });

  it("auto: a card per day when one card would have to shrink", () => {
    const busy = [...rows(6, "2026-10-31"), ...rows(6, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];
    expect(lay({ rows: busy })).toHaveLength(2);
  });

  it("perDay forces a card per day", () => {
    expect(lay({ rows: twoDays, mode: "perDay" })).toHaveLength(2);
  });

  it("single forces one card", () => {
    // 3+3 would shrink, so auto would split it; single must not.
    const busy = [...rows(3, "2026-10-31"), ...rows(3, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];
    expect(lay({ rows: busy })).toHaveLength(2);
    expect(lay({ rows: busy, mode: "single" })).toHaveLength(1);
  });

  it("no rows, no cards", () => {
    expect(lay({ rows: [] })).toEqual([]);
  });

  it("orders rows by date, time, id whatever order they arrive in", () => {
    const [card] = lay({ rows: [row(2, "2026-10-31"), row(1, "2026-10-31")] });
    const chips = texts(card).filter((t) => /^\d\d:\d\d$/.test(t));
    expect(chips).toEqual(["11:00", "12:00"]);
  });
});

describe("fitting", () => {
  it("full size when it fits", () => {
    expect(lay()[0].scale).toBe(1);
  });

  it("shrinks a busy day instead of splitting it", () => {
    const [card, ...rest] = lay({ rows: rows(8, "2026-11-01") });
    expect(rest).toEqual([]);
    expect(card.scale).toBeLessThan(1);
    expect(card.scale).toBeGreaterThanOrEqual(FLOOR);
  });

  it("splits a day that cannot fit at the floor, numbering the parts", () => {
    const cards = lay({ rows: rows(30, "2026-11-01") });
    expect(cards.length).toBeGreaterThan(1);
    expect(texts(cards[0])[0]).toBe(`FIXTURES (1/${cards.length})`);
    const total = cards.reduce((n, c) => n + texts(c).filter((t) => /^\d\d:\d\d$/.test(t)).length, 0);
    expect(total).toBe(30);
  });

  it("shrinks one long row without shrinking its neighbours", () => {
    const long = row(1, "2026-11-01", {
      segments: [{ text: "Junior Men's Reserves", bold: true }, { text: " @ Salthill Devon Athletic Football Club Reserves", bold: false }],
    });
    const [card] = lay({ rows: [long, row(2, "2026-11-01")] });
    const sizes = card.ops.filter((o) => o.op === "text" && o.weight === 700 && /Boys|Reserves/.test(o.text)).map((o) => o.size);
    expect(sizes[0]).toBeLessThan(sizes[1]);
  });

  for (const shape of Object.keys(SHAPES)) {
    for (const n of [1, 6, 12, 30]) {
      it(`${shape}, ${n} rows: every op inside the canvas, every row inside the text region`, () => {
        const { w, h, region } = SHAPES[shape];
        for (const card of lay({ shape, rows: rows(n, "2026-11-01") })) {
          for (const o of card.ops) {
            if (o.op === "box") {
              expect(o.x).toBeGreaterThanOrEqual(region.x);
              expect(o.x + o.w).toBeLessThanOrEqual(region.x + region.w + 0.001);
              expect(o.y + o.h).toBeLessThanOrEqual(region.y + region.h + 0.001);
            }
            if (o.op === "text") {
              const [a, b] = span(o);
              expect(a).toBeGreaterThanOrEqual(region.x - 0.001);
              expect(b).toBeLessThanOrEqual(region.x + region.w + 0.001);
              expect(o.y).toBeLessThanOrEqual(h);
            }
          }
          expect(card.width).toBe(w);
          expect(card.height).toBe(h);
        }
      });
    }
  }
});

describe("file names", () => {
  it("single day", () => {
    expect(fileName("fixtures", "2026-10-31", "2026-10-31", "4x5", null))
      .toBe("fixtures-2026-10-31-4x5.png");
  });

  it("same-month range", () => {
    expect(fileName("results", "2026-08-29", "2026-08-30", "4x3", null))
      .toBe("results-2026-08-29_30-4x3.png");
  });

  it("cross-month range", () => {
    expect(fileName("fixtures", "2026-08-30", "2026-09-03", "4x5", null))
      .toBe("fixtures-2026-08-30_09-03-4x5.png");
  });

  it("split part", () => {
    expect(fileName("fixtures", "2026-11-01", "2026-11-01", "4x5", [1, 2]))
      .toBe("fixtures-2026-11-01-1of2-4x5.png");
  });

  it("every card carries its file name", () => {
    expect(lay()[0].fileName).toBe("fixtures-2026-10-31-4x5.png");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/cardLayout.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/lib/cardLayout.js
// Pure. Rows -> cards of draw operations for the social graphics.
//
// Every layout decision lives here, so the canvas component only executes plain data and
// all of it is testable without a DOM. Text width comes from an injected `measure`: the
// browser passes the canvas's measureText, tests pass approxMeasure.
//
// Dates are formatted from ISO date strings in UTC, never from a kick-off - a UTC
// round-trip of a time moves it by an hour for half the year.

// League Spartan matches the owner's Canva cards exactly. Canva Sans cannot be embedded
// outside Canva, so BODY_FONT is a free stand-in the owner chose by eye.
export const DISPLAY_FONT = "League Spartan";
export const BODY_FONT = "Mulish";

// Canvas = the background's own pixel size. `region` is where text may go, clear of the
// crest (portrait: top-centre; landscape: top-left corner) and inside the results card's
// football border. Moving the crest in Canva means editing these numbers.
export const SHAPES = {
  "4x5": { w: 1080, h: 1350, region: { x: 80, y: 370, w: 920, h: 950 } },
  "4x3": { w: 1448, h: 1086, region: { x: 400, y: 60, w: 920, h: 890 } },
};

const PALETTES = {
  fixtures: {
    heading: "#FFD21F", text: "#FFD21F", rule: "#FFD21F",
    box: "rgba(16, 36, 74, 0.78)", boxStroke: "rgba(255, 210, 31, 0.55)",
    chip: "#FFD21F", chipText: "#10244A",
  },
  results: {
    heading: "#0B4F8C", text: "#0B4F8C", rule: "#0B4F8C",
    box: "rgba(255, 255, 255, 0.88)", boxStroke: "rgba(11, 79, 140, 0.35)",
  },
};

// Full-size metrics, read off the owner's 1080-wide cards.
const M = {
  kind: 52, day: 72, date: 130, range: 110, lineGap: 1.12,
  ruleGap: 18, ruleWidth: 3, ruleLength: 680, afterHeader: 28,
  rowH: 90, rowGap: 30, rowText: 44, subdayH: 84, subday: 56,
  chipW: 130, chipH: 64, pad: 20, radius: 12,
};

// The smallest a card may scale before it splits: rows of ~26px text, still legible on a
// phone at Instagram's 1080 width.
export const FLOOR = 0.6;

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const dayName = (iso) => DAYS[asDate(iso).getUTCDay()];
const dayMonth = (iso) => `${asDate(iso).getUTCDate()} ${MONTHS[asDate(iso).getUTCMonth()]}`;

// "29–30 AUGUST" within a month; "30 AUG – 3 SEP" across one.
export function rangeHeading(from, to) {
  const a = asDate(from);
  const b = asDate(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  }
  const short = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
  return `${short(a)} – ${short(b)}`;
}

export function fileName(kind, from, to, shape, part) {
  let span = from;
  if (to !== from) span += from.slice(0, 7) === to.slice(0, 7) ? `_${to.slice(8)}` : `_${to.slice(5)}`;
  const p = part ? `-${part[0]}of${part[1]}` : "";
  return `${kind}-${span}${p}-${shape}.png`;
}

// CSS font shorthand. Shared with the canvas so measuring and drawing cannot disagree.
export function fontString({ family, size, weight }) {
  return `${weight} ${size}px "${family}"`;
}

// Deterministic stand-in for measureText, for tests and for SSR.
export function approxMeasure(text, { size, weight }) {
  return String(text).length * size * (weight >= 700 ? 0.58 : 0.52);
}

const byOrder = (a, b) =>
  a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))
  || String(a.id).localeCompare(String(b.id));

function groupByDate(rows) {
  const groups = [];
  for (const r of [...rows].sort(byOrder)) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  }
  return groups;
}

// A text line no wider than `max`, shrinking from `size` if it must.
function fitSize(text, font, max, measure) {
  const w = measure(text, font);
  return w <= max ? font.size : font.size * (max / w);
}

function header(kind, groups, shape, part, measure, pal) {
  const { region } = shape;
  const cx = region.x + region.w / 2;
  const first = groups[0].date;
  const last = groups[groups.length - 1].date;
  const label = `${kind.toUpperCase()}${part ? ` (${part[0]}/${part[1]})` : ""}`;
  const lines = first === last
    ? [{ text: label, family: BODY_FONT, size: M.kind, weight: 400 },
       { text: dayName(first), family: BODY_FONT, size: M.day, weight: 400 },
       { text: dayMonth(first), family: DISPLAY_FONT, size: M.date, weight: 700 }]
    : [{ text: label, family: BODY_FONT, size: M.kind, weight: 400 },
       { text: rangeHeading(first, last), family: DISPLAY_FONT, size: M.range, weight: 700 }];
  const ops = [];
  let y = region.y;
  for (const line of lines) {
    const size = fitSize(line.text, line, region.w, measure);
    const h = size * M.lineGap;
    ops.push({ op: "text", x: cx, y: y + h / 2, text: line.text, family: line.family,
      size, weight: line.weight, color: pal.heading, align: "center" });
    y += h;
  }
  y += M.ruleGap;
  const half = Math.min(M.ruleLength, region.w) / 2;
  ops.push({ op: "rule", x1: cx - half, x2: cx + half, y, color: pal.rule, width: M.ruleWidth });
  return { ops, bottom: y + M.afterHeader };
}

function bodyHeight(groups, s, showDays) {
  const n = groups.reduce((k, g) => k + g.rows.length, 0);
  return s * ((showDays ? groups.length * M.subdayH : 0) + n * M.rowH + Math.max(0, n - 1) * M.rowGap);
}

function rowOps(kind, r, y, s, region, measure, pal) {
  const ops = [];
  const h = M.rowH * s;
  const mid = y + h / 2;
  ops.push({ op: "box", x: region.x, y, w: region.w, h, r: M.radius * s,
    fill: pal.box, stroke: pal.boxStroke });
  let left = region.x + M.pad * s;
  let avail = region.w - 2 * M.pad * s;
  if (r.chip) {
    const cw = M.chipW * s;
    const ch = M.chipH * s;
    ops.push({ op: "box", x: left, y: mid - ch / 2, w: cw, h: ch, r: 8 * s, fill: pal.chip, stroke: null });
    const chipFont = { family: BODY_FONT, size: M.rowText * s, weight: 400 };
    const chipSize = fitSize(r.chip, chipFont, cw - 8 * s, measure);
    ops.push({ op: "text", x: left + cw / 2, y: mid, text: r.chip, family: BODY_FONT,
      size: chipSize, weight: 400, color: pal.chipText, align: "center" });
    left += cw + M.pad * s;
    avail -= cw + M.pad * s;
  }
  // One size for the whole row, shrunk only if THIS row is too long.
  const font = (seg, size) => ({ family: BODY_FONT, size, weight: seg.bold ? 700 : 400 });
  const widthAt = (size) => r.segments.reduce((w, seg) => w + measure(seg.text, font(seg, size)), 0);
  let size = M.rowText * s;
  const total = widthAt(size);
  if (total > avail) size *= avail / total;
  const width = widthAt(size);
  // Fixtures read left-aligned after the chip; results are centred, as on the owner's cards.
  let x = r.chip ? left : left + (avail - width) / 2;
  for (const seg of r.segments) {
    const f = font(seg, size);
    ops.push({ op: "text", x, y: mid, text: seg.text, ...f, color: pal.text, align: "left" });
    x += measure(seg.text, f);
  }
  return ops;
}

// One card for these groups, or null if it cannot fit at FLOOR.
function buildCard(kind, groups, shapeName, measure, part) {
  const shape = SHAPES[shapeName];
  const pal = PALETTES[kind];
  const { region } = shape;
  const showDays = groups.length > 1;
  const head = header(kind, groups, shape, part, measure, pal);
  const avail = region.y + region.h - head.bottom;
  const s = Math.min(1, avail / bodyHeight(groups, 1, showDays));
  if (s < FLOOR) return null;
  const ops = [{ op: "image" }, ...head.ops];
  let y = head.bottom;
  for (const g of groups) {
    if (showDays) {
      ops.push({ op: "text", x: region.x + region.w / 2, y: y + (M.subdayH * s) / 2,
        text: dayName(g.date), family: BODY_FONT, size: M.subday * s, weight: 400,
        color: pal.heading, align: "center" });
      y += M.subdayH * s;
    }
    for (const r of g.rows) {
      ops.push(...rowOps(kind, r, y, s, region, measure, pal));
      y += (M.rowH + M.rowGap) * s;
    }
  }
  const from = groups[0].date;
  const to = groups[groups.length - 1].date;
  return { ops, scale: s, width: shape.w, height: shape.h,
    fileName: fileName(kind, from, to, shapeName, part) };
}

// Greedy pages that each fit at FLOOR. The header is sized for a part label throughout,
// so a page that fit while measuring still fits once numbered.
function paginate(kind, groups, shapeName, measure) {
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r })));
  const pages = [];
  let current = [];
  for (const r of flat) {
    const trial = [...current, r];
    if (current.length && !buildCard(kind, groupByDate(trial), shapeName, measure, [99, 99])) {
      pages.push(current);
      current = [r];
    } else {
      current = trial;
    }
  }
  if (current.length) pages.push(current);
  return pages.map((p) => groupByDate(p));
}

function cardsFor(kind, groups, shapeName, measure) {
  const whole = buildCard(kind, groups, shapeName, measure, null);
  if (whole) return [whole];
  const pages = paginate(kind, groups, shapeName, measure);
  return pages.map((p, i) => {
    const card = buildCard(kind, p, shapeName, measure, [i + 1, pages.length]);
    if (!card) throw new Error("cardLayout: a single row does not fit at the floor scale");
    return card;
  });
}

// -> [{ops, scale, width, height, fileName}]
export function layoutCards({ kind, rows, mode = "auto", shape, measure }) {
  if (!rows?.length) return [];
  const groups = groupByDate(rows);
  if (mode === "perDay") return groups.flatMap((g) => cardsFor(kind, [g], shape, measure));
  if (mode === "single") return cardsFor(kind, groups, shape, measure);
  // auto: one card if everything fits WITHOUT shrinking; otherwise a card per day.
  const whole = buildCard(kind, groups, shape, measure, null);
  if (whole && whole.scale === 1) return [whole];
  if (groups.length === 1) return cardsFor(kind, groups, shape, measure);
  return groups.flatMap((g) => cardsFor(kind, [g], shape, measure));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/cardLayout.test.js`
Expected: PASS. If a bounds test fails, fix the layout (smaller metrics, tighter fitting) — never widen the assertion. The row counts in these tests were checked by hand against `M` (portrait: 2+2 rows fit two days at full size; 8 rows on one day scale to ~0.67; 30 rows split into 4). If Task 10 changes `M`, re-check them and adjust COUNTS, never the assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cardLayout.js test/cardLayout.test.js
git commit -m "feat(cards): layout rows into draw ops with fit, split and file names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Fonts — choose the Canva Sans stand-in with the owner

**Files:**
- Modify: `index.html`
- Possibly modify: `src/lib/cardLayout.js` (`BODY_FONT`)

- [ ] **Step 1: Render a comparison**

Write a scratch HTML page (in the session scratchpad, NOT the repo) that loads League Spartan 700 plus Open Sans, Noto Sans and Mulish (400 and 700) from Google Fonts, and renders "12:00 **U15A Boys** v Knocknacarra" and "Gort 1-**1 U15 Girls**" in each body font at 48px, yellow on `#10244A`. Screenshot it if a headless browser is available (`which chromium chromium-browser google-chrome`), otherwise give the owner the file path to open.

- [ ] **Step 2: Ask the owner which is closest to Canva Sans**

This is a checkpoint for the controller — the owner picks. Their sample cards are in the conversation for reference.

- [ ] **Step 3: Load the fonts**

In `index.html`, inside `<head>` after the theme-color meta, add (the owner chose Mulish on 2026-11-06 from the comparison):

```html
    <!-- Fonts for the social cards (src/lib/cardLayout.js). The canvas draws with them,
         so the tab waits on document.fonts before drawing. -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@700&family=Mulish:wght@400;700&display=swap" />
```

If the owner chose a different family, set `BODY_FONT` in `src/lib/cardLayout.js` to it.

- [ ] **Step 4: Build and test**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add index.html src/lib/cardLayout.js
git commit -m "feat(cards): load League Spartan and the chosen body font

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Canvas executor and the Graphics tab

**Files:**
- Create: `src/components/cardCanvas.js`
- Create: `src/components/GraphicsTab.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing SSR smoke tests**

Append to `test/components.test.jsx` (add `import GraphicsTab from "../src/components/GraphicsTab.jsx";` at the top):

```jsx
describe("GraphicsTab", () => {
  const now = { date: "2026-08-25", time: "10:00" };

  it("renders a preview for fixtures in the window", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-25" now={now} />,
    );
    expect(html).toContain("<canvas");
    expect(html).toContain("fixtures-2026-08-29-4x5.png");
  });

  it("lists rows with a Leave off control", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-25" now={now} />,
    );
    expect(html).toContain("U14A Boys");
    expect(html).toContain("Leave off");
  });

  it("says so when the results could not be loaded", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={null}
                   config={config} today="2026-08-25" now={now} initialKind="Results" />,
    );
    expect(html).toContain("Could not load the results");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/components.test.jsx`
Expected: FAIL — cannot resolve `GraphicsTab.jsx`.

- [ ] **Step 3: Implement `cardCanvas.js`**

```js
// src/components/cardCanvas.js
// The ONLY code that touches a canvas. It executes cardLayout's ops and decides nothing.
import { fontString, SHAPES } from "../lib/cardLayout.js";

export function canvasMeasure() {
  const ctx = document.createElement("canvas").getContext("2d");
  return (text, font) => {
    ctx.font = fontString(font);
    return ctx.measureText(text).width;
  };
}

export function backgroundUrl(kind, shape) {
  return `${import.meta.env.BASE_URL}cards/${kind}-${shape}.png`;
}

// Resolves to the image, or rejects with a message the tab shows on the card. A
// background exported at the wrong size is refused, not stretched.
export function loadBackground(kind, shape) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = SHAPES[shape];
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        reject(new Error(`${kind}-${shape}.png is ${img.naturalWidth}×${img.naturalHeight}, expected ${w}×${h}`));
      } else resolve(img);
    };
    img.onerror = () => reject(new Error(`Could not load ${backgroundUrl(kind, shape)}`));
    img.src = backgroundUrl(kind, shape);
  });
}

export function drawCard(canvas, card, background) {
  canvas.width = card.width;
  canvas.height = card.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, card.width, card.height);
  for (const o of card.ops) {
    if (o.op === "image") {
      ctx.drawImage(background, 0, 0);
    } else if (o.op === "rule") {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y);
      ctx.lineTo(o.x2, o.y);
      ctx.stroke();
    } else if (o.op === "box") {
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 2; ctx.stroke(); }
    } else if (o.op === "text") {
      ctx.font = fontString(o);
      ctx.fillStyle = o.color;
      ctx.textAlign = o.align;
      ctx.textBaseline = "middle";
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}

export function downloadCanvas(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}
```

- [ ] **Step 4: Implement `GraphicsTab.jsx`**

```jsx
// src/components/GraphicsTab.jsx
// Thin. Every decision is in lib: cardRows (what each row says), manualResults (what is
// hand-entered or left off), cardLayout (where it all goes). This file wires state and
// runs the ops on canvases.
import { useEffect, useMemo, useRef, useState } from "react";
import { WINDOWS, RESULT_WINDOWS, windowPredicate, resultWindowPredicate } from "../lib/window.js";
import { fixtureRows, resultRows, cardLabels } from "../lib/cardRows.js";
import { mergeManual, manualEntry, applyLeaveOff } from "../lib/manualResults.js";
import { pendingFixtures } from "../lib/pending.js";
import { layoutCards, approxMeasure, DISPLAY_FONT, BODY_FONT, SHAPES } from "../lib/cardLayout.js";
import { canvasMeasure, loadBackground, drawCard, downloadCanvas } from "./cardCanvas.js";

const MODES = [["auto", "Auto"], ["single", "One card"], ["perDay", "Card per day"]];
const SHAPE_NAMES = Object.keys(SHAPES);
const LS_LEAVE_OFF = "cards.leaveOff";
const LS_MANUAL = "cards.manual";

// Browser storage is a convenience: it can throw (private mode, blocked site data) or
// come back empty, and the tab must work either way.
function readLs(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function writeLs(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const faces = [`700 40px "${DISPLAY_FONT}"`, `400 40px "${BODY_FONT}"`, `700 40px "${BODY_FONT}"`];
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready;
}

function CardPreview({ kind, shape, card }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    loadBackground(kind, shape)
      .then((bg) => { if (live && ref.current) { drawCard(ref.current, card, bg); setError(null); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [kind, shape, card]);
  return (
    <figure className="cardprev">
      <canvas ref={ref} width={card.width} height={card.height} />
      <figcaption className="dim">{error ?? card.fileName}</figcaption>
      <button className="chip" disabled={Boolean(error)}
              onClick={() => downloadCanvas(ref.current, card.fileName)}>Download</button>
    </figure>
  );
}

async function downloadAll(kind, shapes, cardsByShape) {
  for (const shape of shapes) {
    const bg = await loadBackground(kind, shape);
    for (const card of cardsByShape[shape]) {
      const canvas = document.createElement("canvas");
      drawCard(canvas, card, bg);
      await downloadCanvas(canvas, card.fileName);
    }
  }
}

export default function GraphicsTab({ fixtures, awaiting = [], results, config, today, now, initialKind = "Fixtures" }) {
  const [kind, setKind] = useState(initialKind);
  const [fxWindow, setFxWindow] = useState("This weekend");
  const [rsWindow, setRsWindow] = useState("Last 7 days");
  const [mode, setMode] = useState("auto");
  const [shape, setShape] = useState("4x5");
  const [leaveOff, setLeaveOff] = useState([]);
  const [manual, setManual] = useState([]);
  useEffect(() => { setLeaveOff(readLs(LS_LEAVE_OFF)); setManual(readLs(LS_MANUAL)); }, []);
  const fontsReady = useFontsReady();
  const measure = useMemo(
    () => (fontsReady && typeof document !== "undefined" ? canvasMeasure() : approxMeasure),
    [fontsReady],
  );

  const isResults = kind === "Results";
  const official = useMemo(() => results?.results ?? [], [results]);
  const merged = useMemo(() => mergeManual(official, manual, today), [official, manual, today]);

  const allRows = useMemo(() => {
    if (isResults) {
      const chosen = merged.results.filter(resultWindowPredicate(rsWindow, today));
      const labels = cardLabels(fixtures, config, chosen.map((r) => r.teamId));
      return resultRows(chosen, labels);
    }
    const chosen = fixtures.filter(windowPredicate(fxWindow, today));
    return fixtureRows(chosen, cardLabels(fixtures, config, []));
  }, [isResults, merged, rsWindow, fxWindow, fixtures, config, today]);

  // Memoised so the cards keep their identity across renders - CardPreview redraws
  // whenever its `card` changes.
  const rows = useMemo(() => applyLeaveOff(allRows, leaveOff), [allRows, leaveOff]);
  const lower = isResults ? "results" : "fixtures";
  const cardsByShape = useMemo(() => Object.fromEntries(SHAPE_NAMES.map((s) =>
    [s, layoutCards({ kind: lower, rows, mode, shape: s, measure })])), [lower, rows, mode, measure]);

  function toggleLeaveOff(id) {
    const next = leaveOff.includes(id) ? leaveOff.filter((x) => x !== id) : [...leaveOff, id];
    setLeaveOff(next);
    writeLs(LS_LEAVE_OFF, next);
  }
  function saveManual(next) { setManual(next); writeLs(LS_MANUAL, next); }

  if (isResults && results === null) {
    return (
      <section>
        <KindPicker kind={kind} setKind={setKind} />
        <div className="card"><p>Could not load the results.</p>
          <p className="dim">The graphics need the results file. Reload, or check the data repo.</p></div>
      </section>
    );
  }

  const windows = isResults ? RESULT_WINDOWS : WINDOWS;
  const windowName = isResults ? rsWindow : fxWindow;
  const setWindow = isResults ? setRsWindow : setFxWindow;
  const cards = cardsByShape[shape];

  return (
    <section>
      <KindPicker kind={kind} setKind={setKind} />
      <div className="row">
        {windows.map((w) => (
          <button key={w} className={w === windowName ? "chip on" : "chip"} onClick={() => setWindow(w)}>{w}</button>
        ))}
      </div>
      <div className="row">
        {MODES.map(([m, label]) => (
          <button key={m} className={m === mode ? "chip on" : "chip"} onClick={() => setMode(m)}>{label}</button>
        ))}
        {SHAPE_NAMES.map((s) => (
          <button key={s} className={s === shape ? "chip on" : "chip"} onClick={() => setShape(s)}>
            {s === "4x5" ? "4:5 portrait" : "4:3 landscape"}
          </button>
        ))}
      </div>

      {cards.length === 0
        ? <div className="card"><p className="dim">Nothing in this window.</p></div>
        : (
          <>
            <div className="row">
              <button className="primary" onClick={() => downloadAll(lower, [shape], cardsByShape)}>Download all ({shape === "4x5" ? "4:5" : "4:3"})</button>
              <button className="chip" onClick={() => downloadAll(lower, SHAPE_NAMES, cardsByShape)}>Download both shapes</button>
            </div>
            <div className="cardgrid">
              {cards.map((card) => <CardPreview key={card.fileName} kind={lower} shape={shape} card={card} />)}
            </div>
          </>
        )}

      {merged.conflicts.length > 0 && (
        <div className="card warn">
          {merged.conflicts.map(({ entry, official: o }) => (
            <p key={entry.id}>
              The league scored {entry.opponent} on {entry.date} as {o.ourScore}-{o.theirScore};
              you entered {entry.ourScore}-{entry.theirScore}. A card you posted may be wrong.
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <p className="phead">Rows</p>
        {allRows.map((r) => (
          <label key={r.id} className="aline">
            <input type="checkbox" checked={leaveOff.includes(r.id)} onChange={() => toggleLeaveOff(r.id)} />
            {" "}Leave off — {r.segments.map((s) => s.text).join("")}
          </label>
        ))}
      </div>

      {isResults && (
        <ManualResults fixtures={fixtures} awaiting={awaiting} official={official} config={config}
                       now={now} manual={manual} onChange={saveManual} />
      )}
    </section>
  );
}

function KindPicker({ kind, setKind }) {
  return (
    <div className="row">
      {["Fixtures", "Results"].map((k) => (
        <button key={k} className={k === kind ? "chip on" : "chip"} onClick={() => setKind(k)}>{k}</button>
      ))}
    </div>
  );
}

// Hand-entered results. Pending games come pre-filled; a free-form row covers a game the
// league never listed. Stored in this browser only; shown on cards only.
function ManualResults({ fixtures, awaiting, official, config, now, manual, onChange }) {
  const pending = now ? pendingFixtures(fixtures, official, now, awaiting) : [];
  const entered = new Set(manual.map((e) => e.id));
  const labels = cardLabels(fixtures, config, [...pending, ...manual].map((x) => x.teamId));
  const squads = Object.entries(labels).sort((a, b) => a[1].localeCompare(b[1]));
  const [free, setFree] = useState({ teamId: "", opponent: "", isHome: true, date: now?.date ?? "", ours: "", theirs: "" });

  function add(fixture, ours, theirs) {
    const e = manualEntry({ fixture, ourScore: ours, theirScore: theirs });
    if (e) onChange([...manual.filter((m) => m.id !== e.id), e]);
  }

  return (
    <div className="card">
      <p className="phead">Add a result the league has not published</p>
      {pending.filter((f) => !entered.has(String(f.fid))).map((f) => (
        <PendingRow key={f.fid} fixture={f} label={labels[f.teamId] ?? f.ourTeam} onAdd={add} />
      ))}
      <form className="row" onSubmit={(ev) => {
        ev.preventDefault();
        add({ fid: null, teamId: free.teamId, date: free.date, time: "", isHome: free.isHome, opponent: free.opponent.trim() }, free.ours, free.theirs);
      }}>
        <select value={free.teamId} onChange={(e) => setFree({ ...free, teamId: e.target.value })}>
          <option value="">Squad…</option>
          {squads.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={free.isHome ? "home" : "away"} onChange={(e) => setFree({ ...free, isHome: e.target.value === "home" })}>
          <option value="home">v (home)</option>
          <option value="away">@ (away)</option>
        </select>
        <input placeholder="Opponent" value={free.opponent} onChange={(e) => setFree({ ...free, opponent: e.target.value })} />
        <input type="date" value={free.date} onChange={(e) => setFree({ ...free, date: e.target.value })} />
        <input className="score" inputMode="numeric" placeholder="Us" value={free.ours} onChange={(e) => setFree({ ...free, ours: e.target.value })} />
        <input className="score" inputMode="numeric" placeholder="Them" value={free.theirs} onChange={(e) => setFree({ ...free, theirs: e.target.value })} />
        <button className="chip" type="submit" disabled={!free.teamId || !free.opponent.trim() || !free.date}>Add</button>
      </form>
      {manual.length > 0 && (
        <>
          <p className="phead">Entered by hand</p>
          {manual.map((e) => (
            <div key={e.id} className="aline">
              {labels[e.teamId] ?? e.teamId} {e.isHome ? "v" : "@"} {e.opponent}: {e.ourScore}-{e.theirScore} ({e.date}){" "}
              <button className="chip" onClick={() => onChange(manual.filter((m) => m.id !== e.id))}>Remove</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PendingRow({ fixture, label, onAdd }) {
  const [ours, setOurs] = useState("");
  const [theirs, setTheirs] = useState("");
  return (
    <div className="row">
      <span>{label} {fixture.isHome ? "v" : "@"} {fixture.opponent} — {fixture.date}</span>
      <input className="score" inputMode="numeric" placeholder="Us" value={ours} onChange={(e) => setOurs(e.target.value)} />
      <input className="score" inputMode="numeric" placeholder="Them" value={theirs} onChange={(e) => setTheirs(e.target.value)} />
      <button className="chip" onClick={() => onAdd(fixture, ours, theirs)}>Add</button>
    </div>
  );
}
```

- [ ] **Step 5: Wire App.jsx**

In `src/App.jsx`:

1. `import GraphicsTab from "./components/GraphicsTab.jsx";`
2. `const TABS = ["Fixtures", "Results", "Graphics", "Form", "Changes", "Squads"];`
3. After `const fixtures = [...]`, add:

```js
  // Played games each scan is still waiting on a result for - see awaiting.js.
  const awaiting = [...(snapshot.awaiting ?? []), ...(faiSnapshot?.awaiting ?? [])];
```

4. Pass `awaiting={awaiting}` to `<ResultsTab ... />`.
5. Add after the Results tab line:

```jsx
      {tab === "Graphics" && (
        <GraphicsTab fixtures={fixtures} awaiting={awaiting} results={results}
                     config={config} today={today} now={now} />
      )}
```

- [ ] **Step 6: Styles**

Append to `src/styles.css`:

```css
.cardgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin: 12px 0; }
.cardprev { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.cardprev canvas { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); }
.cardprev figcaption { font-size: 12px; word-break: break-all; }
.card.warn { border-color: #d29922; }
input.score { width: 4em; }
```

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/cardCanvas.js src/components/GraphicsTab.jsx src/App.jsx src/styles.css test/components.test.jsx
git commit -m "feat(cards): Graphics tab with previews, downloads, leave off and hand-entered results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Look at it, then tune

Canvas output cannot be unit-tested here; this is where it is checked against the owner's cards.

- [ ] **Step 1: Point dev at local data with known content**

Copy the data repo's current files to `public/data/` (gitignored):

```bash
for f in latest.json teams.json changes.json results.json latest-fai.json changes-fai.json results-fai.json; do
  curl -sf "https://raw.githubusercontent.com/seaninryan/fixtures-data/main/$f" -o "public/data/$f" || echo "skip $f"
done
echo 'VITE_DATA_URL=/fixtures/data/' > .env.local
```

- [ ] **Step 2: Run dev and screenshot each shape and kind**

Run `npm run dev` (background), open `http://localhost:5173/fixtures/`. The owner gate needs a Google sign-in; if a headless browser cannot pass it, hand the URL to the owner. Download one 4:5 fixtures, one 4:3 fixtures, one 4:5 results and one 4:3 results card, and compare against the owner's samples (crest clearance, heading sizes, yellow/navy values, row spacing).

- [ ] **Step 3: Tune constants only**

Adjust `SHAPES[...].region`, `M` and `PALETTES` in `src/lib/cardLayout.js`. Re-run `npx vitest run test/cardLayout.test.js` after each change — the bounds tests must stay green.

- [ ] **Step 4: Remove `.env.local`, commit tuning**

```bash
rm .env.local
git add src/lib/cardLayout.js
git commit -m "style(cards): tune layout against the Canva originals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-11-06-social-cards-design.md` (only if implementation diverged)

- [ ] **Step 1: Update CLAUDE.md**

Under **Architecture**, after the `form.js` bullet, add:

```markdown
- `cardRows.js`, `cardLayout.js`, `manualResults.js` — the Graphics tab's social cards.
  `cardLayout` turns rows into plain-data draw ops with text width injected, so fitting,
  splitting and headings are unit-tested without a DOM; `src/components/cardCanvas.js` is
  the only code that touches a canvas. Backgrounds are the owner's Canva exports in
  `public/cards/`, at exactly the sizes in `SHAPES`.
- `awaiting.js` — played games that left the feed with no result, carried in
  `snapshot.awaiting` until the result lands (14 days max). Inside `latest*.json`
  because the data repo's workflow commits a fixed list of files.
```

Change the `pending.js` bullet's "nothing is persisted" to: "It reads the snapshot plus `snapshot.awaiting`."

Under **Invariants**, add:

```markdown
- **Hand-entered results and Leave off reach the graphics only.** They live in the
  browser's localStorage, never `results.json`, the Form tab or the email. A forfeit
  left off a card still counts in Form, because it is the league's result.
- **`awaiting` is never counted by the scan guards and never diffed.** It holds games
  that have already left the feed; the guards are about the feed.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-06-social-cards-design.md
git commit -m "docs: social cards, awaiting, and their invariants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Final verification**

Run: `npm test && npm run build`
Expected: all suites pass, build succeeds.
