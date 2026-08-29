# Results Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture each fixture's result when the league publishes it, and render a copyable round-up of recent results in the club's house format.

**Architecture:** The results are already in the HTML we fetch, in `table-body results` blocks that `parse.js` currently discards. `parse.js` learns to return them, `normalize.js` converts them to our shape, `results.js` merges them **append-only** into an accumulated `results.json`, and a new `ResultsTab` renders the round-up. No new network request, no new endpoint, no parameter change.

**Tech Stack:** Vanilla ES modules, React 18, Vitest (node environment, no jsdom), Node 20.

**Spec:** `docs/superpowers/specs/2026-08-29-results-capture-design.md`

**Branch:** `feat/results-capture` (already created; the spec is committed on it)

---

## Environment

System Node is v14 and silently breaks Vite and Vitest. **Prefix every command in this plan:**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

Every `npx vitest` / `npm` command below assumes this has been run in that shell.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `test/fixtures/club2960-results.html` | Golden capture containing results blocks | Create |
| `test/fixtures/meta.js` | Facts about the golden captures | Modify |
| `src/lib/parse.js` | HTML → raw records | Modify: return `results` |
| `src/lib/normalize.js` | Raw records → our shapes | Modify: add result normalization |
| `src/lib/results.js` | Merge + round-up text | Create |
| `src/lib/window.js` | Date windows | Modify: add backward windows |
| `src/lib/runCheck.js` | The pipeline minus I/O | Modify: thread results through |
| `src/lib/dataSource.js` | Where the JSON lives | No change (`dataUrl` is generic) |
| `scripts/check.mjs` | The cron entry point | Modify: read/write `results.json` |
| `src/App.jsx` | Tab wiring + data loading | Modify: load results, add tab |
| `src/components/ResultsTab.jsx` | Round-up UI | Create |
| `src/lib/fetchFixtures.js` | The only network I/O | Modify: correct a wrong comment |

**Deviation from the spec, deliberate:** the spec said to re-capture `club2960.html` and update `meta.js`. Replacing it would break the date-anchored window and announce tests — they use `today = 2026-08-25` against a capture whose fixtures start 26 Aug, while a fresh capture's earliest fixture is 01 Sep, so "This weekend" would select nothing. A **second** capture is added instead and the original is left untouched.

---

### Task 1: Golden capture containing results

**Files:**
- Create: `test/fixtures/club2960-results.html`
- Modify: `test/fixtures/meta.js`

- [ ] **Step 1: Capture the response**

The capture must come from the live endpoint with the browser headers, because CloudFront 403s a default client User-Agent.

```bash
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
curl -sS -o test/fixtures/club2960-results.html \
  -X POST "https://galwayfa.ie/wp-admin/admin-ajax.php" \
  -H "User-Agent: $UA" \
  -H "Referer: https://galwayfa.ie/clubprofile/2960/" \
  --data "action=fixtures&club_id=2960&competition_id=&team_id=&displayResults="
```

- [ ] **Step 2: Measure what it contains**

Counts are measured, never guessed.

```bash
python3 - <<'PY'
import re, io
h = io.open("test/fixtures/club2960-results.html", encoding="utf-8", errors="replace").read()
parts = re.split(r'(?=<ul class="column-eight table-body (?:fixtures|results)")', h)
fix = [p for p in parts if p.startswith('<ul class="column-eight table-body fixtures')]
res = [p for p in parts if p.startswith('<ul class="column-eight table-body results')]
print("fixtures:", len(fix), " results:", len(res))
PY
```

Expected: a non-zero results count. **If results is 0, stop** — the capture is useless for this work. Results age out of the feed within a day or two, so capture on a day following a match day (Craughwell plays mostly Saturdays).

- [ ] **Step 3: Record the measured counts**

Edit `test/fixtures/meta.js`, replacing the whole file. Substitute the two numbers printed in Step 2:

```javascript
// Facts about the committed golden captures. Update ONLY when re-capturing the HTML.
export const FIXTURE_COUNT = 49;
export const TEAM_COUNT = 19;
export const CLUB_ID = "2960";

// A SECOND capture, taken on a day when results had been published. club2960.html
// predates results capture and contains none, and it is deliberately not replaced:
// the window and announce tests anchor on 2026-08-25 against its fixture dates, and a
// newer capture's fixtures start too late for "This weekend" to select anything.
export const RESULTS_FIXTURE_COUNT = 44;   // <-- from Step 2
export const RESULT_COUNT = 2;             // <-- from Step 2
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/club2960-results.html test/fixtures/meta.js
git commit -m "test(fixtures): capture a response containing results blocks"
```

---

### Task 2: `parse.js` returns results

**Files:**
- Modify: `src/lib/parse.js:11-12,53-112`
- Test: `test/parse.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/parse.test.js`. Note the new import of the second capture and the counts.

```javascript
import { RESULTS_FIXTURE_COUNT, RESULT_COUNT } from "./fixtures/meta.js";

const resultsHtml = readFileSync(
  new URL("./fixtures/club2960-results.html", import.meta.url), "utf8",
);

const RESULT_START = '<ul class="column-eight table-body results';

describe("results blocks", () => {
  it("returns results alongside fixtures from the same response", () => {
    const { fixtures, results } = parse(resultsHtml);
    expect(fixtures).toHaveLength(RESULTS_FIXTURE_COUNT);
    expect(results).toHaveLength(RESULT_COUNT);
  });

  it("gives every result a fid and our team id", () => {
    const { results } = parse(resultsHtml);
    for (const r of results) {
      expect(r.fid).toMatch(/^\d+$/);
      expect(r.teamId).toMatch(/^\d+$/);
    }
  });

  it("carries both scores as written", () => {
    const { results } = parse(resultsHtml);
    for (const r of results) {
      expect(r.homeScore).toMatch(/^\d+$/);
      expect(r.awayScore).toMatch(/^\d+$/);
    }
  });

  it("keeps results out of the fixtures list", () => {
    const { fixtures, results } = parse(resultsHtml);
    const fixtureFids = new Set(fixtures.map((f) => f.fid));
    for (const r of results) expect(fixtureFids.has(r.fid)).toBe(false);
  });

  it("returns an empty results array when the response has none", () => {
    // The original golden predates results and contains none.
    expect(parse(html).results).toEqual([]);
  });

  it("skips a results block whose score is empty - not yet played", () => {
    const blank = resultsHtml.replace(/data-homescore="\d+"/, 'data-homescore=""');
    const { results } = parse(blank);
    expect(results).toHaveLength(RESULT_COUNT - 1);
  });

  it("does not throw on a results block with no fid", () => {
    const parts = resultsHtml.split(new RegExp(`(?=${RESULT_START})`));
    const i = parts.findIndex((p) => p.startsWith(RESULT_START));
    parts[i] = parts[i].replace(/data-fid="\d+"/, 'data-fid=""');
    const { results, errors } = parse(parts.join(""));
    expect(results).toHaveLength(RESULT_COUNT - 1);
    expect(errors.some((e) => /no data-fid/.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/parse.test.js
```

Expected: FAIL — `results` is `undefined`, so `toHaveLength` throws.

- [ ] **Step 3: Implement**

In `src/lib/parse.js`, replace lines 8-12 (the `BLOCK_START` / `SPLIT` constants):

```javascript
// One spelling of each selector, so a class change cannot break the split and the
// filter asymmetrically. Deliberately does not require the closing quote: the plugin
// appending a class (`... fixtures past"`) must not silently match zero blocks.
const FIXTURE_START = '<ul class="column-eight table-body fixtures';
const RESULT_START = '<ul class="column-eight table-body results';
const SPLIT = new RegExp(`(?=${FIXTURE_START}|${RESULT_START})`);
```

Then replace the whole `parse` function (from `export function parse(html) {` to the end of the file):

```javascript
// Everything a fixture and a result have in common. Returns null and records an error
// when identity cannot be established - identity is non-negotiable in both cases.
function readCommon(block, i, errors) {
  // Quote-aware, so a `>` inside an attribute value cannot truncate the open tag
  // and silently blank every attribute after it. data-comment is admin free text
  // ("Moved as agreed (21/8)") and is followed by data-venue and data-compname.
  const openMatch = /^<ul(?:[^>"]|"[^"]*")*>/.exec(block);
  const open = openMatch ? openMatch[0] : block.slice(0, block.indexOf(">") + 1);
  const attrs = dataAttrs(open);
  const label = `block ${i} (${attrs.hometeam || "?"} v ${attrs.awayteam || "?"}, ${attrs.date || "?"})`;

  // NOTE: every data-fid in this feed lives inside an HTML COMMENT — the plugin
  // emits a commented-out .toggle-table div and nothing else carries the fid. The
  // whole identity scheme therefore depends on markup its author has already
  // disabled. If the plugin ever drops that dead block, no fixture gets an id; the
  // zero-blocks guard and this per-block error are what make that loud. Verified
  // 2026-08-29 to be true of RESULTS blocks too, so results inherit this fragility
  // rather than adding a second one.
  const fid = block.match(/data-fid="(\d+)"/)?.[1] ?? null;
  // First match wins, and the home side is always listed first — so in a derby
  // between two of our own teams we keep the home team's id and lose the away one.
  const ours = block.match(
    new RegExp(
      `clubprofile/${CLUB_ID}/\\?competition_id=(?<competitionId>\\d+)&(?:amp;)?team_id=(?<teamId>\\d+)`,
    ),
  );
  if (!fid) { errors.push(`${label}: no data-fid`); return null; }
  if (!ours) { errors.push(`${label}: no team link for club ${CLUB_ID}`); return null; }
  // The date check deliberately does NOT live here. A fixture needs a date AND a time,
  // a result needs only a date, and test/parse.test.js asserts the fixture wording
  // exactly ("missing date or time"). Checking per-kind keeps that message intact and
  // is the more honest check anyway.

  return {
    attrs,
    label,
    fid,
    teamId: ours.groups.teamId,
    competitionId: ours.groups.competitionId,
    homeTeam: attrs.hometeam ?? "",
    awayTeam: attrs.awayteam ?? "",
    homeClubId: sideClubId(block, "team1"),
    awayClubId: sideClubId(block, "team2"),
    venue: attrs.venue ?? "",
    competition: attrs.compname ?? "",
  };
}

export function parse(html) {
  const fixtures = [];
  const results = [];
  const errors = [];
  if (typeof html !== "string" || html.trim() === "") {
    return { fixtures, results, errors: ["empty response"] };
  }

  const blocks = html.split(SPLIT).filter(
    (b) => b.startsWith(FIXTURE_START) || b.startsWith(RESULT_START),
  );
  if (blocks.length === 0) {
    return { fixtures, results, errors: [`no fixture blocks found in ${html.length} bytes of HTML`] };
  }

  blocks.forEach((block, i) => {
    try {
      const common = readCommon(block, i, errors);
      if (!common) return;
      const { attrs, label, ...shared } = common;

      if (block.startsWith(RESULT_START)) {
        if (!attrs.date) return void errors.push(`${label}: missing date`);
        // An empty score is an unplayed fixture that has appeared in the results list.
        // Normal, not an error: skip it and wait for the league to publish the score.
        if (!attrs.homescore || !attrs.awayscore) return;
        results.push({
          ...shared,
          date: attrs.date,
          homeScore: attrs.homescore,
          awayScore: attrs.awayscore,
        });
        return;
      }

      // A fixture needs a kick-off time; a result does not, and never prints one.
      if (!attrs.date || !attrs.time) return void errors.push(`${label}: missing date or time`);
      fixtures.push({
        ...shared,
        date: attrs.date,
        time: attrs.time,
        comment: attrs.comment ?? "",
      });
    } catch (e) {
      errors.push(`block ${i}: ${e.message}`);
    }
  });

  return { fixtures, results, errors };
}
```

- [ ] **Step 4: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS. The refactor touches the fixtures path, so every existing `parse` test must still pass — that is the point of running the whole suite, not just `parse.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse.js test/parse.test.js
git commit -m "feat(parse): return results blocks alongside fixtures"
```

---

### Task 3: Normalize results

**Files:**
- Modify: `src/lib/normalize.js`
- Test: `test/normalize.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/normalize.test.js`:

```javascript
import { normalizeResult, normalizeAllResults, parseScore } from "../src/lib/normalize.js";

const rawResult = (over = {}) => ({
  fid: "1", teamId: "11", competitionId: "77",
  date: "29 Aug 2026",
  homeTeam: "Craughwell United", awayTeam: "St Bernards",
  homeClubId: "2960", awayClubId: "9999",
  homeScore: "1", awayScore: "0",
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1",
  ...over,
});

describe("parseScore", () => {
  it("reads zero as a score, not as missing", () => {
    expect(parseScore("0")).toBe(0);
  });

  it("rejects an empty string rather than coercing it to zero", () => {
    expect(parseScore("")).toBeNull();
    expect(parseScore(undefined)).toBeNull();
    expect(parseScore("  ")).toBeNull();
  });

  it("rejects anything that is not a whole number", () => {
    expect(parseScore("P-P")).toBeNull();
    expect(parseScore("1.5")).toBeNull();
    expect(parseScore("-1")).toBeNull();
  });
});

describe("normalizeResult", () => {
  it("puts the scores our way round when we are at home", () => {
    const r = normalizeResult(rawResult());
    expect(r.isHome).toBe(true);
    expect(r.ourTeam).toBe("Craughwell United");
    expect(r.opponent).toBe("St Bernards");
    expect(r.ourScore).toBe(1);
    expect(r.theirScore).toBe(0);
  });

  it("puts the scores our way round when we are away", () => {
    const r = normalizeResult(rawResult({
      homeClubId: "9999", awayClubId: "2960",
      homeTeam: "Cregmore/Claregalway C", awayTeam: "Craughwell United B",
      homeScore: "4", awayScore: "3",
    }));
    expect(r.isHome).toBe(false);
    expect(r.ourTeam).toBe("Craughwell United B");
    expect(r.opponent).toBe("Cregmore/Claregalway C");
    expect(r.ourScore).toBe(3);
    expect(r.theirScore).toBe(4);
  });

  it("converts the date to an ISO string", () => {
    expect(normalizeResult(rawResult()).date).toBe("2026-08-29");
  });

  it("carries no time - a result never prints one", () => {
    expect(normalizeResult(rawResult()).time).toBeUndefined();
  });
});

describe("normalizeAllResults", () => {
  it("drops a result with an unparseable date and says so", () => {
    const { results, errors } = normalizeAllResults([rawResult({ date: "32 Aug 2026" })]);
    expect(results).toEqual([]);
    expect(errors[0]).toMatch(/unparseable date/);
  });

  it("drops a result with a non-numeric score and says so", () => {
    const { results, errors } = normalizeAllResults([rawResult({ homeScore: "P-P" })]);
    expect(results).toEqual([]);
    expect(errors[0]).toMatch(/score/);
  });

  it("keeps a nil-all draw", () => {
    const { results, errors } = normalizeAllResults([
      rawResult({ homeScore: "0", awayScore: "0" }),
    ]);
    expect(errors).toEqual([]);
    expect(results[0].ourScore).toBe(0);
    expect(results[0].theirScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/normalize.test.js
```

Expected: FAIL — `normalizeResult is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/normalize.js`:

```javascript
// A score of 0 is a real score and an empty string is not a score at all. Number("")
// is 0, so this must never go anywhere near it: coercing a blank to nil-all would
// invent a draw that was never played.
export function parseScore(raw) {
  const s = String(raw ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

export function normalizeResult(raw) {
  const isHome = raw.homeClubId === CLUB_ID;
  const home = parseScore(raw.homeScore);
  const away = parseScore(raw.awayScore);
  return {
    fid: raw.fid,
    teamId: raw.teamId,
    date: isoDate(raw.date),
    isHome,
    ourTeam: isHome ? raw.homeTeam : raw.awayTeam,
    opponent: isHome ? raw.awayTeam : raw.homeTeam,
    // Stored from OUR point of view, with isHome recording which side we were, so a
    // stored result reads correctly on its own and home-first ordering stays a
    // rendering concern rather than a storage one.
    ourScore: isHome ? home : away,
    theirScore: isHome ? away : home,
    venue: raw.venue,
    competition: raw.competition,
  };
}

export function normalizeAllResults(raws) {
  const results = [];
  const errors = [];
  for (const raw of raws ?? []) {
    const r = normalizeResult(raw);
    if (!r.date) {
      errors.push(`fid ${raw.fid}: unparseable date "${raw.date}"`);
      continue;
    }
    if (r.ourScore === null || r.theirScore === null) {
      errors.push(`fid ${raw.fid}: unreadable score "${raw.homeScore}-${raw.awayScore}"`);
      continue;
    }
    results.push(r);
  }
  return { results: sortResults(results), errors };
}

// Stable order keeps the committed results.json diff to the lines that actually
// changed. Ascending, like fixtures - the round-up reverses for display.
export function sortResults(results) {
  return [...results].sort(
    (a, b) => a.date.localeCompare(b.date) || a.fid.localeCompare(b.fid),
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/normalize.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.js test/normalize.test.js
git commit -m "feat(normalize): result records with our-point-of-view scores"
```

---

### Task 4: Backward windows

**Files:**
- Modify: `src/lib/window.js`
- Test: `test/window.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/window.test.js`:

```javascript
import { RESULT_WINDOWS, resultWindowRange, resultWindowPredicate } from "../src/lib/window.js";

// 2026-08-29 is a Saturday, 08-30 Sunday, 08-31 Monday, 09-04 Friday.
describe("result windows", () => {
  it("offers exactly the four backward windows", () => {
    expect(RESULT_WINDOWS).toEqual(["Last weekend", "Last 7 days", "Last 14 days", "All"]);
  });

  it("on Saturday, last weekend is the weekend in progress", () => {
    expect(resultWindowRange("Last weekend", "2026-08-29"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("on Sunday, last weekend includes Saturday's games", () => {
    expect(resultWindowRange("Last weekend", "2026-08-30"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("on Monday, last weekend is the weekend just gone", () => {
    expect(resultWindowRange("Last weekend", "2026-08-31"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("on Friday, last weekend is still the weekend just gone", () => {
    expect(resultWindowRange("Last weekend", "2026-09-04"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("counts back inclusively for the rolling windows", () => {
    expect(resultWindowRange("Last 7 days", "2026-08-30"))
      .toEqual({ from: "2026-08-24", to: "2026-08-30" });
    expect(resultWindowRange("Last 14 days", "2026-08-30"))
      .toEqual({ from: "2026-08-17", to: "2026-08-30" });
  });

  it("shows everything for All, rather than nothing", () => {
    const { from, to } = resultWindowRange("All", "2026-08-30");
    expect(from < "1900-01-01").toBe(true);
    expect(to).toBe("9999-12-31");
  });

  it("selects results by date", () => {
    const inWindow = resultWindowPredicate("Last weekend", "2026-08-31");
    expect(inWindow({ date: "2026-08-29" })).toBe(true);
    expect(inWindow({ date: "2026-08-30" })).toBe(true);
    expect(inWindow({ date: "2026-08-28" })).toBe(false);
    expect(inWindow({ date: "2026-08-31" })).toBe(false);
  });

  it("leaves the forward windows untouched", () => {
    expect(WINDOWS).toEqual(["This weekend", "Next 7 days", "Next 14 days", "All"]);
    expect(windowRange("Next 7 days", "2026-08-30"))
      .toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/window.test.js
```

Expected: FAIL — `RESULT_WINDOWS is not defined`.

- [ ] **Step 3: Implement**

Append to `src/lib/window.js`:

```javascript
// The backward twins, for results. Added as separate exports rather than by
// generalising windowRange: that function is load-bearing for the announcement and
// its weekend logic is subtle enough not to disturb for the sake of sharing five
// lines of arithmetic.
export const RESULT_WINDOWS = ["Last weekend", "Last 7 days", "Last 14 days", "All"];

export function resultWindowRange(name, today) {
  if (name === "Last weekend") {
    const dow = dayOfWeek(today);
    // On the weekend itself, "last weekend" is the one in progress - a Sunday-afternoon
    // round-up must include Saturday's games. Saturday's `to` runs to Sunday even though
    // Sunday has not happened: results only ever exist in the past, so the extra day
    // selects nothing, and it keeps this symmetrical with "This weekend".
    if (dow === 6) return { from: today, to: addDays(today, 1) };
    if (dow === 0) return { from: addDays(today, -1), to: today };
    // Monday to Friday: the Saturday and Sunday just gone, so a Monday-morning
    // round-up is the obvious thing to paste with no thought from whoever posts it.
    const sunday = addDays(today, -dow);
    return { from: addDays(sunday, -1), to: sunday };
  }
  if (name === "Last 7 days") return { from: addDays(today, -6), to: today };
  if (name === "Last 14 days") return { from: addDays(today, -13), to: today };
  // "All", and anything unrecognised: showing everything beats showing nothing.
  return { from: "0000-01-01", to: "9999-12-31" };
}

export function resultWindowPredicate(name, today) {
  const { from, to } = resultWindowRange(name, today);
  return (result) => result.date >= from && result.date <= to;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/window.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window.js test/window.test.js
git commit -m "feat(window): backward windows for results"
```

---

### Task 5: `mergeResults` — append-only accumulation

**Files:**
- Create: `src/lib/results.js`
- Test: `test/results.test.js`

This is the task that protects real history. The merge must never delete.

- [ ] **Step 1: Write the failing tests**

Create `test/results.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mergeResults, RESULTS_VERSION } from "../src/lib/results.js";

const result = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-08-29", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards",
  ourScore: 1, theirScore: 0,
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1",
  ...over,
});

describe("mergeResults", () => {
  it("creates the store on a first run", () => {
    const out = mergeResults(null, [result()], "2026-08-29T12:00:00.000Z");
    expect(out.version).toBe(RESULTS_VERSION);
    expect(out.updatedAt).toBe("2026-08-29T12:00:00.000Z");
    expect(out.results).toHaveLength(1);
  });

  it("adds a result it has not seen", () => {
    const prev = { version: 1, results: [result({ fid: "1" })] };
    const out = mergeResults(prev, [result({ fid: "2", date: "2026-09-05" })], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "2"]);
  });

  it("NEVER removes a stored result that is absent from the feed", () => {
    // The single most important behaviour here. Results age out of the feed within a
    // day or two, so an absent result means the feed moved on - never that the game
    // was unplayed. This is the results counterpart of "a failed fetch must never
    // look like a cancellation".
    const prev = { version: 1, results: [result({ fid: "1" }), result({ fid: "2" })] };
    const out = mergeResults(prev, [], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "2"]);
  });

  it("updates a score the league has corrected", () => {
    const prev = { version: 1, results: [result({ fid: "1", ourScore: 1, theirScore: 0 })] };
    const out = mergeResults(prev, [result({ fid: "1", ourScore: 2, theirScore: 0 })], "now");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].ourScore).toBe(2);
  });

  it("keeps a stable order so the committed diff stays small", () => {
    const prev = { version: 1, results: [result({ fid: "9", date: "2026-09-05" })] };
    const out = mergeResults(prev, [result({ fid: "1", date: "2026-08-29" })], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "9"]);
  });

  it("survives a corrupted store rather than throwing", () => {
    const out = mergeResults({ version: 1, results: "nope" }, [result()], "now");
    expect(out.results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/results.test.js
```

Expected: FAIL — cannot resolve `../src/lib/results.js`.

- [ ] **Step 3: Implement**

Create `src/lib/results.js`:

```javascript
// Pure. The accumulated results store, and the round-up text built from it.
import { sortResults } from "./normalize.js";

export const RESULTS_VERSION = 1;

// Add and update; NEVER delete.
//
// The league's feed carries only the last day or two of results, so the store is the
// only place a result survives. A result missing from today's feed means the feed has
// moved on, never that the game was unplayed - pruning to match the feed would erase
// the season a few days at a time. This is the direct counterpart of runCheck's rule
// that a failed fetch must never look like a cancellation.
export function mergeResults(previous, incoming, now) {
  // Array.isArray, not `?.length`: a corrupted `{results: "nope"}` must read as an
  // empty store rather than as something to iterate.
  const stored = Array.isArray(previous?.results) ? previous.results : [];
  const byFid = new Map(stored.map((r) => [r.fid, r]));
  for (const r of incoming ?? []) byFid.set(r.fid, r);
  return {
    version: RESULTS_VERSION,
    updatedAt: now,
    results: sortResults([...byFid.values()]),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/results.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/results.js test/results.test.js
git commit -m "feat(results): append-only merge that never drops stored history"
```

---

### Task 6: The round-up text

**Files:**
- Modify: `src/lib/results.js`
- Test: `test/results.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/results.test.js`:

```javascript
import { roundupLines, roundup, formatResultLine } from "../src/lib/results.js";

const config = {
  version: 1,
  teams: {
    "11": { label: "U14A Boys", color: "#d9c53c" },
    "22": { label: "U14B Boys", color: "#4d9ae5" },
  },
};

const home = result({ fid: "1", teamId: "11", isHome: true, ourScore: 1, theirScore: 0, opponent: "St Bernards" });
const away = result({
  fid: "2", teamId: "22", isHome: false, ourScore: 3, theirScore: 4,
  ourTeam: "Craughwell United B", opponent: "Cregmore/Claregalway C",
});

describe("formatResultLine", () => {
  it("writes the home game with our label first", () => {
    expect(formatResultLine(home, { 11: "U14A Boys" }))
      .toBe("U14A Boys 1-0 St Bernards");
  });

  it("writes the away game with the opponent first", () => {
    expect(formatResultLine(away, { 22: "U14B Boys" }))
      .toBe("Cregmore/Claregalway C 4-3 U14B Boys");
  });

  it("falls back to the team name when a squad has no label", () => {
    expect(formatResultLine(away, {})).toBe("Cregmore/Claregalway C 4-3 Craughwell United B");
  });

  it("renders a nil-all draw", () => {
    expect(formatResultLine(result({ teamId: "11", ourScore: 0, theirScore: 0 }), { 11: "U14A Boys" }))
      .toBe("U14A Boys 0-0 St Bernards");
  });
});

describe("roundup", () => {
  it("matches the agreed format exactly", () => {
    expect(roundup([home, away], config, "Last weekend", "2026-08-31")).toBe(
      "SATURDAY 29 AUGUST\n\nU14A Boys 1-0 St Bernards\nCregmore/Claregalway C 4-3 U14B Boys",
    );
  });

  it("puts the newest day first", () => {
    const later = result({ fid: "3", teamId: "11", date: "2026-08-30" });
    const text = roundup([home, later], config, "Last weekend", "2026-08-31");
    expect(text.indexOf("SUNDAY 30 AUGUST")).toBeLessThan(text.indexOf("SATURDAY 29 AUGUST"));
  });

  it("never indents a result line", () => {
    for (const line of roundup([home, away], config, "All", "2026-08-31").split("\n")) {
      expect(line).toBe(line.trimStart());
    }
  });

  it("says so when the window is empty", () => {
    expect(roundup([], config, "Last weekend", "2026-08-31")).toMatch(/No results/);
  });

  it("excludes results outside the window", () => {
    const old = result({ fid: "4", teamId: "11", date: "2026-07-01" });
    expect(roundup([old], config, "Last weekend", "2026-08-31")).toMatch(/No results/);
  });
});

describe("roundupLines label resolution", () => {
  it("keeps the A/B letter when only one of two same-age squads played", () => {
    // The bug that has appeared three times: deriveLabels decides whether to show the
    // A/B letter by counting the club's squads at that age and gender. Resolving over
    // the RESULTS alone would count one U14 side and rename "U14A Boys" to "U14 Boys".
    const fixtures = [
      { fid: "90", teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
        ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
        competition: "GFA Boys U14 Championship 1", comment: "" },
      { fid: "91", teamId: "22", date: "2026-09-05", time: "14:00", isHome: true,
        ourTeam: "Craughwell United B", opponent: "Y", venue: "Craughwell",
        competition: "GFA Boys U14 Division 4", comment: "" },
    ];
    const lines = roundupLines([home], {}, "All", "2026-08-31", fixtures);
    const text = lines.map((l) => l.text).join("\n");
    expect(text).toContain("U14A Boys");
    expect(text).not.toContain("U14 Boys 1-0");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/results.test.js
```

Expected: FAIL — `roundupLines is not a function`.

- [ ] **Step 3: Implement**

Add to the imports at the top of `src/lib/results.js`:

```javascript
import { resultWindowPredicate } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor } from "./squadColors.js";
```

Then append:

```javascript
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// "2026-08-29" -> "SATURDAY 29 AUGUST". Same shape as the announcement's heading, so a
// results block and a fixtures block look like siblings pasted into the same thread.
function dayHeading(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Home team first, always - the football convention. Our side is written as its squad
// label and never alongside the club name, exactly as the fixtures announcement writes
// "U14A Boys v St Bernards".
export function formatResultLine(result, labels) {
  const label = labels[result.teamId] ?? result.ourTeam;
  return result.isHome
    ? `${label} ${result.ourScore}-${result.theirScore} ${result.opponent}`
    : `${result.opponent} ${result.theirScore}-${result.ourScore} ${label}`;
}

// The round-up as a list of lines, one entry per rendered line. Mirrors announceLines
// so the site can put a squad's colour BESIDE a result rather than inside it: a swatch
// in the gutter is not text, so it cannot be copied into a WhatsApp message.
//
// Line kinds: blank | day | result | note. Only a `result` line carries teamId/color.
//
// `fixtures` is how labels are resolved and is REQUIRED for correctness - see below.
export function roundupLines(results, config, windowName, today, fixtures = []) {
  const all = results ?? [];
  const chosen = all
    .filter(resultWindowPredicate(windowName, today))
    // Newest day first, then by squad label so the same squad lands in the same place
    // week to week. The fid tiebreak makes the order TOTAL, so the round-up never
    // depends on how the caller happened to sort.
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(a.teamId).localeCompare(String(b.teamId)) ||
      String(a.fid).localeCompare(String(b.fid)));

  if (chosen.length === 0) {
    return [{ kind: "note", text: "No results in this window." }];
  }

  // Resolved over every FIXTURE, not over the results: deriveLabels shows the A/B
  // letter only when the club runs more than one side at that age and gender, and
  // resolving over a weekend's results alone would count one U14 side and silently
  // rename "U14A Boys" to "U14 Boys". Squads whose season has ended have left the
  // fixture list entirely, which is why teams.json - config, and persistent - is
  // passed too, and why formatResultLine falls back to the stored team name.
  const { labels } = resolveTeams(fixtures, config);

  const lines = [];
  let currentDay = null;
  for (const result of chosen) {
    if (result.date !== currentDay) {
      if (currentDay !== null) lines.push({ kind: "blank", text: "" });
      currentDay = result.date;
      lines.push({ kind: "day", text: dayHeading(currentDay) });
      lines.push({ kind: "blank", text: "" });
    }
    lines.push({
      kind: "result",
      text: formatResultLine(result, labels),
      teamId: result.teamId,
      color: squadColor(result.teamId, config).bg,
    });
  }
  return lines;
}

// The plain text: what Copy puts on the clipboard.
export function roundup(results, config, windowName, today, fixtures = []) {
  return roundupLines(results, config, windowName, today, fixtures)
    .map((line) => line.text)
    .join("\n");
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/results.test.js
```

Expected: PASS. If the label test fails, check that `resolveTeams` is being handed `fixtures` and not `results`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/results.js test/results.test.js
git commit -m "feat(results): the copyable round-up text"
```

---

### Task 7: Thread results through `runCheck`

**Files:**
- Modify: `src/lib/runCheck.js:19-71`
- Test: `test/runCheck.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/runCheck.test.js`. Adjust the existing import line to include what you need; the golden with results is a second file.

```javascript
import { RESULT_COUNT } from "./fixtures/meta.js";

const resultsHtml = readFileSync(
  new URL("./fixtures/club2960-results.html", import.meta.url), "utf8",
);

describe("results", () => {
  const base = { now: "2026-08-30T12:00:00.000Z", today: "2026-08-30", config: null };

  it("accumulates results into the store", () => {
    const out = runCheck({ ...base, html: resultsHtml, previous: null, previousResults: null });
    expect(out.results.results).toHaveLength(RESULT_COUNT);
    expect(out.results.updatedAt).toBe(base.now);
  });

  it("keeps stored results the feed has already forgotten", () => {
    const older = {
      version: 1,
      results: [{
        fid: "999999", teamId: "11", date: "2026-08-01", isHome: true,
        ourTeam: "Craughwell United", opponent: "Old Opponent",
        ourScore: 2, theirScore: 2, venue: "Craughwell", competition: "X",
      }],
    };
    const out = runCheck({ ...base, html: resultsHtml, previous: null, previousResults: older });
    expect(out.results.results.some((r) => r.fid === "999999")).toBe(true);
    expect(out.results.results).toHaveLength(RESULT_COUNT + 1);
  });

  it("treats a response with no results as normal, not as a failure", () => {
    // Most days have no games. This must never look like a parse failure.
    const out = runCheck({ ...base, html, previous: null, previousResults: null });
    expect(out.results.results).toEqual([]);
    expect(out.snapshot.fixtures.length).toBeGreaterThan(0);
  });

  it("does not let results affect the shrink guard", () => {
    // The guard counts fixtures only. A response with fewer fixtures but more results
    // must still be judged on its fixtures.
    const previous = { version: 1, fixtures: new Array(50).fill(null).map((_, i) => ({
      fid: String(i), teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
      ourTeam: "C", opponent: "X", venue: "V", competition: "K", comment: "",
    })) };
    expect(() => runCheck({ ...base, html: resultsHtml, previous, previousResults: null }))
      .toThrow(/collapsed/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/runCheck.test.js
```

Expected: FAIL — `out.results` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lib/runCheck.js`, add to the imports:

```javascript
import { normalizeAll, normalizeAllResults } from "./normalize.js";
import { mergeResults } from "./results.js";
```

(The existing `import { normalizeAll } from "./normalize.js";` is replaced by the line above.)

Change the signature on line 19 to accept the previous store:

```javascript
export function runCheck({ html, previous, previousResults, config, now, today, history = [], siteUrl, allowShrink = false }) {
```

Then, immediately after the `const snapshot = ...` line (currently line 46), insert:

```javascript
  // Results are merged AFTER the two guards above on purpose: if the payload was bad
  // enough to fail them, its results are not to be trusted either, and nothing is
  // written at all. Note there is deliberately NO zero-results guard - most days have
  // no games, so an empty results list is the ordinary case, not a signal of failure.
  const { results: parsedResults, errors: resultErrors } = normalizeAllResults(parsed.results);
  errors.push(...resultErrors);
  const results = mergeResults(previousResults, parsedResults, now);
```

`errors` is declared with `const` on line 22 but is an array, so `push` is fine.

Finally add `results` to the returned object:

```javascript
  return {
    snapshot,
    results,
    config: nextConfig,
    changes,
    report,
    unknown,
    errors,
    firstRun,
    history: changes.length ? [{ checkedAt: now, changes }, ...history] : history,
  };
```

- [ ] **Step 4: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS. Run everything — this changes the shared pipeline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runCheck.js test/runCheck.test.js
git commit -m "feat(runCheck): accumulate results without touching the fixture guards"
```

---

### Task 8: `check.mjs` reads and writes `results.json`

**Files:**
- Modify: `scripts/check.mjs:105-130`

There is no unit test for `check.mjs` — it is the I/O shell. It is verified by the offline run in Step 3.

- [ ] **Step 1: Pass the previous store in**

In the `runCheck({...})` call, add after the `history:` line:

```javascript
    previousResults: readJson("results.json", null),
```

- [ ] **Step 2: Write it out and report**

After `writeJson("changes.json", history);` add:

```javascript
  writeJson("results.json", out.results);
```

And after the existing fixtures/changes log line, add:

```javascript
  console.log(`${out.results.results.length} results stored`);
```

- [ ] **Step 3: Verify with a real offline run**

```bash
DATA_DIR=/tmp/results-check FIXTURES_HTML_FILE=test/fixtures/club2960-results.html node scripts/check.mjs
cat /tmp/results-check/results.json
```

Expected: the run prints a fixtures line, a `results stored` line, and `results.json` contains a `results` array with the captured results and a `version` of 1.

- [ ] **Step 4: Verify the append-only behaviour end to end**

Run again against the capture with NO results, pointing at the same directory:

```bash
DATA_DIR=/tmp/results-check FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs
cat /tmp/results-check/results.json
```

Expected: the stored results are **still there**. This is the behaviour that protects real history; if they disappeared, stop and fix `mergeResults` before continuing.

- [ ] **Step 5: Commit**

```bash
git add scripts/check.mjs
git commit -m "feat(check): persist the accumulated results store"
```

---

### Task 9: The site loads `results.json`

**Files:**
- Modify: `src/App.jsx:11,54-77,118-135`

- [ ] **Step 1: Add the tab name**

Change line 11:

```javascript
const TABS = ["Fixtures", "Results", "Changes", "Squads"];
```

- [ ] **Step 2: Load the store**

In the data-loading effect, replace the `Promise.all` block and the `setState` that follows it:

```javascript
        // latest.json is the site. The others degrade: a club with no recorded changes
        // and no labels still gets a correct announcement.
        //
        // results.json resolves to null, NOT [], when it cannot be read. An empty array
        // would render as "No results in this window." - which reads as "nobody played"
        // when the truth is "we could not load them". That is the spinner problem in a
        // different costume, so the tab is told the difference and says so.
        const [snapshot, history, loaded, results] = await Promise.all([
          loadJson("latest.json"),
          loadJson("changes.json").catch(() => []),
          loadJson("teams.json").catch(() => ({ version: 1, teams: {} })),
          loadJson("results.json").catch(() => null),
        ]);
        if (!live) return;
        setConfig(loaded);
        setState({ status: "ready", snapshot, history, results });
```

- [ ] **Step 3: Destructure and render**

Change the destructuring line near the bottom:

```javascript
  const { snapshot, history, results } = state;
```

And add the tab, after the Fixtures line:

```javascript
      {tab === "Results" && (
        <ResultsTab results={results} fixtures={fixtures} config={config} today={today} />
      )}
```

- [ ] **Step 4: Import the component**

Add after the `AnnouncementTab` import:

```javascript
import ResultsTab from "./components/ResultsTab.jsx";
```

- [ ] **Step 5: Commit (after Task 10 — the app will not build until the component exists)**

Do not commit yet. Task 10 creates `ResultsTab.jsx`; commit both together.

---

### Task 10: `ResultsTab`

**Files:**
- Create: `src/components/ResultsTab.jsx`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `test/components.test.jsx`, following the existing SSR smoke-test pattern:

```javascript
import ResultsTab from "../src/components/ResultsTab.jsx";

const resultsFixture = [{
  fid: "1", teamId: "11", date: "2026-08-29", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards",
  ourScore: 1, theirScore: 0, venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1",
}];

const resultsConfig = { version: 1, teams: { "11": { label: "U14A Boys", color: "#d9c53c" } } };

describe("ResultsTab", () => {
  it("renders a result line", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={[]} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toContain("U14A Boys 1-0 St Bernards");
    expect(html).toContain("SATURDAY 29 AUGUST");
  });

  it("says the store could not be loaded rather than claiming nobody played", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={null} fixtures={[]} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toMatch(/could not/i);
    expect(html).not.toMatch(/No results in this window/);
  });

  it("distinguishes an empty store from a failed one", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: [] }}
                  fixtures={[]} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toMatch(/No results/);
    expect(html).not.toMatch(/could not/i);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run test/components.test.jsx
```

Expected: FAIL — cannot resolve `../src/components/ResultsTab.jsx`.

- [ ] **Step 3: Implement**

Create `src/components/ResultsTab.jsx`:

```jsx
import { useState } from "react";
import { roundupLines } from "../lib/results.js";
import { RESULT_WINDOWS } from "../lib/window.js";

// `results` is the parsed results.json, or null when it could not be loaded. The
// distinction matters: an empty store means nobody played, a null one means we do not
// know, and rendering them identically would quietly turn a load failure into a
// confident "no games".
export default function ResultsTab({ results, fixtures, config, today }) {
  const [windowName, setWindowName] = useState("Last weekend");
  const [copied, setCopied] = useState(false);

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

  // Labels resolve over the FIXTURES, never over the windowed results - see
  // roundupLines. Passing the wrong list here is how the A/B letter goes missing.
  const lines = roundupLines(results?.results ?? [], config, windowName, today, fixtures);
  const text = lines.map((line) => line.text).join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <div className="row">
        {RESULT_WINDOWS.map((w) => (
          <button key={w} className={w === windowName ? "chip on" : "chip"}
                  onClick={() => setWindowName(w)}>{w}</button>
        ))}
      </div>
      <div className="card announcement">
        {lines.map((line, i) => (
          // The index is the key on purpose: these lines have no identity of their own,
          // and the whole list is rebuilt whenever the window changes.
          <div className={`aline ${line.kind}`} key={i}>
            {line.color
              ? <span className="swatch" style={{ background: line.color }} aria-hidden="true" />
              : null}
            <span className="atext">{line.text}</span>
          </div>
        ))}
      </div>
      <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests and the build**

```bash
npx vitest run
npm run build
```

Expected: both PASS. The build catches JSX errors the tests cannot.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResultsTab.jsx src/App.jsx test/components.test.jsx
git commit -m "feat(site): results tab with a copyable round-up"
```

---

### Task 11: Correct the `displayResults` comment

**Files:**
- Modify: `src/lib/fetchFixtures.js:17-18`

The comment currently states something proven false. Leaving it would send the next reader looking for a parameter that does nothing.

- [ ] **Step 1: Replace the comment**

Replace lines 17-18 (the two comment lines above `FIXTURES_PARAMS`):

```javascript
// Every parameter is load-bearing EXCEPT displayResults, which is inert: verified
// 2026-08-29 that `displayResults=1` and `displayResults=` return byte-identical
// responses. It is sent because the browser sends it, not because it selects anything.
// Results are not behind it - they arrive in this same response as `table-body results`
// blocks. The two empty ids ask for every competition and every team.
```

- [ ] **Step 2: Verify the existing test still passes**

`test/fetchFixtures.test.js:45` asserts the body contains `displayResults=`; the value is unchanged, so this must still pass.

```bash
npx vitest run test/fetchFixtures.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fetchFixtures.js
git commit -m "docs(fetch): displayResults is inert, not a fixtures/results switch"
```

---

### Task 12: Commit `results.json` from the workflow (OTHER REPO)

**Files:**
- Modify: `.github/workflows/daily-check.yml` in `seaninryan/fixtures-data`

**This is a change to a different repository.** Without it, `results.json` is computed every day and committed never, and the whole feature silently does nothing in production.

- [ ] **Step 1: Clone the data repo**

```bash
cd /tmp && rm -rf fixtures-data && gh repo clone seaninryan/fixtures-data && cd fixtures-data
```

- [ ] **Step 2: Add the file to the commit step**

In `.github/workflows/daily-check.yml`, find the line:

```yaml
          git add latest.json teams.json changes.json
```

Replace it with:

```yaml
          git add latest.json teams.json changes.json results.json
```

- [ ] **Step 3: Verify the YAML still parses**

```bash
python3 -c "import yaml,io;yaml.safe_load(io.open('.github/workflows/daily-check.yml',encoding='utf-8'));print('yaml ok')"
```

Expected: `yaml ok`

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/daily-check.yml
git commit -m "feat(check): commit the results store alongside the snapshot"
git push origin main
```

- [ ] **Step 5: Confirm on the next run**

`git add` fails the whole step if a named file does not exist, and `results.json` will not exist until the first run that writes it. Confirm the next dispatched run is green before considering this done:

```bash
gh workflow run daily-check.yml --repo seaninryan/fixtures-data
gh run list --repo seaninryan/fixtures-data --workflow daily-check.yml --limit 1
```

If the commit step fails with `pathspec 'results.json' did not match any files`, the guard is that `check.mjs` must write the file unconditionally — including when there are no results — which it does, because `mergeResults` always returns a store. Re-check Task 8 if this happens.

---

## Final verification

- [ ] **Full suite**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Build**

```bash
npm run build
```

Expected: succeeds. Catches JSX errors the tests cannot.

- [ ] **Offline pipeline end to end**

```bash
rm -rf /tmp/results-final
DATA_DIR=/tmp/results-final FIXTURES_HTML_FILE=test/fixtures/club2960-results.html node scripts/check.mjs
DATA_DIR=/tmp/results-final FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs
python3 -c "import json;d=json.load(open('/tmp/results-final/results.json'));print(len(d['results']),'results survived the second run')"
```

Expected: a non-zero count. The second run's capture has no results; the store must not shrink.

- [ ] **Manual check after deploy** — interaction coverage is manual by convention. Open the site, pick each window, confirm the Copy button puts unindented text on the clipboard, and confirm the A/B letters are present.

---

## Notes for the implementer

**The invariant that matters most.** `mergeResults` must never delete. The feed carries only the last day or two of results, so the store is the only place a result survives. Every other bug here is recoverable by re-running; this one destroys history permanently.

**Labels resolve over fixtures, never over results.** This bug has appeared three times in this codebase in other guises. `roundupLines` takes `fixtures` as its fifth argument for exactly this reason, and `ResultsTab` must pass it.

**A score of zero is a score.** `Number("")` is `0`. `parseScore` exists to stop a blank becoming a nil-all draw that was never played.

**Times are strings and results carry none.** Do not add a `time` field to a result "for completeness" — the format has no place for it, and every date in this codebase is a string precisely to avoid a UTC round-trip moving a kick-off.
