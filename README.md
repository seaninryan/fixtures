# Craughwell United fixtures

Pulls the club's fixtures from the Galway FA site once a day, commits a snapshot,
and emails a report when the league moves, adds or cancels anything.

**Site:** https://seaninryan.github.io/fixtures/

- **Fixtures** — copyable announcement for club members. Pick a window, press Copy.
- **Changes** — every change the league has made, from `public/data/changes.json`.
- **Squads** — squad labels and colours. Edit here, Copy JSON, paste on GitHub.

Snapshots live in git, so `git log public/data` is the fixture history.

## Setup

Email alerts are optional. Without them everything else still works; the run just
logs `email not configured`. To switch them on, add these repository secrets:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | From the Resend dashboard (the same account as sideline). |
| `ALERT_TO_EMAIL` | Where alerts go. |
| `ALERT_FROM_EMAIL` | Optional. Defaults to `fixtures@resend.dev`. |

## Local development

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"   # system node is v14
npm install
npm run dev      # http://localhost:5173/fixtures/
npm test

# Run the whole pipeline offline against the committed capture
FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs

# Rehearse the live path without writing anything or sending mail
node scripts/check.mjs --dry-run
```

The run aborts rather than write a snapshot if no fixtures parse, or if the fixture
count halves in one run. A genuine collapse (end of season) is `ALLOW_SHRINK=1`.

## Design

`docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md` — read this before
changing the fetch or the diff. It records why the fetch cannot happen in the
browser and how the endpoint behaves.
