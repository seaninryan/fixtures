# FAI Connect Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second data source — the Analyticom COMET API behind FAI Connect —
so the two squads that have migrated off Galway FA appear in the same
announcement, results and form as the nineteen that have not.

**Architecture:** Network at the edge (`fetchFaiConnect.js`), everything
decision-shaped pure and unit-tested (`faiConnect.js`, `runFaiCheck.js`), exactly
as `fetchFixtures.js` / `parse.js` / `runCheck.js` already split. Scan outputs are
parallel files (`latest-fai.json`, `results-fai.json`, `changes-fai.json`);
`teams.json` is shared. FAI ids carry a `fai:` prefix, Galway ids are untouched,
so nothing existing migrates.

**Tech Stack:** Node 20, Vitest (node environment, no jsdom), React 18, Vite.

**Spec:** `docs/superpowers/specs/2026-09-17-fai-connect-scan-design.md`

> **Environment — every command in this plan needs this first:**
> ```bash
> export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
> ```
> System Node is v14 and silently breaks Vite and Vitest.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/source.js` | The `fai:` prefix and the two helpers that apply and detect it. Nothing else. |
| `src/lib/faiConnect.js` | Pure. COMET JSON → the existing Fixture / Result shapes. Season filter. |
| `src/lib/fetchFaiConnect.js` | The only new network I/O. Teams, matches, match detail. |
| `src/lib/runFaiCheck.js` | Pure. The FAI pipeline minus I/O: guards, diff, results merge. |
| `test/source.test.js`, `test/faiConnect.test.js`, `test/fetchFaiConnect.test.js`, `test/runFaiCheck.test.js` | Their tests. |

**Modified:**

| File | Change |
|---|---|
| `src/lib/window.js` | Add `seasonStart` / `seasonPredicate`; clamp `resultWindowRange` to the season. |
| `src/lib/announce.js` | `announceLines` groups the union by source under a heading. |
| `src/components/FormTab.jsx` | Filter results to the current season. |
| `src/App.jsx` | Load the three new files; pass unions down. |
| `scripts/check.mjs` | Run the FAI scan in isolation after Galway; new env vars. |
| `test/fixtures/meta.js` | Counts for the new captures. |

**Already captured** (committed in Task 1, do not re-fetch):
`test/fixtures/fai-teams.json`, `fai-matches-61270-future.json`,
`fai-matches-61270-past.json`, `fai-matches-87946-future.json`,
`fai-match-detail.json`, and `fai-capture.json` — the same data in the bundled
shape `FAI_MATCHES_FILE` reads, so an offline rehearsal needs no credential.

---

### Task 1: Commit the captured API responses

These were captured from the live API on 2026-09-17. They are the golden
captures for every test below, exactly as `club2960.html` is for `parse.js`.
The API key travels only in a request header, so no capture contains it.

**Files:**
- Commit (already on disk): `test/fixtures/fai-*.json`
- Modify: `test/fixtures/meta.js`

- [ ] **Step 1: Confirm the captures are present and key-free**

```bash
ls -1 test/fixtures/fai-*.json
grep -rl 'bTbZ' test/fixtures/ || echo "clean: no key in fixtures"
```

Expected: six files listed, then `clean: no key in fixtures`.

`fai-capture.json` is the other five bundled into the single shape
`FAI_MATCHES_FILE` reads — team list, each team's `future`/`past` payloads, and
the match details. It is derived from them, so if you ever re-capture, rebuild it
in the same commit or the offline rehearsal drifts from the unit tests.

- [ ] **Step 2: Add the counts to `test/fixtures/meta.js`**

Append to the file:

```js
// Facts about the committed FAI Connect captures, taken 2026-09-17.
// Update ONLY when re-capturing. Counts are asserted, never assumed.
export const FAI_CLUB_ID = 10671;
export const FAI_TEAM_COUNT = 25;          // includes stale/legacy squads
export const FAI_ACTIVE_TEAM_COUNT = 2;    // 61270 Juniors, 87946 Reserves
export const FAI_JUNIORS_TEAM_ID = 61270;
export const FAI_RESERVES_TEAM_ID = 87946;
export const FAI_JUNIORS_FUTURE_COUNT = 5;
export const FAI_JUNIORS_PAST_COUNT = 9;   // reaches back to 2024-09-22
export const FAI_RESERVES_FUTURE_COUNT = 3;

// Of the 9 past matches, only these 2 fall on or after 2026-08-01.
export const FAI_JUNIORS_PAST_IN_SEASON = 2;
```

- [ ] **Step 3: Commit**

```bash
git add test/fixtures/
git commit -m "test(fixtures): capture live FAI Connect API responses"
```

---

### Task 2: `seasonStart` and `seasonPredicate`

The season runs from 1 August, derived from `today` so it rolls over with no
annual edit. Lives in `window.js`, which already declares itself pure date
arithmetic over ISO strings.

**Files:**
- Modify: `src/lib/window.js`
- Test: `test/window.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/window.test.js`:

```js
import { seasonStart, seasonPredicate } from "../src/lib/window.js";

describe("seasonStart", () => {
  it("returns 1 August of the same year on or after 1 August", () => {
    expect(seasonStart("2026-08-01")).toBe("2026-08-01");
    expect(seasonStart("2026-09-17")).toBe("2026-08-01");
    expect(seasonStart("2026-12-31")).toBe("2026-08-01");
  });

  it("returns the PREVIOUS 1 August before 1 August", () => {
    expect(seasonStart("2026-07-31")).toBe("2025-08-01");
    expect(seasonStart("2026-01-01")).toBe("2025-08-01");
    expect(seasonStart("2026-05-01")).toBe("2025-08-01");
  });

  it("rolls over on the boundary day, not the day after", () => {
    expect(seasonStart("2027-07-31")).toBe("2026-08-01");
    expect(seasonStart("2027-08-01")).toBe("2027-08-01");
  });
});

describe("seasonPredicate", () => {
  it("keeps this season and drops last season", () => {
    const inSeason = seasonPredicate("2026-09-17");
    expect(inSeason({ date: "2026-09-12" })).toBe(true);
    expect(inSeason({ date: "2026-08-01" })).toBe(true);
    expect(inSeason({ date: "2026-07-31" })).toBe(false);
    expect(inSeason({ date: "2024-09-22" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/window.test.js
```

Expected: FAIL — `seasonStart is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/window.js`:

```js
// The season boundary. 1 August is early enough to precede every squad's first
// competitive game - most start in September - and late enough to sit clear of the
// previous season's tail.
//
// Derived from `today` rather than configured, so it rolls over on its own: there is no
// constant to forget to edit each August. Pure string arithmetic, like everything else
// here - "2026-09-17" >= "2026-08-01" is a correct comparison on ISO dates.
export const SEASON_START_MONTH_DAY = "08-01";

export function seasonStart(today) {
  const year = Number(String(today).slice(0, 4));
  const thisYears = `${year}-${SEASON_START_MONTH_DAY}`;
  return today >= thisYears ? thisYears : `${year - 1}-${SEASON_START_MONTH_DAY}`;
}

// For filtering a results store, which keeps every season forever - mergeResults never
// deletes. Anything dated before the boundary belongs to a season that has ended.
export function seasonPredicate(today) {
  const from = seasonStart(today);
  return (r) => r.date >= from;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/window.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window.js test/window.test.js
git commit -m "feat(window): seasonStart and seasonPredicate, a 1 August season"
```

---

### Task 3: Clamp the result windows to the season

`resultWindowRange("All")` currently returns `0000-01-01` to `9999-12-31` — all
time. Every backward window is clamped to the season start, not just "All": in
early August, "Last 14 days" would otherwise reach into last season.

**Files:**
- Modify: `src/lib/window.js:60-72`
- Test: `test/window.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/window.test.js`:

```js
describe("resultWindowRange season clamp", () => {
  it("bounds All by the season start, not all time", () => {
    expect(resultWindowRange("All", "2026-09-17"))
      .toEqual({ from: "2026-08-01", to: "9999-12-31" });
  });

  it("clamps a backward window that would cross the boundary", () => {
    // 14 days back from 5 Aug reaches 23 July - last season.
    expect(resultWindowRange("Last 14 days", "2026-08-05").from).toBe("2026-08-01");
  });

  it("leaves a window that sits inside the season alone", () => {
    expect(resultWindowRange("Last 7 days", "2026-09-17"))
      .toEqual({ from: "2026-09-11", to: "2026-09-17" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/window.test.js -t "season clamp"
```

Expected: FAIL — `All` returns `from: "0000-01-01"`.

- [ ] **Step 3: Implement**

Replace the body of `resultWindowRange` in `src/lib/window.js`:

```js
export function resultWindowRange(name, today) {
  // Every backward window is clamped to the season, not just "All". In the first days of
  // August a 14-day window reaches into July - last season - and the round-up would show
  // results the Form tab has already stopped counting. One rule, applied once.
  const from = seasonStart(today);
  if (name === "Last 7 days") return { from: max(addDays(today, -6), from), to: today };
  if (name === "Last 14 days") return { from: max(addDays(today, -13), from), to: today };
  // "All", and anything unrecognised: everything this SEASON. A stale "Last weekend"
  // reaches here now that the window is gone, and lands on the safe answer rather than
  // on an empty range.
  return { from, to: "9999-12-31" };
}

const max = (a, b) => (a >= b ? a : b);
```

- [ ] **Step 4: Run the whole suite — this changes shipped behaviour**

```bash
npm test
```

Expected: PASS. If a `results.test.js` case asserted an all-time "All" window,
update it to the season-bounded expectation and note why in the test name.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window.js test/window.test.js
git commit -m "fix(window): bound result windows by the season, not all time"
```

---

### Task 4: The `fai:` id prefix

One tiny module so the prefix has a single definition. `faiConnect.js` applies
it; `announce.js` detects it to group the announcement.

**Files:**
- Create: `src/lib/source.js`
- Test: `test/source.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/source.test.js`:

```js
import { describe, it, expect } from "vitest";
import { FAI_PREFIX, faiId, isFaiId } from "../src/lib/source.js";

describe("faiId", () => {
  it("prefixes a numeric id, as a string", () => {
    expect(faiId(52005172)).toBe("fai:52005172");
    expect(faiId("61270")).toBe("fai:61270");
  });
});

describe("isFaiId", () => {
  it("recognises a prefixed id", () => {
    expect(isFaiId("fai:61270")).toBe(true);
  });

  it("rejects a bare Galway id, whatever its type", () => {
    expect(isFaiId("235380")).toBe(false);
    expect(isFaiId(235380)).toBe(false);
  });

  it("does not throw on a missing id", () => {
    expect(isFaiId(undefined)).toBe(false);
    expect(isFaiId(null)).toBe(false);
  });
});

describe("FAI_PREFIX", () => {
  it("is the one definition both sides use", () => {
    expect(faiId(1).startsWith(FAI_PREFIX)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/source.test.js
```

Expected: FAIL — cannot resolve `../src/lib/source.js`.

- [ ] **Step 3: Implement**

Create `src/lib/source.js`:

```js
// Pure. Which system an id came from.
//
// Identity is still the league's own id - the prefix only names WHICH league. Galway FA
// ids stay bare and nothing in the data repo is renamed; only the new source carries a
// prefix. That is what lets teams.json stay a single shared file: config holds labels and
// COLOURS, and two squads sharing a key would share both.
//
// The two id ranges happen not to overlap today (Galway fixtures are 7-digit, COMET's are
// 8-digit), but nothing enforces that and both are bare numeric strings. This makes a
// collision structurally impossible rather than merely unlikely.
export const FAI_PREFIX = "fai:";

export const faiId = (id) => `${FAI_PREFIX}${id}`;

// String(), so a numeric id from a hand-edited teams.json cannot throw here.
export const isFaiId = (id) => String(id ?? "").startsWith(FAI_PREFIX);
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/source.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/source.js test/source.test.js
git commit -m "feat(source): the fai: id prefix"
```

---

### Task 5: Normalize a COMET match into a Fixture

**Files:**
- Create: `src/lib/faiConnect.js`
- Test: `test/faiConnect.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/faiConnect.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faiFixture } from "../src/lib/faiConnect.js";
import { FAI_JUNIORS_TEAM_ID } from "./fixtures/meta.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const future = load("fai-matches-61270-future.json").result;
const byId = (id) => future.find((m) => m.id === id);

describe("faiFixture", () => {
  it("converts epoch ms to the club's LOCAL kick-off, never UTC", () => {
    // 2026-09-19 13:00Z is 14:00 in Craughwell - Ireland is UTC+1 in September.
    // Storing 13:00 would move every kick-off by an hour for half the year.
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.date).toBe("2026-09-19");
    expect(f.time).toBe("14:00");
  });

  it("keeps date and time as STRINGS", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(typeof f.date).toBe("string");
    expect(typeof f.time).toBe("string");
  });

  it("prefixes both fid and teamId", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.fid).toBe("fai:52005172");
    expect(f.teamId).toBe("fai:61270");
  });

  it("reads an away game from team === 'A'", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.isHome).toBe(false);
    expect(f.ourTeam).toBe("Craughwell United Juniors");
    expect(f.opponent).toBe("Renmore FC");
  });

  it("reads a home game from team === 'H'", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID);
    expect(f.isHome).toBe(true);
    expect(f.ourTeam).toBe("Craughwell United Juniors");
    expect(f.opponent).toBe("Moyne Villa Junior A");
  });

  it("carries a non-scheduled status as the comment, so diff reports it", () => {
    const f = faiFixture(byId(52005183), FAI_JUNIORS_TEAM_ID);
    expect(f.comment).toBe("POSTPONED");
  });

  it("leaves the comment empty for an ordinary scheduled game", () => {
    expect(faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID).comment).toBe("");
  });

  it("takes the competition name, not the parent season", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.competition).toBe("Western Hygiene Supplies Brod Trill Mens Premier League");
  });

  it("defaults venue to empty - the list endpoint carries none", () => {
    expect(faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID).venue).toBe("");
  });

  it("takes a venue when a facility is supplied", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID, { place: "Craughwell" });
    expect(f.venue).toBe("Craughwell");
  });

  it("tolerates a null facility - one live fixture has one", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID, null);
    expect(f.venue).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/faiConnect.test.js
```

Expected: FAIL — cannot resolve `../src/lib/faiConnect.js`.

- [ ] **Step 3: Implement**

Create `src/lib/faiConnect.js`:

```js
// Pure. COMET match objects -> the Fixture and Result shapes the rest of this codebase
// already speaks. The counterpart of parse.js + normalize.js for the second source.
import { clubNow } from "./clock.js";
import { faiId } from "./source.js";

// `match.team` is "H" or "A" RELATIVE TO THE REQUESTED TEAM, which is why every function
// here takes the team id it was fetched for. It is not derivable from the match alone in
// a derby between two of the club's own sides.
const isHomeSide = (match) => match.team === "H";

// A status worth telling someone about. SCHEDULED is the ordinary case and PLAYED is
// already visible as a result, so neither is news; anything else - POSTPONED today, and
// whatever else COMET adds later - rides out through the existing `comment` diff path
// rather than needing a new change type. The notes warned the observed statuses are not
// the whole set, so this is a denylist of the boring ones, never an allowlist.
const QUIET_STATUSES = new Set(["SCHEDULED", "PLAYED"]);

export function statusComment(liveStatus) {
  const s = String(liveStatus ?? "").trim();
  return s && !QUIET_STATUSES.has(s) ? s : "";
}

// `facility` comes from a SEPARATE call - the paginated list carries no venue at all.
// It is optional because it is only fetched for home fixtures: formatFixtureLine names a
// ground only for a home game played elsewhere, so an away venue would be a request whose
// answer is never rendered. One live fixture returns a null facility, so absence is a real
// path, not a defensive flourish.
export function faiFixture(match, teamId, facility) {
  const isHome = isHomeSide(match);
  const ours = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  // dateTimeUTC is epoch MILLISECONDS. clubNow returns the club's local date and time as
  // STRINGS - this is the only new place a Date is constructed, and it is handed straight
  // to clock.js rather than unwrapped here. A UTC round-trip moves every kick-off by an
  // hour for half the year.
  const { date, time } = clubNow(new Date(match.dateTimeUTC));
  return {
    fid: faiId(match.id),
    teamId: faiId(teamId),
    date,
    time,
    isHome,
    ourTeam: ours.name,
    opponent: opponent.name,
    venue: facility?.place ?? "",
    competition: match.competition?.name ?? "",
    comment: statusComment(match.liveStatus),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/faiConnect.test.js
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/faiConnect.js test/faiConnect.test.js
git commit -m "feat(faiConnect): normalize a COMET match into a Fixture"
```

---

### Task 6: Normalize a played match into a Result, and filter by season

**Files:**
- Modify: `src/lib/faiConnect.js`
- Test: `test/faiConnect.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/faiConnect.test.js`:

```js
import { faiResult, faiResults } from "../src/lib/faiConnect.js";
import { FAI_JUNIORS_PAST_COUNT, FAI_JUNIORS_PAST_IN_SEASON } from "./fixtures/meta.js";

const past = load("fai-matches-61270-past.json").result;
const pastById = (id) => past.find((m) => m.id === id);

describe("faiResult", () => {
  it("stores a home defeat from OUR point of view", () => {
    // 52005166: Craughwell 0 - 4 Mervue, at home.
    const r = faiResult(pastById(52005166), FAI_JUNIORS_TEAM_ID);
    expect(r.isHome).toBe(true);
    expect(r.ourScore).toBe(0);
    expect(r.theirScore).toBe(4);
  });

  it("flips the scores for an away game", () => {
    // 52005161: Salthill Devon 8 - 1 Craughwell, away. Ours is the 1.
    const r = faiResult(pastById(52005161), FAI_JUNIORS_TEAM_ID);
    expect(r.isHome).toBe(false);
    expect(r.ourScore).toBe(1);
    expect(r.theirScore).toBe(8);
  });

  it("keeps a nil-all as real zeroes, not as missing", () => {
    // 27609861: 0-0. Number("") is 0, so a blank must never reach here as a score.
    const r = faiResult(pastById(27609861), FAI_JUNIORS_TEAM_ID);
    expect(r.ourScore).toBe(0);
    expect(r.theirScore).toBe(0);
  });

  it("does NOT store the W/D/L field - the scores already say who won", () => {
    expect(faiResult(pastById(52005166), FAI_JUNIORS_TEAM_ID).result).toBeUndefined();
  });
});

describe("faiResults", () => {
  it("drops everything before the season start", () => {
    const { results } = faiResults(past, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(past).toHaveLength(FAI_JUNIORS_PAST_COUNT);
    expect(results).toHaveLength(FAI_JUNIORS_PAST_IN_SEASON);
    expect(results.map((r) => r.fid)).toEqual(["fai:52005161", "fai:52005166"]);
  });

  it("keeps the 2024 cup run OUT - mergeResults never deletes, so this is permanent", () => {
    const { results } = faiResults(past, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(results.some((r) => r.date < "2026-08-01")).toBe(false);
  });

  it("admits last season's matches when read from within last season", () => {
    const { results } = faiResults(past, FAI_JUNIORS_TEAM_ID, "2025-03-01");
    expect(results.map((r) => r.date)).toEqual(["2024-09-22", "2024-10-13",
      "2024-11-03", "2024-12-01", "2025-01-12"]);
  });

  it("skips a match with no score rather than inventing a draw", () => {
    const unplayed = [{ ...pastById(52005166), homeTeamResult: null, awayTeamResult: null }];
    const { results, errors } = faiResults(unplayed, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/fai:52005166/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/faiConnect.test.js -t "faiResult"
```

Expected: FAIL — `faiResult is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/faiConnect.js`:

```js
import { sortResults } from "./normalize.js";
import { seasonPredicate } from "./window.js";

// `.current` is the final score; `.regular` and `.half` are the same match at other
// moments and are deliberately ignored. A missing block means the match has no score yet,
// which is not the same as nil-all - hence null rather than 0.
const scoreOf = (side) => (typeof side?.current === "number" ? side.current : null);

export function faiResult(match, teamId) {
  const isHome = isHomeSide(match);
  const ours = isHome ? match.homeTeam : match.awayTeam;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const { date } = clubNow(new Date(match.dateTimeUTC));
  const home = scoreOf(match.homeTeamResult);
  const away = scoreOf(match.awayTeamResult);
  return {
    fid: faiId(match.id),
    teamId: faiId(teamId),
    date,
    isHome,
    ourTeam: ours.name,
    opponent: opponent.name,
    // Stored from OUR point of view with isHome recording which side we were, exactly as
    // normalizeResult does, so a stored result reads correctly on its own.
    ourScore: isHome ? home : away,
    theirScore: isHome ? away : home,
    venue: "",
    competition: match.competition?.name ?? "",
  };
}

// -> {results, errors}. `today` decides the season; see window.js seasonStart.
//
// THE SEASON FILTER IS THE POINT OF THIS FUNCTION. The past endpoint returns TWO YEARS of
// history in one call - the Juniors' nine past matches reach back to 2024-09-22 - while
// the Galway feed only ever carried the last day or two. mergeResults adds and updates but
// NEVER deletes, so a stale match admitted once is permanent without hand-editing the data
// repo. Filtering here, on ingest, is what keeps a 2024 cup run out of this season's form.
export function faiResults(matches, teamId, today) {
  const inSeason = seasonPredicate(today);
  const results = [];
  const errors = [];
  for (const match of matches ?? []) {
    const r = faiResult(match, teamId);
    if (!inSeason(r)) continue;
    if (r.ourScore === null || r.theirScore === null) {
      errors.push(`${r.fid}: no score on a past match (${r.ourTeam} v ${r.opponent})`);
      continue;
    }
    results.push(r);
  }
  return { results: sortResults(results), errors };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/faiConnect.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/faiConnect.js test/faiConnect.test.js
git commit -m "feat(faiConnect): results, filtered to the current season on ingest"
```

---

### Task 7: The network module

**Files:**
- Create: `src/lib/fetchFaiConnect.js`
- Test: `test/fetchFaiConnect.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/fetchFaiConnect.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import {
  FAI_BASE_URL, FAI_USER_AGENT, fetchTeams, fetchMatches, fetchMatchDetail,
} from "../src/lib/fetchFaiConnect.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const opts = { apiKey: "test-key" };

describe("fetchTeams", () => {
  it("sends the api_key and an explicit User-Agent", async () => {
    const fetchImpl = vi.fn(async () => ok([{ id: 1 }]));
    await fetchTeams(10671, { ...opts, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${FAI_BASE_URL}/api/live/team/10671/teams`);
    expect(init.headers.api_key).toBe("test-key");
    // A DEFAULT client UA is not safe here: Python-urllib/3.12 gets a 403 from this
    // host. Never rely on whatever the runtime happens to send.
    expect(init.headers["User-Agent"]).toBe(FAI_USER_AGENT);
  });

  it("throws on a non-2xx rather than returning nothing", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    await expect(fetchTeams(10671, { ...opts, fetchImpl })).rejects.toThrow(/403/);
  });
});

describe("fetchMatches", () => {
  it("asks for the documented path with a large page", async () => {
    const fetchImpl = vi.fn(async () => ok({ result: [], size: 0 }));
    await fetchMatches(61270, "future", { ...opts, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${FAI_BASE_URL}/api/live/team/61270/matches/paginated/future/1?page=1&pageSize=100`,
    );
  });

  it("returns the result array", async () => {
    const fetchImpl = vi.fn(async () => ok({ result: [{ id: 7 }], size: 1 }));
    expect(await fetchMatches(61270, "past", { ...opts, fetchImpl })).toEqual([{ id: 7 }]);
  });

  it("THROWS when the page is short of `size` rather than reading it as complete", async () => {
    // `size` is the TOTAL, not the page length - verified against the live API. A partial
    // list read as complete is a fixture list that shrank for no reason, which is exactly
    // what this project refuses to write.
    const fetchImpl = vi.fn(async () => ok({ result: [{ id: 1 }], size: 9 }));
    await expect(fetchMatches(61270, "past", { ...opts, fetchImpl }))
      .rejects.toThrow(/1 of 9/);
  });

  it("rejects a period it does not know", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchMatches(61270, "sideways", { ...opts, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchMatchDetail", () => {
  it("returns the facility, which the list endpoint does not carry", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 1, facility: { place: "Craughwell" } }));
    expect(await fetchMatchDetail(1, { ...opts, fetchImpl })).toEqual({ place: "Craughwell" });
  });

  it("returns null when there is no facility, rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 1, facility: null }));
    expect(await fetchMatchDetail(1, { ...opts, fetchImpl })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/fetchFaiConnect.test.js
```

Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

Create `src/lib/fetchFaiConnect.js`:

```js
// The second module in this project that touches the outside world.
//
// Three things here are load-bearing:
//   1. THE api_key HEADER IS REQUIRED. Without it the host answers 403. It is a
//      credential observed in FAI Connect's own app traffic - server-side only, never in
//      browser code, never committed. See the spec's security note.
//   2. THERE IS A USER-AGENT DENYLIST. `Python-urllib/3.12` gets a 403 while curl's
//      default, okhttp, `node` and a browser UA all get 200. The same class of trap as
//      the CloudFront rule in fetchFixtures.js, so it gets the same treatment: send an
//      explicit UA rather than trusting whatever the runtime happens to use.
//   3. `size` IS THE TOTAL, NOT THE PAGE LENGTH. Verified - pageSize=2 returns size=9
//      with two results. So a short page is detectable, and detecting it matters: a
//      truncated list read as complete looks exactly like fixtures being cancelled.
//
// Like fetchFixtures, this deliberately does NOT judge an empty body. Zero teams or zero
// matches is runFaiCheck's decision, since it owns the abort rules.
export const FAI_BASE_URL = "https://api-fai.analyticom.de";

// Identifies this scan honestly rather than impersonating the mobile app. Any UA outside
// the denylist is accepted; what matters is that one is sent at all.
export const FAI_USER_AGENT = "craughwell-fixtures/1.0 (+https://github.com/seaninryan/fixtures)";

export const FAI_PAGE_SIZE = 100;
export const FAI_PERIODS = ["future", "past"];

async function getJson(url, { apiKey, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(url, {
    headers: {
      api_key: apiKey,
      "accept-language": "en",
      "User-Agent": FAI_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`FAI Connect fetch failed: HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchTeams(clubId, opts) {
  return getJson(`${FAI_BASE_URL}/api/live/team/${clubId}/teams`, opts);
}

// The trailing `/1` is inert - verified that /0, /2 and /3 return identical data. It is
// sent because the app sends it, not because anything depends on it.
export async function fetchMatches(teamId, period, opts) {
  if (!FAI_PERIODS.includes(period)) {
    throw new Error(`unknown period "${period}" (expected ${FAI_PERIODS.join(" or ")})`);
  }
  const url = `${FAI_BASE_URL}/api/live/team/${teamId}/matches/paginated/${period}/1`
    + `?page=1&pageSize=${FAI_PAGE_SIZE}`;
  const body = await getJson(url, opts);
  const result = body?.result ?? [];
  const size = body?.size ?? result.length;
  // Louder than paginating on. A club with more than 100 matches in one period is a
  // season nobody has played, so this firing means the contract changed - and guessing
  // at a second page would hide that behind a list that is silently missing games.
  if (result.length < size) {
    throw new Error(
      `FAI Connect returned a partial page for team ${teamId} ${period}: `
      + `${result.length} of ${size}`,
    );
  }
  return result;
}

// Undocumented - found by probing, not in the captured app traffic, so it is the lowest
// confidence call here. It exists only to supply a venue, and a venue is the one field
// the fixtures can publish without, so a caller treats a failure as "no venue".
export async function fetchMatchDetail(matchId, opts) {
  const body = await getJson(`${FAI_BASE_URL}/api/live/match/${matchId}`, opts);
  return body?.facility ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/fetchFaiConnect.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchFaiConnect.js test/fetchFaiConnect.test.js
git commit -m "feat(fetchFaiConnect): the FAI Connect API client"
```

---

### Task 8: `runFaiCheck` — the pipeline and its guards

**Files:**
- Create: `src/lib/runFaiCheck.js`
- Test: `test/runFaiCheck.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/runFaiCheck.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runFaiCheck } from "../src/lib/runFaiCheck.js";
import { FAI_ACTIVE_TEAM_COUNT, FAI_TEAM_COUNT } from "./fixtures/meta.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const TEAMS = load("fai-teams.json");
const JUNIORS_FUTURE = load("fai-matches-61270-future.json").result;
const JUNIORS_PAST = load("fai-matches-61270-past.json").result;
const RESERVES_FUTURE = load("fai-matches-87946-future.json").result;

// What check.mjs hands in: one entry per team that returned anything.
const MATCHES = {
  61270: { future: JUNIORS_FUTURE, past: JUNIORS_PAST },
  87946: { future: RESERVES_FUTURE, past: [] },
};

const base = {
  teams: TEAMS,
  matches: MATCHES,
  facilities: {},
  previous: null,
  previousResults: null,
  config: null,
  now: "2026-09-17T11:00:00.000Z",
  today: "2026-09-17",
};

describe("runFaiCheck", () => {
  it("keeps only the squads that actually have matches", () => {
    const out = runFaiCheck(base);
    expect(TEAMS).toHaveLength(FAI_TEAM_COUNT);
    const squads = new Set(out.snapshot.fixtures.map((f) => f.teamId));
    expect(squads.size).toBe(FAI_ACTIVE_TEAM_COUNT);
    expect([...squads].sort()).toEqual(["fai:61270", "fai:87946"]);
  });

  it("orders fixtures by date, then time, then fid", () => {
    const { fixtures } = runFaiCheck(base).snapshot;
    const keys = fixtures.map((f) => `${f.date} ${f.time} ${f.fid}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("reports NO changes on a first run", () => {
    const out = runFaiCheck(base);
    expect(out.firstRun).toBe(true);
    expect(out.changes).toEqual([]);
    expect(out.report).toBeNull();
  });

  it("aborts when team discovery comes back empty", () => {
    // Broken auth or a moved endpoint - never a club with no teams.
    expect(() => runFaiCheck({ ...base, teams: [] })).toThrow(/no teams/i);
  });

  it("aborts when every team goes quiet but the previous run had fixtures", () => {
    const previous = runFaiCheck(base).snapshot;
    expect(() => runFaiCheck({ ...base, matches: {}, previous }))
      .toThrow(/no fixtures/i);
  });

  it("does NOT abort on an empty first run - the club may not have migrated yet", () => {
    const out = runFaiCheck({ ...base, matches: {} });
    expect(out.snapshot.fixtures).toEqual([]);
  });

  it("does NOT apply the 50% shrink rule - playing games is not a collapse", () => {
    // The Juniors have 5 upcoming fixtures. Playing three in a fortnight halves the list
    // and is entirely ordinary at this scale, which is why runCheck's guard is not reused.
    const previous = runFaiCheck(base).snapshot;
    const thinned = { 61270: { future: JUNIORS_FUTURE.slice(3), past: [] } };
    const out = runFaiCheck({ ...base, matches: thinned, previous });
    expect(out.snapshot.fixtures).toHaveLength(2);
  });

  it("stores only this season's results", () => {
    const out = runFaiCheck(base);
    expect(out.results.results.map((r) => r.fid)).toEqual(["fai:52005161", "fai:52005166"]);
  });

  it("never drops a stored result that has left the feed", () => {
    const previousResults = {
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      results: [{
        fid: "fai:99", teamId: "fai:61270", date: "2026-08-20", isHome: true,
        ourTeam: "Craughwell United Juniors", opponent: "Someone", ourScore: 1,
        theirScore: 0, venue: "", competition: "Cup",
      }],
    };
    const out = runFaiCheck({ ...base, previousResults });
    expect(out.results.results.map((r) => r.fid)).toContain("fai:99");
  });

  it("seeds config for the new squads without touching an existing entry", () => {
    const config = { version: 1, teams: { 235380: { label: "U14A Boys", color: "#123456" } } };
    const out = runFaiCheck({ ...base, config });
    expect(out.config.teams["235380"]).toEqual({ label: "U14A Boys", color: "#123456" });
    expect(out.config.teams["fai:61270"]).toBeDefined();
  });

  it("reports a postponement as a change against a clean previous run", () => {
    const clean = JUNIORS_FUTURE.map((m) =>
      m.id === 52005183 ? { ...m, liveStatus: "SCHEDULED" } : m);
    const previous = runFaiCheck({ ...base, matches: { 61270: { future: clean, past: [] } } }).snapshot;
    const out = runFaiCheck({ ...base, previous });
    expect(out.changes.some((c) => c.fid === "fai:52005183")).toBe(true);
  });

  it("attaches a venue from the facilities it was given", () => {
    const out = runFaiCheck({ ...base, facilities: { 52005175: { place: "Craughwell" } } });
    const f = out.snapshot.fixtures.find((x) => x.fid === "fai:52005175");
    expect(f.venue).toBe("Craughwell");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/runFaiCheck.test.js
```

Expected: FAIL — cannot resolve `../src/lib/runFaiCheck.js`.

- [ ] **Step 3: Implement**

Create `src/lib/runFaiCheck.js`:

```js
// Pure. The FAI Connect pipeline minus I/O, mirroring runCheck.js.
//
// The safety rules live here rather than in the script for the same reason they do
// there: they are the part that must be tested, and a script that talks to the network
// and the filesystem is the hardest place to test anything.
import { faiFixture, faiResults } from "./faiConnect.js";
import { sortFixtures } from "./normalize.js";
import { mergeResults } from "./results.js";
import { diff } from "./diff.js";
import { seedConfig, resolveTeams } from "./teams.js";
import { changeReport } from "./changeReport.js";

export const FAI_SNAPSHOT_VERSION = 1;

// `matches` is {teamId: {future, past}} and `facilities` is {matchId: facility|null},
// both assembled by the caller - this module performs no I/O.
export function runFaiCheck({
  teams, matches, facilities = {}, previous, previousResults, config,
  now, today, history = [], siteUrl,
}) {
  // THE FIRST SAFETY RULE. An empty team list is a broken api_key, a User-Agent that has
  // been added to the denylist, or a moved endpoint. It is never a club with no teams.
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("aborting: FAI Connect returned no teams for the club");
  }

  const fixtures = [];
  const rawResults = [];
  const errors = [];
  for (const team of teams) {
    // Most of the 25 teams are stale entries that have not played in two years. A team
    // with no matches is skipped, not reported: that is the ordinary case during the
    // migration, not a failure.
    const found = matches?.[team.id];
    if (!found) continue;
    for (const match of found.future ?? []) {
      fixtures.push(faiFixture(match, team.id, facilities[match.id]));
    }
    const { results, errors: resultErrors } = faiResults(found.past, team.id, today);
    rawResults.push(...results);
    errors.push(...resultErrors);
  }

  // THE SECOND SAFETY RULE, and the counterpart of runCheck's zero-fixtures abort. Every
  // team going quiet at once is what a blocked or rerouted API looks like; writing that
  // snapshot would report both squads' fixtures as cancelled.
  //
  // Conditioned on the PREVIOUS snapshot having had fixtures, because an empty result is
  // legitimate before any squad has migrated - and will be again at the end of a season.
  // runCheck's 50% shrink rule is deliberately NOT reused: the Juniors have five upcoming
  // fixtures, so playing three in a fortnight would trip it. At this scale the guard would
  // cry wolf far more often than it caught anything.
  const before = Array.isArray(previous?.fixtures) ? previous.fixtures.length : 0;
  if (fixtures.length === 0 && before > 0) {
    throw new Error(
      `aborting: no fixtures from FAI Connect, but the previous snapshot had ${before}`,
    );
  }

  const snapshot = {
    version: FAI_SNAPSHOT_VERSION,
    fetchedAt: now,
    fixtures: sortFixtures(fixtures),
  };

  const results = mergeResults(previousResults, rawResults, now);
  const nextConfig = seedConfig(snapshot.fixtures, config);
  const { unknown } = resolveTeams(snapshot.fixtures, nextConfig);

  // A first run has nothing to compare against. Diffing against an empty list would call
  // both squads' whole seasons "new" and email all of it.
  const firstRun = !previous || !Array.isArray(previous.fixtures);
  const changes = firstRun ? [] : diff(previous.fixtures, snapshot.fixtures, today);
  const report = changeReport(changes, nextConfig, {
    unknown, siteUrl, fixtures: snapshot.fixtures,
  });

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
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run test/runFaiCheck.test.js
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runFaiCheck.js test/runFaiCheck.test.js
git commit -m "feat(runFaiCheck): the FAI pipeline, with guards sized for two squads"
```

---

### Task 9: Group the announcement by source

`announceLines` takes the **union** of both fixture lists in **one** call, so
labels resolve over everything. It then groups by id prefix.

**Files:**
- Modify: `src/lib/announce.js:66-115`
- Test: `test/announce.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/announce.test.js`:

```js
import { FAI_SECTION_HEADING } from "../src/lib/announce.js";

const gfaFixture = {
  fid: "6946083", teamId: "235380", date: "2026-09-19", time: "10:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Salthill Devon", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "",
};
const faiFix = {
  fid: "fai:52005172", teamId: "fai:61270", date: "2026-09-19", time: "14:00",
  isHome: false, ourTeam: "Craughwell United Juniors", opponent: "Renmore FC",
  venue: "", competition: "Western Hygiene Supplies Brod Trill Mens Premier League",
  comment: "",
};

describe("announceLines source grouping", () => {
  const config = { version: 1, teams: {} };

  it("puts the FAI squads after a heading of their own", () => {
    const lines = announceLines([gfaFixture, faiFix], config, "All", "2026-09-19");
    const kinds = lines.map((l) => l.kind);
    const heading = kinds.indexOf("section");
    expect(heading).toBeGreaterThan(-1);
    const texts = lines.map((l) => l.text);
    expect(texts[heading]).toBe(FAI_SECTION_HEADING);
    // Galway fixture before the heading, FAI fixture after it.
    expect(texts.findIndex((t) => t.includes("Salthill Devon"))).toBeLessThan(heading);
    expect(texts.findIndex((t) => t.includes("Renmore FC"))).toBeGreaterThan(heading);
  });

  it("emits NO heading when only Galway squads play - today's ordinary weekend", () => {
    const lines = announceLines([gfaFixture], config, "All", "2026-09-19");
    expect(lines.some((l) => l.kind === "section")).toBe(false);
  });

  it("emits NO heading when only FAI squads play", () => {
    const lines = announceLines([faiFix], config, "All", "2026-09-19");
    expect(lines.some((l) => l.kind === "section")).toBe(false);
  });

  it("resolves labels over the WHOLE union, never per section", () => {
    // Two U14 Boys sides means the A/B letter must appear. Adding an FAI squad must not
    // change that count - and rendering each section with its own resolveTeams call would.
    const a = { ...gfaFixture, teamId: "1", ourTeam: "Craughwell United" };
    const b = { ...gfaFixture, fid: "6946084", teamId: "2", ourTeam: "Craughwell United B" };
    const lines = announceLines([a, b, faiFix], config, "All", "2026-09-19");
    const text = lines.map((l) => l.text).join("\n");
    expect(text).toContain("U14A Boys");
    expect(text).toContain("U14B Boys");
  });

  it("restarts day headings inside the FAI section", () => {
    const lines = announceLines([gfaFixture, faiFix], config, "All", "2026-09-19");
    const days = lines.filter((l) => l.kind === "day").map((l) => l.text);
    expect(days).toEqual(["SATURDAY 19 SEPTEMBER", "SATURDAY 19 SEPTEMBER"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run test/announce.test.js -t "source grouping"
```

Expected: FAIL — `FAI_SECTION_HEADING` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/announce.js`, add the import and the constant near the top:

```js
import { isFaiId } from "./source.js";

// The heading above the squads whose league has migrated to FAI Connect.
//
// It names the SQUADS, not the system: "FAI CONNECT" would leak plumbing into a message
// pasted into a club WhatsApp group. Today the migrated squads are the two adult men's
// sides, which is what this says. As youth squads migrate the wording stops being true
// and must be revisited - which is why the heading is suppressed entirely unless BOTH
// sources have fixtures in the window, so it disappears of its own accord at the end of
// the migration rather than becoming quietly wrong.
export const FAI_SECTION_HEADING = "ADULT SQUADS";
```

Then replace the rendering loop at the end of `announceLines`. Where it
currently reads:

```js
  let currentDay = null;
  for (const fixture of chosen) {
    ...
  }

  return lines;
```

substitute:

```js
  // Grouped by source, NOT resolved per source. `labels` above came from resolveTeams
  // over every fixture in the union, which is the whole reason this is one call and not
  // two: deriveLabels decides whether to show the A/B letter by COUNTING the club's
  // squads at that age and gender in the list it is given, so announcing each source
  // separately would silently rename "U14A Boys" to "U14 Boys". That bug has appeared
  // three times in this codebase; grouping after the fact is what keeps it away.
  const galway = chosen.filter((f) => !isFaiId(f.teamId));
  const fai = chosen.filter((f) => isFaiId(f.teamId));

  const pushSection = (section, heading) => {
    if (section.length === 0) return;
    if (heading) {
      lines.push({ kind: "blank", text: "" });
      lines.push({ kind: "section", text: heading });
    }
    let currentDay = null;
    for (const fixture of section) {
      if (fixture.date !== currentDay) {
        currentDay = fixture.date;
        lines.push({ kind: "blank", text: "" });
        lines.push({ kind: "day", text: dayHeading(currentDay) });
      }
      lines.push({
        kind: "fixture",
        text: formatFixtureLine(fixture, labels),
        teamId: fixture.teamId,
        color: squadColor(fixture.teamId, config).bg,
      });
    }
  };

  // No heading when only one source has fixtures: an ordinary youth-only weekend must
  // read exactly as it did before this feature existed.
  const both = galway.length > 0 && fai.length > 0;
  pushSection(galway, null);
  pushSection(fai, both ? FAI_SECTION_HEADING : null);

  return lines;
```

- [ ] **Step 4: Run the whole suite — this touches shipped output**

```bash
npm test
```

Expected: PASS. Existing `announce` tests must be untouched, because a
Galway-only list takes the `pushSection(galway, null)` path and renders
identically.

- [ ] **Step 5: Commit**

```bash
git add src/lib/announce.js test/announce.test.js
git commit -m "feat(announce): group the union by source under one heading"
```

---

### Task 10: Season-filter the Form tab

**Files:**
- Modify: `src/components/FormTab.jsx:39-80`
- Test: `test/form.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/form.test.js`:

```js
import { seasonPredicate } from "../src/lib/window.js";

describe("squadRecords over a season boundary", () => {
  const config = { version: 1, teams: {} };
  const result = (fid, date, ourScore, theirScore) => ({
    fid, teamId: "fai:61270", date, isHome: true,
    ourTeam: "Craughwell United Juniors", opponent: "Someone",
    ourScore, theirScore, venue: "", competition: "League",
  });

  it("counts only the current season once the caller filters", () => {
    const all = [
      result("a", "2024-09-22", 4, 2),   // last-last season
      result("b", "2025-01-12", 1, 3),   // last season
      result("c", "2026-09-12", 0, 4),   // this season
    ];
    const filtered = all.filter(seasonPredicate("2026-09-17"));
    const [record] = squadRecords(filtered, [], config);
    expect(record.played).toBe(1);
    expect(record.lost).toBe(1);
    expect(record.won).toBe(0);
  });

  it("would otherwise carry two dead seasons into the record", () => {
    // Guards the reason the filter exists: this is what the Form tab showed before it.
    const all = [
      result("a", "2024-09-22", 4, 2),
      result("b", "2025-01-12", 1, 3),
      result("c", "2026-09-12", 0, 4),
    ];
    expect(squadRecords(all, [], config)[0].played).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it passes already**

```bash
npx vitest run test/form.test.js -t "season boundary"
```

Expected: PASS. `squadRecords` is unchanged — these tests pin the contract that
filtering happens at the call site, which is what the next step wires up.

- [ ] **Step 3: Apply the filter in `FormTab.jsx`**

In `src/components/FormTab.jsx`, add the import:

```js
import { seasonPredicate } from "../lib/window.js";
```

Then replace this exact line in `src/components/FormTab.jsx`:

```js
  const stored = results?.results ?? [];
```

with:

```js
  // The results store keeps every season forever - mergeResults never deletes - so a
  // squad's record and chart must be bounded here or, from 1 August, they silently start
  // carrying last season's games into this season's form. Applied ONCE, above both
  // squadRecords and weekSeries, so the table and the chart can never disagree about
  // which season they are showing.
  const allStored = results?.results ?? [];
  const stored = allStored.filter(seasonPredicate(today));
```

Nothing else in the component changes: `squadRecords(stored, ...)`,
`weekAxis(stored, ...)` and `weekSeries(stored, ...)` all already read `stored`.

- [ ] **Step 4: Run the suite and the build**

```bash
npm test && npm run build
```

Expected: PASS, then a clean build. The build is what catches JSX errors the
tests cannot.

- [ ] **Step 5: Commit**

```bash
git add src/components/FormTab.jsx test/form.test.js
git commit -m "fix(form): bound records and chart by the season"
```

---

### Task 11: Run the FAI scan from `check.mjs`

**Files:**
- Modify: `scripts/check.mjs`

- [ ] **Step 1: Add the imports and config**

Near the existing imports in `scripts/check.mjs`:

```js
import { fetchTeams, fetchMatches, fetchMatchDetail } from "../src/lib/fetchFaiConnect.js";
import { runFaiCheck } from "../src/lib/runFaiCheck.js";
```

Below the existing `SITE_URL` constant:

```js
// The FAI Connect scan. The club is migrating onto this system league by league, so this
// grows as the Galway FA scrape shrinks.
//
// The key is a CREDENTIAL observed in the FAI Connect app's own traffic. It lives only in
// the environment - never in this repo, never in the data repo's JSON, never in browser
// code. The API sends no CORS headers anyway, so the site could not call it if it wanted to.
const FAI_API_KEY = process.env.FAI_CONNECT_API_KEY;
const FAI_CLUB_ID = process.env.FAI_CONNECT_CLUB_ID || "10671";
```

- [ ] **Step 2: Add the collector**

Above `main()`:

```js
// Everything the FAI scan needs from the network, gathered into the plain objects
// runFaiCheck consumes. Kept here rather than in a lib module for the same reason the
// Galway fetch is: this is I/O, and runFaiCheck must stay pure and testable.
async function collectFai(opts) {
  const teams = await fetchTeams(FAI_CLUB_ID, opts);
  const matches = {};
  for (const team of teams) {
    const [future, past] = await Promise.all([
      fetchMatches(team.id, "future", opts),
      fetchMatches(team.id, "past", opts),
    ]);
    // Most of the 25 teams are stale entries that have not played in two years. Recording
    // only the ones with matches keeps the snapshot to the squads that have migrated.
    if (future.length || past.length) matches[team.id] = { future, past };
  }

  // Venue comes from a SEPARATE call per match, and only for HOME fixtures:
  // formatFixtureLine names a ground only for a home game played somewhere other than
  // Craughwell, so an away venue is a request whose answer is never rendered.
  const facilities = {};
  const home = Object.values(matches).flatMap((m) => m.future).filter((m) => m.team === "H");
  for (const match of home) {
    // A venue is the one field a fixture can publish without, and this endpoint is
    // undocumented - so a failure here degrades to "no venue" instead of failing the scan.
    try {
      facilities[match.id] = await fetchMatchDetail(match.id, opts);
    } catch (err) {
      console.warn(`fai: no venue for match ${match.id} (${err.message})`);
    }
  }
  return { teams, matches, facilities };
}

// Returns the report to email, or null. NEVER throws: the caller decides what a failure
// means, and the whole point of this scan being separate is that its failure must not
// stop the Galway snapshot being written.
async function runFai({ now, today }) {
  if (!FAI_API_KEY) {
    // Loud, and fatal to the exit code, but not to the Galway write. A silently skipped
    // scan would leave latest-fai.json frozen with nobody noticing.
    console.error("FAI_CONNECT_API_KEY is not set - skipping the FAI Connect scan");
    return { report: null, failed: true };
  }
  const { teams, matches, facilities } = await collectFai({ apiKey: FAI_API_KEY });
  const out = runFaiCheck({
    teams,
    matches,
    facilities,
    previous: readJson("latest-fai.json", null),
    previousResults: readJson("results-fai.json", null),
    config: readJson("teams.json", null),
    history: readJson("changes-fai.json", []),
    now,
    today,
    siteUrl: SITE_URL,
  });

  for (const err of out.errors) console.warn(`fai warning: ${err}`);

  writeJson("latest-fai.json", out.snapshot);
  writeJson("results-fai.json", out.results);
  writeJson("changes-fai.json", out.history.slice(0, HISTORY_LIMIT));
  // teams.json is SHARED with the Galway scan and is written by it, seeded from the union
  // of both fixture lists. Writing it here too would have the second scan overwrite the
  // first's seeding with a config that has never seen a Galway squad.
  console.log(`fai: ${out.snapshot.fixtures.length} fixtures, ${out.changes.length} changes, `
    + `${out.results.results.length} results stored`);
  if (out.unknown.length) console.log(`fai: squads still needing a label: ${out.unknown.join(", ")}`);
  return { report: out.report, failed: false };
}
```

- [ ] **Step 3: Add the offline path**

`FAI_MATCHES_FILE` is the counterpart of `FIXTURES_HTML_FILE` and exists for the
same reason: rehearsing the whole pipeline without touching the live API. Add
above `collectFai`:

```js
// One captured run: the team list, each team's future/past payloads, and the match
// details, all keyed by id. The counterpart of FIXTURES_HTML_FILE - it exercises
// everything below the network without a key and without a request.
const FAI_MATCHES_FILE = process.env.FAI_MATCHES_FILE;

function readFaiCapture(path) {
  const capture = JSON.parse(readFileSync(path, "utf8"));
  const matches = {};
  for (const [teamId, periods] of Object.entries(capture.matches ?? {})) {
    matches[teamId] = { future: periods.future?.result ?? [], past: periods.past?.result ?? [] };
  }
  const facilities = {};
  for (const [matchId, detail] of Object.entries(capture.details ?? {})) {
    facilities[matchId] = detail?.facility ?? null;
  }
  return { teams: capture.teams ?? [], matches, facilities };
}
```

and take that branch at the top of `runFai`, before the key check, so an offline
rehearsal needs no credential:

```js
  if (FAI_MATCHES_FILE) {
    const { teams, matches, facilities } = readFaiCapture(FAI_MATCHES_FILE);
    return { report: finishFai({ teams, matches, facilities, now, today }), failed: false };
  }
```

Extract the body of `runFai` from `runFaiCheck(...)` onward into
`finishFai({teams, matches, facilities, now, today})`, returning `out.report`, so
the live and captured paths share it rather than duplicating the writes.

- [ ] **Step 4: Wire it into `main()`**

`teams.json` must be seeded from **both** fixture lists, so the Galway
`runCheck` call now takes the union. In `main()`, after the existing `runCheck`
block and before the writes, replace the `writeJson("teams.json", out.config)`
call and add the FAI run at the end:

```js
  // Seeded from the UNION so one shared teams.json covers both sources - and so a colour
  // handed to a Galway squad is never handed to an FAI squad as well. seedConfig walks the
  // palette taking the first UNUSED colour, which only works if it sees every squad.
  const faiPrevious = readJson("latest-fai.json", null);
  const allFixtures = [...out.snapshot.fixtures, ...(faiPrevious?.fixtures ?? [])];
  writeJson("teams.json", seedConfig(allFixtures, readJson("teams.json", null)));
```

with `import { seedConfig } from "../src/lib/teams.js";` added at the top. Then,
at the end of `main()`, after the existing email send:

```js
  // Isolated ON PURPOSE. A third-party API serving two squads must not stop the other
  // nineteen updating - but a failure still has to be loud, so it sets the exit code
  // rather than being swallowed. latest-fai.json is left exactly as it was, so the site
  // shows yesterday's FAI fixtures with an honest fetchedAt rather than an empty list
  // that would read as "every adult fixture was cancelled".
  let faiFailed = false;
  try {
    const fai = await runFai({ now, today });
    faiFailed = fai.failed;
    if (fai.report) await sendEmail(fai.report);
  } catch (err) {
    faiFailed = true;
    console.error(`FAI Connect scan failed: ${err.message}`);
  }
  if (faiFailed) process.exitCode = 1;
```

- [ ] **Step 5: Rehearse offline, then live**

Fully offline, no credential, nothing written:

```bash
FIXTURES_HTML_FILE=test/fixtures/club2960.html \
FAI_MATCHES_FILE=test/fixtures/fai-capture.json \
  node scripts/check.mjs --dry-run
```

Expected: the Galway pipeline reports its fixtures, then
`fai: 8 fixtures, 0 changes, 2 results stored`, and a zero exit.

Then confirm the missing-key path is loud rather than silent:

```bash
FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs --dry-run
echo "exit: $?"
```

Expected: `FAI_CONNECT_API_KEY is not set - skipping the FAI Connect scan` and
`exit: 1`. That non-zero exit **is** the feature working — the Galway snapshot
is still reported above it.

- [ ] **Step 6: Commit**

```bash
git add scripts/check.mjs
git commit -m "feat(check): run the FAI Connect scan, isolated from the Galway write"
```

---

### Task 12: Load and render both sources on the site

**Files:**
- Modify: `src/App.jsx:60-90`, `src/App.jsx:140-155`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Load the three new files**

In `src/App.jsx`, extend the `Promise.all`:

```js
        // The FAI files degrade the way results.json does. A club whose squads have not
        // migrated yet has no latest-fai.json at all, and that is not an error - so these
        // resolve to an empty snapshot rather than rejecting and blanking the whole site.
        const [snapshot, history, loaded, results, faiSnapshot, faiHistory, faiResults] =
          await Promise.all([
            loadJson("latest.json"),
            loadJson("changes.json").catch(() => []),
            loadJson("teams.json").catch(() => ({ version: 1, teams: {} })),
            loadJson("results.json").catch(() => null),
            loadJson("latest-fai.json").catch(() => ({ fixtures: [] })),
            loadJson("changes-fai.json").catch(() => []),
            loadJson("results-fai.json").catch(() => null),
          ]);
        if (!live) return;
        setConfig(loaded);
        setState({
          status: "ready", snapshot, history, results, faiSnapshot, faiHistory, faiResults,
        });
```

- [ ] **Step 2: Hand every tab the union**

Where `fixtures` and `results` are derived for the tabs (around line 140),
before the `<ResultsTab>` / `<FormTab>` / `<ChangesTab>` elements:

```js
  // Every tab sees BOTH sources. The files are separate; the app is not. Labels and
  // colours come from the one shared teams.json, so a squad keeps its identity across the
  // announcement, the round-up, the chart and the table whichever system it is on.
  const fixtures = [
    ...(state.snapshot?.fixtures ?? []),
    ...(state.faiSnapshot?.fixtures ?? []),
  ];
  // ResultsTab and FormTab both read `results?.results ?? []` and both branch on
  // `results === null`, so this must stay the WRAPPER shape and must keep null meaning
  // "could not load" - which they render differently from "nobody played". A bare array
  // here would silently break both tabs.
  //
  // null only when BOTH failed: a club whose squads have not migrated has no
  // results-fai.json at all, and that must not blank the Results tab. The cost is that if
  // exactly one of the two fails we show a partial store without saying so - accepted,
  // because catch(() => null) cannot tell "absent" from "failed" across origins.
  const results = state.results === null && state.faiResults === null
    ? null
    : { results: [...(state.results?.results ?? []), ...(state.faiResults?.results ?? [])] };
  const history = [...(state.history ?? []), ...(state.faiHistory ?? [])]
    .sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)));
```

The existing call sites already pass `fixtures`, `results` and `history` by those
names, so no JSX below this needs to change:

```jsx
{tab === "Fixtures" && <AnnouncementTab fixtures={fixtures} config={config} today={today} />}
{tab === "Results" && (
  <ResultsTab results={results} fixtures={fixtures} config={config} today={today} now={now} />
)}
{tab === "Form" && (
  <FormTab results={results} fixtures={fixtures} config={config} today={today} />
)}
{tab === "Changes" && <ChangesTab history={history} fixtures={fixtures} config={config} />}

- [ ] **Step 3: Add an SSR smoke test**

Append to `test/components.test.jsx`:

`AnnouncementTab` takes `fixtures`, not a snapshot. `fixtures` and `config` are
already module-scope consts in this file, so the union is built inside the test
to avoid shadowing them:

```jsx
describe("both sources together", () => {
  it("renders an announcement containing Galway and FAI squads", () => {
    const union = [
      ...fixtures,
      { fid: "fai:52005172", teamId: "fai:61270", date: "2026-08-29", time: "14:00",
        isHome: false, ourTeam: "Craughwell United Juniors", opponent: "Renmore FC",
        venue: "", competition: "Western Hygiene Supplies Brod Trill Mens Premier League",
        comment: "" },
    ];
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={union} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("U14A Boys v St Bernards");
    expect(html).toContain("Renmore FC");
  });
});
```

The FAI fixture is dated 2026-08-29 to fall inside the same window the existing
tests use for `today="2026-08-25"`.

- [ ] **Step 4: Run the suite and the build**

```bash
npm test && npm run build
```

Expected: PASS, then a clean build.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx test/components.test.jsx
git commit -m "feat(site): read both sources and hand every tab the union"
```

---

### Task 13: Document the second source

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In **Commands**, add:

```bash
FAI_CONNECT_API_KEY=... node scripts/check.mjs    # includes the FAI Connect scan
```

In **What this is**, after the paragraph about the two repos:

```markdown
**There are two data sources.** Galway FA's WordPress endpoint (`parse.js`,
scraped HTML) and FAI Connect's COMET API (`faiConnect.js`, JSON). The club is
migrating league by league; two squads have moved so far and the rest follow.
The scans write separate files and share `teams.json`. See the spec.
```

In **Invariants**, add:

```markdown
- **FAI ids are prefixed, Galway ids are bare.** `fai:61270`. The two systems
  number teams independently, and `teams.json` is keyed on team id and holds
  colours, so a collision would give a squad another squad's identity. Never
  strip the prefix to "tidy up" a key.
- **The FAI scan's failure must not block the Galway write.** It is a
  third-party API serving two squads; the other nineteen must keep updating. It
  still sets a non-zero exit, so the failure is loud.
- **The season starts 1 August, derived from `today`.** `seasonStart` in
  `window.js`. The FAI `past` endpoint returns two years of history and
  `mergeResults` never deletes, so the filter runs on ingest as well as at read
  time.
```

- [ ] **Step 2: Update `README.md`**

Add `FAI_CONNECT_API_KEY` and `FAI_CONNECT_CLUB_ID` to the environment section,
noting the key is a credential and belongs in the **data repo's** secrets,
because that is where the workflow runs.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: the FAI Connect source, its invariants and its env"
```

---

### Task 14: Verify and open the PR

- [ ] **Step 1: Full verification**

```bash
npm test && npm run build
```

Expected: every suite passes and the build is clean. Do not proceed on a red
suite — record the failure instead.

- [ ] **Step 2: Live end-to-end, writing nothing**

```bash
FAI_CONNECT_API_KEY='<key>' node scripts/check.mjs --dry-run
```

Expected: both scans report, zero exit, and the dry run says it would write
`latest-fai.json`, `results-fai.json` and `changes-fai.json`. The FAI fixture
count is whatever the league currently lists — it was 8 at capture time, and it
is **not** asserted anywhere, because counts are measured, never hardcoded.

- [ ] **Step 3: Confirm no credential is committed**

```bash
git log -p origin/main..HEAD | grep -i 'bTbZ\|api_key.*=' || echo "clean: no credential in the diff"
```

Expected: `clean: no credential in the diff`.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fai-connect-scan
gh pr create --fill
```

The PR body must state the two manual steps in `seaninryan/fixtures-data`:
add `FAI_CONNECT_API_KEY` as a repository secret, and add it to the workflow
step's `env:`. Until both are done the scan skips and the build is red.

---

## Notes for the implementer

**Do not re-fetch the captures.** `test/fixtures/fai-*.json` are the golden
captures, taken 2026-09-17. Re-capturing changes counts and dates and will break
tests that pin them — if you must, update `test/fixtures/meta.js` in the same
commit, exactly as the `club2960.html` convention requires.

**Counts are measured, not hardcoded.** Import them from `meta.js`. Tests assert
rules — that pre-cutoff matches are excluded, that a stale team is skipped —
never totals for their own sake.

**The API key never lands on disk in this repo.** It travels in a request header
only. If you add a debugging `console.log`, do not log the headers.

**`npm run build` catches JSX errors the tests cannot** — the component tests are
SSR smoke tests via `renderToStaticMarkup`, with no jsdom and no interaction
coverage. Run the build after any `.jsx` change.
