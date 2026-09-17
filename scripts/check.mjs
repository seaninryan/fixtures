#!/usr/bin/env node
// The cron entry point. Fetch, diff, persist, email.
//
// Everything decision-shaped lives in src/lib/runCheck.js and is unit-tested. This file
// only does I/O, and is deliberately dull.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFixtures } from "../src/lib/fetchFixtures.js";
import { runCheck } from "../src/lib/runCheck.js";
import { changeReport } from "../src/lib/changeReport.js";
import { fetchTeams, fetchMatches, fetchMatchDetail } from "../src/lib/fetchFaiConnect.js";
import { runFaiCheck } from "../src/lib/runFaiCheck.js";
import { seedConfig } from "../src/lib/teams.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The snapshots live in their own repo (see src/lib/dataSource.js), so the cron checks
// that repo out and points DATA_DIR at it. The default keeps a bare local run - the
// offline rehearsal in the README - writing somewhere harmless and gitignored.
const DATA = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(ROOT, "public", "data");
const SITE_URL = process.env.SITE_URL || "https://seaninryan.github.io/fixtures/";

// The FAI Connect scan. The club is migrating onto this system league by league, so this
// grows as the Galway FA scrape shrinks.
//
// The key is a CREDENTIAL observed in the FAI Connect app's own traffic. It lives only in
// the environment - never in this repo, never in the data repo's JSON, never in browser
// code. The API sends no CORS headers anyway, so the site could not call it if it wanted to.
const FAI_API_KEY = process.env.FAI_CONNECT_API_KEY;
const FAI_CLUB_ID = process.env.FAI_CONNECT_CLUB_ID || "10671";

// One captured run: the team list, each team's future/past payloads, and the match
// details, all keyed by id. The counterpart of FIXTURES_HTML_FILE - it exercises
// everything below the network without a key and without a request.
const FAI_MATCHES_FILE = process.env.FAI_MATCHES_FILE;

// changes.json is committed and grows one entry per changed day, forever. Keeping a
// couple of seasons of it is useful; keeping all of it is a file nobody can open.
const HISTORY_LIMIT = 400;

// Everything except the writes and the email. The point is to be able to rehearse the
// live path by hand before trusting the cron with it.
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

function readJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(join(DATA, name), "utf8"));
  } catch {
    return fallback;
  }
}

// Returns true if bytes actually hit the disk.
//
// snapshot.fetchedAt moves every run, so latest.json always differs - that is expected.
// teams.json and changes.json usually do not, and rewriting them byte-identically makes
// the Action's `git diff --staged --quiet` see a change where there is none.
function writeJson(name, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const path = join(DATA, name);
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = null;
  }
  if (current === next) {
    console.log(`${name}: unchanged, not rewritten`);
    return false;
  }
  if (DRY_RUN) {
    console.log(`${name}: would write ${current === null ? "(new file)" : "(changed)"} - dry run`);
    return false;
  }
  mkdirSync(DATA, { recursive: true });
  writeFileSync(path, next);
  console.log(`${name}: written`);
  return true;
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
  // ANY resend.dev sender may only deliver to the address on the Resend account itself;
  // anything else comes back 403. That is fine for a personal alert and a dead end for
  // sending to the club, so say it here rather than leave it to an error nobody reads.
  if (from.endsWith("@resend.dev")) {
    console.log(
      `from ${from}: resend.dev delivers only to your own Resend account address. ` +
      "Set ALERT_FROM_EMAIL to an address on a verified domain to reach anyone else.",
    );
  }
  if (DRY_RUN) {
    console.log(`would email ${to}: ${report.subject} - dry run`);
    return;
  }
  const { Resend } = await import("resend");
  await new Resend(key).emails.send({ from, to, subject: report.subject, text: report.text });
  console.log(`emailed: ${report.subject}`);
}

// Reads the shape written by test/fixtures/fai-capture.json.
function readFaiCapture(path) {
  const capture = JSON.parse(readFileSync(path, "utf8"));
  const matches = {};
  for (const [teamId, periods] of Object.entries(capture.matches ?? {})) {
    matches[teamId] = { future: periods.future?.result ?? [], past: periods.past?.result ?? [] };
  }
  const facilities = {};
  for (const [matchId, detail] of Object.entries(capture.details ?? {})) {
    facilities[matchId] = detail?.facility ?? null;
  }
  return { teams: capture.teams ?? [], matches, facilities };
}

// Everything the FAI scan needs from the network, gathered into the plain objects
// runFaiCheck consumes. Kept here rather than in a lib module for the same reason the
// Galway fetch is: this is I/O, and runFaiCheck must stay pure and testable.
async function collectFai(opts) {
  const teams = await fetchTeams(FAI_CLUB_ID, opts);
  const matches = {};
  for (const team of teams) {
    const [future, past] = await Promise.all([
      fetchMatches(team.id, "future", opts),
      fetchMatches(team.id, "past", opts),
    ]);
    // Most of the 25 teams are stale entries that have not played in two years. Recording
    // only the ones with matches keeps the snapshot to the squads that have migrated.
    if (future.length || past.length) matches[team.id] = { future, past };
  }

  // Venue comes from a SEPARATE call per match, and only for HOME fixtures:
  // formatFixtureLine names a ground only for a home game played somewhere other than
  // Craughwell, so an away venue is a request whose answer is never rendered.
  const facilities = {};
  const home = Object.values(matches).flatMap((m) => m.future).filter((m) => m.team === "H");
  for (const match of home) {
    // A venue is the one field a fixture can publish without, and this endpoint is
    // undocumented - so a failure here degrades to "no venue" instead of failing the scan.
    try {
      facilities[match.id] = await fetchMatchDetail(match.id, opts);
    } catch (err) {
      console.warn(`fai: no venue for match ${match.id} (${err.message})`);
    }
  }
  return { teams, matches, facilities };
}

// The pure-pipeline half plus the writes. Shared by the live and captured paths so the
// offline rehearsal exercises exactly what the cron does. Returns the raw materials for
// the report, which main() builds over BOTH sources at once.
function finishFai({ teams, matches, facilities, now, today }) {
  const out = runFaiCheck({
    teams,
    matches,
    facilities,
    previous: readJson("latest-fai.json", null),
    previousResults: readJson("results-fai.json", null),
    config: readJson("teams.json", null),
    history: readJson("changes-fai.json", []),
    now,
    today,
    siteUrl: SITE_URL,
  });

  for (const err of out.errors) console.warn(`fai warning: ${err}`);

  writeJson("latest-fai.json", out.snapshot);
  writeJson("results-fai.json", out.results);
  writeJson("changes-fai.json", out.history.slice(0, HISTORY_LIMIT));
  // teams.json is SHARED with the Galway scan and is written by main() from the union of
  // both fixture lists. Writing it here too would have the second scan overwrite the
  // first's seeding with a config that has never seen a Galway squad.
  console.log(`fai: ${out.snapshot.fixtures.length} fixtures, ${out.changes.length} changes, `
    + `${out.results.results.length} results stored`);
  if (out.unknown.length) console.log(`fai: squads still needing a label: ${out.unknown.join(", ")}`);
  return { changes: out.changes, unknown: out.unknown, fixtures: out.snapshot.fixtures };
}

// Returns {result, failed}. NEVER throws for a missing key: the caller decides what a
// failure means, and the whole point of this scan being separate is that its failure must
// not stop the Galway snapshot being written.
async function runFai({ now, today }) {
  if (FAI_MATCHES_FILE) {
    console.log(`fai: reading the captured run at ${FAI_MATCHES_FILE}`);
    return { result: finishFai({ ...readFaiCapture(FAI_MATCHES_FILE), now, today }), failed: false };
  }
  if (!FAI_API_KEY) {
    // Loud, and fatal to the exit code, but not to the Galway write. A silently skipped
    // scan would leave latest-fai.json frozen with nobody noticing.
    console.error("FAI_CONNECT_API_KEY is not set - skipping the FAI Connect scan");
    return { result: null, failed: true };
  }
  const collected = await collectFai({ apiKey: FAI_API_KEY });
  return { result: finishFai({ ...collected, now, today }), failed: false };
}

async function main() {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  if (DRY_RUN) console.log("dry run: no files will be written and no email will be sent");

  // FIXTURES_HTML_FILE lets you exercise the whole pipeline offline against the golden
  // capture, without touching the live site.
  const local = process.env.FIXTURES_HTML_FILE;
  const html = local ? readFileSync(local, "utf8") : await fetchFixtures();

  const out = runCheck({
    html,
    previous: readJson("latest.json", null),
    config: readJson("teams.json", null),
    history: readJson("changes.json", []),
    previousResults: readJson("results.json", null),
    now,
    today,
    siteUrl: SITE_URL,
    // The shrink guard is right by default. The escape hatch is for the end of a season,
    // or for the league genuinely emptying the list.
    allowShrink: process.env.ALLOW_SHRINK === "1",
  });

  for (const err of out.errors) console.warn(`parse warning: ${err}`);

  const history = out.history.slice(0, HISTORY_LIMIT);
  const dropped = out.history.length - history.length;
  if (dropped) console.log(`history trimmed to the most recent ${HISTORY_LIMIT} runs (dropped ${dropped})`);

  writeJson("latest.json", out.snapshot);
  // Seeded from the UNION so one shared teams.json covers both sources - and so a colour
  // handed to a Galway squad is never handed to an FAI squad as well. seedConfig walks the
  // palette taking the first UNUSED colour, which only works if it sees every squad.
  //
  // The FAI side comes from the PREVIOUS snapshot, because this runs before the FAI scan.
  // A squad that migrates today therefore gets its config entry tomorrow - a one-run lag
  // that costs it a derived label for a day and then self-heals.
  const faiPrevious = readJson("latest-fai.json", null);
  const allFixtures = [...out.snapshot.fixtures, ...(faiPrevious?.fixtures ?? [])];
  writeJson("teams.json", seedConfig(allFixtures, readJson("teams.json", null)));
  writeJson("changes.json", history);
  writeJson("results.json", out.results);

  if (out.firstRun) {
    console.log(`first run: ${out.snapshot.fixtures.length} fixtures recorded as the baseline`);
  } else {
    console.log(`${out.snapshot.fixtures.length} fixtures, ${out.changes.length} changes`);
  }
  console.log(`${out.results.results.length} results stored`);
  if (out.unknown.length) {
    console.log(`squads still needing a label: ${out.unknown.join(", ")}`);
  }

  // Isolated ON PURPOSE. A third-party API serving two squads must not stop the other
  // nineteen updating - but a failure still has to be loud, so it sets the exit code
  // rather than being swallowed. latest-fai.json is left exactly as it was, so the site
  // shows yesterday's FAI fixtures with an honest fetchedAt rather than an empty list
  // that would read as "every adult fixture was cancelled".
  let faiFailed = false;
  let fai = null;
  try {
    const out2 = await runFai({ now, today });
    faiFailed = out2.failed;
    fai = out2.result;
  } catch (err) {
    faiFailed = true;
    console.error(`FAI Connect scan failed: ${err.message}`);
  }

  // ONE report over BOTH sources, never one per source. changeReport resolves squad
  // labels from the fixture list it is given, and deriveLabels shows the A/B letter only
  // when the club runs more than one side at that age and gender - so a report built from
  // half the club will silently rename "U15A Boys" to "U15 Boys" the day a youth squad
  // migrates while its sibling is still on Galway FA. Same reason announceLines takes the
  // union. Built here rather than inside either pipeline because this is the only place
  // that has both.
  //
  // Built AFTER the FAI block but from whatever survived it: a failed FAI scan must not
  // swallow the Galway alert, which is the point of the two scans being isolated.
  const report = changeReport(
    [...out.changes, ...(fai?.changes ?? [])],
    readJson("teams.json", null),
    {
      unknown: [...out.unknown, ...(fai?.unknown ?? [])],
      siteUrl: SITE_URL,
      fixtures: [...out.snapshot.fixtures, ...(fai?.fixtures ?? [])],
    },
  );
  if (report) await sendEmail(report);
  if (faiFailed) process.exitCode = 1;
}

// A non-zero exit is the signal that the run failed. The Action then fails visibly and
// nothing is committed, which is exactly what should happen when the fetch is blocked.
main().catch((err) => {
  console.error(err.message);
  // Surface the override at the one moment the operator needs it, rather than in a
  // README they will not be reading when the cron mails them a red build.
  if (/allowShrink/.test(err.message)) {
    console.error("if the collapse is real, re-run with ALLOW_SHRINK=1");
  }
  process.exit(1);
});
