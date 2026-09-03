# Pending Results and Midweek Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every game the club has played visible on the Results tab — with its score if the league published one, and as "no result yet" if it has not.

**Architecture:** Two display defects, no change to capture or storage. First, `RESULT_WINDOWS` loses `"Last weekend"` (it hid three of six live results on a Thursday) and the tab defaults to `"Last 7 days"`. Second, a new pure `pending.js` derives, at read time, the fixtures still in `latest.json` whose kick-off has elapsed and whose `fid` has no result — filling the ~16-hour hole where a played game appears nowhere. A new pure `clock.js` supplies the current Irish date and time as strings, which also corrects the site's UTC-derived `today`.

**Tech Stack:** JavaScript (ES modules), React 18, Vitest (node environment, no jsdom), Vite.

**Spec:** `docs/superpowers/specs/2026-09-03-pending-results-design.md`

---

## Before you start

**Node v14 is the system default and silently breaks Vite and Vitest.** Every command in this plan assumes you have run this first, in every shell you use:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

Verify with `node --version` — it must print `v20.20.2`.

Confirm the suite is green before you change anything:

```bash
npm test
```

Expected: all suites pass. If anything fails now, stop and report it — do not start on a red tree.

## Things that will get you into trouble

Read these before Task 1. They are the failure modes this codebase has actually suffered.

- **Labels resolve over ALL fixtures, never a filtered subset.** `deriveLabels` shows the A/B letter only when the club runs more than one side at that age and gender. Resolve labels over a one-game pending list and "U14A Boys" silently becomes "U14 Boys". This bug has appeared three times. Task 3 has a test for it; do not weaken it.
- **Times are strings, never `Date` objects.** A UTC round-trip moves every kick-off by an hour for half the year. `Date` may only ever touch a date-only string in UTC (`new Date("2026-08-29T00:00:00Z")`), which is what the existing `dayHeading`/`shortDate` helpers do.
- **Identity is `fid`.** Never match a result to a fixture on names or dates.
- **Counts are measured, never hardcoded.** Assert rules, not totals.
- **Do not touch `roundup` or `roundupLines`.** Both the site and `scripts/check.mjs` import them, and that shared import is the only thing keeping the copied text and the emailed text from drifting.
- **Commit after every task**, with the suite green.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/window.js` (modify) | Window definitions. Loses the `"Last weekend"` branch and list entry. | 1 |
| `test/window.test.js` (modify) | Rewrite the `result windows` describe block. | 1 |
| `test/results.test.js` (modify) | Four call sites move off `"Last weekend"`. | 1 |
| `src/components/ResultsTab.jsx` (modify) | Default window; later, the pending section. | 1, 5 |
| `src/lib/clock.js` (create) | The only module that knows the club's timezone. Returns date/time as strings. | 2 |
| `test/clock.test.js` (create) | Pinned instants, including both sides of a DST boundary. | 2 |
| `src/lib/announce.js` (modify) | Export the existing private `shortDate` for reuse. | 3 |
| `src/lib/pending.js` (create) | The pending rule and its display lines. | 3 |
| `test/pending.test.js` (create) | The rule, the floor, the malformed-time fallback, label resolution. | 3 |
| `src/App.jsx` (modify) | `today` from the club clock; pass `now` to the Results tab. | 4, 5 |
| `src/styles.css` (modify) | Styling for the pending card. | 5 |
| `test/components.test.jsx` (modify) | SSR smoke tests for the pending section. | 5 |
| `CLAUDE.md` (modify) | Record the new modules and the Irish-clock invariant. | 6 |

---

### Task 1: Drop the "Last weekend" result window

This is the fix for the defect that actually bit the user: on Thursday 3 Sep the default window returned `{from: "2026-08-29", to: "2026-08-30"}` and hid the Mon/Tue/Wed results that were sitting in the store.

`"Last weekend"` is removed as an option, not merely demoted, so the branch in `resultWindowRange` becomes unreachable and is deleted with it. The unrecognised-name fallthrough already returns the "All" range, so a stale value degrades to showing everything rather than nothing.

**Files:**
- Modify: `src/lib/window.js:42-57`
- Modify: `test/window.test.js:266-311`
- Modify: `test/results.test.js:108,115,126,131`
- Modify: `src/components/ResultsTab.jsx:10`

- [ ] **Step 1: Rewrite the failing tests**

Replace the whole `describe("result windows", ...)` block in `test/window.test.js` — it currently starts at the comment on line 266 and ends at the closing `});` on line 318 — with this:

```js
// 2026-08-29 is a Saturday, 08-30 Sunday, 08-31 Monday, 09-01 Tuesday,
// 09-02 Wednesday, 09-03 Thursday, 09-04 Friday.
describe("result windows", () => {
  it("offers exactly the three backward windows", () => {
    expect(RESULT_WINDOWS).toEqual(["Last 7 days", "Last 14 days", "All"]);
  });

  // The defect this replaced: "Last weekend" was the Results tab's default, and on a
  // Thursday it selected Sat+Sun only. Midweek evening kick-offs are routine for this
  // club, so it hid half the store most weeks.
  it("no longer offers a weekend-only window", () => {
    expect(RESULT_WINDOWS).not.toContain("Last weekend");
  });

  it("treats a stale window name as All, rather than as nothing", () => {
    expect(resultWindowRange("Last weekend", "2026-09-03"))
      .toEqual(resultWindowRange("All", "2026-09-03"));
  });

  it("selects midweek results, which is the whole point of the change", () => {
    const inWindow = resultWindowPredicate("Last 7 days", "2026-09-03");
    expect(inWindow({ date: "2026-08-31" })).toBe(true); // Monday
    expect(inWindow({ date: "2026-09-01" })).toBe(true); // Tuesday
    expect(inWindow({ date: "2026-09-02" })).toBe(true); // Wednesday
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
    const inWindow = resultWindowPredicate("Last 7 days", "2026-09-03");
    expect(inWindow({ date: "2026-08-28" })).toBe(true);
    expect(inWindow({ date: "2026-09-03" })).toBe(true);
    expect(inWindow({ date: "2026-08-27" })).toBe(false);
    expect(inWindow({ date: "2026-09-04" })).toBe(false);
  });

  it("leaves the forward windows untouched", () => {
    expect(WINDOWS).toEqual(["This weekend", "Next 7 days", "Next 14 days", "All"]);
    expect(windowRange("Next 7 days", "2026-08-30"))
      .toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run test/window.test.js
```

Expected: FAIL. `offers exactly the three backward windows` reports the received array still containing `"Last weekend"`, and `treats a stale window name as All` fails because the branch still matches.

- [ ] **Step 3: Change `window.js`**

In `src/lib/window.js`, replace line 42 with:

```js
export const RESULT_WINDOWS = ["Last 7 days", "Last 14 days", "All"];
```

Then delete the `"Last weekend"` branch from `resultWindowRange` — the whole `if (name === "Last weekend") { ... }` block including its comments (lines 45-57) — leaving:

```js
export function resultWindowRange(name, today) {
  if (name === "Last 7 days") return { from: addDays(today, -6), to: today };
  if (name === "Last 14 days") return { from: addDays(today, -13), to: today };
  // "All", and anything unrecognised: showing everything beats showing nothing. A
  // stale "Last weekend" reaches here now that the window is gone, and lands on the
  // safe answer rather than on an empty range.
  return { from: "0000-01-01", to: "9999-12-31" };
}
```

Also update the comment above `RESULT_WINDOWS` (line 38-41) to drop its reference to weekend logic:

```js
// The backward twins, for results. Added as separate exports rather than by
// generalising windowRange: that function is load-bearing for the announcement and its
// weekend logic is subtle enough not to disturb for the sake of sharing five lines of
// arithmetic. There is deliberately no weekend window here - this club plays midweek
// evenings routinely, and a weekend-only default hid half the store.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/window.test.js
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Move the dependent call sites off `"Last weekend"`**

In `test/results.test.js`, change `"Last weekend"` to `"Last 7 days"` on lines 108, 115, 126 and 131. Nothing else in those tests changes: `today` is `"2026-08-31"`, so `"Last 7 days"` spans `2026-08-25`–`2026-08-31` and still contains the 29 and 30 Aug results, while line 131's `2026-07-01` result still falls outside.

In `src/components/ResultsTab.jsx`, change line 10 to:

```js
  const [windowName, setWindowName] = useState("Last 7 days");
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS, every suite. The existing `ResultsTab` test at `test/components.test.jsx:73` renders with `today="2026-08-31"` and still finds `"U14A Boys 1-0 St Bernards"`, because the 29 Aug result is inside `"Last 7 days"` too.

- [ ] **Step 7: Commit**

```bash
git add src/lib/window.js src/components/ResultsTab.jsx test/window.test.js test/results.test.js
git commit -F - <<'MSG'
fix(results): drop the weekend-only result window

"Last weekend" was the Results tab's default. On Thursday 3 Sep it selected
29-30 Aug only, hiding the Mon/Tue/Wed results the store already held - three
of the six recorded. Four of the 14 distinct kick-off times in the live
snapshot are 18:30 or later, so midweek games are routine here and the
weekend-only range hid some of them most weeks.

Remove the window rather than just the default, and delete the now-unreachable
branch: a stale name falls through to the "All" range, which is the safe
answer. Default to "Last 7 days".
MSG
```

---

### Task 2: The club clock

Deciding whether a kick-off has elapsed needs the current time where the club plays, which nothing in the codebase has needed until now. This module is the only place a `Date` is unwrapped into date and time strings.

Verified on Node v20.20.2 (`process.config.variables.icu_small === false`, so full ICU is present): `Europe/Dublin` resolves, and both sides of the 25 Oct 2026 DST end format correctly.

**Files:**
- Create: `src/lib/clock.js`
- Test: `test/clock.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/clock.test.js`:

```js
import { describe, it, expect } from "vitest";
import { clubNow, CLUB_TZ } from "../src/lib/clock.js";

// Ireland is UTC+1 (IST) from late March to late October, and UTC+0 (GMT) otherwise.
describe("clubNow", () => {
  it("names the club's timezone", () => {
    expect(CLUB_TZ).toBe("Europe/Dublin");
  });

  it("returns the date and time as strings", () => {
    const now = clubNow(new Date("2026-09-03T10:10:00Z"));
    expect(now).toEqual({ date: "2026-09-03", time: "11:10" });
  });

  // The latent bug this fixes: the site derived `today` from the UTC date, so between
  // Irish midnight and 01:00 in summer the whole site was a day behind.
  it("is already tomorrow in Dublin at 23:30 UTC in summer", () => {
    expect(clubNow(new Date("2026-09-03T23:30:00Z")))
      .toEqual({ date: "2026-09-04", time: "00:30" });
  });

  it("agrees with UTC in winter, when Ireland is on GMT", () => {
    expect(clubNow(new Date("2026-01-15T23:30:00Z")))
      .toEqual({ date: "2026-01-15", time: "23:30" });
  });

  // 25 October 2026 is the Irish DST end: 02:00 IST becomes 01:00 GMT.
  it("handles both sides of the autumn DST boundary", () => {
    expect(clubNow(new Date("2026-10-25T00:30:00Z")).time).toBe("01:30"); // still IST
    expect(clubNow(new Date("2026-10-25T02:30:00Z")).time).toBe("02:30"); // now GMT
  });

  // A "24:00" here would sort above every kick-off and break the pending comparison.
  it("writes midnight as 00:00, never 24:00", () => {
    expect(clubNow(new Date("2026-09-03T23:00:00Z")).time).toBe("00:00");
  });

  it("zero-pads every field, so the strings compare correctly", () => {
    const { date, time } = clubNow(new Date("2026-01-05T09:07:00Z"));
    expect(date).toBe("2026-01-05");
    expect(time).toBe("09:07");
  });

  // Pure: the instant is an argument, so nothing reads a hidden clock.
  it("returns the same answer for the same instant", () => {
    const instant = new Date("2026-09-03T10:10:00Z");
    expect(clubNow(instant)).toEqual(clubNow(instant));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run test/clock.test.js
```

Expected: FAIL — the file `src/lib/clock.js` does not exist, so the import cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/lib/clock.js`:

```js
// Pure given an instant. The only module that knows where the club plays.
//
// Everything else compares ISO date strings and raw "HH:MM" kick-off strings, never
// Date objects - a UTC round-trip moves every kick-off by an hour for half the year.
// So this returns STRINGS, and is the one place a Date is unwrapped.
//
// Deliberately NOT part of window.js: that module declares itself pure date arithmetic
// over ISO strings, and a clock is not that.
export const CLUB_TZ = "Europe/Dublin";

// hourCycle: "h23" rather than hour12: false. Both give "00" for midnight on Node 20,
// but h23 is the option that guarantees it - hour12: false has historically produced
// "24:00" in some ICU builds, and a "24:00" here would sort above every kick-off and
// make an evening game look permanently unplayed.
const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// -> { date: "2026-09-03", time: "18:30" }
//
// formatToParts rather than a formatted string: nothing then depends on the locale's
// field order or punctuation, only on the part names, which are fixed by the spec.
export function clubNow(instant) {
  const p = {};
  for (const part of FORMAT.formatToParts(instant)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run test/clock.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clock.js test/clock.test.js
git commit -F - <<'MSG'
feat(clock): the club's local date and time, as strings

Deciding whether a kick-off has elapsed needs the current time where the club
plays. Returns strings only - no Date ever reaches a kick-off - and takes the
instant as an argument so it stays pure and testable.

Its own module rather than part of window.js, which declares itself pure date
arithmetic over ISO strings.
MSG
```

---

### Task 3: The pending rule

A fixture is pending when its kick-off has elapsed, no result carries its `fid`, and its date is no earlier than the `"Last 14 days"` floor.

**Files:**
- Modify: `src/lib/announce.js` (export the existing private `shortDate`)
- Create: `src/lib/pending.js`
- Test: `test/pending.test.js`

- [ ] **Step 1: Export `shortDate` from `announce.js`**

`announce.js` already has exactly the date format the pending lines need. In `src/lib/announce.js`, change the private `shortDate` declaration (line 28) to an export, and extend its comment. It is already used by the window subtitle at line 78, so only the `export` keyword and the comment change:

```js
// "2026-08-29" -> "Sat 29 Aug"
//
// Exported for pending.js, which prints the same format. One builder, so the two
// cannot drift. Date is applied only to a date-only string in UTC - never to a
// kick-off, which would move it by an hour for half the year.
export function shortDate(iso) {
  const d = asDate(iso);
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
```

Nothing else in `announce.js` changes. Confirm the existing suite still passes:

```bash
npx vitest run test/announce.test.js
```

Expected: PASS.

- [ ] **Step 2: Write the failing test**

Create `test/pending.test.js`:

```js
import { describe, it, expect } from "vitest";
import { hasKickedOff, pendingFixtures, pendingLines } from "../src/lib/pending.js";

const config = { version: 1, teams: { "11": { label: "U14A Boys", color: "#d9c53c" } } };

const fixture = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-09-02", time: "18:30", isHome: false,
  ourTeam: "Craughwell United", opponent: "Colga", venue: "Colga",
  competition: "GFA Boys U14 Championship 1", comment: "", ...over,
});

const result = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-09-02", isHome: false,
  ourTeam: "Craughwell United", opponent: "Colga",
  ourScore: 3, theirScore: 5, venue: "Colga",
  competition: "GFA Boys U14 Championship 1", ...over,
});

const now = { date: "2026-09-03", time: "09:00" };

describe("hasKickedOff", () => {
  it("is true for a fixture on an earlier day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-02", time: "23:45" }), now)).toBe(true);
  });

  it("is false for a fixture on a later day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-04", time: "00:15" }), now)).toBe(false);
  });

  it("is false before kick-off on the same day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "18:30" }), now)).toBe(false);
  });

  it("is true at and after kick-off on the same day", () => {
    const atNine = fixture({ date: "2026-09-03", time: "09:00" });
    expect(hasKickedOff(atNine, now)).toBe(true);
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "08:30" }), now)).toBe(true);
  });

  // "9:00" compares ABOVE "18:30" as a string, which would make a morning game look
  // permanently unplayed. An unrecognised time falls back to the date alone, which
  // reports not-yet-kicked-off today and picks the game up tomorrow.
  it("falls back to the date alone when the time is not HH:MM", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "9:00" }), now)).toBe(false);
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "" }), now)).toBe(false);
    expect(hasKickedOff(fixture({ date: "2026-09-02", time: "9:00" }), now)).toBe(true);
  });
});

describe("pendingFixtures", () => {
  it("lists an elapsed fixture with no result", () => {
    expect(pendingFixtures([fixture()], [], now).map((f) => f.fid)).toEqual(["1"]);
  });

  it("excludes a fixture whose result has arrived", () => {
    expect(pendingFixtures([fixture()], [result()], now)).toEqual([]);
  });

  // Identity is fid. A result for a DIFFERENT game on the same day must not clear it.
  it("matches a result to a fixture on fid, never on the date", () => {
    const other = result({ fid: "999" });
    expect(pendingFixtures([fixture()], [other], now).map((f) => f.fid)).toEqual(["1"]);
  });

  it("excludes a fixture that has not kicked off", () => {
    expect(pendingFixtures([fixture({ date: "2026-09-05" })], [], now)).toEqual([]);
  });

  it("excludes a fixture older than the Last 14 days floor", () => {
    // now.date is 2026-09-03, so the floor is 2026-08-21.
    expect(pendingFixtures([fixture({ date: "2026-08-20" })], [], now)).toEqual([]);
    expect(pendingFixtures([fixture({ date: "2026-08-21" })], [], now)).toHaveLength(1);
  });

  it("treats a missing or malformed store as empty rather than throwing", () => {
    expect(pendingFixtures([fixture()], null, now)).toHaveLength(1);
    expect(pendingFixtures([fixture()], undefined, now)).toHaveLength(1);
    expect(pendingFixtures(null, [], now)).toEqual([]);
  });

  it("orders newest first, then by teamId, then by fid", () => {
    const older = fixture({ fid: "2", date: "2026-08-29" });
    const sameDayB = fixture({ fid: "3", teamId: "22", date: "2026-09-02" });
    const sameDayA2 = fixture({ fid: "0", teamId: "11", date: "2026-09-02" });
    const order = pendingFixtures([older, sameDayB, sameDayA2, fixture()], [], now)
      .map((f) => f.fid);
    expect(order).toEqual(["0", "1", "3", "2"]);
  });
});

describe("pendingLines", () => {
  it("is empty when nothing is pending", () => {
    expect(pendingLines([fixture()], [result()], config, now)).toEqual([]);
  });

  it("writes the squad, the opponent and when it was played", () => {
    const [line] = pendingLines([fixture()], [], config, now);
    expect(line.text).toBe("U14A Boys @ Colga — Wed 2 Sep, 18:30");
    expect(line.kind).toBe("pending");
    expect(line.teamId).toBe("11");
    expect(line.color).toBe("#d9c53c");
  });

  it("writes v for a home game, matching the announcement", () => {
    const [line] = pendingLines([fixture({ isHome: true })], [], config, now);
    expect(line.text).toContain("U14A Boys v Colga");
  });

  it("falls back to the feed name for an unlabelled squad", () => {
    const bare = { version: 1, teams: {} };
    const [line] = pendingLines([fixture()], [], bare, now);
    expect(line.text).toContain("Craughwell United");
  });

  // THE INVARIANT. deriveLabels shows the A/B letter only when the club runs more than
  // one side at that age and gender. Resolve over the pending subset - one U14 side -
  // and "U14A Boys" silently becomes "U14 Boys". This bug has appeared three times.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({
      fid: "2", teamId: "B1", ourTeam: "Craughwell United B", date: "2026-09-05",
    });
    // Only aSide is pending; bSide has not been played. The B side must still be
    // counted when the label is derived.
    const lines = pendingLines([aSide, bSide], [], bare, now);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("U14A Boys");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run test/pending.test.js
```

Expected: FAIL — `src/lib/pending.js` does not exist, so the import cannot be resolved.

- [ ] **Step 4: Write the implementation**

Create `src/lib/pending.js`:

```js
// Pure. Games whose kick-off has passed but whose result has not arrived.
//
// Derived at READ time from the snapshot and the results store, with nothing persisted.
// The reason it works at all: the league's endpoint returns only upcoming fixtures, so
// a played game leaves the feed - but every fixture window starts at `today`, "All"
// included, so a past-dated fixture still sitting in latest.json is filtered out of the
// Fixtures tab while having no result to show under Results. That hole is about 16 hours
// wide for an evening kick-off, and this fills it.
//
// What this deliberately does NOT cover: once a run happens after the game the fixture
// leaves the snapshot too, and if the league still has not published, the game vanishes
// again. Only a persisted store keyed off diff.js's disappearance branch fixes that, and
// the spec defers it - the live data has no instance of it.
import { resultWindowRange } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor } from "./squadColors.js";
import { shortDate } from "./announce.js";

// How far back a pending game is still worth showing. The snapshot only holds what the
// league still lists, so this bounds the one failure mode that outlives a run: a fixture
// stranded in the feed with a past date would otherwise sit in the list for months.
const PENDING_WINDOW = "Last 14 days";

const HH_MM = /^\d{2}:\d{2}$/;

// String comparison throughout, which is only valid for zero-padded 24-hour times. All
// 14 distinct times in the live snapshot are strict HH:MM, but a single "9:00" would
// compare ABOVE "18:30" and make a morning game look permanently unplayed - so an
// unrecognised time falls back to the date alone. That reports not-yet-kicked-off for
// today and picks the game up tomorrow: late, never wrong.
export function hasKickedOff(fixture, now) {
  if (fixture.date < now.date) return true;
  if (fixture.date > now.date) return false;
  if (!HH_MM.test(fixture.time) || !HH_MM.test(now.time)) return false;
  return fixture.time <= now.time;
}

// `now` is {date, time} from clock.js - the club's local clock, not UTC.
export function pendingFixtures(fixtures, results, now) {
  // Identity is fid, never a name or a date: a result for another game on the same day
  // must not clear this one.
  const scored = new Set((results ?? []).map((r) => r.fid));
  const floor = resultWindowRange(PENDING_WINDOW, now.date).from;
  return (fixtures ?? [])
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
export function pendingLines(fixtures, results, config, now) {
  const chosen = pendingFixtures(fixtures, results, now);
  if (chosen.length === 0) return [];

  // Resolved over EVERY fixture, never over `chosen`. deriveLabels shows the A/B letter
  // only when the club runs more than one side at that age and gender, so resolving over
  // a one-game pending list silently renames "U14A Boys" to "U14 Boys". The pending list
  // is a filtered subset and therefore exactly the shape that causes this. It has
  // happened three times. NEVER pass `chosen` here.
  const { labels } = resolveTeams(fixtures ?? [], config);

  return chosen.map((f) => ({
    kind: "pending",
    // v / @ and the date format both come from announce.js, so a pending line and a
    // fixture line read the same way.
    text: `${labels[f.teamId] ?? f.ourTeam} ${f.isHome ? "v" : "@"} ${f.opponent}` +
      ` — ${shortDate(f.date)}, ${f.time}`,
    teamId: f.teamId,
    color: squadColor(f.teamId, config).bg,
  }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run test/pending.test.js
```

Expected: PASS, 17 tests. If `writes the squad, the opponent and when it was played` fails on the dash, check that the character between the opponent and the date is an em dash (`—`, U+2014), matching the test.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS, every suite — including `test/announce.test.js`, which Step 1 touched.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pending.js src/lib/announce.js test/pending.test.js
git commit -F - <<'MSG'
feat(pending): derive games awaiting a result

Every fixture window starts at `today`, "All" included, so a past-dated
fixture still sitting in latest.json is filtered out of the Fixtures tab while
having no result to show under Results. For an evening kick-off that hole is
about 16 hours wide and it opens every time the club plays midweek.

Derived at read time from the snapshot and the results store - no new
persisted file, so the data repo's workflow needs no change. Labels resolve
over every fixture, never the pending subset, which is the A/B-letter bug that
has appeared three times. Reuses announce.js's shortDate and v/@ wording.
MSG
```

---

### Task 4: The site's `today` moves to the club clock

`App.jsx` derives `today` from the UTC date, so between Irish midnight and 01:00 in summer the whole site is a day behind. This is a pre-existing defect, and the clock from Task 2 fixes it in one line.

`scripts/check.mjs` stays on UTC deliberately: the cron runs around 11:00, when the UTC and Irish dates always agree, so there is no defect to fix and no reason to disturb the cron's behaviour.

**Files:**
- Modify: `src/App.jsx:1-10` (import), `src/App.jsx:125`

- [ ] **Step 1: Make the change**

In `src/App.jsx`, add the import alongside the other lib imports (after the `owner.js` import on line 10):

```js
import { clubNow } from "./lib/clock.js";
```

Then replace line 125:

```js
  const today = new Date().toISOString().slice(0, 10);
```

with:

```js
  // The club's local date, not UTC. Ireland is UTC+1 for half the year, so a UTC date
  // is a day behind between Irish midnight and 01:00 - every window would then select
  // yesterday's games. `now` also carries the time, which the Results tab needs to tell
  // whether a kick-off has passed.
  const now = clubNow(new Date());
  const today = now.date;
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: build succeeds. `App.jsx` has no unit test — it is the I/O shell — so the build and the manual check below are the coverage.

- [ ] **Step 3: Confirm the suite is still green**

```bash
npm test
```

Expected: PASS, every suite.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -F - <<'MSG'
fix(site): read today from the club's clock, not UTC

Ireland is UTC+1 for half the year, so a UTC-derived date is a day behind
between Irish midnight and 01:00 and every window then selects yesterday's
games. Also carries the time, which the pending list needs.

check.mjs stays on UTC: the cron runs around 11:00, when the two dates always
agree.
MSG
```

---

### Task 5: The pending section on the Results tab

The section renders only when the list is non-empty, and sits **outside** the `.card announcement` div. That placement is the point: it is visible on the site and never lands on the clipboard. The copied text is built from `roundupLines` alone, so pending cannot reach it.

**Files:**
- Modify: `src/components/ResultsTab.jsx`
- Modify: `src/App.jsx:138` (pass `now`)
- Modify: `src/styles.css`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

In `test/components.test.jsx`, add these to the existing `describe("ResultsTab", ...)` block, after the `distinguishes an empty store from a failed one` test (line 97). Note the `now` prop, and that `resultsPendingFixtures` below deliberately has no matching entry in `resultsFixture`:

```js
  const resultsPendingFixtures = [{
    fid: "77", teamId: "11", date: "2026-08-30", time: "18:30", isHome: false,
    ourTeam: "Craughwell United", opponent: "Colga", venue: "Colga",
    competition: "GFA Boys U14 Championship 1", comment: "",
  }];
  const nowAfter = { date: "2026-08-31", time: "09:00" };

  it("lists a played game that has no result yet", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsPendingFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html).toContain("No result yet");
    expect(html).toContain("U14A Boys @ Colga");
  });

  it("shows no pending section when every played game has a result", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsSquadFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html).not.toContain("No result yet");
  });

  // The pending card must sit AFTER the copyable one, and outside it. The copied text is
  // built from roundupLines alone, so a pending line can never reach the clipboard.
  it("keeps the pending section outside the copyable card", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsPendingFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html.indexOf("No result yet"))
      .toBeGreaterThan(html.indexOf('class="card announcement"'));
    expect(roundup(resultsFixture, resultsConfig, "Last 7 days", "2026-08-31",
                   resultsPendingFixtures)).not.toContain("Colga");
  });

  it("renders no pending section when the store could not be loaded", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={null} fixtures={resultsPendingFixtures}
                  config={resultsConfig} today="2026-08-31" now={nowAfter} />,
    );
    expect(html).not.toContain("No result yet");
    expect(html).toMatch(/could not/i);
  });
```

Add the `roundup` import at the top of `test/components.test.jsx`, after the component imports:

```js
import { roundup } from "../src/lib/results.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run test/components.test.jsx
```

Expected: FAIL — `lists a played game that has no result yet` cannot find `"No result yet"`, because the component does not render it.

- [ ] **Step 3: Add the section to `ResultsTab.jsx`**

Add the import after the existing `results.js` import (line 2):

```js
import { pendingLines } from "../lib/pending.js";
```

Change the signature (line 9) to accept `now`:

```js
export default function ResultsTab({ results, fixtures, config, today, now }) {
```

The `results === null` early return stays exactly as it is and now also covers pending: deriving pending against a store that failed to load would list every elapsed fixture as awaiting a result.

After the `text` line (line 30), add:

```js
  // A played game with no result yet. Derived here rather than stored - see pending.js.
  // `now` carries the club's local time; without it there is nothing to compare a
  // kick-off against, so an absent prop yields no section rather than a wrong one.
  const pending = now ? pendingLines(fixtures, results?.results ?? [], config, now) : [];
```

Then, between the closing `</div>` of the announcement card and the Copy button, add:

```jsx
      {pending.length > 0 && (
        // OUTSIDE the announcement card, and after it. `text` above is built from
        // roundupLines alone, so nothing here can reach the clipboard.
        <div className="card pending">
          <p className="phead">No result yet</p>
          {pending.map((line, i) => (
            // The index is the key on purpose: these lines have no identity of their
            // own, and the whole list is rebuilt whenever the data changes.
            <div className="aline pending" key={i}>
              <span className="swatch" style={{ background: line.color }} aria-hidden="true" />
              <span className="atext">{line.text}</span>
            </div>
          ))}
          <p className="dim">
            Played, but the league has not published a score. It usually appears within a
            day.
          </p>
        </div>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/components.test.jsx
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Pass `now` from `App.jsx`**

In `src/App.jsx`, change the Results tab render (line 137-139) to pass `now`:

```jsx
      {tab === "Results" && (
        <ResultsTab results={results} fixtures={fixtures} config={config}
                    today={today} now={now} />
      )}
```

- [ ] **Step 6: Style the card**

Append to `src/styles.css`:

```css
/* The pending card. Monospace and the same gutter as the announcement so a pending line
   and a result line read as siblings - but a SEPARATE card, outside the copyable one,
   because this text must never reach the clipboard. */
.card.pending { font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-x: auto; }
.card.pending .dim { margin: 10px 0 0; font-family: ui-sans-serif, system-ui, sans-serif; }
.phead { margin: 0 0 8px; font-weight: 600; }
.aline.pending { padding-left: 30px; }
```

- [ ] **Step 7: Run the full suite and the build**

```bash
npm test && npm run build
```

Expected: both PASS. The build is what catches JSX errors the tests cannot.

- [ ] **Step 8: Commit**

```bash
git add src/components/ResultsTab.jsx src/App.jsx src/styles.css test/components.test.jsx
git commit -F - <<'MSG'
feat(results): show games that are waiting on a result

A section on the Results tab, rendered only when non-empty and placed outside
the copyable card - visible on the site, never on the clipboard. The copied
text is still built from roundupLines alone.

Wording is "no result yet", never "played, awaiting score": a fixture also
leaves the feed when the league deletes it, and that is indistinguishable from
a played game.

A store that failed to load renders no section - deriving pending against a
null store would list every elapsed fixture as awaiting a result.
MSG
```

---

### Task 6: Verify against the live data, and record the change

The unit tests prove the rules. This task proves the thing actually works on the real snapshot, and records the two new modules where the next person will look.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Check the pending rule against the live data**

Write this to the scratchpad (not the repo) and run it. It fetches the live snapshot and results store and applies the real `pendingFixtures`:

```bash
cd /home/sean/workspace/fixtures
mkdir -p /tmp/pending-check && cd /tmp/pending-check
curl -sS -O https://raw.githubusercontent.com/seaninryan/fixtures-data/main/latest.json
curl -sS -O https://raw.githubusercontent.com/seaninryan/fixtures-data/main/results.json
cd /home/sean/workspace/fixtures
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { pendingFixtures, pendingLines } from "/home/sean/workspace/fixtures/src/lib/pending.js";
import { clubNow } from "/home/sean/workspace/fixtures/src/lib/clock.js";
const snap = JSON.parse(readFileSync("/tmp/pending-check/latest.json", "utf8"));
const res = JSON.parse(readFileSync("/tmp/pending-check/results.json", "utf8"));
const now = clubNow(new Date());
console.log("club now:", now);
console.log("fixtures:", snap.fixtures.length, "results:", res.results.length);
const p = pendingFixtures(snap.fixtures, res.results, now);
console.log("pending:", p.length);
for (const l of pendingLines(snap.fixtures, res.results, { version: 1, teams: {} }, now)) {
  console.log("  ", l.text);
}
'
```

Expected: it runs without throwing and prints a `pending` count. **Zero is a valid and likely result** — it means every elapsed fixture already has a result, which is the ordinary state most of the day. What matters is that it does not throw and does not list a fixture that already appears in `results.json`.

Sanity-check the output by hand: every line printed must be a fixture whose date/time has passed in Irish time and whose `fid` is absent from `results.json`.

- [ ] **Step 2: Confirm the cron path is untouched**

The offline rehearsal must behave exactly as before — this change touches no file the cron writes:

```bash
FIXTURES_HTML_FILE=test/fixtures/club2960-results.html DATA_DIR=/tmp/pending-check/data \
  node scripts/check.mjs --dry-run
```

Expected: it completes and reports a fixture count, a change count and a stored-results count, with no errors. It must not mention pending — `check.mjs` does not import it.

- [ ] **Step 3: Update `CLAUDE.md`**

In the **Architecture** section, after the `diff.js` / `announce.js` bullet, add:

```markdown
- `pending.js` — games whose kick-off has passed with no result yet. Derived at
  read time from the snapshot and the results store; nothing is persisted, so
  the data repo's workflow is unaffected. `clock.js` — the club's local date and
  time as strings, and the only place a `Date` is unwrapped.
```

In the **Invariants** section, after the "Times are strings" bullet, add:

```markdown
- **The site's `today` is the club's local date, never UTC.** Ireland is UTC+1
  for half the year, so a UTC date is a day behind between Irish midnight and
  01:00 and every window then selects yesterday. `scripts/check.mjs` stays on
  UTC on purpose: the cron runs around 11:00, when the two always agree.
- **There is no weekend-only results window.** This club plays midweek evenings
  routinely, and a weekend-only default hid half the results store.
```

- [ ] **Step 4: Final verification**

```bash
npm test && npm run build
```

Expected: both PASS. Confirm the new files are all present and tested:

```bash
git status --short
npx vitest run test/clock.test.js test/pending.test.js test/window.test.js
```

Expected: `git status` shows only `CLAUDE.md` modified; the three suites pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -F - <<'MSG'
docs: record the pending list and the club clock

Verified against the live snapshot and results store: pendingFixtures runs
clean, and the offline check.mjs rehearsal is unchanged - nothing the cron
writes was touched.
MSG
```

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-09-03-pending-results-design.md`:

| Spec section | Task |
|---|---|
| Result windows | 1 |
| The clock (`clock.js`) | 2 |
| `today` moves onto the club clock | 4 |
| Pending (`pending.js`) — three conditions, no grace, label rule, line shape, sort | 3 |
| Display — outside the copyable card, wording, ignores the chips | 5 |
| Error handling — null store, empty store, no elapsed fixtures, malformed time, stale window name | 1 (stale name), 3 (malformed time, empty store), 5 (null store) |
| Testing — clock, pending, window, rewritten existing tests, SSR smoke, build | 1, 2, 3, 5 |
| Deferred — persisted store | Not implemented, by design. Recorded in `pending.js`'s header comment. |

One spec line needed no work: it anticipated re-dating `test/results.test.js:131`'s out-of-window result, but `2026-07-01` already falls outside `"Last 7 days"` from `2026-08-31`, so only the window name changes.
