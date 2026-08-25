// Pure. Colour per squad. Shape follows fancystats' teamColors.js: configured value
// wins, otherwise a STABLE fallback so a squad is never colourless and never changes
// colour between runs.

// Spread around the wheel so neighbouring age groups do not look alike. Sized with
// headroom over the current squad count - the club added three squads in a single day,
// and a squad with no distinct colour is the failure this list exists to prevent.
export const PALETTE = [
  "#e5484d", "#e5794d", "#e5a94d", "#d9c53c",
  "#a3c93f", "#3fb950", "#3fb98a", "#3fb9b9",
  "#3f93d9", "#1f6feb", "#5a5ae5", "#8b5ae5",
  "#b95ad9", "#d94da3", "#8c6f5a", "#7d8a99",
  "#a32d31", "#b06a1f", "#7a8f1f", "#1f7a3d",
  "#1f7a7a", "#2a4fa3", "#6b2fa3", "#a32d6b",
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
