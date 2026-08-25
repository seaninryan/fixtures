# Craughwell Fixtures Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Actions cron that pulls Craughwell United's fixtures from the Galway FA site, commits a snapshot, emails a report of anything the league changed, plus a static GitHub Pages site that renders a copy-pasteable announcement.

**Architecture:** Pure logic in `src/lib/` (vitest, node environment, no jsdom); one impure fetch module; one orchestrator script that runs in CI; a thin React/Vite site on GitHub Pages that reads the committed JSON. No database, no server, no auth anywhere. Snapshots live in git, so `git log` is the fixture history.

**Tech Stack:** Node 20, Vite 5, React 18, Vitest 2, Resend, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md` — read it before Task 3; the "data source" section documents hard-won facts about the endpoint.

**One deliberate deviation from the spec:** the spec calls the data directory `data/`. It is implemented as **`public/data/`** so Vite serves the JSON to the site with no copy step. Everything else matches.

---

## Environment — read this first

The system Node is **v14** and silently breaks Vite and Vitest. Every local `npm`/`npx`/`node` command in this plan assumes:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
node -v   # must print v20.x
```

Run that once per shell before starting.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/parse.js` | HTML → raw fixture records. Never throws. |
| `src/lib/normalize.js` | Raw records → typed `Fixture` (ISO date, isHome, opponent). |
| `src/lib/teams.js` | Label derivation, config merge, config seeding. |
| `src/lib/squadColors.js` | Palette, colour per team, contrast text, emoji square. |
| `src/lib/window.js` | The four named date windows. Nothing else knows their boundaries. |
| `src/lib/diff.js` | `(prev, next, today)` → `Change[]`. |
| `src/lib/announce.js` | `Fixture[]` → the copyable announcement text. |
| `src/lib/changeReport.js` | `Change[]` → `{subject, text}` for the email. |
| `src/lib/fetchFixtures.js` | The only network I/O. |
| `scripts/check.mjs` | Orchestrator: fetch, diff, write, email. The only place I/O meets purity. |
| `src/App.jsx` | Tab state, data loading. |
| `src/components/AnnouncementTab.jsx` | Window buttons, announcement, copy button. |
| `src/components/ChangesTab.jsx` | Change history from `changes.json`. |
| `src/components/SquadsTab.jsx` | Label + colour editor, Copy JSON, edit-on-GitHub link. |
| `public/data/latest.json` | Snapshot. Written by the cron. |
| `public/data/changes.json` | Change history. Written by the cron. |
| `public/data/teams.json` | Labels + colours. Written by you. |
| `test/fixtures/club2960.html` | Golden capture of the real endpoint response. |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fixtures",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "node scripts/check.mjs"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "resend": "^6.12.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `.nvmrc`, `.gitignore`, `vite.config.js`**

`.nvmrc`:
```
20
```

`.gitignore`:
```
node_modules
dist
.DS_Store
```

`vite.config.js`:
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/fixtures/",
  plugins: [react()],
});
```

- [ ] **Step 3: Create the app shell**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Craughwell United Fixtures</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`src/main.jsx`:
```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

`src/App.jsx`:
```jsx
export default function App() {
  return <main className="wrap"><h1>Craughwell United Fixtures</h1></main>;
}
```

`src/styles.css`:
```css
:root { --bg: #0f1419; --card: #182029; --fg: #e6edf3; --dim: #9fb0c0; --line: #2a3541; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
.wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
```

- [ ] **Step 4: Install and verify the toolchain**

Run: `npm install && npx vitest run --passWithNoTests`
Expected: install completes, vitest reports `No test files found` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react + vitest"
```

---

## Task 2: Capture the golden fixture

The parser is tested against the **real** endpoint response, not hand-built HTML. Capture it once and commit it; tests then stay stable forever even as real fixtures get played.

**Files:**
- Create: `test/fixtures/club2960.html`

- [ ] **Step 1: Capture the response**

The browser `User-Agent` and `Referer` are required — a default curl UA gets a CloudFront 403. Run:

```bash
mkdir -p test/fixtures
curl -sS -X POST \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Referer: https://galwayfa.ie/clubprofile/2960/' \
  -o test/fixtures/club2960.html \
  -w 'HTTP %{http_code} size=%{size_download}\n' \
  'https://galwayfa.ie/wp-admin/admin-ajax.php?action=fixtures&club_id=2960&competition_id=&team_id=&displayResults='
```

Expected: `HTTP 200` and a size around 240000. If you get 403, the UA header is missing or wrong.

- [ ] **Step 2: Verify it contains fixture blocks**

Run: `grep -c 'class="column-eight table-body fixtures"' test/fixtures/club2960.html`
Expected: a number greater than 0. Note it — later tests use `FIXTURE_COUNT`.

- [ ] **Step 3: Record the count as a test constant**

Create `test/fixtures/meta.js`, replacing `43` with the number from Step 2 if it differs:

```js
// Facts about the committed golden capture. Update ONLY when re-capturing the HTML.
export const FIXTURE_COUNT = 43;
export const TEAM_COUNT = 16;
export const CLUB_ID = "2960";
```

- [ ] **Step 4: Commit**

```bash
git add test/fixtures
git commit -m "test: golden capture of the live fixtures endpoint"
```

---

## Task 3: `parse.js` — HTML to raw records

**Files:**
- Create: `src/lib/parse.js`
- Test: `test/parse.test.js`

- [ ] **Step 1: Write the failing test**

`test/parse.test.js`:
```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { FIXTURE_COUNT, TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

describe("parse", () => {
  it("finds every fixture block in the real capture", () => {
    const { fixtures, errors } = parse(html);
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
    expect(errors).toEqual([]);
  });

  it("gives every fixture a unique league fixture id", () => {
    const { fixtures } = parse(html);
    const fids = fixtures.map((f) => f.fid);
    expect(fids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(new Set(fids).size).toBe(FIXTURE_COUNT);
  });

  it("identifies our own team id on every fixture", () => {
    const { fixtures } = parse(html);
    expect(fixtures.every((f) => /^\d+$/.test(f.teamId))).toBe(true);
    expect(new Set(fixtures.map((f) => f.teamId)).size).toBe(TEAM_COUNT);
  });

  it("records which side is the club, so home/away never depends on name matching", () => {
    const { fixtures } = parse(html);
    expect(fixtures.every((f) => f.homeClubId === "2960" || f.awayClubId === "2960")).toBe(true);
  });

  it("carries the data attributes across", () => {
    const { fixtures } = parse(html);
    const f = fixtures.find((x) => x.fid === "6951014");
    expect(f).toMatchObject({
      date: "29 Aug 2026",
      time: "12:00",
      homeTeam: "Craughwell United",
      awayTeam: "St Bernards",
      venue: "Craughwell",
      competition: "GFA Boys U14 Championship 1",
    });
  });

  it("never throws, and reports empty input as an error", () => {
    expect(() => parse(null)).not.toThrow();
    expect(parse("").errors).toEqual(["empty response"]);
    expect(parse("<html>nothing here</html>").fixtures).toEqual([]);
  });

  it("loses only the malformed block, never the whole page", () => {
    const broken = html.replace(/data-fid="6951014"/, 'data-XXX="6951014"');
    const { fixtures, errors } = parse(broken);
    expect(fixtures).toHaveLength(FIXTURE_COUNT - 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/no data-fid/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/parse.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/parse.js"`.

- [ ] **Step 3: Write the implementation**

`src/lib/parse.js`:
```js
// Pure. Raw endpoint HTML -> raw fixture records.
//
// NEVER THROWS. One malformed block must cost that block and nothing else: this feed
// is a third-party WordPress plugin and a single odd fixture must not blank the club's
// whole weekend.
export const CLUB_ID = "2960";

const BLOCK_START = '<ul class="column-eight table-body fixtures';
const SPLIT = /(?=<ul class="column-eight table-body fixtures")/;

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&nbsp;/g, " ");
}

function dataAttrs(openTag) {
  const out = {};
  for (const m of openTag.matchAll(/data-([a-z0-9]+)="([^"]*)"/g)) {
    out[m[1]] = decode(m[2]).trim();
  }
  return out;
}

// Which club plays on a given side. The team1/team2 spans each wrap a link to that
// club's profile, so this is positional and does not depend on matching club names —
// which matters the day two Craughwell teams are drawn against each other.
function sideClubId(block, side) {
  const re = new RegExp(`<span class="data ${side}">\\s*<a href="[^"]*clubprofile/(\\d+)/`);
  return block.match(re)?.[1] ?? null;
}

export function parse(html) {
  const fixtures = [];
  const errors = [];
  if (typeof html !== "string" || html.trim() === "") {
    return { fixtures, errors: ["empty response"] };
  }

  const blocks = html.split(SPLIT).filter((b) => b.startsWith(BLOCK_START));

  blocks.forEach((block, i) => {
    try {
      const open = block.slice(0, block.indexOf(">") + 1);
      const a = dataAttrs(open);
      const fid = block.match(/data-fid="(\d+)"/)?.[1] ?? null;
      const ours = block.match(
        new RegExp(`clubprofile/${CLUB_ID}/\\?competition_id=(\\d+)&(?:amp;)?team_id=(\\d+)`),
      );
      if (!fid) return void errors.push(`block ${i}: no data-fid`);
      if (!ours) return void errors.push(`block ${i} (fid ${fid}): no team link for club ${CLUB_ID}`);
      if (!a.date || !a.time) return void errors.push(`block ${i} (fid ${fid}): missing date or time`);

      fixtures.push({
        fid,
        teamId: ours[2],
        competitionId: ours[1],
        date: a.date,
        time: a.time,
        homeTeam: a.hometeam ?? "",
        awayTeam: a.awayteam ?? "",
        homeClubId: sideClubId(block, "team1"),
        awayClubId: sideClubId(block, "team2"),
        venue: a.venue ?? "",
        competition: a.compname ?? "",
        comment: a.comment ?? "",
      });
    } catch (e) {
      errors.push(`block ${i}: ${e.message}`);
    }
  });

  return { fixtures, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/parse.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse.js test/parse.test.js
git commit -m "feat(parse): extract fixtures from the endpoint HTML"
```

---

## Task 4: `normalize.js` — raw records to typed fixtures

**Files:**
- Create: `src/lib/normalize.js`
- Test: `test/normalize.test.js`

- [ ] **Step 1: Write the failing test**

`test/normalize.test.js`:
```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { isoDate, normalize, normalizeAll, sortFixtures } from "../src/lib/normalize.js";
import { FIXTURE_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

const raw = {
  fid: "1", teamId: "235380", date: "29 Aug 2026", time: "12:00",
  homeTeam: "Craughwell United", awayTeam: "St Bernards",
  homeClubId: "2960", awayClubId: "2787",
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1", comment: "",
};

describe("isoDate", () => {
  it("converts the feed's date format", () => {
    expect(isoDate("29 Aug 2026")).toBe("2026-08-29");
    expect(isoDate("01 Sep 2026")).toBe("2026-09-01");
    expect(isoDate("13 Jan 2027")).toBe("2027-01-13");
  });

  it("returns null rather than a wrong date", () => {
    expect(isoDate("29 Xxx 2026")).toBeNull();
    expect(isoDate("nonsense")).toBeNull();
    expect(isoDate("")).toBeNull();
  });
});

describe("normalize", () => {
  it("marks a home fixture and names the opponent", () => {
    expect(normalize(raw)).toMatchObject({
      fid: "1", date: "2026-08-29", time: "12:00",
      isHome: true, opponent: "St Bernards", ourTeam: "Craughwell United",
    });
  });

  it("marks an away fixture and names the opponent", () => {
    const away = { ...raw, homeTeam: "Colga B", awayTeam: "Craughwell United",
      homeClubId: "2801", awayClubId: "2960" };
    expect(normalize(away)).toMatchObject({
      isHome: false, opponent: "Colga B", ourTeam: "Craughwell United",
    });
  });

  it("keeps the feed's time string untouched", () => {
    // A timezone round-trip would silently turn a 12:00 kick-off into 11:00.
    expect(normalize(raw).time).toBe("12:00");
  });
});

describe("normalizeAll", () => {
  it("normalizes the whole real capture", () => {
    const { fixtures } = normalizeAll(parse(html).fixtures);
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
    expect(fixtures.every((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date))).toBe(true);
  });

  it("drops an unparseable date into errors instead of the fixture list", () => {
    const { fixtures, errors } = normalizeAll([{ ...raw, date: "nonsense" }]);
    expect(fixtures).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe("sortFixtures", () => {
  it("orders by date, then kick-off, then id so snapshots are stable", () => {
    const f = (fid, date, time) => ({ fid, date, time });
    const sorted = sortFixtures([
      f("3", "2026-08-30", "14:00"), f("1", "2026-08-29", "12:00"),
      f("2", "2026-08-29", "10:00"),
    ]);
    expect(sorted.map((x) => x.fid)).toEqual(["2", "1", "3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/normalize.test.js`
Expected: FAIL — cannot resolve `../src/lib/normalize.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/normalize.js`:
```js
// Pure. Raw parse records -> the Fixture shape everything downstream uses.
import { CLUB_ID } from "./parse.js";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// "29 Aug 2026" -> "2026-08-29". Returns null rather than guessing: a wrong date is
// worse than a reported failure.
export function isoDate(feedDate) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(String(feedDate ?? "").trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

export function normalize(raw) {
  const isHome = raw.homeClubId === CLUB_ID;
  return {
    fid: raw.fid,
    teamId: raw.teamId,
    date: isoDate(raw.date),
    // Stored exactly as the feed gave it. Never converted through a Date object —
    // a UTC round-trip would move every kick-off by an hour half the year.
    time: raw.time,
    isHome,
    ourTeam: isHome ? raw.homeTeam : raw.awayTeam,
    opponent: isHome ? raw.awayTeam : raw.homeTeam,
    venue: raw.venue,
    competition: raw.competition,
    comment: raw.comment,
  };
}

export function normalizeAll(raws) {
  const fixtures = [];
  const errors = [];
  for (const raw of raws) {
    const f = normalize(raw);
    if (!f.date) {
      errors.push(`fid ${raw.fid}: unparseable date "${raw.date}"`);
      continue;
    }
    fixtures.push(f);
  }
  return { fixtures: sortFixtures(fixtures), errors };
}

// Stable order keeps the committed snapshot's git diff to the lines that actually
// changed, instead of reshuffling on every run.
export function sortFixtures(fixtures) {
  return [...fixtures].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.fid.localeCompare(b.fid),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/normalize.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.js test/normalize.test.js
git commit -m "feat(normalize): typed fixtures with ISO dates and home/away"
```

---

## Task 5: `squadColors.js` — palette and colour resolution

Built before `teams.js` because config seeding assigns colours.

**Files:**
- Create: `src/lib/squadColors.js`
- Test: `test/squadColors.test.js`

- [ ] **Step 1: Write the failing test**

`test/squadColors.test.js`:
```js
import { describe, it, expect } from "vitest";
import { PALETTE, contrastFg, squadColor, colorEmoji } from "../src/lib/squadColors.js";

describe("PALETTE", () => {
  it("has 16 distinct hex colours, one per squad", () => {
    expect(PALETTE).toHaveLength(16);
    expect(new Set(PALETTE).size).toBe(16);
    expect(PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
});

describe("contrastFg", () => {
  it("picks dark text on light backgrounds and light on dark", () => {
    expect(contrastFg("#ffffff")).toBe("#17222b");
    expect(contrastFg("#000000")).toBe("#ffffff");
    expect(contrastFg("#f2c744")).toBe("#17222b");
  });
});

describe("squadColor", () => {
  const config = { teams: { "235380": { color: "#1f6feb" } } };

  it("uses the configured colour when there is one", () => {
    expect(squadColor("235380", config)).toEqual({ bg: "#1f6feb", fg: "#ffffff" });
  });

  it("falls back to a palette colour so nothing is ever colourless", () => {
    const c = squadColor("999999", config);
    expect(PALETTE).toContain(c.bg);
  });

  it("is stable: the same team always gets the same fallback", () => {
    expect(squadColor("999999", {}).bg).toBe(squadColor("999999", {}).bg);
  });

  it("survives an absent or empty config", () => {
    expect(squadColor("235380", undefined).bg).toBeTruthy();
    expect(squadColor("235380", { teams: {} }).bg).toBeTruthy();
  });
});

describe("colorEmoji", () => {
  it("maps a colour to the nearest emoji square for plain-text announcements", () => {
    expect(colorEmoji("#e5484d")).toBe("🟥");
    expect(colorEmoji("#1f6feb")).toBe("🟦");
    expect(colorEmoji("#3fb950")).toBe("🟩");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/squadColors.test.js`
Expected: FAIL — cannot resolve `../src/lib/squadColors.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/squadColors.js`:
```js
// Pure. Colour per squad. Shape follows fancystats' teamColors.js: configured value
// wins, otherwise a STABLE fallback so a squad is never colourless and never changes
// colour between runs.

// Sixteen colours, one per current squad, spread around the wheel so neighbouring age
// groups do not look alike.
export const PALETTE = [
  "#e5484d", "#e5794d", "#e5a94d", "#d9c53c",
  "#a3c93f", "#3fb950", "#3fb98a", "#3fb9b9",
  "#3f93d9", "#1f6feb", "#5a5ae5", "#8b5ae5",
  "#b95ad9", "#d94da3", "#8c6f5a", "#7d8a99",
];

export function contrastFg(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#17222b" : "#ffffff";
}

function hashIndex(teamId, len) {
  let h = 0;
  for (const ch of String(teamId)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h % len;
}

export function squadColor(teamId, config) {
  const set = config?.teams?.[teamId]?.color;
  const bg = set || PALETTE[hashIndex(teamId, PALETTE.length)];
  return { bg, fg: contrastFg(bg) };
}

// Plain-text announcements cannot carry colour, but emoji squares survive WhatsApp
// intact. Nearest hue wins; greys fall through to white.
const SQUARES = [
  { emoji: "🟥", hue: 0 }, { emoji: "🟧", hue: 30 }, { emoji: "🟨", hue: 55 },
  { emoji: "🟩", hue: 130 }, { emoji: "🟦", hue: 215 }, { emoji: "🟪", hue: 280 },
  { emoji: "🟫", hue: 25 },
];

function hsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export function colorEmoji(hex) {
  const { h, s, v } = hsv(hex);
  if (s < 0.2) return v < 0.35 ? "⬛" : "⬜";
  if (s < 0.45 && v < 0.65) return "🟫";
  let best = SQUARES[0];
  let bestDist = 360;
  for (const sq of SQUARES.slice(0, 6)) {
    const dist = Math.min(Math.abs(h - sq.hue), 360 - Math.abs(h - sq.hue));
    if (dist < bestDist) { bestDist = dist; best = sq; }
  }
  return best.emoji;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/squadColors.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/squadColors.js test/squadColors.test.js
git commit -m "feat(colors): squad palette with stable fallback and emoji squares"
```

---

## Task 6: `teams.js` — label derivation, config merge, seeding

**Files:**
- Create: `src/lib/teams.js`
- Test: `test/teams.test.js`

- [ ] **Step 1: Write the failing test**

`test/teams.test.js`:
```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { deriveLabels, resolveTeams, teamsFromFixtures, seedConfig } from "../src/lib/teams.js";
import { PALETTE } from "../src/lib/squadColors.js";
import { TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
const { fixtures } = normalizeAll(parse(html).fixtures);

describe("deriveLabels", () => {
  const labels = deriveLabels(fixtures);
  const squads = teamsFromFixtures(fixtures);

  it("letters a squad only when the club runs more than one at that age and gender", () => {
    // The letter comes from the TEAM NAME ("Craughwell United B"), not the division.
    expect(labels["235380"]).toBe("U14A Boys");   // Craughwell United,   U14 Championship 1
    expect(labels["254061"]).toBe("U14B Boys");   // Craughwell United B, U14 Division 4
    expect(labels["300398"]).toBe("U17 Boys");    // sole U17 side: no letter
  });

  it("derives girls' squads the same way", () => {
    expect(labels["238174"]).toBe("U12A Girls");
    expect(labels["238188"]).toBe("U12B Girls");
    expect(labels["238155"]).toBe("U14 Girls");
  });

  it("returns null rather than guessing when the competition name lacks age or gender", () => {
    expect(labels["234323"]).toBeNull();   // "GFA U21 Division 1"       - no gender
    expect(labels["379931"]).toBeNull();   // "GFA Women's Championship" - no age
  });

  // Asserted as a RULE, not a count. The league renames competitions mid-season - on
  // 2026-08-25 "GFA U16 Division 1" became "GFA U16 Girls Division 1", which moved one
  // squad from underivable to derivable. A hardcoded "13 of 16" would have failed for
  // a reason that has nothing to do with this code being wrong.
  it("labels exactly those squads whose competition names carry both an age and a gender", () => {
    for (const [teamId, meta] of Object.entries(squads)) {
      const derivable = /\bU\d{1,2}\b/.test(meta.competition)
        && /\b(Boys|Girls|Women'?s?|Men'?s?)\b/i.test(meta.competition);
      if (derivable) expect(labels[teamId]).toMatch(/^U\d{1,2}[A-Z]? (Boys|Girls|Women|Men)$/);
      else expect(labels[teamId]).toBeNull();
    }
  });
});

describe("resolveTeams", () => {
  it("lets config beat derivation, so labels never drift", () => {
    const config = { teams: { "235380": { label: "U14A Lions" } } };
    expect(resolveTeams(fixtures, config).labels["235380"]).toBe("U14A Lions");
  });

  it("falls back to the raw feed name for an unlabelled squad, and reports it", () => {
    const { labels, unknown } = resolveTeams(fixtures, { teams: {} });
    expect(labels["379931"]).toBe("Craughwell United");
    expect(unknown).toContain("379931");
    expect(unknown).toContain("234323");
  });

  it("reports nothing unknown once every gap is filled", () => {
    // Built from the data so it survives the league renaming a competition.
    const { unknown: gaps } = resolveTeams(fixtures, { teams: {} });
    const config = { teams: Object.fromEntries(gaps.map((id) => [id, { label: `Squad ${id}` }])) };
    expect(resolveTeams(fixtures, config).unknown).toEqual([]);
  });
});

describe("teamsFromFixtures", () => {
  it("finds every squad once", () => {
    expect(Object.keys(teamsFromFixtures(fixtures))).toHaveLength(TEAM_COUNT);
    expect(teamsFromFixtures(fixtures)["254061"]).toMatchObject({
      ourTeam: "Craughwell United B",
      competition: "GFA Boys U14 Division 4",
    });
  });
});

describe("seedConfig", () => {
  it("creates an entry for every squad, labelling what it can", () => {
    const config = seedConfig(fixtures, null);
    expect(Object.keys(config.teams)).toHaveLength(TEAM_COUNT);
    expect(config.teams["235380"].label).toBe("U14A Boys");
    expect(config.teams["379931"].label).toBeNull();
    expect(PALETTE).toContain(config.teams["235380"].color);
  });

  it("never overwrites what you already set", () => {
    const existing = { version: 1, teams: { "235380": { label: "My Lads", color: "#000000" } } };
    const config = seedConfig(fixtures, existing);
    expect(config.teams["235380"]).toEqual({ label: "My Lads", color: "#000000" });
  });

  it("adds a squad that appeared since the last run", () => {
    const existing = seedConfig(fixtures, null);
    const withNew = [...fixtures, { ...fixtures[0], fid: "999", teamId: "411902",
      ourTeam: "Craughwell United", competition: "GFA Boys U12 Cup" }];
    const config = seedConfig(withNew, existing);
    expect(config.teams["411902"]).toBeDefined();
    expect(config.teams["411902"].label).toBeNull();
  });

  it("gives distinct colours to distinct squads", () => {
    // Distinctness is capped by the palette, not by the squad count - seedConfig walks
    // PALETTE taking the first unused colour, so once the club outgrows the palette the
    // guarantee is "as distinct as possible", not "all different".
    const colors = Object.values(seedConfig(fixtures, null).teams).map((t) => t.color);
    expect(new Set(colors).size).toBe(Math.min(TEAM_COUNT, PALETTE.length));
  });

  it("rejects a configured colour that is not a hex value rather than rendering it", () => {
    // A CSS colour name or 3-digit hex reaches contrastFg as NaN and silently produces
    // white text on an unvalidated background.
    const config = seedConfig(fixtures, { version: 1, teams: { "235380": { label: "X", color: "red" } } });
    expect(config.teams["235380"].color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/teams.test.js`
Expected: FAIL — cannot resolve `../src/lib/teams.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/teams.js`:
```js
// Pure. Squad identity, labels and config seeding.
//
// A squad is identified by the league's team_id, never by its name. That is what lets a
// cup competition entered by an existing squad inherit its label with no action, and what
// makes a genuinely new squad visible as new.
import { PALETTE } from "./squadColors.js";

export const CONFIG_VERSION = 1;

// One entry per squad: {teamId: {ourTeam, competition}}
export function teamsFromFixtures(fixtures) {
  const out = {};
  for (const f of fixtures) {
    if (!out[f.teamId]) out[f.teamId] = { ourTeam: f.ourTeam, competition: f.competition };
  }
  return out;
}

function ageOf(competition) {
  const m = /\bU(\d{1,2})\b/.exec(competition);
  return m ? `U${m[1]}` : null;
}

function genderOf(competition) {
  if (/\bBoys\b/i.test(competition)) return "Boys";
  if (/\bGirls\b/i.test(competition)) return "Girls";
  if (/\bWomen'?s?\b/i.test(competition)) return "Women";
  if (/\bMen'?s?\b/i.test(competition)) return "Men";
  return null;
}

// "Craughwell United B" -> "B". The A side carries no suffix at all.
function letterOf(ourTeam) {
  return /\bUnited\s+([B-Z])$/.exec(String(ourTeam).trim())?.[1] ?? "A";
}

// -> {teamId: label | null}. null means "this needs a human", never a guess.
export function deriveLabels(fixtures) {
  const teams = teamsFromFixtures(fixtures);
  const parts = {};
  for (const [teamId, meta] of Object.entries(teams)) {
    parts[teamId] = {
      age: ageOf(meta.competition),
      gender: genderOf(meta.competition),
      letter: letterOf(meta.ourTeam),
    };
  }

  // A letter is only shown when the club actually runs more than one side at that age
  // and gender - "U17 Boys" reads better than "U17A Boys" when there is only one.
  const counts = {};
  for (const p of Object.values(parts)) {
    if (!p.age || !p.gender) continue;
    const key = `${p.age}|${p.gender}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const labels = {};
  for (const [teamId, p] of Object.entries(parts)) {
    if (!p.age || !p.gender) { labels[teamId] = null; continue; }
    const many = counts[`${p.age}|${p.gender}`] > 1;
    labels[teamId] = `${p.age}${many ? p.letter : ""} ${p.gender}`;
  }
  return labels;
}

// -> {labels: {teamId: string}, unknown: teamId[]}
// Config always beats derivation, so a label you set can never be moved by a change in
// the league's competition naming.
export function resolveTeams(fixtures, config) {
  const derived = deriveLabels(fixtures);
  const teams = teamsFromFixtures(fixtures);
  const labels = {};
  const unknown = [];
  for (const [teamId, meta] of Object.entries(teams)) {
    const set = config?.teams?.[teamId]?.label || null;
    const label = set || derived[teamId] || null;
    // An unlabelled squad shows its raw feed name: visibly unfinished, never silently wrong.
    labels[teamId] = label ?? meta.ourTeam;
    if (!label) unknown.push(teamId);
  }
  return { labels, unknown };
}

// Returns a config containing every squad, preserving everything already set.
export function seedConfig(fixtures, existing) {
  const derived = deriveLabels(fixtures);
  const teams = teamsFromFixtures(fixtures);
  const out = { version: CONFIG_VERSION, teams: { ...(existing?.teams ?? {}) } };

  const used = new Set(Object.values(out.teams).map((t) => t.color).filter(Boolean));
  for (const teamId of Object.keys(teams).sort()) {
    if (out.teams[teamId]) continue;
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[used.size % PALETTE.length];
    used.add(color);
    out.teams[teamId] = { label: derived[teamId] ?? null, color };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/teams.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/teams.js test/teams.test.js
git commit -m "feat(teams): derive squad labels, merge config, seed new squads"
```

---

## Task 7: `window.js` — the four named date windows

**Files:**
- Create: `src/lib/window.js`
- Test: `test/window.test.js`

- [ ] **Step 1: Write the failing test**

`test/window.test.js`:
```js
import { describe, it, expect } from "vitest";
import { WINDOWS, windowRange, windowPredicate } from "../src/lib/window.js";

// 2026-08-25 is a Tuesday. 08-28 Fri, 08-29 Sat, 08-30 Sun.
describe("windowRange", () => {
  it("offers exactly the four named windows", () => {
    expect(WINDOWS).toEqual(["This weekend", "Next 7 days", "Next 14 days", "All"]);
  });

  it("finds the coming Friday-to-Sunday from midweek", () => {
    expect(windowRange("This weekend", "2026-08-25"))
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
  });

  it("uses the current weekend when asked on a Saturday", () => {
    expect(windowRange("This weekend", "2026-08-29"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("uses today only when asked on a Sunday", () => {
    expect(windowRange("This weekend", "2026-08-30"))
      .toEqual({ from: "2026-08-30", to: "2026-08-30" });
  });

  it("starts a Friday weekend on that Friday", () => {
    expect(windowRange("This weekend", "2026-08-28"))
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
  });

  it("counts N days inclusive of today", () => {
    expect(windowRange("Next 7 days", "2026-08-25"))
      .toEqual({ from: "2026-08-25", to: "2026-08-31" });
    expect(windowRange("Next 14 days", "2026-08-25"))
      .toEqual({ from: "2026-08-25", to: "2026-09-07" });
  });

  it("runs to the far future for All", () => {
    expect(windowRange("All", "2026-08-25")).toEqual({ from: "2026-08-25", to: "9999-12-31" });
  });

  it("treats an unknown window name as All rather than showing nothing", () => {
    expect(windowRange("nonsense", "2026-08-25")).toEqual(windowRange("All", "2026-08-25"));
  });
});

describe("windowPredicate", () => {
  const inWeek = windowPredicate("Next 7 days", "2026-08-25");

  it("includes both ends and excludes the past", () => {
    expect(inWeek({ date: "2026-08-25" })).toBe(true);
    expect(inWeek({ date: "2026-08-31" })).toBe(true);
    expect(inWeek({ date: "2026-09-01" })).toBe(false);
    expect(inWeek({ date: "2026-08-24" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/window.test.js`
Expected: FAIL — cannot resolve `../src/lib/window.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/window.js`:
```js
// Pure. The only module that knows what "This weekend" means.
//
// All arithmetic is on ISO date STRINGS via UTC day maths. Fixture dates are Irish local
// dates with no time component, so this never crosses a DST boundary and a kick-off can
// never shift a day.
export const WINDOWS = ["This weekend", "Next 7 days", "Next 14 days", "All"];

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const asIso = (d) => d.toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

const dayOfWeek = (iso) => asDate(iso).getUTCDay(); // 0 Sun .. 6 Sat

export function windowRange(name, today) {
  if (name === "This weekend") {
    const dow = dayOfWeek(today);
    if (dow === 6) return { from: today, to: addDays(today, 1) };  // Saturday
    if (dow === 0) return { from: today, to: today };              // Sunday
    const friday = addDays(today, 5 - dow);                        // Mon..Fri -> this Friday
    return { from: friday, to: addDays(friday, 2) };
  }
  if (name === "Next 7 days") return { from: today, to: addDays(today, 6) };
  if (name === "Next 14 days") return { from: today, to: addDays(today, 13) };
  // "All", and anything unrecognised: showing everything beats showing nothing.
  return { from: today, to: "9999-12-31" };
}

export function windowPredicate(name, today) {
  const { from, to } = windowRange(name, today);
  return (fixture) => fixture.date >= from && fixture.date <= to;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/window.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window.js test/window.test.js
git commit -m "feat(window): named date windows for the announcement"
```

---

## Task 8: `diff.js` — what changed since the last pull

This is the heart of the product. Read the spec's "Diff semantics" section before starting.

**Files:**
- Create: `src/lib/diff.js`
- Test: `test/diff.test.js`

- [ ] **Step 1: Write the failing test**

`test/diff.test.js`:
```js
import { describe, it, expect } from "vitest";
import { diff, SEVERITY } from "../src/lib/diff.js";

const TODAY = "2026-08-25";

const fixture = (over = {}) => ({
  fid: "6951014", teamId: "235380", date: "2026-08-29", time: "12:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1", comment: "",
  ...over,
});

describe("diff", () => {
  it("reports nothing when nothing changed", () => {
    expect(diff([fixture()], [fixture()], TODAY)).toEqual([]);
  });

  it("reports a moved kick-off as one change, not a delete plus an add", () => {
    const changes = diff([fixture()], [fixture({ time: "16:00" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: "moved", fid: "6951014",
      from: { date: "2026-08-29", time: "12:00" },
      to: { date: "2026-08-29", time: "16:00" },
    });
  });

  it("reports a moved date", () => {
    const changes = diff([fixture()], [fixture({ date: "2026-09-05" })], TODAY);
    expect(changes[0].type).toBe("moved");
    expect(changes[0].to.date).toBe("2026-09-05");
  });

  it("reports a venue switch", () => {
    const changes = diff([fixture()], [fixture({ venue: "Colemanstown" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "venue", from: "Craughwell", to: "Colemanstown" });
  });

  it("reports a new fixture", () => {
    const changes = diff([], [fixture()], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("added");
  });

  it("reports a corrected opponent or competition", () => {
    expect(diff([fixture()], [fixture({ opponent: "Renmore" })], TODAY)[0].type).toBe("opponent");
    expect(diff([fixture()], [fixture({ competition: "GFA Cup" })], TODAY)[0].type).toBe("opponent");
  });

  it("treats a future fixture that vanished as a cancellation", () => {
    const changes = diff([fixture({ date: "2026-09-05" })], [], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("cancelled");
  });

  it("stays silent about a past fixture that vanished - it was simply played", () => {
    // The endpoint returns upcoming fixtures only, so played games leave the list.
    // Treating that as a cancellation would email a false alarm after every match.
    expect(diff([fixture({ date: "2026-08-20" })], [], TODAY)).toEqual([]);
  });

  it("treats a fixture vanishing on the day itself as played, not cancelled", () => {
    expect(diff([fixture({ date: TODAY })], [], TODAY)).toEqual([]);
  });

  it("attaches the league's note to the change it explains", () => {
    const changes = diff(
      [fixture()],
      [fixture({ time: "16:00", comment: "Colemanstown requested kickoff time" })],
      TODAY,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].comment).toBe("Colemanstown requested kickoff time");
  });

  it("reports a note on its own only when nothing else changed", () => {
    const changes = diff([fixture()], [fixture({ comment: "Home KO SUN 4PM" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "comment", to: "Home KO SUN 4PM" });
  });

  it("ignores referee, assessor and score fields entirely", () => {
    const changes = diff(
      [fixture({ referee: "TBC", homescore: "" })],
      [fixture({ referee: "J Murphy", homescore: "2" })],
      TODAY,
    );
    expect(changes).toEqual([]);
  });

  it("can report a move and a venue switch on the same fixture", () => {
    const changes = diff([fixture()], [fixture({ time: "16:00", venue: "Athenry" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["moved", "venue"]);
  });

  it("orders changes most-disruptive first", () => {
    const other = fixture({ fid: "7", date: "2026-09-05" });
    const changes = diff(
      [fixture(), other],
      [fixture({ venue: "Athenry" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["cancelled", "venue"]);
    expect(SEVERITY.indexOf("cancelled")).toBeLessThan(SEVERITY.indexOf("venue"));
  });

  it("handles a first-ever run with no previous snapshot", () => {
    expect(diff(undefined, [fixture()], TODAY)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/diff.test.js`
Expected: FAIL — cannot resolve `../src/lib/diff.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/diff.js`:
```js
// Pure. What changed between two snapshots.
//
// Everything keys off the league's fixture id. That is the whole trick: matching on id
// turns a reschedule into "12:00 -> 16:00" instead of an unrelated delete and add, and it
// keeps working when a fixture moves to a different date, venue and opponent at once.

// Most disruptive first. Also the order sections appear in the email.
export const SEVERITY = ["cancelled", "moved", "venue", "opponent", "added", "comment"];

const byFid = (list) => new Map((list ?? []).map((f) => [f.fid, f]));

export function diff(prev, next, today) {
  const before = byFid(prev);
  const after = byFid(next);
  const changes = [];

  for (const [fid, p] of before) {
    if (after.has(fid)) continue;
    // A fixture leaving the list is ambiguous: the endpoint only ever returns UPCOMING
    // fixtures, so a played game disappears exactly like a cancelled one. The date settles
    // it. Without this, every Monday would email "43 fixtures cancelled".
    if (p.date > today) {
      changes.push({ type: "cancelled", fid, teamId: p.teamId, fixture: p, comment: p.comment || "" });
    }
  }

  for (const [fid, n] of after) {
    const p = before.get(fid);
    if (!p) {
      changes.push({ type: "added", fid, teamId: n.teamId, fixture: n, comment: n.comment || "" });
      continue;
    }

    let substantive = false;
    const note = n.comment || "";

    if (p.date !== n.date || p.time !== n.time) {
      substantive = true;
      changes.push({
        type: "moved", fid, teamId: n.teamId, fixture: n, comment: note,
        from: { date: p.date, time: p.time },
        to: { date: n.date, time: n.time },
      });
    }
    if (p.venue !== n.venue) {
      substantive = true;
      changes.push({ type: "venue", fid, teamId: n.teamId, fixture: n, comment: note,
        from: p.venue, to: n.venue });
    }
    if (p.opponent !== n.opponent || p.competition !== n.competition) {
      substantive = true;
      changes.push({
        type: "opponent", fid, teamId: n.teamId, fixture: n, comment: note,
        from: { opponent: p.opponent, competition: p.competition },
        to: { opponent: n.opponent, competition: n.competition },
      });
    }
    // The league writes its explanation in the comment, so it is context on the change
    // above rather than an item of its own. Alone, it is still worth knowing about.
    if (!substantive && p.comment !== n.comment) {
      changes.push({ type: "comment", fid, teamId: n.teamId, fixture: n,
        from: p.comment, to: n.comment });
    }
  }

  return changes.sort(
    (a, b) =>
      SEVERITY.indexOf(a.type) - SEVERITY.indexOf(b.type) ||
      a.fixture.date.localeCompare(b.fixture.date) ||
      a.fixture.time.localeCompare(b.fixture.time),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/diff.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.js test/diff.test.js
git commit -m "feat(diff): fid-keyed change detection with played-vs-cancelled rule"
```

---

## Task 9: `announce.js` — the copyable announcement

**Files:**
- Create: `src/lib/announce.js`
- Test: `test/announce.test.js`

- [ ] **Step 1: Write the failing test**

`test/announce.test.js`:
```js
import { describe, it, expect } from "vitest";
import { announce, formatFixtureLine, HOME_VENUE } from "../src/lib/announce.js";

const config = { teams: {
  "235380": { label: "U14A Boys", color: "#1f6feb" },
  "254061": { label: "U14B Boys", color: "#3fb950" },
  "238155": { label: "U14 Girls", color: "#e5484d" },
} };

const f = (over = {}) => ({
  fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: HOME_VENUE, competition: "GFA Boys U14 Championship 1", comment: "",
  ...over,
});

describe("formatFixtureLine", () => {
  const labels = { "235380": "U14A Boys" };

  it("writes a home game with v", () => {
    expect(formatFixtureLine(f(), labels, {}))
      .toBe("  12:00  U14A Boys v St Bernards");
  });

  it("writes an away game with @", () => {
    expect(formatFixtureLine(f({ isHome: false, opponent: "Cregmore/Claregalway C", venue: "Cregmore" }), labels, {}))
      .toBe("  12:00  U14A Boys @ Cregmore/Claregalway C");
  });

  it("keeps the opposition's own suffix, so parents know which side they face", () => {
    expect(formatFixtureLine(f({ opponent: "Colga B" }), labels, {}))
      .toContain("v Colga B");
  });

  it("names the ground only when a home game is not at the home ground", () => {
    expect(formatFixtureLine(f({ venue: "Colemanstown" }), labels, {}))
      .toBe("  12:00  U14A Boys v St Bernards (at Colemanstown)");
  });

  it("can prefix the squad's colour as an emoji square for WhatsApp", () => {
    expect(formatFixtureLine(f(), labels, config, { colors: true }))
      .toBe("  🟦 12:00  U14A Boys v St Bernards");
  });
});

describe("announce", () => {
  const fixtures = [
    f({ fid: "1", date: "2026-08-29", time: "12:00" }),
    f({ fid: "2", date: "2026-08-29", time: "12:00", teamId: "254061",
        isHome: false, opponent: "Cregmore/Claregalway C", venue: "Cregmore" }),
    f({ fid: "3", date: "2026-08-30", time: "12:00", teamId: "238155",
        isHome: false, opponent: "Colga B", venue: "Clarinbridge" }),
    f({ fid: "9", date: "2026-12-01", time: "20:15" }),
  ];

  it("renders the house format, grouped by day", () => {
    expect(announce(fixtures, config, "This weekend", "2026-08-25")).toBe(
`CRAUGHWELL UNITED
Fri 28 Aug - Sun 30 Aug

SATURDAY 29 AUGUST
  12:00  U14A Boys v St Bernards
  12:00  U14B Boys @ Cregmore/Claregalway C

SUNDAY 30 AUGUST
  12:00  U14 Girls @ Colga B`);
  });

  it("honours the window", () => {
    expect(announce(fixtures, config, "This weekend", "2026-08-25")).not.toContain("DECEMBER");
    expect(announce(fixtures, config, "All", "2026-08-25")).toContain("DECEMBER");
  });

  it("orders by kick-off within a day", () => {
    const out = announce(
      [f({ fid: "a", time: "14:00" }), f({ fid: "b", time: "10:00" })],
      config, "All", "2026-08-25",
    );
    expect(out.indexOf("10:00")).toBeLessThan(out.indexOf("14:00"));
  });

  it("says so plainly when the window is empty, instead of printing a bare header", () => {
    expect(announce([], config, "This weekend", "2026-08-25"))
      .toContain("No fixtures");
  });

  it("keeps the A/B letter when only one of the two squads plays this window", () => {
    // Derivation counts how many squads the club runs at an age and gender. Counting
    // over the FILTERED list would silently demote "U14B Boys" to "U14 Boys" on a
    // weekend when the A side has no game.
    const bOnly = [f({ fid: "2", teamId: "254061", ourTeam: "Craughwell United B",
      competition: "GFA Boys U14 Division 4" })];
    const all = [...bOnly, f({ fid: "1", teamId: "235380", date: "2026-12-01",
      competition: "GFA Boys U14 Championship 1" })];
    expect(announce(all, {}, "This weekend", "2026-08-25")).toContain("U14B Boys");
  });

  it("shows the raw feed name for a squad you have not labelled yet", () => {
    expect(announce([f({ teamId: "379931", ourTeam: "Craughwell United" })], config, "All", "2026-08-25"))
      .toContain("Craughwell United v St Bernards");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/announce.test.js`
Expected: FAIL — cannot resolve `../src/lib/announce.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/announce.js`:
```js
// Pure. The club's announcement text.
//
// Imported by BOTH the site and scripts/check.mjs, so what you copy out of the app and
// what an email quotes can never drift apart.
import { windowPredicate, windowRange } from "./window.js";
import { resolveTeams } from "./teams.js";
import { squadColor, colorEmoji } from "./squadColors.js";

export const CLUB_TITLE = "CRAUGHWELL UNITED";
export const HOME_VENUE = "Craughwell";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);

// "2026-08-29" -> "SATURDAY 29 AUGUST"
function dayHeading(iso) {
  const d = asDate(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// "2026-08-29" -> "Sat 29 Aug"
function shortDate(iso) {
  const d = asDate(iso);
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function formatFixtureLine(fixture, labels, config, opts = {}) {
  const label = labels[fixture.teamId] ?? fixture.ourTeam;
  const versus = fixture.isHome ? "v" : "@";
  // v / @ already tells you whose ground it is. The ground is only worth naming when a
  // HOME game is somewhere other than home - the case that actually strands people.
  const where = fixture.isHome && fixture.venue && fixture.venue !== HOME_VENUE
    ? ` (at ${fixture.venue})`
    : "";
  const swatch = opts.colors ? `${colorEmoji(squadColor(fixture.teamId, config).bg)} ` : "";
  return `  ${swatch}${fixture.time}  ${label} ${versus} ${fixture.opponent}${where}`;
}

export function announce(fixtures, config, windowName, today, opts = {}) {
  const all = fixtures ?? [];
  const inWindow = windowPredicate(windowName, today);
  const { from, to } = windowRange(windowName, today);
  const chosen = all
    .filter(inWindow)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const heading = windowName === "All"
    ? `${CLUB_TITLE}\nAll upcoming fixtures`
    : `${CLUB_TITLE}\n${shortDate(from)} - ${shortDate(to)}`;

  if (chosen.length === 0) return `${heading}\n\nNo fixtures in this window.`;

  // Resolved over EVERY fixture, not just the windowed ones: deriveLabels decides
  // whether to show the A/B letter by counting the club's squads at that age and
  // gender, and that count must not change with the window.
  const { labels } = resolveTeams(all, config);

  const sections = [];
  let currentDay = null;
  for (const fixture of chosen) {
    if (fixture.date !== currentDay) {
      currentDay = fixture.date;
      sections.push(`\n${dayHeading(currentDay)}`);
    }
    sections.push(formatFixtureLine(fixture, labels, config, opts));
  }

  return `${heading}\n${sections.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/announce.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/announce.js test/announce.test.js
git commit -m "feat(announce): copyable announcement in the club's house format"
```

---

## Task 10: `changeReport.js` — the email body

**Files:**
- Create: `src/lib/changeReport.js`
- Test: `test/changeReport.test.js`

- [ ] **Step 1: Write the failing test**

`test/changeReport.test.js`:
```js
import { describe, it, expect } from "vitest";
import { changeReport } from "../src/lib/changeReport.js";

const config = { teams: { "235380": { label: "U14A Boys" } } };

const base = {
  fid: "1", teamId: "235380", date: "2026-08-30", time: "14:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: "Craughwell", competition: "GFA U16 Division 1", comment: "",
};

const moved = {
  type: "moved", fid: "1", teamId: "235380", fixture: { ...base, time: "16:00" },
  from: { date: "2026-08-30", time: "14:00" }, to: { date: "2026-08-30", time: "16:00" },
  comment: "Colemanstown requested kickoff time",
};

const added = {
  type: "added", fid: "2", teamId: "235380",
  fixture: { ...base, fid: "2", date: "2026-09-16", time: "20:15", isHome: false,
    opponent: "Athenry", venue: "Athenry" },
  comment: "",
};

describe("changeReport", () => {
  it("counts the changes in the subject", () => {
    expect(changeReport([moved, added], config).subject)
      .toBe("Craughwell fixtures: 2 changes (1 moved, 1 new)");
  });

  it("uses the singular for one change", () => {
    expect(changeReport([moved], config).subject)
      .toBe("Craughwell fixtures: 1 change (1 moved)");
  });

  it("shows a move as before -> after", () => {
    const { text } = changeReport([moved], config);
    expect(text).toContain("MOVED");
    expect(text).toContain("U14A Boys v St Bernards");
    expect(text).toContain("Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00");
  });

  it("quotes the league's note under the change it explains", () => {
    expect(changeReport([moved], config).text)
      .toContain('League note: "Colemanstown requested kickoff time"');
  });

  it("omits the note line when there is no note", () => {
    expect(changeReport([added], config).text).not.toContain("League note");
  });

  it("groups by type, most disruptive first", () => {
    const { text } = changeReport([added, moved], config);
    expect(text.indexOf("MOVED")).toBeLessThan(text.indexOf("NEW"));
  });

  it("warns when a squad still needs a label", () => {
    const { text } = changeReport([added], config, { unknown: ["411902"], siteUrl: "https://example.com/" });
    expect(text).toContain("1 squad still needs a label");
  });

  it("links back to the site", () => {
    expect(changeReport([moved], config, { siteUrl: "https://example.com/" }).text)
      .toContain("https://example.com/");
  });

  it("returns null for an empty change list, so the caller cannot send an empty email", () => {
    expect(changeReport([], config)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/changeReport.test.js`
Expected: FAIL — cannot resolve `../src/lib/changeReport.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/changeReport.js`:
```js
// Pure. Change list -> the plain-text alert email.
import { SEVERITY } from "./diff.js";
import { resolveTeams } from "./teams.js";

const HEADINGS = {
  cancelled: "CANCELLED", moved: "MOVED", venue: "VENUE CHANGE",
  opponent: "CORRECTION", added: "NEW", comment: "NOTE",
};

// Deliberately short words: this is a subject line read on a phone.
const NOUNS = {
  cancelled: "cancelled", moved: "moved", venue: "venue change",
  opponent: "correction", added: "new", comment: "note",
};

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function when(date, time) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${time}`;
}

const describe = (change, labels) => {
  const f = change.fixture;
  const label = labels[change.teamId] ?? f.ourTeam;
  return `${label} ${f.isHome ? "v" : "@"} ${f.opponent}`;
};

function detail(change, labels) {
  const f = change.fixture;
  const lines = [`  ${describe(change, labels)}`];
  switch (change.type) {
    case "moved":
      lines.push(`  ${when(change.from.date, change.from.time)}  ->  ${when(change.to.date, change.to.time)}`);
      break;
    case "venue":
      lines.push(`  ${when(f.date, f.time)}`);
      lines.push(`  ${change.from || "(none)"}  ->  ${change.to || "(none)"}`);
      break;
    case "opponent":
      lines.push(`  ${when(f.date, f.time)}`);
      lines.push(`  ${change.from.opponent} (${change.from.competition})`);
      lines.push(`  ->  ${change.to.opponent} (${change.to.competition})`);
      break;
    case "comment":
      lines.push(`  ${when(f.date, f.time)}`);
      lines.push(`  "${change.from || "(none)"}"  ->  "${change.to || "(none)"}"`);
      break;
    default: // cancelled, added
      lines.push(`  ${when(f.date, f.time)} - ${f.venue}`);
      lines.push(`  ${f.competition}`);
  }
  if (change.comment) lines.push(`  League note: "${change.comment}"`);
  return lines.join("\n");
}

// -> {subject, text} | null. Null for an empty list: there is no such thing as an
// alert email with nothing in it, and the caller should not have to remember that.
export function changeReport(changes, config, opts = {}) {
  if (!changes || changes.length === 0) return null;

  const { labels } = resolveTeams(changes.map((c) => c.fixture), config);

  const counts = {};
  for (const c of changes) counts[c.type] = (counts[c.type] ?? 0) + 1;
  const summary = SEVERITY.filter((t) => counts[t]).map((t) => `${counts[t]} ${NOUNS[t]}`).join(", ");
  const subject = `Craughwell fixtures: ${changes.length} ${changes.length === 1 ? "change" : "changes"} (${summary})`;

  const sections = [];
  for (const type of SEVERITY) {
    const of = changes.filter((c) => c.type === type);
    if (of.length === 0) continue;
    sections.push(`${HEADINGS[type]}\n${of.map((c) => detail(c, labels)).join("\n\n")}`);
  }

  const footer = [];
  const unknown = opts.unknown ?? [];
  if (unknown.length) {
    footer.push(
      `${unknown.length} squad${unknown.length === 1 ? "" : "s"} still needs a label ` +
      `(team ${unknown.join(", ")}). Until then it shows its raw feed name.`,
    );
  }
  if (opts.siteUrl) footer.push(`Site: ${opts.siteUrl}`);

  return { subject, text: [...sections, ...footer].join("\n\n") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/changeReport.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/changeReport.js test/changeReport.test.js
git commit -m "feat(changeReport): plain-text alert email body"
```

---

## Task 11: `fetchFixtures.js` — the one network call

**Files:**
- Create: `src/lib/fetchFixtures.js`
- Test: `test/fetchFixtures.test.js`

- [ ] **Step 1: Write the failing test**

`test/fetchFixtures.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { fetchFixtures, FIXTURES_URL, REFERER, USER_AGENT } from "../src/lib/fetchFixtures.js";

describe("fetchFixtures", () => {
  it("POSTs to the club's fixtures endpoint", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<ul>" });
    await fetchFixtures(fake);
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(FIXTURES_URL);
    expect(init.method).toBe("POST");
  });

  it("sends the headers the WAF requires", async () => {
    // CloudFront 403s a default client user-agent. This is not optional politeness.
    const fake = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<ul>" });
    await fetchFixtures(fake);
    const { headers } = fake.mock.calls[0][1];
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["User-Agent"]).toMatch(/Mozilla/);
    expect(headers.Referer).toBe(REFERER);
  });

  it("returns the body on success", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<ul>hi</ul>" });
    await expect(fetchFixtures(fake)).resolves.toBe("<ul>hi</ul>");
  });

  it("throws on a non-200 so the caller aborts instead of writing an empty snapshot", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "blocked" });
    await expect(fetchFixtures(fake)).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fetchFixtures.test.js`
Expected: FAIL — cannot resolve `../src/lib/fetchFixtures.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/fetchFixtures.js`:
```js
// The only network I/O in this project.
//
// Two things here are load-bearing and were established the hard way:
//   1. The endpoint sits behind CloudFront, which 403s a default client User-Agent.
//      A browser UA plus a Referer gets a 200.
//   2. It sends no CORS headers, so this can never run in the browser - which is why
//      the whole fetch/diff pipeline lives in a CI job rather than in the app.
export const FIXTURES_URL =
  "https://galwayfa.ie/wp-admin/admin-ajax.php" +
  "?action=fixtures&club_id=2960&competition_id=&team_id=&displayResults=";

export const REFERER = "https://galwayfa.ie/clubprofile/2960/";
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Safari/537.36";

export async function fetchFixtures(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(FIXTURES_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Referer: REFERER,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
    },
  });
  if (!res.ok) throw new Error(`fixtures fetch failed: HTTP ${res.status}`);
  return res.text();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/fetchFixtures.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchFixtures.js test/fetchFixtures.test.js
git commit -m "feat(fetch): fixtures endpoint client with the headers the WAF needs"
```

---

## Task 12: `runCheck.js` — the pipeline, without I/O

The safety rules belong in a pure function so they can be tested. `scripts/check.mjs` (Task 13) becomes a thin shell around this.

**Files:**
- Create: `src/lib/runCheck.js`
- Test: `test/runCheck.test.js`

- [ ] **Step 1: Write the failing test**

`test/runCheck.test.js`:
```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runCheck } from "../src/lib/runCheck.js";
import { FIXTURE_COUNT, TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
const NOW = "2026-08-25T06:00:11Z";
const TODAY = "2026-08-25";

describe("runCheck", () => {
  it("produces a snapshot from the real capture", () => {
    const out = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    expect(out.snapshot.version).toBe(1);
    expect(out.snapshot.fetchedAt).toBe(NOW);
    expect(out.snapshot.fixtures).toHaveLength(FIXTURE_COUNT);
  });

  it("seeds a config covering every squad on a first run", () => {
    const out = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    expect(Object.keys(out.config.teams)).toHaveLength(TEAM_COUNT);
    // Not a hardcoded count: which squads are underivable changes when the league
    // renames a competition. Every unknown must be a real squad in the snapshot.
    expect(out.unknown.every((id) => id in out.config.teams)).toBe(true);
    expect(out.unknown.every((id) => out.config.teams[id].label === null)).toBe(true);
  });

  it("reports no changes when the previous snapshot is identical", () => {
    const first = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    const second = runCheck({ html, previous: first.snapshot, config: first.config, now: NOW, today: TODAY });
    expect(second.changes).toEqual([]);
    expect(second.report).toBeNull();
  });

  it("treats a first-ever run as no changes, not 43 new fixtures", () => {
    // Otherwise the very first cron run emails the entire season.
    const out = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    expect(out.changes).toEqual([]);
    expect(out.firstRun).toBe(true);
  });

  it("detects a change against a previous snapshot", () => {
    const first = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    const previous = {
      ...first.snapshot,
      fixtures: first.snapshot.fixtures.map((f, i) => (i === 0 ? { ...f, time: "09:00" } : f)),
    };
    const out = runCheck({ html, previous, config: first.config, now: NOW, today: TODAY });
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].type).toBe("moved");
    expect(out.report.subject).toMatch(/1 change/);
  });

  it("ABORTS rather than writing an empty snapshot when the page yields nothing", () => {
    // The critical safety rule. Without it, one WAF hiccup emails "everything cancelled"
    // and then poisons the baseline so the next run reports everything as new.
    expect(() => runCheck({ html: "<html>blocked</html>", previous: null, config: null, now: NOW, today: TODAY }))
      .toThrow(/no fixtures/i);
  });

  it("ABORTS on an empty response body", () => {
    expect(() => runCheck({ html: "", previous: null, config: null, now: NOW, today: TODAY }))
      .toThrow(/no fixtures/i);
  });

  it("prepends this run to the change history, newest first", () => {
    const first = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    const previous = {
      ...first.snapshot,
      fixtures: first.snapshot.fixtures.map((f, i) => (i === 0 ? { ...f, venue: "Nowhere" } : f)),
    };
    const history = [{ checkedAt: "2026-08-24T06:00:00Z", changes: [] }];
    const out = runCheck({ html, previous, config: first.config, now: NOW, today: TODAY, history });
    expect(out.history).toHaveLength(2);
    expect(out.history[0].checkedAt).toBe(NOW);
    expect(out.history[1].checkedAt).toBe("2026-08-24T06:00:00Z");
  });

  it("leaves the history untouched on a quiet day", () => {
    const first = runCheck({ html, previous: null, config: null, now: NOW, today: TODAY });
    const history = [{ checkedAt: "2026-08-24T06:00:00Z", changes: [] }];
    const out = runCheck({ html, previous: first.snapshot, config: first.config, now: NOW, today: TODAY, history });
    expect(out.history).toEqual(history);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/runCheck.test.js`
Expected: FAIL — cannot resolve `../src/lib/runCheck.js`.

- [ ] **Step 3: Write the implementation**

`src/lib/runCheck.js`:
```js
// Pure. The whole pipeline minus I/O: HTML in, everything the caller must persist out.
//
// Keeping the safety rules here rather than in the script is deliberate - they are the
// part that must be tested, and a script that talks to the network and the filesystem is
// the hardest place to test anything.
import { parse } from "./parse.js";
import { normalizeAll } from "./normalize.js";
import { diff } from "./diff.js";
import { seedConfig, resolveTeams } from "./teams.js";
import { changeReport } from "./changeReport.js";

export const SNAPSHOT_VERSION = 1;

export function runCheck({ html, previous, config, now, today, history = [], siteUrl }) {
  const parsed = parse(html);
  const { fixtures, errors: dateErrors } = normalizeAll(parsed.fixtures);
  const errors = [...parsed.errors, ...dateErrors];

  // THE SAFETY RULE. A blocked request, a redesigned page or a truncated response all
  // arrive here as "no fixtures". Writing that snapshot would report every fixture as
  // cancelled and then leave a baseline claiming the club has no fixtures at all.
  if (fixtures.length === 0) {
    throw new Error(`aborting: no fixtures parsed from the response (${errors.length} parse errors)`);
  }

  const snapshot = { version: SNAPSHOT_VERSION, fetchedAt: now, fixtures };
  const nextConfig = seedConfig(fixtures, config);
  const { unknown } = resolveTeams(fixtures, nextConfig);

  // A first run has nothing to compare against. Diffing against an empty list would call
  // the entire season "new" and email all of it.
  const firstRun = !previous || !Array.isArray(previous.fixtures);
  const changes = firstRun ? [] : diff(previous.fixtures, fixtures, today);

  const report = changeReport(changes, nextConfig, { unknown, siteUrl });

  return {
    snapshot,
    config: nextConfig,
    changes,
    report,
    unknown,
    errors,
    firstRun,
    history: changes.length ? [{ checkedAt: now, changes }, ...history] : history,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/runCheck.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/runCheck.js test/runCheck.test.js
git commit -m "feat(runCheck): pipeline core with the abort-on-empty safety rule"
```

---

## Task 13: `scripts/check.mjs` — the orchestrator

**Files:**
- Create: `scripts/check.mjs`

- [ ] **Step 1: Write the script**

`scripts/check.mjs`:
```js
#!/usr/bin/env node
// The cron entry point. Fetch, diff, persist, email.
//
// Everything decision-shaped lives in src/lib/runCheck.js and is unit-tested. This file
// only does I/O, and is deliberately dull.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFixtures } from "../src/lib/fetchFixtures.js";
import { runCheck } from "../src/lib/runCheck.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "public", "data");
const SITE_URL = process.env.SITE_URL || "https://seaninryan.github.io/fixtures/";

function readJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(join(DATA, name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function sendEmail(report) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_TO_EMAIL;
  const from = process.env.ALERT_FROM_EMAIL || "fixtures@resend.dev";
  // Same contract as sideline's notify route: unconfigured is a clean no-op, not an error.
  // The snapshot is still written and committed either way.
  if (!key || !to) {
    console.log("email not configured (RESEND_API_KEY / ALERT_TO_EMAIL) - skipping");
    return;
  }
  const { Resend } = await import("resend");
  await new Resend(key).emails.send({ from, to, subject: report.subject, text: report.text });
  console.log(`emailed: ${report.subject}`);
}

async function main() {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // FIXTURES_HTML_FILE lets you exercise the whole pipeline offline against the golden
  // capture, without touching the live site.
  const local = process.env.FIXTURES_HTML_FILE;
  const html = local ? readFileSync(local, "utf8") : await fetchFixtures();

  const out = runCheck({
    html,
    previous: readJson("latest.json", null),
    config: readJson("teams.json", null),
    history: readJson("changes.json", []),
    now,
    today,
    siteUrl: SITE_URL,
  });

  for (const err of out.errors) console.warn(`parse warning: ${err}`);

  writeJson("latest.json", out.snapshot);
  writeJson("teams.json", out.config);
  writeJson("changes.json", out.history);

  if (out.firstRun) {
    console.log(`first run: ${out.snapshot.fixtures.length} fixtures recorded as the baseline`);
  } else {
    console.log(`${out.snapshot.fixtures.length} fixtures, ${out.changes.length} changes`);
  }
  if (out.unknown.length) {
    console.log(`squads still needing a label: ${out.unknown.join(", ")}`);
  }

  if (out.report) await sendEmail(out.report);
}

// A non-zero exit is the signal that the run failed. The Action then fails visibly and
// nothing is committed, which is exactly what should happen when the fetch is blocked.
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it offline against the golden capture**

Run: `FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs`
Expected:
```
first run: 43 fixtures recorded as the baseline
squads still needing a label: 238142, 234323, 379931
email not configured (RESEND_API_KEY / ALERT_TO_EMAIL) - skipping
```

- [ ] **Step 3: Run it a second time to prove it is idempotent**

Run: `FIXTURES_HTML_FILE=test/fixtures/club2960.html node scripts/check.mjs`
Expected: `43 fixtures, 0 changes` — and `git status` shows `public/data` unchanged apart from `fetchedAt`.

- [ ] **Step 4: Prove the safety rule fires**

Run: `echo '<html>blocked</html>' > /tmp/blocked.html && FIXTURES_HTML_FILE=/tmp/blocked.html node scripts/check.mjs; echo "exit=$?"`
Expected: `aborting: no fixtures parsed from the response (...)` and `exit=1`. Confirm `public/data/latest.json` still holds 43 fixtures.

- [ ] **Step 5: Fill in the three squad labels**

Edit `public/data/teams.json` and set the three `null` labels — `238142`, `234323`, `379931` — to whatever the owner confirms. Leave them `null` if unconfirmed; the pipeline handles it.

- [ ] **Step 6: Commit**

```bash
git add scripts/check.mjs public/data
git commit -m "feat(check): cron orchestrator with offline mode and guarded email"
```

---

## Task 14: The site

Three tabs over the committed JSON. Components stay thin: all formatting is already in `src/lib/`.

**Files:**
- Create: `src/components/AnnouncementTab.jsx`, `src/components/ChangesTab.jsx`, `src/components/SquadsTab.jsx`
- Modify: `src/App.jsx`, `src/styles.css`
- Test: `test/components.test.jsx`

- [ ] **Step 1: Write the failing test**

SSR smoke tests via `renderToStaticMarkup`, matching both reference projects. Interaction is verified by hand after deploy.

`test/components.test.jsx`:
```jsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnnouncementTab from "../src/components/AnnouncementTab.jsx";
import ChangesTab from "../src/components/ChangesTab.jsx";
import SquadsTab from "../src/components/SquadsTab.jsx";

const config = { version: 1, teams: { "235380": { label: "U14A Boys", color: "#1f6feb" } } };
const fixtures = [{
  fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "",
}];

describe("AnnouncementTab", () => {
  it("renders the announcement text", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("U14A Boys v St Bernards");
  });

  it("offers every window", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("This weekend");
    expect(html).toContain("All");
  });
});

describe("ChangesTab", () => {
  it("says so when nothing has ever changed", () => {
    expect(renderToStaticMarkup(<ChangesTab history={[]} config={config} />))
      .toContain("No changes recorded");
  });

  it("renders a recorded change", () => {
    const history = [{ checkedAt: "2026-08-25T06:00:00Z", changes: [{
      type: "moved", fid: "1", teamId: "235380", fixture: fixtures[0],
      from: { date: "2026-08-29", time: "12:00" }, to: { date: "2026-08-29", time: "16:00" },
      comment: "",
    }] }];
    const html = renderToStaticMarkup(<ChangesTab history={history} config={config} />);
    expect(html).toContain("MOVED");
    expect(html).toContain("U14A Boys");
  });
});

describe("SquadsTab", () => {
  it("lists every squad with its label", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} onChange={() => {}} />,
    );
    expect(html).toContain("U14A Boys");
    expect(html).toContain("235380");
  });

  it("links to the file's edit page on GitHub", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} onChange={() => {}} />,
    );
    expect(html).toContain("github.com");
    expect(html).toContain("public/data/teams.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/components.test.jsx`
Expected: FAIL — cannot resolve `../src/components/AnnouncementTab.jsx`.

- [ ] **Step 3: Write `AnnouncementTab.jsx`**

```jsx
import { useState } from "react";
import { announce } from "../lib/announce.js";
import { WINDOWS } from "../lib/window.js";

export default function AnnouncementTab({ fixtures, config, today }) {
  const [windowName, setWindowName] = useState("Next 7 days");
  const [colors, setColors] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = announce(fixtures, config, windowName, today, { colors });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <div className="row">
        {WINDOWS.map((w) => (
          <button key={w} className={w === windowName ? "chip on" : "chip"}
                  onClick={() => setWindowName(w)}>{w}</button>
        ))}
      </div>
      <label className="row dim">
        <input type="checkbox" checked={colors} onChange={(e) => setColors(e.target.checked)} />
        Colour squares
      </label>
      <pre className="card announcement">{text}</pre>
      <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  );
}
```

- [ ] **Step 4: Write `ChangesTab.jsx`**

```jsx
import { resolveTeams } from "../lib/teams.js";

const HEADINGS = {
  cancelled: "CANCELLED", moved: "MOVED", venue: "VENUE CHANGE",
  opponent: "CORRECTION", added: "NEW", comment: "NOTE",
};

function summarise(change) {
  switch (change.type) {
    case "moved":
      return `${change.from.date} ${change.from.time} → ${change.to.date} ${change.to.time}`;
    case "venue":
      return `${change.from || "(none)"} → ${change.to || "(none)"}`;
    case "opponent":
      return `${change.from.opponent} → ${change.to.opponent}`;
    case "comment":
      return `"${change.from || "(none)"}" → "${change.to || "(none)"}"`;
    default:
      return `${change.fixture.date} ${change.fixture.time} — ${change.fixture.venue}`;
  }
}

export default function ChangesTab({ history, config }) {
  if (!history || history.length === 0) {
    return <p className="dim">No changes recorded yet.</p>;
  }
  return (
    <section>
      {history.map((run) => {
        const { labels } = resolveTeams(run.changes.map((c) => c.fixture), config);
        return (
          <div className="card" key={run.checkedAt}>
            <h3 className="dim">{run.checkedAt.slice(0, 10)}</h3>
            {run.changes.map((c) => (
              <div className="change" key={`${c.type}-${c.fid}`}>
                <span className="tag">{HEADINGS[c.type]}</span>
                <strong>{labels[c.teamId] ?? c.fixture.ourTeam}</strong>{" "}
                {c.fixture.isHome ? "v" : "@"} {c.fixture.opponent}
                <div className="dim">{summarise(c)}</div>
                {c.comment ? <div className="dim">League note: “{c.comment}”</div> : null}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 5: Write `SquadsTab.jsx`**

```jsx
import { useState } from "react";
import { teamsFromFixtures, resolveTeams } from "../lib/teams.js";
import { squadColor } from "../lib/squadColors.js";

const EDIT_URL =
  "https://github.com/seaninryan/fixtures/edit/main/public/data/teams.json";

// The site is static, so it cannot write to the repo. Editing is therefore
// edit-here / copy / paste-on-GitHub. See the spec's "Config editing" section.
export default function SquadsTab({ fixtures, config, onChange }) {
  const [copied, setCopied] = useState(false);
  const squads = teamsFromFixtures(fixtures);
  const { labels } = resolveTeams(fixtures, config);
  const json = `${JSON.stringify(config, null, 2)}\n`;

  function set(teamId, field, value) {
    onChange({
      ...config,
      teams: { ...config.teams, [teamId]: { ...(config.teams?.[teamId] ?? {}), [field]: value } },
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      {Object.entries(squads).map(([teamId, meta]) => {
        const unlabelled = !config?.teams?.[teamId]?.label;
        return (
          <div className="card row" key={teamId}>
            <input type="color"
                   value={squadColor(teamId, config).bg}
                   onChange={(e) => set(teamId, "color", e.target.value)} />
            <div className="grow">
              <input className="label-input"
                     value={config?.teams?.[teamId]?.label ?? ""}
                     placeholder={labels[teamId]}
                     onChange={(e) => set(teamId, "label", e.target.value || null)} />
              <div className="dim">{teamId} — {meta.competition}</div>
            </div>
            {unlabelled ? <span className="tag warn">needs a label</span> : null}
          </div>
        );
      })}
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy JSON"}</button>
        <a className="chip" href={EDIT_URL} target="_blank" rel="noreferrer">Edit on GitHub</a>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Rewrite `src/App.jsx`**

```jsx
import { useEffect, useState } from "react";
import AnnouncementTab from "./components/AnnouncementTab.jsx";
import ChangesTab from "./components/ChangesTab.jsx";
import SquadsTab from "./components/SquadsTab.jsx";

const TABS = ["Fixtures", "Changes", "Squads"];

async function loadJson(name, fallback) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState("Fixtures");
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState({ version: 1, teams: {} });

  useEffect(() => {
    loadJson("latest.json", null).then(setSnapshot);
    loadJson("changes.json", []).then(setHistory);
    loadJson("teams.json", { version: 1, teams: {} }).then(setConfig);
  }, []);

  if (!snapshot) return <main className="wrap"><p className="dim">Loading…</p></main>;

  const today = new Date().toISOString().slice(0, 10);
  const fixtures = snapshot.fixtures ?? [];

  return (
    <main className="wrap">
      <h1>Craughwell United</h1>
      <div className="row">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "chip on" : "chip"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Fixtures" && <AnnouncementTab fixtures={fixtures} config={config} today={today} />}
      {tab === "Changes" && <ChangesTab history={history} config={config} />}
      {tab === "Squads" && <SquadsTab fixtures={fixtures} config={config} onChange={setConfig} />}
      <footer className="dim">Updated {snapshot.fetchedAt?.slice(0, 10)}</footer>
    </main>
  );
}
```

- [ ] **Step 7: Append the styles to `src/styles.css`**

```css
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
.grow { flex: 1; min-width: 0; }
.dim { color: var(--dim); font-size: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 12px; margin: 12px 0; }
.chip { background: transparent; color: var(--fg); border: 1px solid var(--line);
  border-radius: 999px; padding: 6px 12px; font-size: 14px; cursor: pointer;
  text-decoration: none; }
.chip.on { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.primary { background: #1f6feb; color: #fff; border: 0; border-radius: 8px;
  padding: 10px 18px; font-size: 15px; cursor: pointer; }
.announcement { white-space: pre-wrap; font: 14px/1.55 ui-monospace, SFMono-Regular,
  Menlo, monospace; overflow-x: auto; }
.change { padding: 8px 0; border-top: 1px solid var(--line); }
.change:first-of-type { border-top: 0; }
/* Squad chips are UI badges, NOT body text. Six of the 24 palette colours sit between
   3:1 and 4.5:1 against their best foreground and cannot be fixed by text colour, so
   the 3:1 large/bold floor is the one that must apply: keep chip text bold and do not
   drop it below 14px. See squadColors.js contrastFg. */
.tag { display: inline-block; font-size: 11px; letter-spacing: .08em;
  border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; margin-right: 8px; }
.tag.warn { border-color: #e5a94d; color: #e5a94d; }
.label-input { width: 100%; background: var(--bg); color: var(--fg);
  border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 15px; }
```

- [ ] **Step 8: Run the component tests**

Run: `npx vitest run test/components.test.jsx`
Expected: PASS, 6 tests.

- [ ] **Step 9: Verify the build catches what tests cannot**

Run: `npm run build`
Expected: build succeeds. (JSX errors surface here that node-environment tests never see.)

- [ ] **Step 10: Look at it**

Run: `npm run dev` and open http://localhost:5173/fixtures/
Check: the announcement matches the house format; the window buttons change the range; Copy works; Squads shows three "needs a label" tags if you left them null.

- [ ] **Step 11: Commit**

```bash
git add src test
git commit -m "feat(site): announcement, changes and squads tabs"
```

---

## Task 15: GitHub Actions — the cron and the deploy

**Files:**
- Create: `.github/workflows/check.yml`, `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the check workflow**

`.github/workflows/check.yml`:
```yaml
name: check

on:
  # GitHub cron is UTC-only, so this is 07:00 IST in summer and 06:00 GMT in winter.
  # Fixtures move days ahead, not hours, so the drift does not matter.
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: check
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      # A failed fetch exits non-zero here, so nothing below runs and nothing is
      # committed. That is the intended behaviour: a blocked request must never be
      # recorded as "no fixtures".
      - name: Check fixtures
        run: node scripts/check.mjs
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          ALERT_TO_EMAIL: ${{ secrets.ALERT_TO_EMAIL }}
          ALERT_FROM_EMAIL: ${{ secrets.ALERT_FROM_EMAIL }}

      - name: Commit snapshot
        run: |
          git config user.name "fixtures-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/data
          git diff --staged --quiet && echo "no snapshot change" && exit 0
          git commit -m "chore: fixtures snapshot $(date -u +%F)"
          git push
```

- [ ] **Step 2: Write the deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Validate the YAML parses**

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/check.yml','.github/workflows/deploy.yml']]; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: daily fixtures check and Pages deploy"
```

---

## Task 16: Repository documentation

**Files:**
- Create: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Craughwell United fixtures

Pulls the club's fixtures from the Galway FA site once a day, commits a snapshot,
and emails a report when the league moves, adds or cancels anything.

**Site:** https://seaninryan.github.io/fixtures/

- **Fixtures** — copyable announcement for club members. Pick a window, press Copy.
- **Changes** — every change the league has made, from `public/data/changes.json`.
- **Squads** — squad labels and colours. Edit here, Copy JSON, paste on GitHub.

## Setup

Email alerts are optional. Without them everything else still works; the run just
logs `email not configured`. To switch them on, add two repository secrets:

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
```

## Design

`docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md` — read this before
changing the fetch or the diff. It records why the fetch cannot happen in the
browser and how the endpoint behaves.
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
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

## Invariants

- **Identity is `fid`**, the league's fixture id. Never compare on names or dates.
- **A failed fetch must never look like a cancellation.** `runCheck` throws when
  zero fixtures parse, so nothing is written. Do not soften this into a warning.
- **A first run reports no changes.** Diffing against an empty baseline would
  email the whole season.
- **Config beats derivation.** A label in `teams.json` is never overwritten.
- **Times are strings, never `Date` objects.** A UTC round-trip moves every
  kick-off by an hour for half the year.
- **`parse.js` never throws.** One bad block costs that block.

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
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README and CLAUDE.md"
```

---

## Task 17: First live run and deploy

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Do one real run against the live site**

Run: `node scripts/check.mjs`
Expected: `43 fixtures, N changes` (N is however much the league has changed since the golden capture was taken). If you get `HTTP 403`, the WAF headers in `fetchFixtures.js` need attention — see the spec.

- [ ] **Step 3: Commit the live snapshot**

```bash
git add public/data
git commit -m "chore: first live fixtures snapshot"
```

- [ ] **Step 4: Create the GitHub repo and push**

```bash
gh repo create fixtures --public --source=. --remote=origin --push
```

- [ ] **Step 5: Turn on Pages**

In the repo: Settings → Pages → Source → **GitHub Actions**. Then watch the `deploy`
workflow finish and open https://seaninryan.github.io/fixtures/

- [ ] **Step 6: Trigger the check workflow by hand**

Run: `gh workflow run check.yml && sleep 45 && gh run list --workflow=check.yml --limit 1`
Expected: the run succeeds. It will report no changes and commit nothing.

- [ ] **Step 7: Add the email secrets (optional, when ready)**

```bash
gh secret set RESEND_API_KEY
gh secret set ALERT_TO_EMAIL
```

Then `gh workflow run check.yml` again. With no changes, still no email — that is
correct. The email path is exercised by Task 12's unit tests.

---

## Self-review

Checked against `docs/superpowers/specs/2026-08-25-fixtures-tracker-design.md`.

**Spec coverage**

| Spec section | Task |
|---|---|
| Data source / endpoint + WAF headers | 2, 11 |
| Module contracts (all 9) | 3–12 |
| Data model: `latest.json`, `teams.json`, `changes.json` | 12, 13 |
| Invariant 1 — identity is `fid` | 8 |
| Invariant 2 — failed fetch never looks like a cancellation | 11, 12, 13 (step 4), 15 |
| Invariant 3 — nothing derived is stored | 12 (snapshot holds feed fields only) |
| Invariant 4 — config beats derivation | 6 |
| Invariant 5 — `parse.js` never throws | 3 |
| Diff semantics, all six types + played-vs-cancelled | 8 |
| Team labels, 13/16 derived, 3 seeded null | 6, 13 (step 5) |
| Squad colours + emoji squares | 5, 9, 14 |
| Config editing (copy + commit) | 14 |
| Announcement format + four windows | 7, 9, 14 |
| Change email + graceful no-op | 10, 13 |
| Testing conventions | every task |
| Operations: cron, permissions, secrets, public repo | 15, 16, 17 |

**Gaps found and closed while reviewing**

- The spec does not say what a **first run** should do. Diffing 43 fixtures against
  an empty baseline would email the entire season on day one. Added `firstRun` to
  `runCheck` with two tests (Task 12).
- The spec's `changeReport` contract does not cover an **empty change list**. It now
  returns `null`, so `check.mjs` cannot send an empty email (Task 10).
- `announce` had no defined behaviour for an **empty window**. It now says
  "No fixtures in this window." rather than printing a bare header (Task 9).

**Placeholder scan:** none. Every code step contains complete code; every command
has expected output.

**Type consistency:** `Fixture` fields (`fid`, `teamId`, `date`, `time`, `isHome`,
`ourTeam`, `opponent`, `venue`, `competition`, `comment`) are produced by
`normalize` in Task 4 and consumed unchanged in Tasks 6–14. `Change` fields
(`type`, `fid`, `teamId`, `fixture`, `comment`, plus `from`/`to`) are produced by
`diff` in Task 8 and consumed by `changeReport` (Task 10) and `ChangesTab`
(Task 14). `SEVERITY` is defined once in `diff.js` and imported by `changeReport.js`.
`PALETTE` is defined once in `squadColors.js` and imported by `teams.js`.
`CLUB_ID` is defined once in `parse.js` and imported by `normalize.js`.
