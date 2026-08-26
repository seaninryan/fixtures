// Pure. Colour per squad. Shape follows fancystats' teamColors.js: configured value
// wins, otherwise a STABLE fallback so a squad is never colourless and never changes
// colour between runs.

// Spread around the wheel so neighbouring age groups do not look alike, with headroom
// over the current squad count - the club added three squads in a single day.
//
// This list does NOT guarantee a distinct colour per squad. squadColor's fallback is an
// unseeded hash, so squads collide by the birthday bound no matter how long this gets
// (19 real squads currently land on 12 entries). Distinctness comes from seedConfig
// (teams.js), which walks this list taking the first unused colour. The hash is only
// the never-colourless safety net for a squad that is not in the config yet.
export const PALETTE = [
  "#e5484d", "#e5794d", "#e5a94d", "#d9c53c",
  "#a3c93f", "#3fb950", "#3fb98a", "#3fb9b9",
  "#3f93d9", "#1f6feb", "#5a5ae5", "#8b5ae5",
  "#b95ad9", "#d94da3", "#8c6f5a", "#7d8a99",
  "#a32d31", "#b06a1f", "#7a8f1f", "#1f7a3d",
  "#1f7a7a", "#2a4fa3", "#6b2fa3", "#a32d6b",
];

// The threshold is 122, not the more obvious 150. These ITU-601 coefficients weight
// green at 0.587, where WCAG's linearised weighting is 0.7152 after gamma, so saturated
// greens and teals read as "dark" here while being perceptually light. At 150 the mid
// teals got white text at 2.4:1 - below even the 3:1 floor for UI text - and 10 of the
// 24 palette colours got the LESS legible of the two foregrounds. At 122 that is 1 of
// 24, and nothing falls under 3:1. Do not "tidy" this back to a round number.
export function contrastFg(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 122 ? "#17222b" : "#ffffff";
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
