# Pending results and midweek windows — design

Written 2026-09-03. Extends the results capture
(`docs/superpowers/specs/2026-08-29-results-capture-design.md`). Two defects
found in the same investigation: one hides results the store already holds, the
other hides games between kick-off and the result landing. Both are display
bugs. Nothing about capture, storage or the cron changes.

## Goal

Every game the club has played is accounted for on the Results tab: shown with
its score if the league has published one, and listed as awaiting a result if
it has not.

## Non-goals

A persisted pending store — see "Deferred" below. Any change to the
announcement text, the alert email, `check.mjs`, or the definitions of the
forward fixture windows (`WINDOWS`, `windowRange`, `windowPredicate`). Note
that moving `today` onto the club clock does change what those windows select
between Irish midnight and 01:00; their definitions are what stays fixed.
Chasing the league for a missing score. Editing a score by hand.

---

## What was actually wrong

Investigated 2026-09-03 against the live data repo. Both findings were verified
against `latest.json`, `results.json` and `changes.json` as committed, not
reasoned about.

**`"Last weekend"` was the wrong default for this club.** The Results tab opens
on `"Last weekend"` (`ResultsTab.jsx:10`).
`resultWindowRange("Last weekend", "2026-09-03")` — a Thursday — returns
`{from: "2026-08-29", to: "2026-08-30"}`. Against the six results in the live
store:

| Date | Day | Shown by the default window |
|---|---|---|
| 29 Aug ×2 | Sat | yes |
| 30 Aug | Sun | yes |
| 31 Aug | Mon | **no** |
| 1 Sep | Tue | **no** |
| 2 Sep | Wed | **no** |

Half the store was correctly captured and thrown away by the window. This is
not an edge case: four of the 14 distinct kick-off times in the live snapshot
are 18:30 or later, and three of the six stored results are midweek, so
`"Last weekend"` would hide some of them most weeks.

**A played game is invisible until its result lands.** Every forward window
starts at `today` — `windowRange` returns `from: today` for all four,
**including `"All"`** (`window.js:30`) — and `windowPredicate` requires
`fixture.date >= from`. So a fixture whose date has passed is filtered out of
the Fixtures tab entirely while still sitting in `latest.json`. Worked example
from the live data:

- 2 Sep, 18:30, away at Colga. The 2 Sep 11:14 run recorded it as upcoming.
- No further run before midnight, so it stayed in `latest.json`.
- On 3 Sep its date is in the past: no window selects it, `"All"` included. No
  result had been published either. The game existed in the file and appeared
  nowhere on the site.
- The 3 Sep 11:10 run fetched its result and it reappeared under Results.

For an evening kick-off that hole is roughly 16 hours wide, and it opens every
time the club plays in the evening.

**What was not wrong.** A reconstruction of every fixture ever recorded — the
stale local snapshot plus every fixture named in `changes.json`, 57 distinct —
found exactly one past-dated fixture with no result: fid `6959215`, 30 Aug
14:00 v St Bernards, and `changes.json` records it as `cancelled`. **No game
has been lost by disappearing from the feed unscored.** This is the evidence
the deferred store rests on, and it is why capture is out of scope here.

---

## Result windows

`RESULT_WINDOWS` becomes `["Last 7 days", "Last 14 days", "All"]` and
`ResultsTab` defaults to `"Last 7 days"`.

The `"Last weekend"` branch is **deleted** from `resultWindowRange` rather than
left in place. Nothing can select it once it leaves `RESULT_WINDOWS`, and a
block of careful comments guarding a dead window is worse than no block at all.
The unrecognised-name fallthrough already returns the "All" range, so a stale
value persisted anywhere degrades to showing everything rather than nothing.

The forward `WINDOWS` and `windowRange` are untouched. `"This weekend"` has the
same midweek blindness, but it is not the default on the Fixtures tab
(`AnnouncementTab.jsx:6` opens on `"Next 7 days"`) and a weekend-only list is
exactly what a Friday announcement wants.

---

## The clock — `src/lib/clock.js`

Deciding whether a kick-off has elapsed needs the current time where the club
plays, which nothing in the codebase has needed until now.

```js
export const CLUB_TZ = "Europe/Dublin";
export function clubNow(instant) // -> { date: "2026-09-03", time: "18:30" }
```

Pure: the caller supplies the instant, so tests pin it and nothing reads a
hidden clock. Built from `Intl.DateTimeFormat` + `formatToParts`, and it
returns **strings only** — no `Date` object ever touches a kick-off, per the
standing invariant that a UTC round-trip moves every kick-off by an hour for
half the year.

A separate module rather than an addition to `window.js`: that file declares
itself pure date arithmetic over ISO strings, and a clock is not that.

Verified 2026-09-03 on Node v20.20.2 (`process.config.variables.icu_small ===
false`, so full ICU): `Europe/Dublin` resolves, and both sides of the 25 Oct
2026 DST end format correctly (`00:30Z -> 01:30`, `02:30Z -> 02:30`).

**`today` moves onto this clock.** `App.jsx:125` derives `today` from the UTC
date, so between Irish midnight and 01:00 the whole site is a day behind —
`2026-09-03T23:30Z` is already 4 Sep in Dublin. It becomes
`clubNow(new Date()).date`. This affects the Fixtures tab as well as Results,
and is strictly more correct in both.

`check.mjs` stays on UTC. The cron runs around 11:00, when the UTC and Irish
dates always agree, so there is no defect to fix and no reason to disturb the
cron's behaviour.

---

## Pending — `src/lib/pending.js`

```js
export function pendingFixtures(fixtures, results, now)        // the rule
export function pendingLines(fixtures, results, config, now)   // the display shape
```

A fixture is pending when all three hold:

1. **Its kick-off has elapsed.** `f.date < now.date || (f.date === now.date &&
   f.time <= now.time)`. Both comparisons are string comparisons, which is only
   valid for zero-padded 24-hour times. All 14 distinct times in the live
   snapshot are strict `HH:MM`, but a single `"9:00"` would compare above
   `"18:30"` and make a morning game look permanently unplayed — so a time
   failing `/^\d{2}:\d{2}$/` falls back to the date-only comparison rather than
   comparing wrongly.
2. **No result carries its `fid`.** Identity is `fid`, never names or dates.
3. **Its date is no earlier than the `"Last 14 days"` floor** — that is,
   `f.date >= resultWindowRange("Last 14 days", now.date).from`, reusing that
   function rather than restating the arithmetic, so the two cannot drift. The
   snapshot only holds what the league still lists, so this bounds the one
   failure mode that outlives a run: a fixture stranded in the feed with a past
   date would otherwise sit in the list for months.

No grace period after kick-off. A game in progress reads as awaiting a result,
which is true, and any grace figure would be invented.

`pendingLines` returns the same `{kind, text, teamId, color}` shape as
`roundupLines`, so the tab renders it through the existing swatch markup. Every
line carries `kind: "pending"`, and each has a `teamId` and a `color` — unlike
the round-up there are no day or blank lines to interleave.

The order is newest first, then by squad label, then by `fid`, which makes it
**total**: the list never depends on how the caller happened to sort, the same
rule `roundupLines` follows.

**Labels resolve over the full `fixtures` list, never over the pending
subset.** `deriveLabels` shows the A/B letter only when the club runs more than
one side at that age and gender, so resolving over a pending list holding one
U14 side would silently rename "U14A Boys" to "U14 Boys". This bug has appeared
three times; the pending list is a filtered subset and therefore exactly the
shape that causes it.

`roundup` and `roundupLines` are not modified. They are imported by both the
site and `check.mjs`, and that shared import is the only thing stopping the
copied text and the emailed text from drifting.

---

## Display

A section on the Results tab, rendered only when the list is non-empty, placed
**outside** the `.card announcement` div:

```
No result yet
● U14A Boys v St Bernards — Wed 2 Sep, 18:30
```

Outside that div is the whole point — the section is visible on the site and
never reaches the clipboard. The wording is "no result yet", never "played,
awaiting score": a fixture also leaves the list when the league deletes it, and
that is indistinguishable from a played game, so the copy must not claim more
than is known.

The section ignores the window chips. It is a short "waiting on" list rather
than part of the round-up, and having it change when you select "Last 14 days"
would be noise.

---

## Error handling

| Situation | Behaviour |
|---|---|
| `results.json` unreadable (`results === null`) | Existing behaviour wins: the tab shows the load-failure card and no pending section. Deriving pending against a null store would list every elapsed fixture as awaiting a result. |
| `results.json` empty but readable | Pending derives normally. An empty store legitimately means nothing has been scored yet. |
| Snapshot holds no elapsed fixtures | No section rendered. The ordinary case. |
| Fixture time malformed | Date-only comparison for that fixture. Never throws. |
| Stale `"Last weekend"` value reaches `resultWindowRange` | Falls through to the "All" range. |

---

## Testing

Vitest, node environment, matching existing conventions.

- **`clock.js`** — pinned instants: `2026-09-03T23:30:00Z` → `2026-09-04
  00:30` (the day-behind case), a midsummer IST offset, and both sides of the
  25 Oct 2026 DST end.
- **`pending.js`** — elapsed and not-yet-elapsed; same-day before and after
  kick-off; a fixture with a result is excluded; the 14-day floor excludes an
  older fixture; a malformed time falls back to date-only; and the A/B letter
  survives, asserting labels resolved over all fixtures rather than the pending
  subset.
- **`window.js`** — `"Last weekend"` is absent from `RESULT_WINDOWS`; an
  unrecognised name returns the "All" range.
- **Existing tests to rewrite.** `test/results.test.js:126` and `:131` assert
  the empty-window cases against `"Last weekend"`, and `test/components.test.jsx`
  renders the tab with it. Both move to `"Last 7 days"`, with `:131`'s
  out-of-window result re-dated to fall outside seven days.
- **Components** — SSR smoke test via `renderToStaticMarkup` that the pending
  section renders, and that the copy text excludes it.
- `npm run build`, which catches JSX errors the tests cannot.

Counts are measured, never hardcoded: these assert rules, not totals.

---

## Deferred

**The persisted pending store.** Once a run happens after the game the fixture
leaves the snapshot, and if the league has still not published, the game
vanishes from the site again. Read-time derivation cannot cover that; only a
store that accumulates on disappearance can, keyed off the `p.date > today`
branch in `diff.js:22` that currently discards exactly this information.

It is deferred because the live data contains no instance of it — the single
candidate was a genuine cancellation — and a store means a new committed file,
which means editing the `seaninryan/fixtures-data` workflow to add it to the
commit step. The trigger for revisiting: a game known to have been played
appearing in neither the results nor the pending list.

---

## Consequences

- Midweek results become visible by default, which is most of what the club
  plays.
- `"Last weekend"` disappears as an option. Selecting the weekend alone is no
  longer possible; "Last 7 days" on a Monday covers it and more.
- The site's notion of `today` shifts from UTC to Irish local time, correcting
  the Fixtures tab as well between Irish midnight and 01:00.
- Two new modules' worth of surface (`clock.js`, `pending.js`) and no change
  to any file the cron writes.
