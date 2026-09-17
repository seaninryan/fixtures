# FAI Connect scan — design

Written 2026-09-17. Adds a **second data source** alongside the Galway FA
scraper: the Analyticom COMET LIVE API that backs the FAI Connect mobile app.

The club is being migrated onto FAI Connect league by league. Today exactly two
squads have left the old system and live only in the new one; over the coming
seasons the rest follow. This spec adds the second scan and the rendering that
joins the two, so that a squad moving across changes which file it lands in and
nothing else.

Source notes: `~/Downloads/fai-connect-api-notes.md`, captured from app traffic.
Everything below marked **verified** was confirmed against the live API on
2026-09-17; the notes left several of these open and explicitly warned against
guessing them.

## Goal

Fixtures and results for the squads that have migrated to FAI Connect, appearing
in the same announcement as the Galway FA squads, with the same change alerts.

## Non-goals

Migrating the Galway FA squads off the old scraper — that is the league's
decision, not ours, and this design must keep working throughout. Standings or
league tables. Match events, scorers, cards, lineups. Replacing `parse.js`.
Renaming any existing id (see **Identity**). A second copyable announcement.

---

## What the live API actually does

Nine findings, because several of them contradict or extend the notes and each
one is load-bearing below.

**1. Only two squads have migrated.** Of the 25 teams returned for club 10671,
only `61270 Craughwell United Juniors` (5 future, 9 past) and
`87946 CUFC Reserves` (3 future, 0 past) have any matches at all. The other 23
return empty and are still on Galway FA. The notes said "Junior Men"; Reserves
is active too.

**2. The team list is full of stale entries**, as the notes warned — names
carrying `25/26`, squads that have not played in two years. It cannot be
filtered by name. A team with no matches is simply skipped.

**3. Completed-match fields, verified.** The notes said to map these from a real
response rather than guess. Captured:

```json
"homeTeamResult": { "current": 0, "regular": 0, "half": 0 },
"awayTeamResult": { "current": 4, "regular": 4, "half": 2 },
"liveStatus": "PLAYED",
"result": "L",
"team": "H"
```

`current` is the final score. `result` and `team` are both relative to the
**requested** team, not to the home side. Statuses observed across all 18
matches: `SCHEDULED`, `POSTPONED`, `PLAYED`.

**4. `past` returns two years of history.** The Juniors' nine past matches reach
back to **2024-09-22** — an FAI Junior Cup 24/25 run and a Connacht Cup tie from
January 2025. This is the single most consequential finding: the Galway feed
only ever carries the last day or two of results, so the results store has never
had to think about seasons. This endpoint hands over two of them at once.

**5. Season cannot be derived from competition names.** Two of the nine past
matches have **no `parentName` and no `parentId`** at all ("Mens Connacht Cup
Final 2026", "Connacht Cup 24/25"). Any filter keyed on the season name would
silently drop them — and a genuine current-season cup result would vanish. The
cutoff must be date-based. This is why the `parentId` approach was rejected.

**6. `size` is the total, not the page length.** Verified: `pageSize=2` returns
`size=9` with two results. This gives a free truncation guard —
`result.length < size` means the fetch was incomplete. `pageSize=100` and `500`
are both honoured and return everything.

**7. The trailing `/1` path segment is inert.** The notes flagged its meaning as
unknown and said not to reinterpret it. Verified: `/0`, `/1`, `/2` and `/3`
return byte-identical results. We keep sending `/1` because the app does, but
nothing depends on it.

**8. There is an undocumented match-detail endpoint carrying the venue.**
`GET /api/live/match/{id}` returns a `facility` object:

```json
"facility": { "id": 88023, "name": "Craughwell United",
              "address": "Shanbally, Craughwell, ...", "place": "Craughwell" }
```

The paginated list has **no venue field whatsoever**. `facility.place` for a
Craughwell home game is exactly `"Craughwell"`, which is already
`announce.js`'s `HOME_VENUE` — so the existing "only name the ground when a home
game is somewhere other than home" rule works unchanged. One fixture
(`52871799`) returned a null facility, so absence must be tolerated.

**9. There is a User-Agent denylist.** `Python-urllib/3.12` gets a **403**;
curl's default, `okhttp/4.9.1`, `node` and a browser UA all get 200. The
`api_key` header is genuinely required — without it, 403. This is the same class
of trap as the CloudFront rule documented in `fetchFixtures.js`, and it gets the
same kind of comment: a default client UA is not safe to rely on, so we send an
explicit one.

### Id ranges

| | Galway FA | FAI Connect |
|---|---|---|
| fixture id | 6,946,083 – 6,972,294 | 25,601,931 – 52,871,799 |
| team id | 234,323 – 380,288 | 29,985 – 87,946 |

Disjoint **today**. Nothing enforces it, both are bare numeric strings, and
`teams.json` is keyed on team id and holds labels and colours — so a collision
would silently give a squad another squad's identity. See **Identity**.

---

## Storage: separate files, shared config

The scan outputs are **parallel files**, not a merged snapshot:

| File | Contents |
|---|---|
| `latest-fai.json` | `{version, fetchedAt, fixtures}` — the existing Fixture shape |
| `results-fai.json` | `{version, updatedAt, results}` — the existing Result shape |
| `changes-fai.json` | change history, same shape as `changes.json` |
| `teams.json` | **shared, not duplicated** — see below |

A merged `latest.json` was considered and rejected: it would require renaming
every existing `fid` and `teamId` in the data repo, and the owner chose not to
pay that cost for a benefit that render-time joining provides anyway.

**`teams.json` stays a single file**, and this is the one place the design
departs from a clean split. `seedConfig` assigns colours by walking `PALETTE`
and taking the first unused entry. Two independent config files would each hand
out `PALETTE[0]`, putting **two squads in the same announcement in the same
colour**. Colour distinctness is inherently global the moment the rendering
merges, so the config that provides it must be too. It also keeps one
`EDIT_TEAMS_URL` rather than two.

## Identity

**FAI ids are prefixed; Galway ids stay bare.**

```
teamId: "fai:61270"        fid: "fai:52005172"
```

This is what makes a shared `teams.json` safe, and it requires **no migration**:
no existing key in `latest.json`, `results.json` or `teams.json` changes. Only
the new source carries a prefix. Collision stops being unlikely and becomes
structurally impossible, so the two id ranges drifting into each other in a
future season is a non-event rather than a silent corruption.

`fid` is prefixed as well as `teamId`. It is not strictly required while the
snapshots are separate files, but the change history and the alert email do show
both sources together, and an unprefixed id there would be ambiguous to anyone
reading it. The rule "identity is the league's fixture id" survives intact — the
prefix names *which league*.

---

## The season rule

A new export in `window.js`, which already declares itself pure date arithmetic
over ISO strings:

```js
// The most recent 1 August on or before `today`.
//   "2026-09-17" -> "2026-08-01"
//   "2026-05-01" -> "2025-08-01"
export function seasonStart(today)
```

Derived from `today`, so it rolls over on its own with no annual edit and no
constant to forget. 1 August is early enough to precede every squad's first
competitive game (most start in September) and late enough to sit clear of the
previous season's tail.

Applied in **three** places:

1. **The FAI ingest.** `past` matches before the cutoff never enter the store.
   This is what keeps the 2024 Junior Cup run out of the Juniors' record.
2. **`form.js`.** Records are computed over the current season only. Today this
   changes nothing visible, because the store holds only 26/27 data — but on
   **1 August 2027** the existing Galway squads would otherwise start carrying
   last season's results into their season record, silently and permanently.
   That is a latent bug in shipped code, and the cutoff fixes it.
3. **The results round-up's "All" window.** `resultWindowRange` currently
   returns `0000-01-01` to `9999-12-31`, so "All" means all time. It becomes all
   *season*.

Scope note: (2) and (3) are changes to existing, working, tested behaviour,
deliberately included rather than deferred. The logic is written either way, and
a season concept that is true of one scan but not of the app is the kind of
half-rule that gets rediscovered as a bug.

`mergeResults` never deletes, so a result admitted in error is permanent without
hand-editing the data repo. The filter therefore runs on **ingest** as well as
at read time — belt and braces, and the ingest filter is the one that matters.

---

## Modules

The existing split holds: network at the edge, everything decision-shaped pure
and unit-tested.

### `src/lib/fetchFaiConnect.js`

The second module in the project that touches the outside world.

```js
export async function fetchTeams(clubId, opts)
export async function fetchMatches(teamId, period, opts)   // "future" | "past"
export async function fetchMatchDetail(matchId, opts)
```

- Sends `api_key`, `accept-language: en`, and an **explicit User-Agent**.
  Finding 9 — a default client UA is not dependable here.
- `pageSize=100`.
- **Throws when `result.length < size`.** Finding 6. A partial list read as
  complete is a fixture list that shrank for no reason, which is exactly the
  failure this project refuses to write.
- Like `fetchFixtures`, it does **not** judge an empty body. Zero teams or zero
  matches is `runFaiCheck`'s decision, not this module's.

### `src/lib/faiConnect.js`

Pure. COMET JSON into the shapes the rest of the codebase already speaks.

| Fixture field | Source |
|---|---|
| `fid` | `"fai:" + match.id` |
| `teamId` | `"fai:" + <our side's team id>` |
| `date`, `time` | `clubNow(new Date(match.dateTimeUTC))` — see below |
| `isHome` | `match.team === "H"`, cross-checked against `awayTeam.parent.id` |
| `ourTeam` / `opponent` | the two sides, ordered by `isHome` |
| `venue` | `facility.place`, home fixtures only; `""` when absent |
| `competition` | `competition.name` |
| `comment` | `liveStatus` when it is neither `SCHEDULED` nor `PLAYED` |

**`dateTimeUTC` is epoch milliseconds and must not leak as a `Date`.** It is
converted through `clubNow` from `clock.js`, which returns the club's local date
and time as **strings**. `clock.js` remains the only place a `Date` is
unwrapped — this module delegates rather than duplicating the timezone logic.
Getting this wrong moves every kick-off by an hour for half the year: the
Juniors' 2026-09-19 fixture is `13:00Z`, which is **14:00** in Craughwell.

`venue` is fetched only for **home** fixtures — roughly four extra requests a
day. Away venues never render (`formatFixtureLine` only names a ground for a
home game played elsewhere), so fetching them would be cost with no output.
Away fixtures get `""` consistently, so `diff.js` sees no spurious venue change.

Mapping `comment` from `liveStatus` means a `POSTPONED` fixture produces a
change alert through the existing `comment` path, with no new change type. One
postponement is already present in the live data.

Results map from `homeTeamResult.current` / `awayTeamResult.current`, stored
from our point of view with `isHome` recording which side we were — exactly as
`normalizeResult` does. `result` (`W`/`D`/`L`) is **not** stored: it is
derivable from the scores, and storing a second source of truth for who won
invites the two to disagree.

### `src/lib/runFaiCheck.js`

Pure. The FAI pipeline minus I/O, mirroring `runCheck.js`.

**Guards.** The 50% shrink rule is deliberately **not** reused. The Juniors have
five upcoming fixtures; playing three in a fortnight is ordinary and would trip
it. In its place:

- **Zero teams from discovery aborts.** An empty team list is a broken auth or a
  moved endpoint, never a club with no teams.
- **Every team returning zero matches, when the previous snapshot had some,
  aborts.** This is the shape a blocked or rerouted API actually takes, and it
  catches what the shrink rule was for without the false alarms.
- **A first run reports no changes**, as Galway does. Diffing against an empty
  baseline would email both squads' whole seasons.

`diff.js`, `mergeResults`, `seedConfig` and `changeReport` are reused unchanged.
They are keyed on `fid` and `teamId` and do not care which league those came
from.

---

## Wiring

### `scripts/check.mjs`

Galway runs first and writes. The FAI scan then runs **in isolation**: a failure
is caught and logged, its files are left untouched, and the run exits non-zero.

This preserves the invariant that matters — *a failure is never written as
data* — without letting a third-party API serving two squads stop the nineteen squads still
on Galway FA from updating. The non-zero exit keeps the Action visibly red, so the
failure is loud rather than silent. A stale `latest-fai.json` is detectable from
its own `fetchedAt`.

One email covers both sources.

### Environment

```
FAI_CONNECT_API_KEY     required; absent = scan skipped loudly, non-zero exit
FAI_CONNECT_CLUB_ID     default 10671
FAI_MATCHES_FILE        captured JSON bundle, for offline runs
```

`FAI_MATCHES_FILE` is the counterpart of `FIXTURES_HTML_FILE` and exists for the
same reason: rehearsing the live path without touching the live API. It points
at a single JSON file holding one captured run — the team list, and each team's
`future` and `past` payloads keyed by team id:

```json
{ "teams": [ ... ],
  "matches": { "61270": { "future": {...}, "past": {...} } },
  "details": { "52005175": {...} } }
```

One file rather than a directory of them, so a capture can be committed, diffed
and replaced as a unit.

**The API key is a credential** lifted from mobile app traffic. It never enters
this repo, the committed captures, the data repo's JSON, or any browser-side
code. The site cannot call this API anyway — like the Galway endpoint, it is
server-side only.

**This changes the script's env contract, so the data repo must change too.**
Per CLAUDE.md, `scripts/check.mjs` lives here and the workflow that calls it
lives in `seaninryan/fixtures-data`. Two manual steps there:

1. Add `FAI_CONNECT_API_KEY` as a repository secret.
2. Add it to the workflow step's `env:` block.

Until both are done the scan skips and the build is red — which is the intended
signal, not a regression.

### The site

`App.jsx` loads the three new files alongside the existing four, degrading the
way `results.json` already does: a missing `latest-fai.json` is an error state
for the FAI section, never a spinner.

**The announcement takes the union of both fixture lists in a single
`announceLines` call**, and renders them as ONE chronological list.

**Superseded 2026-09-17, same day.** This originally grouped by source under an
"ADULT SQUADS" heading. The owner asked for the two sources to read as one after
seeing it live, and they were right: which back-end system a fixture came from is
plumbing, a shared Saturday reads better as one Saturday than two, and the heading
was a wording problem waiting to happen once youth squads migrate. The single
`announceLines` call over the union is unchanged and remains load-bearing — see below.

Calling `announceLines` twice, once per source, is **not an option**. Labels
would resolve over two filtered subsets, and `deriveLabels` decides whether to
show the A/B letter by counting the club's squads at a given age and gender in
the list it is given. That is the bug that has already appeared three times in
this codebase. Labels resolve once, over everything.

**Every tab takes the union of both stores**, resolved once, for the same reason
the announcement does:

| Tab | Behaviour |
|---|---|
| Announcement | union of `latest.json` + `latest-fai.json`, one chronological list |
| Results | union of `results.json` + `results-fai.json`, one round-up |
| Form | union of both results stores and both fixture lists |
| Changes | union of `changes.json` + `changes-fai.json`, newest first |
| Squads | driven by the shared `teams.json`, so it already covers both |

The Form tab merging is what makes the shared `teams.json` pay for itself: a
squad keeps one colour and one label across the chart, the table, the round-up
and the announcement, whichever system it is currently on. It is also why the
`fai:` prefix reaches `teamId` rather than stopping at `fid` — every one of
these surfaces keys on `teamId`.

A squad that migrates mid-season will hold results in **both** stores, its old
ones under a bare `teamId` and its new ones under a prefixed one. They will read
as two squads until the owner points both ids at the same label in config. This
is a known and accepted consequence of the file split; nothing derives the link
automatically, because the two systems share no identifier that would support
it.

The two migrated squads derive **no label**: `ageOf` looks for a `U<n>` in the
competition name and "Western Hygiene Supplies Brod Trill Mens Premier League"
has none. Both fall back to their raw feed names and appear in `unknown`. That
is correct existing behaviour — visibly unfinished, never silently wrong — and
the owner names them once in config, after which config beats derivation.

---

## Testing

Captured JSON goes in `test/fixtures/`, following the `club2960.html`
convention: real responses, never hand-built. The API key is scrubbed — it lives
only in request headers, which are not captured.

- `fai-teams.json` — all 25 teams, stale entries included
- `fai-matches-61270-{future,past}.json` — the nine-match history that
  exercises the season cutoff
- `fai-matches-87946-future.json` — a squad with future fixtures and no past
- `fai-match-detail.json` — including the null-facility case
- `test/fixtures/meta.js` gains the corresponding counts

**Counts are measured, not hardcoded** — the invariant holds here too. Tests
assert rules: that pre-cutoff matches are excluded, that a stale team with no
matches is skipped, that `13:00Z` becomes `14:00`, that a missing facility does
not throw, that zero teams aborts.

`seasonStart` is tested either side of 1 August and across a year boundary.
`form.js`'s existing tests need dates checked against the cutoff.

## Risks

**The API is undocumented and unowned.** Field names, the UA denylist and the
key itself can all change without notice. Mitigated by the guards, the loud
failure and the isolation from the Galway path — but it will break eventually,
and the notes' suggestion of asking FAI for a supported club key stands.

**`GET /api/live/match/{id}` was not in the notes.** Discovered by probing.
Lower confidence than the endpoints observed in real app traffic. It affects
only `venue`, so if it disappears the fixtures still publish without one.

**Opponent names from COMET are dirty** and land verbatim in the announcement:
a Junior Cup opponent recorded as `"Corrib Celtic Girls U11 A"`, others carrying
season suffixes like `"Merlin Woods Reserve 2425"`. Not worth a cleanup rule —
any such rule would be guessing at the league's intent. Noted so it is
recognised as upstream data rather than a bug here.
