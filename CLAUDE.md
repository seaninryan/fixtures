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

FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs   # offline run
node scripts/check.mjs --dry-run                                        # no writes, no email
ALLOW_SHRINK=1 node scripts/check.mjs                                   # genuine collapse
```

## What this is

A fixtures tracker for one club (Galway FA club id **2960**, Craughwell United).
Two jobs: a copyable announcement for club members, and change alerts by email.
A GitHub Action does the work daily; GitHub Pages serves a static React site over
the JSON the Action commits. No server, no database, no auth.

## Architecture

**Pure logic in `src/lib/`, thin components in `src/components/`.** Only
`fetchFixtures.js` and `scripts/check.mjs` touch the outside world. Every rule
lives in a unit-tested pure function; new derivations belong in lib with tests.

- `runCheck.js` — the whole pipeline minus I/O. The safety rules live here.
- `diff.js` — change detection. `announce.js` — the announcement text.
- `announce.js` is imported by **both** the site and `check.mjs`, so what you copy
  out of the app and what the email quotes cannot drift.

The data directory is **`public/data/`**, not `data/`, so Vite serves the JSON to
the site with no copy step. That JSON is copied into `dist` at build time, which is
why `deploy.yml` also runs on `workflow_run` of `check` — a GITHUB_TOKEN push does
not trigger a workflow, so without it new data would never reach the site.

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
  filtered list silently renames squads. This bug has appeared three times.
- **Times are strings, never `Date` objects.** A UTC round-trip moves every
  kick-off by an hour for half the year.
- **`parse.js` never throws.** One bad block costs that block.
- **Counts are measured, never hardcoded.** The league adds and renames squads
  mid-season; tests assert rules, not totals.

## The data source

The club page is a shell; fixtures come from `admin-ajax.php`. CloudFront **403s a
default client User-Agent** — a browser UA plus a Referer is required. The endpoint
sends no CORS headers, so it can never be called from the browser. Every fixture
carries its fields as `data-` attributes; `data-fid` and our `team_id` come from
the markup inside the block. See the spec for the full account.

## Testing conventions

Vitest in the node environment — no jsdom. `parse.js` is tested against the real
captured response in `test/fixtures/`, not hand-built HTML; if you re-capture it,
update `test/fixtures/meta.js`. Component tests are SSR smoke tests via
`renderToStaticMarkup`; interaction coverage is manual after deploy.

## Workflow

Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
Read the relevant spec before extending a feature.
