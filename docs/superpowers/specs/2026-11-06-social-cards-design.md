# Social cards — design

Written 2026-11-06. The owner posts a fixtures graphic to Facebook and Instagram on
Fridays and a results graphic on Sundays, built by hand in Canva over blank
backgrounds. This moves the text onto those backgrounds in the app, and adds the two
things the hand-built flow quietly relies on: fresh data on a Sunday evening, and a
way to post a score the league has not published yet.

## Goal

From the Graphics tab, the owner downloads ready-to-post PNGs of a window's fixtures
or results, in 4:5 (Facebook, portrait photos) and 4:3 (Instagram, alongside landscape
team photos), that look like the Canva cards they replace.

## Non-goals

- Posting to Facebook or Instagram, or the Web Share sheet. Download only.
- Writing hand-entered results anywhere but this browser. They never reach
  `results.json`, the Form tab or the alert email.
- Triggering the workflow from the browser with a token. "Sync now" is a link.
- Fetching Galway FA or FAI from the browser. Neither sends CORS headers and the FAI
  key is a secret.
- Editing the card design in the app. The look lives in the Canva backgrounds and in
  `cardLayout.js`.

---

## 1. Rendering — Canvas 2D

The background PNG is drawn to a `<canvas>`, the layout's draw operations on top, and
`canvas.toBlob` produces the download. No new dependency. Chosen over HTML-to-image
(drops web fonts and backgrounds) and SVG-to-PNG (fonts must be inlined as data URIs).

Fonts:

- **League Spartan** (Google Fonts) for the big date and ranges — exact match.
- **Canva Sans** is proprietary to Canva and cannot be embedded. A free stand-in is
  chosen during implementation by rendering the owner's row text in two or three
  candidates beside a sample card; the owner picks. Used regular and bold.
- The component waits on `document.fonts.load(...)` for every face before drawing;
  a canvas drawn before a web font loads silently falls back to a system font.

## 2. Units

### `src/lib/cardRows.js` (pure, tested)

Turns one fixture or result into a row: a list of segments `{text, bold}`, plus the
row's date, time and identity (`fid`, or a manual id).

- **Fixture row:** time chip `"12:00"`; segments `[{label, bold}, {" v Knocknacarra"}]`
  or `" @ Oughterard"`. A home game away from `HOME_VENUE` appends `" (at Venue)"`,
  matching `formatFixtureLine`.
- **Result row:** home side first. Our squad label **and our score** are bold; the
  opponent and their score are regular. `isHome` decides the side, never the letter.
  `U18 Girls 5-0 Gort` → `[{"U18 Girls 5", bold}, {"-0 Gort"}]`;
  `Gort 1-1 U15 Girls` → `[{"Gort 1-"}, {"1 U15 Girls", bold}]`.
- Labels come from `resolveTeams` over **all** fixtures, never the window's subset.

### `src/lib/cardLayout.js` (pure, tested)

`layoutCards({kind, rows, range, mode, shape, measure})` → `[{fileName, ops}]`.

- `kind`: `"fixtures" | "results"`. `mode`: `"auto" | "single" | "perDay"`.
  `shape`: `"4x5" | "4x3"`.
- `measure(text, font) → width` is injected. The component passes the canvas's
  `measureText`; tests pass a deterministic fake (`chars × size × k`).
- `ops` are plain data: `{op:"image"}` (background), `{op:"text", x, y, text, font,
  size, weight, color, align}`, `{op:"rule", ...}`, `{op:"box", ...}`, `{op:"chip", ...}`.
- Constants per shape: canvas size and the **text region** `{x, y, w, h}` that clears
  the crest. Portrait 1080×1350, crest top-centre, text below it. Landscape 1080×810,
  **crest on the left, text region on the right**. Moving the crest in Canva means
  editing these four numbers.
- Palette per kind: fixtures yellow text, yellow time chips, translucent navy boxes with
  a thin yellow border; results navy text in white boxes with a thin border. Values
  sampled from the owner's cards.

**Heading.**

- Single day: `FIXTURES` (or `RESULTS`) small, day name, `31 OCTOBER` in League Spartan
  Bold, rule.
- Multiple days: `FIXTURES`, the range in League Spartan Bold, rule; then a day
  sub-heading (`SATURDAY`) above each day's rows.
- Range format, all caps: same month `29–30 AUGUST`; spanning months
  `30 AUG – 3 SEP`. Date strings are formatted from ISO dates in UTC, never from a
  kick-off (the times-are-strings invariant).

**Order.** Date, then time, then `fid` — the announcement's total order.

**Fitting.**

1. Each row's text shrinks on its own to fit the box width (a long
   `Junior Men's Reserves @ Salthill Devon` does not shrink its neighbours).
2. Too many rows: row height, gap and text scale down together to a floor that stays
   legible on a phone.
3. `auto`: one card for the whole window if it fits at **full** size; otherwise one card
   per day, each scaled per step 2. `single` and `perDay` force the choice.
4. A card that still overflows at the floor splits: `SUNDAY 1 NOVEMBER (1/2)`, `(2/2)`.

Every op lies inside the canvas, and every row inside the text region — asserted in
tests for both shapes.

**File names:** `fixtures-2026-10-31-4x5.png`, `results-2026-08-29_30-4x3.png`, with
`-1of2` before the shape for a split card.

### `src/components/GraphicsTab.jsx` (thin)

A new **Graphics** tab. Controls: Fixtures / Results; the window (the existing
fixture windows for fixtures, the existing result windows for results); One card /
Card per day / Auto. Shows each card as a preview canvas with **Download 4:5**,
**Download 4:3** and **Download both**. Under each preview, the rows with a
**Leave off** toggle. Under Results, the **Add result** form (section 4).

It executes `ops` on a canvas and nothing else. No layout decision lives in JSX.

### Backgrounds

`public/cards/fixtures-4x5.png`, `fixtures-4x3.png`, `results-4x5.png`,
`results-4x3.png`, supplied by the owner from Canva at exactly those sizes, crest
included. A missing background is an error shown on the card, not a blank canvas.

## 3. Sync now

The data repo's `daily-check.yml` runs at 06:17 UTC and accepts `workflow_dispatch`,
so Sunday's results otherwise appear on Monday. The button opens
`https://github.com/seaninryan/fixtures-data/actions/workflows/daily-check.yml` in a
new tab, where the owner presses Run workflow.

The app then polls `api.github.com/repos/seaninryan/fixtures-data/commits/main`
(CORS-enabled, unauthenticated, 60 requests an hour) every 15 s for up to 10 minutes.
When the head SHA changes it re-fetches the JSON from `raw.githubusercontent.com` **at
that SHA**, not at `main` — the branch URL is cached for up to five minutes and would
serve the old file. `dataSource.js` gains an optional ref and stays the single place
that knows where the JSON lives. The poll times out quietly back to the normal state
with a "no new data yet" note.

## 4. Played games that have left the feed

Today a played game with no published result vanishes from the data entirely after
the next run: the league lists only upcoming fixtures, and `diff.js` deliberately skips
past-dated departures. `pending.js` documents the gap and the earlier spec deferred it.
A Sunday-evening sync makes it the normal case, so it is fixed here.

- `runCheck` (and `runFaiCheck`) carry an **`awaiting`** list in the snapshot: a fixture
  that was in the previous snapshot, is dated before `today`, is absent from the new
  feed and has no result in the results store joins `awaiting`. The previous
  `awaiting` carries forward. An entry leaves when its `fid` gains a result or when its
  date is more than 14 days before `today`.
- It lives **inside** `latest.json` / `latest-fai.json` because the data repo's
  workflow `git add`s a fixed list of files; a new file would need an edit there.
- `awaiting` is not counted by the zero-fixtures or halving guards, and a first run
  starts it empty (no baseline, no carry). It is not diffed and emits no alerts.
- `pending.js` reads snapshot fixtures plus `awaiting`, deduplicated on `fid`, so the
  Results tab's pending list and the Add result pre-fill both survive a sync.

## 5. Hand-entered results and Leave off

**Add result.** Pending games (from `pending.js`) appear pre-filled; the owner types
the two scores. A free-form row covers a game the league never listed: squad (dropdown
of resolved labels), opponent, home/away, date, both scores.

- Stored in `localStorage` only, wrapped in try/catch; the tab works without it.
- Shown on cards only. Not in Results, Form, the round-up text or email.
- **Official result wins.** A pre-filled entry is replaced when its `fid` appears in the
  results store; a free-form entry when a result for that squad on that date appears.
  If the official score differs, the tab shows a warning naming the game, so a posted
  card that was wrong is visible.
- Entries older than 14 days are dropped on read.

**Leave off.** A per-row toggle stored in `localStorage` by `fid` (or manual id), for
fixtures and results. Graphics only — a forfeit 3–0 still counts in Form, because it is
the league's result.

## 6. Testing

- `cardRows`: bold segments for home/away wins, draws, losses; home-game venue note;
  labels resolved over all fixtures when handed a filtered window (the three-times bug).
- `cardLayout`: grouping and `auto`/`single`/`perDay`; single-day and both range
  formats; order; per-row width shrink; whole-card scale; split with `(1/2)` headings;
  every op inside the canvas and every row inside the text region, both shapes;
  file names.
- `runCheck` / `runFaiCheck`: a past fixture leaving the feed joins `awaiting`; leaves
  on result; expires at 14 days; a future fixture leaving still reads as cancelled; the
  guards ignore `awaiting`; a first run has none.
- `pending.js`: includes `awaiting`, dedupes on `fid`.
- Manual-entry merge (pure, in lib): official wins, mismatch flagged, expiry.
- `GraphicsTab`: SSR smoke test. Canvas output is checked by eye after deploy.

## Open item

The Canva Sans stand-in, chosen by the owner from a rendered comparison during
implementation.
