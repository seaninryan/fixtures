# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Environment — read this first

System Node is **v14** and silently breaks Vite and Vitest. Prefix every command:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
```

## Commands

```bash
npm run dev                                  # http://localhost:5173/fixtures/
npm test                                     # vitest run (all suites)
npx vitest run test/diff.test.js             # one file
npx vitest run -t "cancelled"                # by test name
npm run build                                # catches JSX errors tests cannot

FIXTURES_HTML_FILE=test/fixtures/club2960.html \
  FAI_MATCHES_FILE=test/fixtures/fai-capture.json node scripts/check.mjs  # offline, both sources
FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs   # offline, Galway only
node scripts/check.mjs --dry-run                                        # no writes, no email
ALLOW_SHRINK=1 node scripts/check.mjs                                   # genuine collapse
DATA_DIR=../fixtures-data node scripts/check.mjs                        # write to the data repo
```

## What this is

A fixtures tracker for one club (Galway FA club id **2960**, Craughwell United).
Two jobs: a copyable announcement for club members, and change alerts by email.
A GitHub Action does the work daily; GitHub Pages serves a static React site over
the JSON the Action commits. No server, no database.

The site is gated to the owner's Google account (`src/lib/owner.js`, ported from
ballislife). The cron performs no OAuth and never will - see the spec.

**The work is split over two repos.** This one is code. The snapshots live in
`seaninryan/fixtures-data`, and so does the cron workflow that produces them — a
workflow's `GITHUB_TOKEN` only writes to its own repo, so running it there needs no
long-lived token. It checks this repo out read-only for the code. `scripts/check.mjs`
is here, the workflow that calls it is there: changing the script's env contract
(`DATA_DIR`, `FIXTURES_HTML_FILE`, `ALLOW_SHRINK`, `FAI_CONNECT_API_KEY`,
`FAI_CONNECT_CLUB_ID`, `FAI_MATCHES_FILE`) means editing the other repo.

**There are two data sources.** Galway FA's WordPress endpoint (`parse.js`, scraped
HTML) and FAI Connect's COMET API (`faiConnect.js`, JSON). The club is migrating league
by league; two squads have moved so far and the rest follow over coming seasons. The
scans write separate files (`latest-fai.json`, `results-fai.json`, `changes-fai.json`)
and **share `teams.json`**, because colour distinctness is global once the announcement
merges them. The FAI key is a credential and lives only in the data repo's secrets - see
`docs/superpowers/specs/2026-09-17-fai-connect-scan-design.md`.

## Architecture

**Pure logic in `src/lib/`, thin components in `src/components/`.** Only
`fetchFixtures.js`, `fetchFaiConnect.js` and `scripts/check.mjs` touch the outside world. Every rule
lives in a unit-tested pure function; new derivations belong in lib with tests.

- `runCheck.js` — the whole pipeline minus I/O. The safety rules live here.
- `diff.js` — change detection. `announce.js` — the announcement text.
- `pending.js` — games whose kick-off has passed with no result yet. Derived at
  read time from the snapshot and the results store; nothing is persisted, so
  the data repo's workflow is unaffected. `clock.js` — the club's local date and
  time as strings, and the only place a `Date` is unwrapped.
- `form.js` — each squad's season record, and the Form tab's chart series and SVG
  geometry. Pure, so the scales and path strings are unit-tested without a DOM.
  `squadColors.js` gained `strokeOn` (a squad's colour made visible as a *line*,
  which its chip colour often is not) and `squadDash`.
- `announce.js` is imported by **both** the site and `check.mjs`, so what you copy
  out of the app and what the email quotes cannot drift.

`src/lib/dataSource.js` is the single place that knows where the JSON lives. The site
fetches it from `raw.githubusercontent.com` at **runtime**, so new fixtures appear
without a deploy and `deploy.yml` needs no data trigger. That host is the only
github.com host that sends `Access-Control-Allow-Origin: *`; the prettier
`github.com/<owner>/<repo>/raw/...` URL 302s to it and the redirect has no CORS
headers, so the browser refuses it. `public/data/` is gitignored local scratch for
offline runs.

## Invariants

- **Identity is `fid`**, the league's fixture id. Never compare on names or dates.
- **A failed fetch must never look like a cancellation.** `runCheck` throws when
  zero fixtures parse, and again when the count halves in one run, so nothing is
  written. Do not soften either into a warning.
- **A first run reports no changes.** Diffing against an empty baseline would
  email the whole season.
- **Config beats derivation.** A label in `teams.json` is never overwritten.
- **Labels resolve over ALL fixtures, never a filtered subset.** The A/B letter
  only appears when the club runs more than one side at that age and gender, so a
  filtered list silently renames squads. This bug has appeared three times. The
  Form tab's squad selector makes filtered subsets a first-class feature, so it
  is the easiest place to reintroduce it — `form.js` never passes a selection to
  `resolveTeams`.
- **The Form chart has no cap on selected squads, deliberately.** The dataviz
  guidance caps a categorical palette at 8 series and the palette validator
  fails past that; the owner chose no cap after seeing the finding. Identity is
  therefore carried by four channels and not by hue alone — direct labels up to
  six lines, a per-squad dash, a native `<title>` on every point, and the table.
  Do not "fix" this by reassigning colours per selection: colour follows the
  squad, never its position in a filter.
- **Times are strings, never `Date` objects.** A UTC round-trip moves every
  kick-off by an hour for half the year.
- **The site's `today` is the club's local date, never UTC.** Ireland is UTC+1
  for half the year, so a UTC date is a day behind between Irish midnight and
  01:00 and every window then selects yesterday. `scripts/check.mjs` stays on
  UTC on purpose: the cron runs around 11:00, when the two always agree.
- **There is no weekend-only results window.** This club plays midweek evenings
  routinely, and a weekend-only default hid half the results store.
- **`parse.js` never throws.** One bad block costs that block.
- **A missing `latest.json` is an error state, not a spinner.** The site reads it
  across origins, so failure is a real path and must be visible.
- **The owner gate is not a security boundary.** It hides the app, not the data - the
  data repo is public by design. Nothing else in the codebase may come to depend on it.
- **Never request a Google token silently at load.** GIS may never call back when the
  browser has no Google session, and the page then sits on "Loading..." forever instead
  of showing the sign-in button. Only a cached token skips the button.
- **Counts are measured, never hardcoded.** The league adds and renames squads
  mid-season; tests assert rules, not totals.
- **FAI ids are prefixed, Galway ids are bare.** `fai:61270`. The two systems number
  teams independently and `teams.json` is keyed on team id and holds colours, so a
  collision would hand a squad another squad's identity. Never strip a prefix to tidy
  a key, and never add one to a Galway id - nothing in the data repo was renamed.
- **The FAI scan's failure must not block the Galway write.** It is a third-party API
  serving two squads; the other nineteen must keep updating through an outage. It still
  sets a non-zero exit, so the failure is loud. Its files are left untouched rather than
  written empty - an empty list would read as every adult fixture being cancelled.
- **The season starts 1 August, derived from `today`.** `seasonStart` in `window.js`.
  The FAI `past` endpoint returns two years of history in one call and `mergeResults`
  never deletes, so the filter runs on INGEST as well as at read time. `seasonStart`
  fails OPEN on a malformed date, which is right when reading and permanent when
  writing - so `runFaiCheck` refuses a malformed `today` outright.
- **Only the "All" results window is season-bounded.** Clamping the rolling windows too
  put a game played on 31 July beyond every window on 1 August, with nothing saying so,
  and made `pending.js` inherit a season rule it never asked for.
- **`isHome` comes from the team ids, never from `match.team`.** A wrong letter silently
  swaps our side for the opponent's and publishes every score backwards. The letter is
  kept only as a cross-check, and a disagreement drops the record loudly.
- **A failed venue lookup carries the previous venue forward.** Rendering it as `""`
  emits a VENUE CHANGE alert one run and emits it back the next - a failed fetch
  rendered as real data.
- **`runFaiCheck` guards a PARTIAL outage, not just total silence.** One squad's feed
  going quiet while another still reports would diff its upcoming fixtures as
  cancellations. Scoped to fixtures dated after today, so an ordinary end of season
  never trips it. `ALLOW_SHRINK=1` is the escape hatch, as for Galway.
- **The alert email is built ONCE, over both sources.** `changeReport` resolves labels
  from the fixture list it is handed, so a per-source report will drop the A/B letter
  the day a youth squad migrates while its sibling is still on Galway FA.

## The data sources

### Galway FA

The club page is a shell; fixtures come from `admin-ajax.php`. CloudFront **403s a
default client User-Agent** — a browser UA plus a Referer is required. The endpoint
sends no CORS headers, so it can never be called from the browser. Every fixture
carries its fields as `data-` attributes; `data-fid` and our `team_id` come from
the markup inside the block. See the spec for the full account.

### FAI Connect (Analyticom COMET)

`https://api-fai.analyticom.de`, club **10671**. Three endpoints: the club's teams, a
team's paginated `future`/`past` matches, and an undocumented per-match detail call that
is the only source of a venue. Facts established by probing, each one load-bearing:

- The `api_key` header is **required** - without it, 403.
- There is a **User-Agent denylist**: `Python-urllib/3.12` gets 403 while curl, okhttp,
  `node` and browser UAs get 200. Always send an explicit UA. Same class of trap as
  Galway's CloudFront rule.
- `size` is the **total**, not the page length, so a short page is detectable - and
  `fetchMatches` throws rather than returning a truncated list.
- The trailing `/1` in the matches path is **inert** (`/0`, `/2`, `/3` are identical).
  It is sent because the app sends it.
- `past` returns **two years** of history, and some competitions carry no parent season
  at all - which is why the season cutoff is by date and never by competition name.
- Of 25 teams returned, most are stale entries with no matches. A team with no matches
  is skipped, not reported: that is the ordinary case during the migration.

Opponent names from COMET are dirty and land verbatim in the announcement
("Merlin Woods Reserve 2425"). Upstream data, not a bug here.

## Testing conventions

Vitest in the node environment — no jsdom. `parse.js` is tested against the real
captured response in `test/fixtures/`, not hand-built HTML; if you re-capture it,
update `test/fixtures/meta.js`. Component tests are SSR smoke tests via
`renderToStaticMarkup`; interaction coverage is manual after deploy.

## Workflow

Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
Read the relevant spec before extending a feature.
