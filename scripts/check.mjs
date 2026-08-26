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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The snapshots live in their own repo (see src/lib/dataSource.js), so the cron checks
// that repo out and points DATA_DIR at it. The default keeps a bare local run - the
// offline rehearsal in the README - writing somewhere harmless and gitignored.
const DATA = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(ROOT, "public", "data");
const SITE_URL = process.env.SITE_URL || "https://seaninryan.github.io/fixtures/";

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
  if (DRY_RUN) {
    console.log(`would email ${to}: ${report.subject} - dry run`);
    return;
  }
  const { Resend } = await import("resend");
  await new Resend(key).emails.send({ from, to, subject: report.subject, text: report.text });
  console.log(`emailed: ${report.subject}`);
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
  writeJson("teams.json", out.config);
  writeJson("changes.json", history);

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
  // Surface the override at the one moment the operator needs it, rather than in a
  // README they will not be reading when the cron mails them a red build.
  if (/allowShrink/.test(err.message)) {
    console.error("if the collapse is real, re-run with ALLOW_SHRINK=1");
  }
  process.exit(1);
});
