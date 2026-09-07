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

// The chart's card surface. Must match --card in styles.css; there is no way for a pure
// module to read a CSS variable, so this is the one duplicated value and it is named
// loudly for that reason.
export const CHART_SURFACE = "#182029";

// 3:1, the WCAG floor for non-text graphics. A line below it is not a subtle line, it is
// an absent one.
const STROKE_CONTRAST = 3;
const MIX_STEPS = 21;
const HEX6 = /^#[0-9a-f]{6}$/i;

// WCAG relative luminance. NOTE this is deliberately NOT the ITU-601 approximation used
// by contrastFg above: that one is tuned for picking a foreground over a filled chip and
// its green weighting makes teals read as light. For "can I see this line at all" the
// linearised WCAG maths is the honest measure.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// Toward white in sRGB. This desaturates as it lightens, which is why the tests assert
// the hue still dominates rather than assert an exact hex.
function towardWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * t);
  const out = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// A squad's colour, made visible as a LINE on the chart surface. Same hue, lightened
// only as far as it takes to clear 3:1 - so a colour that already passes is returned
// byte-identical, which is what makes this idempotent and what keeps the chart's colours
// recognisably the squad's own.
//
// Chips are NOT affected. squadColor stays the identity everywhere else; this is the
// stroke counterpart of contrastFg.
export function strokeOn(hex, surface = CHART_SURFACE) {
  if (!HEX6.test(hex ?? "")) return "#ffffff";
  for (let step = 0; step < MIX_STEPS; step++) {
    const candidate = towardWhite(hex, step / (MIX_STEPS - 1));
    if (contrast(candidate, surface) >= STROKE_CONTRAST) return candidate;
  }
  return "#ffffff";
}

// Secondary encoding, because colour alone cannot separate many lines - and the owner
// chose not to cap how many may be selected. Keyed off teamId via the same hash as the
// colour fallback, so it follows the SQUAD and never its position in the selection:
// deselecting one squad must not restyle the others.
//
// "" is solid. Cycling is acceptable here where it would not be for hue, because this is
// a secondary channel and a collision costs a little clarity rather than an identity.
export const SQUAD_DASHES = ["", "6 3", "1 3", "9 3 2 3", "4 2 1 2"];

export function squadDash(teamId) {
  return SQUAD_DASHES[hashIndex(teamId, SQUAD_DASHES.length)];
}
