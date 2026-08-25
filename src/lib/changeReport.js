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
  // Unreachable while normalize.js guarantees ISO dates - but this is an email, and
  // "undefined NaN undefined" reaching the owner is worse than showing the raw string.
  if (Number.isNaN(d.getTime())) return `${date} ${time}`;
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

  // Labels MUST be resolved over every fixture, not just the changed ones: deriveLabels
  // shows the A/B letter only when the club runs more than one side at that age and
  // gender, so counting over a subset renames a squad. runCheck passes the full snapshot.
  const { labels } = resolveTeams(opts.fixtures ?? changes.map((c) => c.fixture), config);

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
      `${unknown.length} squad${unknown.length === 1 ? "" : "s"} still ` +
      `${unknown.length === 1 ? "needs" : "need"} a label ` +
      `(team ${unknown.join(", ")}). Until then it shows its raw feed name.`,
    );
  }
  if (opts.siteUrl) footer.push(`Site: ${opts.siteUrl}`);

  return { subject, text: [...sections, ...footer].join("\n\n") };
}
