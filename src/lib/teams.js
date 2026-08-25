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

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

// A colour that is not a six-digit hex reaches contrastFg as NaN, which silently renders
// white text on an unknown background. Expand a three-digit hex; reject anything else so
// seedConfig replaces it with a real palette colour.
function usableColor(color) {
  if (typeof color !== "string") return null;
  const c = color.trim();
  if (HEX6.test(c)) return c.toLowerCase();
  const m = HEX3.exec(c);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : null;
}

// Returns a config containing every squad, preserving every label already set.
export function seedConfig(fixtures, existing) {
  const derived = deriveLabels(fixtures);
  const teams = teamsFromFixtures(fixtures);

  const kept = {};
  for (const [teamId, entry] of Object.entries(existing?.teams ?? {})) {
    kept[teamId] = { label: entry?.label ?? null, color: usableColor(entry?.color) };
  }

  // Walk the palette taking the first UNUSED colour. squadColor's hash cannot promise
  // distinctness (it collides by the birthday bound); this is where distinctness for
  // seeded squads actually comes from.
  const used = new Set(Object.values(kept).map((t) => t.color).filter(Boolean));
  const nextColor = () => {
    const c = PALETTE.find((x) => !used.has(x)) ?? PALETTE[used.size % PALETTE.length];
    used.add(c);
    return c;
  };

  for (const entry of Object.values(kept)) {
    if (!entry.color) entry.color = nextColor();
  }

  const out = { version: CONFIG_VERSION, teams: kept };
  for (const teamId of Object.keys(teams).sort()) {
    if (out.teams[teamId]) continue;
    out.teams[teamId] = { label: derived[teamId] ?? null, color: nextColor() };
  }
  return out;
}
