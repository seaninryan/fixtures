# Craughwell United fixtures

Pulls the club's fixtures from the Galway FA site once a day, commits a snapshot,
and emails a report when the league moves, adds or cancels anything.

**Site:** https://seaninryan.github.io/fixtures/
**Data:** https://github.com/seaninryan/fixtures-data

- **Fixtures** — copyable announcement for club members. Pick a window, press Copy.
- **Changes** — every change the league has made, from `public/data/changes.json`.
- **Squads** — squad labels and colours. Edit here, Copy JSON, paste on GitHub.

## Two repos

This one holds the code. The snapshots live in **`seaninryan/fixtures-data`**, so this
repo's history stays code and `git log` over there is the fixture history.

The daily cron lives in the data repo too, because that is where it needs write access:
a workflow's `GITHUB_TOKEN` is scoped to its own repo, so running it there needs no
token at all. It checks this repo out read-only for the code. **`scripts/check.mjs`
lives here; the workflow that runs it lives there** — change one, check the other.

The site fetches the JSON from the data repo at runtime, so a new snapshot reaches the
site without a deploy.

## Setup

Email alerts are optional. Without them everything else still works; the run just
logs `email not configured`. To switch them on, add these secrets **to the data repo**,
where the cron runs:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | From the Resend dashboard (the same account as sideline). |
| `ALERT_TO_EMAIL` | Where alerts go. |
| `ALERT_FROM_EMAIL` | Defaults to `fixtures@resend.dev`, which Resend will only deliver to the address on your own Resend account. To mail anyone else, verify a domain and set this to an address on it. |

## Local development

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"   # system node is v14
npm install
npm run dev      # http://localhost:5173/fixtures/ - reads the live data repo
npm test

# Run the whole pipeline offline against the committed capture. Writes to public/data,
# which is gitignored scratch: the real snapshots live in the data repo.
FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs

# Rehearse the live path without writing anything or sending mail
node scripts/check.mjs --dry-run

# Write somewhere else - this is what the cron does with the data repo checked out
DATA_DIR=../fixtures-data node scripts/check.mjs
```

To point the dev site at that local copy instead of the data repo, put
`VITE_DATA_URL=/fixtures/data/` in `.env.local`.

The run aborts rather than write a snapshot if no fixtures parse, or if the fixture
count halves in one run. A genuine collapse (end of season) is `ALLOW_SHRINK=1`.

## Design

`docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md` — read this before
changing the fetch or the diff. It records why the fetch cannot happen in the
browser and how the endpoint behaves.
