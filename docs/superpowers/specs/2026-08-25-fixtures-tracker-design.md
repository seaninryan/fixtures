# Craughwell United fixtures tracker — design

**Date:** 2026-08-25
**Status:** approved (design), ready for planning

## Problem

Club announcements for Craughwell United are written by hand from the Galway FA
club page. Two things go wrong. Assembling the weekend post is manual, and the
league moves fixtures *after* an announcement has gone out — a changed kick-off
time or venue reaches members only if someone happens to re-read the page.

## Goals

1. Produce a **copyable announcement** of upcoming fixtures in the club's house
   format, ready to paste into WhatsApp, email, or a Facebook post.
2. **Detect changes** against the previous pull and email a report when the
   league moves, adds, or cancels anything.

## Non-goals

Results and scores. League tables. Posting to WhatsApp or Facebook
automatically. Any club other than 2960. Player or squad management.

---

## The data source

Investigated 2026-08-24 against the live site. These findings are the reason the
architecture looks the way it does; re-read them before changing the fetch layer.

`https://galwayfa.ie/clubprofile/2960/` is a WordPress page running the
SportLoMo plugin. The visible page contains **no fixture data** — it is a shell
that loads fixtures by AJAX on `document.ready`:

```
POST https://galwayfa.ie/wp-admin/admin-ajax.php
     body: action=fixtures&club_id=2960&competition_id=&team_id=&displayResults=
```

**The WAF blocks default client user-agents.** A plain `curl` POST returns a
CloudFront `403 ERROR / Request blocked`. The same request with a browser
`User-Agent` plus `Referer: https://galwayfa.ie/clubprofile/2960/` returns 200
and ~240KB of HTML. Any fetch code must send those headers.

**AMENDED 2026-08-26 — the parameters must travel in the BODY, not the query
string.** Written as a query string (as this spec originally had it) the request
succeeds from a residential connection and is refused from a datacenter one, so it
passed every local test and 403'd the first time the cron ran on a GitHub runner.
Probed from a runner: the club page returns 200, so the site is not blocking those
IPs; `admin-ajax.php?action=heartbeat` returns 200, so the path is not blocked;
the body says `Request blocked.`, which is a WAF rule rather than CloudFront
geo-restriction; and the same parameters moved into a form-encoded POST body
return 200. The response is byte-identical either way — 272,955 bytes, 49
fixtures. The rule inspects the query string. A browser's `$.post` sends a body;
match the browser, and add `Content-Type: application/x-www-form-urlencoded`.

**The fetch cannot happen in the browser.** The endpoint sends no CORS headers,
so a `fetch` from a GitHub Pages origin is blocked regardless of user-agent.
This is the single constraint that rules out the client-only architecture used
by fancystats and ballislife.

**The response is unusually clean.** Each fixture is one `<ul>` carrying every
field as a `data-` attribute — no text scraping required:

```html
<ul class="column-eight table-body fixtures"
    data-date="29 Aug 2026" data-time="12:00"
    data-hometeam="Craughwell United" data-awayteam="St Bernards"
    data-homescore="" data-awayscore=""
    data-venue="Craughwell" data-compname="GFA Boys U14 Championship 1"
    data-referee="TBC" data-referee2="" data-assessor="" data-comment="">
```

Two identifiers are **not** in the attributes and must be recovered from the
markup inside each block:

- **`data-fid`** on the nested `.toggle-table` image — the league's fixture id
  (e.g. `6951014`). Unique per fixture; **this is our identity key**.
- **our `team_id`** — from the link whose href matches
  `clubprofile/2960/?competition_id=<C>&team_id=<T>`. The opposing side links to
  a different `clubprofile/<id>/`, which is how our team is told from theirs.

Field notes from the live pull:

- `referee` is `"TBC"` on all 43 fixtures; `referee2` and `assessor` are empty
  on all 43. Treated as dead fields.
- `comment` is where the league writes the human explanation of a change:
  `"Moved as agreed (21/8)"`, `"Colemanstown requested kickoff time"`,
  `"Home KO SUN 4PM"`. It is signal, not noise.
- `homescore`/`awayscore` are empty on all 43 — **the endpoint returns upcoming
  fixtures only**. Played fixtures leave the list. See "played vs cancelled".
- Times are Irish local, with no timezone marker.

Shape of the 2026-08-24 pull: 43 fixtures, 16 teams, one competition per team,
spanning 29 Aug 2026 → 13 Jan 2027. Saturday/Sunday clusters plus a midweek
U21 game most Wednesdays at 20:15.

---

## Architecture

Follows the fancystats/ballislife house style — **pure logic in `src/lib/`,
thin components, vitest in the node environment** — with one addition: a Node
script running in CI, because the fetch cannot happen in a browser.

```
.github/workflows/check.yml     cron + workflow_dispatch
        |
        v
scripts/check.mjs --> fetch --> parse --> diff vs data/latest.json
        |                                       |
        |-- write data/latest.json              |
        |-- add run to data/changes.json <------+
        |-- git commit                    (history, free)
        +-- Resend email, if configured and something changed

.github/workflows/deploy.yml -> GitHub Pages (Vite build, static)
        +-- site reads the committed JSON. No auth, no login, no server.
```

**No Google Drive and no OAuth anywhere.** Considered and rejected: ballislife's
Drive layer is an interactive browser flow (`initTokenClient` →
`requestAccessToken` → consent popup), which a cron cannot perform. Making it
work headlessly needs a service account or a stored refresh token, and a consent
screen left in "Testing" status expires refresh tokens after 7 days, silently
breaking the cron. Git gives us versioned storage the robot can write with the
token it already has, and `git log` becomes a permanent, readable history of
every fixture change — which is precisely the product requirement.

**Consequence, accepted:** a static site cannot write to git, so the config
editor (§ Config) works by copy-and-commit rather than saving directly.

---

## Repository layout

```
scripts/check.mjs            orchestrator: the only place I/O meets purity
src/lib/fetchFixtures.js     the one impure fetch
src/lib/parse.js             HTML -> {fixtures, errors}; never throws
src/lib/normalize.js         raw attrs -> typed Fixture
src/lib/teams.js             label derivation + config merge + unknown detection
src/lib/squadColors.js       colour per team_id, stable fallback
src/lib/diff.js              (prev, next, today) -> Change[]
src/lib/announce.js          (fixtures, config, window, today) -> String
src/lib/changeReport.js      Change[] -> {subject, text}
src/lib/window.js            named date windows -> predicate
src/components/*.jsx         thin: wire state, render
data/latest.json             snapshot, written by the cron
data/changes.json            change history, written by the cron
data/teams.json              labels + colours, written by you
test/fixtures/               golden HTML captured from the live endpoint
```

`announce.js` is imported by **both** the site and `check.mjs`, so the app and
the email can never render fixtures differently.

---

## Module contracts

| Module | Contract |
|---|---|
| `fetchFixtures.js` | `fetchFixtures() -> Promise<string>`. POSTs with browser UA + Referer. Throws on non-200. The only network I/O in the project. |
| `parse.js` | `parse(html) -> {fixtures: RawFixture[], errors: string[]}`. **Never throws.** One malformed block costs that block, not the other 42. |
| `normalize.js` | `normalize(raw) -> Fixture`. Parses `"29 Aug 2026"` to `"2026-08-29"`, resolves `isHome`/`opponent` from which side is club 2960. |
| `teams.js` | `deriveLabel(name, comp) -> string \| null`; `resolveTeams(fixtures, config) -> {labels, colours, unknown: teamId[]}`. Config wins over derivation, always. |
| `diff.js` | `diff(prev, next, today) -> Change[]`. Pure, keyed on `fid`, date-aware. |
| `announce.js` | `announce(fixtures, config, window, today) -> string`. Deterministic; golden-file tested. |
| `changeReport.js` | `changeReport(changes, config) -> {subject, text}`. |
| `squadColors.js` | `squadColor(teamId, config) -> {bg, fg}`. Config override, else stable hash of `teamId`. Never returns nothing. |
| `window.js` | `windowPredicate(name, today) -> (fixture) -> boolean`. The four named windows; no other module knows their boundaries. |

---

## Data model

```jsonc
// data/latest.json
{
  "version": 1,
  "fetchedAt": "2026-08-25T06:00:11Z",
  "fixtures": [
    {
      "fid": "6951014",            // identity. Never derived from anything else.
      "teamId": "235380",          // our side
      "date": "2026-08-29",        // Irish local date
      "time": "12:00",             // Irish local time
      "isHome": true,
      "opponent": "St Bernards",
      "venue": "Craughwell",
      "competition": "GFA Boys U14 Championship 1",
      "comment": ""
    }
  ]
}
```

```jsonc
// data/teams.json — the only file you edit
{
  "version": 1,
  "teams": {
    "235380": { "label": "U14A Boys", "color": "#1f6feb" },
    "238142": { "label": null,        "color": null      }  // needs a label
  }
}
```

```jsonc
// data/changes.json — newest run first; runs are only ever added, never edited
[
  {
    "checkedAt": "2026-08-25T06:00:11Z",
    "changes": [
      { "type": "moved", "fid": "6951014", "teamId": "235380",
        "from": { "date": "2026-08-30", "time": "14:00" },
        "to":   { "date": "2026-08-30", "time": "16:00" },
        "comment": "Colemanstown requested kickoff time" }
    ]
  }
]
```

Dates and times are stored **exactly as the feed gives them**, as strings, and
compared in `Europe/Dublin`. They are never converted to UTC `Date` objects for
storage — a 12:00 kick-off must not become 11:00 in the announcement because of
a timezone round-trip.

## Invariants

1. **Identity is `fid`.** Every comparison keys off the league's fixture id,
   never off names or dates. This is what turns a reschedule into
   `12:00 → 14:00` instead of a delete plus an unrelated add.
2. **A failed fetch must never look like a cancellation.** If the request
   errors, returns non-200, or parses to zero fixtures, `check.mjs` **aborts
   without writing the snapshot and exits non-zero**. Without this rule one WAF
   hiccup emails "43 fixtures cancelled" and then poisons the baseline so the
   next run reports 43 new fixtures. This is the most important rule here.
3. **Nothing derived is stored.** Snapshots hold only what the feed gave.
   Labels, colours, windows and announcement text are computed at render time,
   so correcting a label retroactively corrects every view and every future
   email.
4. **Config always beats derivation.** A label in `teams.json` is never
   overwritten by the heuristic, so labels cannot drift when the league renames
   a competition or a B team registers.
5. **`parse.js` never throws.** Partial data beats no data.

---

## Diff semantics

Match `prev` and `next` on `fid`. Emit, in this severity order:

| Type | Condition |
|---|---|
| `cancelled` | `fid` gone from `next`, **and its date is still in the future** |
| `moved` | same `fid`, `date` or `time` differs |
| `venue` | same `fid`, `venue` differs |
| `opponent` | same `fid`, `opponent` or `competition` differs |
| `added` | `fid` absent from `prev` |
| `comment` | same `fid`, `comment` differs, nothing else did |

**Played vs cancelled.** The endpoint returns upcoming fixtures only, so a
fixture leaving the list is ambiguous. Resolution: gone **and past** is a played
game and is silent; gone **and still future** is a real cancellation and alerts.

`referee`, `referee2`, `assessor` and scores are ignored entirely.

A `comment` change accompanying another change is attached to that change as
context rather than reported separately — the league uses it to explain moves.

---

## Team labels and colours

Labels are `U14A Boys` style. **The A/B letter comes from the team name, not the
division:** the feed calls the A side `Craughwell United` and the B side
`Craughwell United B`. Age and gender come from the competition name.

The derivation gets 13 of 16 right. It cannot resolve three, and they are
seeded as `null` for the owner to fill in:

| team_id | competition | why derivation fails |
|---|---|---|
| `238142` | `GFA U16 Division 1` | no gender in the name, and `GFA U16 Boys Division 1` is a **different** team |
| `234323` | `GFA U21 Division 1` | no gender in the name |
| `379931` | `GFA Women's Championship` | no age or gender pattern |

A `team_id` not present in `teams.json` is auto-appended by the cron with
`label: null`, and the change email says **"new team needs a label"**. Until
labelled, the app and email fall back to the raw feed name — visibly unlabelled,
never silently wrong. Because `team_id` is stable, a cup competition entered by
an existing team inherits its label and colour with no action.

Colours follow fancystats' `teamColors.js`: explicit override, else a stable
hash of `team_id` so nothing is ever colourless, with `contrastFg` picking
readable foreground text. Seeded from a 16-colour palette chosen for distinct
age groups.

---

## Config editing

`data/teams.json` lives in the repo. The app provides a real editor — colour
picker, label fields, and a live preview of the announcement as edits are made —
then a **Copy JSON** button and a deep link to that file's edit page on
github.com. Paste, commit, done; workable from a phone.

This is a deliberate consequence of choosing git: a static site cannot write to
the repo. The alternative (Drive + OAuth in the app + a refresh token for the
cron) was rejected as disproportionate machinery for one small file.

---

## Announcement format

House format, confirmed with the owner: `v` for home, `@` for away.

```
CRAUGHWELL UNITED
Sat 29 Aug - Fri 4 Sep

SATURDAY 29 AUGUST
  12:00  U14A Boys v St Bernards
  12:00  U14B Boys @ Cregmore/Claregalway C

SUNDAY 30 AUGUST
  12:00  U14 Girls @ Colga B
  14:00  U16 Boys v St Bernards

MONDAY 31 AUGUST
  18:30  U18 Boys v Renmore
```

- This sample assumes `teams.json` has been completed. A team still carrying
  `label: null` renders its raw feed name (`Craughwell United`) instead — the
  Sun 14:00 game above is team `238142`, one of the three unresolved ones.
- Grouped by date, ordered by kick-off within a date.
- Venue is normally omitted: `v`/`@` already implies it. A **home** game at a
  ground other than Craughwell appends `(at Colemanstown)`.
- Opponent names keep the league's suffix (`Cregmore/Claregalway C`) — it tells
  parents which of the opposition's sides they are playing.
- Windows, all inclusive of both ends and evaluated in `Europe/Dublin`:
  `This weekend` (the coming Fri–Sun; on a Sat or Sun, the current one),
  `Next 7 days` / `Next 14 days` (today + N-1 days), `All` (every future
  fixture). Defaults to **Next 7 days** so midweek U21 games are not stranded.
- Optional toggle: prefix each line with the squad's colour as an emoji square
  (`🟦 12:00 U14A Boys v St Bernards`), which survives WhatsApp intact. Off by
  default.

## Change email

Plain text, via Resend, reusing the existing sideline account. Ordered
most-disruptive first.

```
Subject: Craughwell fixtures: 2 changes (1 moved, 1 new)

MOVED
  U16 Boys v St Bernards
  Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00
  League note: "Colemanstown requested kickoff time"

NEW
  U21 Boys @ Athenry - Wed 16 Sep, 20:15
  GFA U21 Division 1

Site: https://seaninryan.github.io/fixtures/
```

**A failed or aborted run sends nothing** — invariant 2 exits before the diff
exists, and the Action's own failure is the signal. Otherwise **sent only when
`changes.length > 0`.** Guarded exactly like sideline's notify
route (`if (!secret) return ok()`): absent `RESEND_API_KEY` or `ALERT_TO_EMAIL`
logs `email not configured - skipping` and exits clean. The snapshot is still
written and committed. So the email path ships fully built and tested, and stays
silent until two secrets are added.

---

## Testing

Vitest, node environment, no jsdom — matching both reference projects.

- `parse.js` is tested against the **real ~240KB response**, captured to
  `test/fixtures/`, not hand-built HTML. Asserts 43 fixtures, 16 distinct
  `team_id`s, all `fid`s unique and present.
- `diff.js` gets a table of before/after pairs covering all six change types
  plus: gone-and-past is silent, gone-and-future alerts, and an empty `next`
  aborts rather than reporting mass cancellation.
- `announce.js` is golden-file tested — the exact expected text, so a format
  regression fails loudly.
- `teams.js` asserts the 13 correct derivations, the 3 unresolvable ones, and
  that config always wins over derivation.
- Components get SSR smoke tests via `renderToStaticMarkup`.

## Operations

- **Node 20.** System node is v14 and silently breaks Vite/Vitest; locally
  `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`. CI uses
  `actions/setup-node`.
- **Schedule:** `0 6 * * *` UTC. GitHub cron is UTC-only, so this is 07:00 IST
  in summer and 06:00 GMT in winter. Accepted; fixtures move days ahead, not
  hours.
- `workflow_dispatch` for manual runs.
- `permissions: contents: write` for the snapshot commit. Commit is skipped when
  the working tree is clean, so quiet days add no noise.
- **Secrets:** `RESEND_API_KEY`, `ALERT_TO_EMAIL`. Both optional.
- **Repo visibility: public** (decided 2026-08-25). The fixture data is already
  public on galwayfa.ie, so there is nothing to hide, and Pages stays free.
  `RESEND_API_KEY` and `ALERT_TO_EMAIL` live in GitHub Secrets, which are not
  exposed by a public repo.

**AMENDED 2026-08-26 — two repos, not one** (decided by the owner). The snapshots
live in `seaninryan/fixtures-data`; the code lives in `seaninryan/fixtures`. Three
consequences, all of them load-bearing:

- **The site reads the JSON at runtime** from `raw.githubusercontent.com`, the only
  github.com host that sends `Access-Control-Allow-Origin: *`. So a new snapshot
  reaches the site with no rebuild, and `deploy.yml` needs no data trigger.
  `src/lib/dataSource.js` is the only place that knows the location.
- **The cron lives in the data repo**, because that is the repo it writes to: a
  workflow's `GITHUB_TOKEN` writes only to its own repo, so this needs no
  long-lived PAT to expire and silently break the cron. It checks the code repo
  out read-only. `scripts/check.mjs` and the workflow that calls it are therefore
  versioned apart — change the script's env contract (`DATA_DIR`) and change the
  other repo too.
- **The email secrets belong to the data repo**, where the cron runs.

Everything this spec says about `data/*.json` still holds; the files are simply at
the root of the data repo rather than in `data/` here. Locally they are written to
`public/data/`, which is gitignored scratch for offline runs.

## Open questions

None. Two owner inputs are handled as data, not code: the three unresolved team
labels, and the initial colour choices. Confirmed 2026-08-25 that both are to be
filled in through the config editor after first deploy — so `teams.json` ships
with all 16 teams present, 13 labelled by derivation and 3 as `label: null`.
