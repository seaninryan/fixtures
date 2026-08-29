# Results capture — design

Written 2026-08-29. Extends the fixtures tracker
(`docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md`), which listed
"Results and scores" as a non-goal. This spec lifts that one item and nothing
else: league tables, automatic posting and other clubs stay out of scope.

## Goal

Capture each fixture's result when the league publishes it, and produce a
**copyable round-up** of recent results in the club's house format — the
backward-looking twin of the existing announcement.

## Non-goals

League tables. Standings, form or streaks. Emailing results. Any club other
than 2960. Editing or correcting a score by hand.

---

## The data source

Investigated 2026-08-29 against the live endpoint. Two findings overturn what
the original spec assumed, and both were verified rather than reasoned about.

**`displayResults` is inert.** The original spec records the POST body as
`...&displayResults=` and `fetchFixtures.js` comments that the empty value "is
what asks for FIXTURES rather than results". That is wrong. `displayResults=1`
and `displayResults=` return **byte-identical** responses (258,114 bytes, 44
fixture blocks each). The parameter changes nothing. Correct the comment; do
not build on the parameter.

**Results are already in the response we fetch.** The same payload carries a
second block type, distinguished by class and by a `data-title` attribute:

```html
<ul class="column-eight table-body results" data-title="Result Information "
    data-date="29 Aug 2026" data-time="12:00"
    data-hometeam="Craughwell United" data-awayteam="St Bernards"
    data-homescore="1" data-awayscore="0"
    data-venue="Craughwell" data-compname="GFA Boys U14 Championship 1"
    data-referee="Martin Kenny" data-comment="">
```

`parse.js` splits on `table-body fixtures` and discards these. That is the
entire reason results have never been captured — not a missing endpoint.

Field notes from the live pull:

- **`data-fid` is present**, recovered from the same nested commented-out
  `.toggle-table` markup as fixtures. Verified: the result for
  `fid=6951014` corresponds to the fixture carrying that same fid in the
  previous snapshot. **Identity survives the fixture→result transition**, so no
  name or date matching is ever required.
- **our `team_id` is present**, via the same `clubprofile/2960/?...&team_id=<T>`
  link. Verified `235380` and `254061`.
- `referee` is populated on results ("Martin Kenny") where it is `"TBC"` on
  fixtures. Not used; noted so it is not mistaken for signal later.
- Scores are integers as strings. Draws and `0` are ordinary values — a score of
  `"0"` must never be treated as missing.

**Results age out, and fast.** The 2026-08-29 pull carried exactly **2** results
blocks — that day's two games — while the earliest *fixture* present was 01 Sep.
The feed is a rolling window, not an archive.

Retention, observed: both 29 Aug results were **still present on 30 Aug**, so the
window is at least two days. That is a floor, not a guarantee — it was measured
over one weekend and the league may prune on its own schedule. Design for **one
day**: the extra day is slack that may not always be there, and nothing in the
design should need it.

This is the binding constraint on the whole design. A run that does not happen
loses those results permanently, and the scheduler has already demonstrated a
six-hour drift and a multi-day failure to fire at all.

---

## Architecture

Follows the existing split: pure logic in `src/lib/`, thin components in
`src/components/`, only `fetchFixtures.js` and `scripts/check.mjs` touching the
outside world.

### Data flow

```
admin-ajax.php (unchanged request)
  └─ parse.js          → { fixtures, results, errors }     ← results is new
       └─ normalize.js  → result dates to ISO strings
            └─ runCheck.js
                 ├─ fixtures pipeline (unchanged)
                 └─ mergeResults(previous, incoming) → results.json
                                                          └─ results.js → round-up text
                                                               └─ ResultsTab.jsx
```

### New and changed modules

| Module | Change |
|---|---|
| `parse.js` | Return `results` alongside `fixtures`. Split on both block classes. |
| `normalize.js` | Normalize result dates. Same string-only date handling. |
| `results.js` | **New.** `mergeResults()` and `formatRoundup()`. Pure. |
| `window.js` | Add backward windows for results. |
| `runCheck.js` | Merge results into the accumulated set; return it to persist. |
| `dataSource.js` | Knows about `results.json`. |
| `ResultsTab.jsx` | **New.** Round-up, window selector, copy button. |
| `fetchFixtures.js` | Correct the `displayResults` comment. No behaviour change. |

### `results.json`

Lives in `seaninryan/fixtures-data` beside `latest.json`.

```json
{
  "version": 1,
  "updatedAt": "2026-08-29T12:39:54.143Z",
  "results": [
    {
      "fid": "6951014",
      "teamId": "235380",
      "date": "2026-08-29",
      "isHome": true,
      "ourTeam": "Craughwell United",
      "opponent": "St Bernards",
      "ourScore": 1,
      "theirScore": 0,
      "competition": "GFA Boys U14 Championship 1",
      "venue": "Craughwell"
    }
  ]
}
```

Scores are stored **from our point of view** (`ourScore`/`theirScore`) with
`isHome` recording which side we were. Home-first rendering is then a
presentation concern, not a storage one, and a result reads correctly without
consulting anything else.

---

## The round-up text

Built by `results.js`. Note the split: `mergeResults` runs in the cron, reached via
`runCheck`, while `formatRoundup` is used by the site alone. Unlike `announce.js` —
which both the site and the email must render identically — no email quotes the
round-up, so there is no drift to prevent and no shared-rendering constraint.

Format, using the two real results from 2026-08-29:

```
SATURDAY 29 AUGUST

U14A Boys 1-0 St Bernards
Cregmore/Claregalway C 4-3 U14B Boys
```

Rules:

- **Home team first**, always — the football convention.
- **Our side is written as its squad label**, exactly as the fixtures
  announcement writes `U14A Boys v St Bernards`. The label replaces the club
  name; it is never printed alongside it.
- **No times.** A result's kick-off time is spent information.
- Day headings match the announcement's (`SATURDAY 29 AUGUST`), so the two
  blocks look like siblings when pasted into the same thread.
- No leading whitespace on a result line, for the same reason as fixture lines:
  WhatsApp and Facebook treat indented lines as preformatted. Indentation is CSS
  on the site only.

Ordering: newest day first, and within a day, by squad label so the same squad
lands in the same place week to week.

---

## Windows

`window.js` is "the only module that knows what 'This weekend' means". Its
existing windows are all forward-looking and anchored at `today`. Results need
backward equivalents, added as **separate exports** rather than by generalising
the existing ones — `windowRange` is load-bearing for the announcement and its
weekend logic is subtle enough not to disturb.

```
RESULT_WINDOWS = ["Last weekend", "Last 7 days", "Last 14 days", "All"]
```

"Last weekend" mirrors "This weekend" reflected. On a **Saturday or Sunday** it is
the weekend in progress, so a Sunday-afternoon copy includes Saturday's games. On
**Monday to Friday** it is the most recently completed weekend — the Saturday and
Sunday just gone — so a Monday-morning round-up is the obvious thing to paste and
needs no thought from whoever is posting it. Default window: **Last weekend**.

---

## Safety rules

These are the results analogues of the existing invariants, and they matter for
the same reason: the failure mode is silent, wrong data that looks fine.

**An absent result is never a withdrawn result.** `mergeResults` adds and
updates; it never deletes. A result missing from today's feed means the feed
has moved on, never that the game was unplayed. This is the direct counterpart
of "a failed fetch must never look like a cancellation", and it is what makes a
missed run survivable rather than destructive.

**Zero results is normal, and must never abort.** Unlike fixtures — where zero
parsed fixtures is the signal of a blocked or redesigned page — most days have
no games. The zero-fixtures guard and the shrink guard apply to fixtures only.
Results must never contribute to either, or a quiet Tuesday would look like a
parse failure.

**A results parse failure costs only results.** `parse.js` never throws; one bad
block costs that block. A malformed results block must not prevent the fixtures
snapshot from being written — the change-alert path is the more important of the
two and must not become hostage to the newer one.

**Labels resolve over ALL fixtures, never a filtered subset.** This bug has
appeared three times and results open a fourth door: resolving labels over the
*results* alone would print "U14 Boys" whenever only one U14 side had played
that weekend, silently renaming the squad. Results take their labels from
`resolveTeams(fixtures, config)` over the full fixture set, exactly as
`changeReport` does.

**A squad whose season has ended keeps its label.** Once a squad has no upcoming
fixtures it leaves the fixture set, but its results remain. `teams.json` is
config, persists, and beats derivation, so a labelled squad is safe. For a squad
that was never in `teams.json` and has now left the fixtures, fall back to the
result's own `ourTeam` string rather than printing an empty label.

**A score of zero is a score.** `0` and `""` must not be conflated. A block with
an empty `homescore` is an unplayed fixture that has appeared in the results
list, and is skipped.

---

## Error handling

| Situation | Behaviour |
|---|---|
| No results blocks in the response | Normal. `results.json` unchanged. |
| Results block missing `fid` | Skip the block, record a parse error. Identity is non-negotiable. |
| Results block missing a score | Skip. Not yet played. |
| Score changes for a known `fid` | Update in place. The league corrects typos. |
| `results.json` absent on first run | Treat as an empty set and create it. |
| `results.json` unreadable by the site | An error state, not a spinner — same rule as `latest.json`. |

---

## Testing

Vitest, node environment, matching existing conventions.

- **`parse.js` against the real captured response.** The current fixture in
  `test/fixtures/` predates this work and contains no results blocks. Capture a
  fresh response that includes them and update `test/fixtures/meta.js`, per the
  testing conventions. The 2026-08-29 pull with its two results is a suitable
  capture.
- **`mergeResults`** — adds new, updates changed scores, and **never removes**;
  the never-removes case is the one that protects real history.
- **Zero results does not disturb the fixtures pipeline**, and does not trip the
  shrink or zero-fixtures guards.
- **Label resolution over the full fixture set** — the A/B letter survives a
  weekend in which only one of two same-age squads played. This is the
  regression test for the bug that has recurred three times.
- **A retired squad's result still renders a label.**
- **`formatRoundup`** — home-first ordering for both a home and an away result,
  a `0-0` draw, and no leading whitespace on any line.
- **Counts are measured, never hardcoded**, as everywhere else in this suite.
- `ResultsTab` gets an SSR smoke test via `renderToStaticMarkup`; interaction
  coverage stays manual after deploy.

---

## Consequences

`scripts/check.mjs` gains one file to write, so the workflow in
`seaninryan/fixtures-data` must `git add results.json` alongside the others.
That is a change to the **other repo** and must land with this work, or results
will be computed every day and committed never.

The site makes a second runtime fetch. `results.json` grows by roughly the
number of games played per week and stays small for a season.
