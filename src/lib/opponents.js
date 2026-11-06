// src/lib/opponents.js
// Pure. How an opponent's name is SHOWN.
//
// The leagues send names with clutter: a team letter ("Knocknacarra D") and, from COMET,
// a season code ("Merlin Woods Reserve 2425"). Those are stripped by default, and the
// owner can override any name in teams.json under `opponents`, keyed on the RAW feed
// name - the only stable identity an opponent has, since neither league gives a club id.
//
// Display only. diff.js and every stored fixture and result keep the raw name, so a
// rename can never raise a change alert.

// A, B... H. Stops short of letters that could be a real word or initial ("Mervue U").
const TEAM_LETTER = / [A-H]$/;
const SEASON_CODE = / (\d{2})(\d{2})$/;

export function cleanOpponent(raw) {
  const original = String(raw ?? "").trim();
  let name = original;
  const season = SEASON_CODE.exec(name);
  // Only two CONSECUTIVE years ("2425"), so "Club 2024" keeps its number. No century
  // wrap: "9900" is not a season, and a modulo would make it one.
  if (season && Number(season[1]) + 1 === Number(season[2])) {
    name = name.slice(0, season.index).trim();
  }
  name = name.replace(TEAM_LETTER, "").trim();
  return name || original;
}

export function opponentName(raw, config) {
  const set = config?.opponents?.[raw];
  if (typeof set === "string" && set.trim()) return set.trim();
  return cleanOpponent(raw);
}

// A new config with the override for `raw` set to `name` - or removed, when `name` is
// blank or equals the cleaned default, so teams.json never collects no-op entries.
export function setOpponent(config, raw, name) {
  const opponents = { ...cleanOpponents(config?.opponents) };
  const value = String(name ?? "").trim();
  if (!value || value === cleanOpponent(raw)) delete opponents[raw];
  else opponents[raw] = value;
  return { ...config, opponents };
}

// Validate a stored `opponents` object: string keys to non-empty strings, nothing else.
export function cleanOpponents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
