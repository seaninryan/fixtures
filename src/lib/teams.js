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
//
// "United" is hardcoded, so a club rename stops this finding the letter. That fails
// LOUDLY, not silently: every side then derives the same letter, the collision rule below
// nulls all of them, and they surface in resolveTeams' unknown list to be named by hand.
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

  // Two squads deriving the SAME label is worse than two unlabelled ones: an announcement
  // shows a duplicate line, and the change email cannot say whose fixture moved. It is
  // reachable because the letter comes from the team name and the league names every
  // un-suffixed side "Craughwell United" - a third side at an age the club already
  // doubles up on collides with the first. Both claimants go to null rather than one of
  // them being auto-suffixed to "U12C Boys", because which side is the C side is not in
  // the feed, and inventing it is exactly the guess this module refuses to make. The
  // owner names them once in the config, and config beats derivation from then on.
  const claims = {};
  for (const label of Object.values(labels)) {
    if (label) claims[label] = (claims[label] ?? 0) + 1;
  }
  for (const [teamId, label] of Object.entries(labels)) {
    if (label && claims[label] > 1) labels[teamId] = null;
  }
  return labels;
}

// A configured label is text: trimmed, with a blank result counting as absent. Clearing
// the box on the site must hand the squad back to derivation rather than pin it to a
// display name that renders as nothing. Anything that is not a string is not a label -
// repaired the same way usableColor repairs a corrupt colour.
export function cleanLabel(label) {
  return typeof label === "string" ? label.trim() || null : null;
}

// -> {labels: {teamId: string}, unknown: teamId[], duplicates: label[]}
// Config always beats derivation, so a label you set can never be moved by a change in
// the league's competition naming.
export function resolveTeams(fixtures, config) {
  const derived = deriveLabels(fixtures);
  const teams = teamsFromFixtures(fixtures);
  const labels = {};
  const unknown = [];
  for (const [teamId, meta] of Object.entries(teams)) {
    const set = cleanLabel(config?.teams?.[teamId]?.label);
    const label = set || derived[teamId] || null;
    // An unlabelled squad shows its raw feed name: visibly unfinished, never silently wrong.
    labels[teamId] = label ?? meta.ourTeam;
    if (!label) unknown.push(teamId);
  }

  // The feed names every un-suffixed side "Craughwell United", so two unlabelled squads
  // fall back to the SAME heading - the duplicate-line failure the collision rule exists
  // to prevent, arriving by the fallback path instead of the derived one. Qualify a
  // duplicated fallback with its competition, which is what actually tells them apart.
  // Only on real duplication: a squad whose feed name is already unique keeps it bare.
  let counts = tally(labels);
  for (const teamId of unknown) {
    if (counts.get(labels[teamId]) > 1) {
      const meta = teams[teamId];
      labels[teamId] = `${meta.ourTeam} (${meta.competition})`;
    }
  }

  // Whatever is still duplicated is a CONFIGURED label - one the owner set to a name
  // another squad already resolves to. Config beats derivation is a hard rule, so this is
  // reported and never rewritten: the caller decides how loudly to say it.
  counts = tally(labels);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([label]) => label);
  return { labels, unknown, duplicates };
}

// A Map, not an object: a squad could legitimately be labelled "constructor".
function tally(map) {
  const n = new Map();
  for (const v of Object.values(map)) n.set(v, (n.get(v) ?? 0) + 1);
  return n;
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

// A colour that is not a six-digit hex reaches contrastFg as NaN, which silently renders
// white text on an unknown background. Expand a three-digit hex; reject anything else so
// seedConfig replaces it with a real palette colour.
//
// An eight-digit #rrggbbaa is rejected DELIBERATELY, not by oversight: contrastFg reads
// the low byte as blue, so an alpha hex picks the wrong foreground. If a colour picker on
// the site ever starts emitting alpha, teach contrastFg about it here rather than
// widening this regex, or every such colour is silently swapped for a palette one.
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
    kept[teamId] = { label: cleanLabel(entry?.label), color: usableColor(entry?.color) };
  }

  // Walk the palette taking the first UNUSED colour. squadColor's hash cannot promise
  // distinctness (it collides by the birthday bound); this is where distinctness for
  // seeded squads actually comes from.
  //
  // A squad that leaves the fixture list keeps its entry, and so keeps its colour
  // reserved. Over enough seasons a long-lived config exhausts the 24-entry palette, at
  // which point the modulo fallback starts repeating colours. Known, not a surprise:
  // at 19 squads there is headroom, and a repeated colour is cosmetic, not wrong.
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
