// src/lib/cardLayout.js
// Pure. Rows -> cards of draw operations for the social graphics.
//
// Every layout decision lives here, so the canvas component only executes plain data and
// all of it is testable without a DOM. Text width comes from an injected `measure`: the
// browser passes the canvas's measureText, tests pass approxMeasure.
//
// Dates are formatted from ISO date strings in UTC, never from a kick-off - a UTC
// round-trip of a time moves it by an hour for half the year.

// League Spartan matches the owner's Canva cards exactly. Canva Sans cannot be embedded
// outside Canva, so BODY_FONT is a free stand-in the owner chose by eye.
export const DISPLAY_FONT = "League Spartan";
export const BODY_FONT = "Mulish";

// Canvas = the background's own pixel size. `region` is where text may go, clear of the
// crest (portrait: top-centre; landscape: top-left corner) and inside the results card's
// football border. Moving the crest in Canva means editing these numbers.
//
// `body` (optional) is where the rows and day sub-headings go when that differs from the
// heading region. On landscape the headings sit beside the crest, but below it the card
// is clear, so the rows are centred on the whole card - the owner's choice. No row box
// starts above `top`, so none sits beside the crest (which ends about y 345).
export const SHAPES = {
  "4x5": { w: 1080, h: 1350, region: { x: 80, y: 395, w: 920, h: 905 } },
  "4x3": {
    w: 1448, h: 1086,
    region: { x: 400, y: 115, w: 900, h: 815 },
    body: { x: 274, w: 900, top: 360 },
  },
};

// -> {x, w, top}: the horizontal band rows use, and the highest y they may start at.
export function bodyRegion(shape) {
  const { region, body } = shape;
  return body ?? { x: region.x, w: region.w, top: region.y };
}

const PALETTES = {
  fixtures: {
    heading: "#FFD21F", text: "#FFD21F", rule: "#FFD21F",
    box: "rgba(16, 36, 74, 0.78)", boxStroke: "rgba(255, 210, 31, 0.55)",
    chip: "#FFD21F", chipText: "#10244A",
  },
  results: {
    heading: "#0B4F8C", text: "#0B4F8C", rule: "#0B4F8C",
    box: "rgba(255, 255, 255, 0.88)", boxStroke: "rgba(11, 79, 140, 0.35)",
  },
};

// Full-size metrics, read off the owner's 1080-wide cards.
const M = {
  kind: 52, day: 72, date: 130, range: 100, lineGap: 1.12,
  ruleGap: 18, ruleWidth: 3, ruleLength: 680, afterHeader: 28,
  rowH: 90, rowGap: 30, rowText: 44, subdayH: 84, subday: 56,
  chipW: 130, chipH: 64, pad: 20, radius: 12,
};

// The smallest a card may scale before it splits: rows of ~26px text, still legible on a
// phone at Instagram's 1080 width.
export const FLOOR = 0.6;

// Centred heading lines stop this far short of each side of the region, so a fitted line
// never runs edge to edge.
export const INSET = 16;

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const dayName = (iso) => DAYS[asDate(iso).getUTCDay()];
const dayMonth = (iso) => `${asDate(iso).getUTCDate()} ${MONTHS[asDate(iso).getUTCMonth()]}`;

// "29–30 AUGUST" within a month; "30 AUG – 3 SEP" across one; "31 OCTOBER" for one day.
export function rangeHeading(from, to) {
  if (from === to) return dayMonth(from);
  const a = asDate(from);
  const b = asDate(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  }
  const short = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
  return `${short(a)} – ${short(b)}`;
}

export function fileName(kind, from, to, shape, part) {
  let span = from;
  if (to !== from) span += from.slice(0, 7) === to.slice(0, 7) ? `_${to.slice(8)}` : `_${to.slice(5)}`;
  const p = part ? `-${part[0]}of${part[1]}` : "";
  return `${kind}-${span}${p}-${shape}.png`;
}

// CSS font shorthand. Shared with the canvas so measuring and drawing cannot disagree.
export function fontString({ family, size, weight }) {
  return `${weight} ${size}px "${family}"`;
}

// Deterministic stand-in for measureText, for tests and for SSR.
export function approxMeasure(text, { size, weight }) {
  return String(text).length * size * (weight >= 700 ? 0.58 : 0.52);
}

const byOrder = (a, b) =>
  a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))
  || String(a.id).localeCompare(String(b.id));

function groupByDate(rows) {
  const groups = [];
  for (const r of [...rows].sort(byOrder)) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  }
  return groups;
}

// The largest size up to `size` at which widthAt(size) <= max. Scaling once by max/width
// assumes width is proportional to size, which a real font's side bearings and hinting
// break, so the result is re-measured and shrunk again until it truly fits.
function shrinkToFit(size, max, widthAt) {
  let w = widthAt(size);
  for (let i = 0; i < 12 && w > max; i += 1) {
    size *= Math.min(0.98, max / w);
    w = widthAt(size);
  }
  return size;
}

// A text line no wider than `max`, shrinking from `size` if it must.
function fitSize(text, font, max, measure) {
  return shrinkToFit(font.size, max, (size) => measure(text, { ...font, size }));
}

// The injected measure, refusing a non-finite width: NaN compares false against every
// limit, so it would otherwise pass every fit and draw text at an unchecked size.
function checked(measure) {
  return (text, font) => {
    const w = measure(text, font);
    if (!Number.isFinite(w)) {
      throw new Error(`cardLayout: measure returned ${w} for "${text}" at ${fontString(font)}`);
    }
    return w;
  };
}

function header(kind, groups, shape, part, measure, pal) {
  const { region } = shape;
  const cx = region.x + region.w / 2;
  const first = groups[0].date;
  const last = groups[groups.length - 1].date;
  const label = `${kind.toUpperCase()}${part ? ` (${part[0]}/${part[1]})` : ""}`;
  const lines = first === last
    ? [{ text: label, family: BODY_FONT, size: M.kind, weight: 400 },
       { text: dayName(first), family: BODY_FONT, size: M.day, weight: 400 },
       { text: dayMonth(first), family: DISPLAY_FONT, size: M.date, weight: 700 }]
    : [{ text: label, family: BODY_FONT, size: M.kind, weight: 400 },
       { text: rangeHeading(first, last), family: DISPLAY_FONT, size: M.range, weight: 700 }];
  const ops = [];
  let y = region.y;
  for (const line of lines) {
    const size = fitSize(line.text, line, region.w - 2 * INSET, measure);
    const h = size * M.lineGap;
    ops.push({ op: "text", x: cx, y: y + h / 2, text: line.text, family: line.family,
      size, weight: line.weight, color: pal.heading, align: "center" });
    y += h;
  }
  y += M.ruleGap;
  const half = Math.min(M.ruleLength, region.w) / 2;
  ops.push({ op: "rule", x1: cx - half, x2: cx + half, y, color: pal.rule, width: M.ruleWidth });
  return { ops, bottom: y + M.afterHeader };
}

function bodyHeight(groups, s, showDays) {
  const n = groups.reduce((k, g) => k + g.rows.length, 0);
  return s * ((showDays ? groups.length * M.subdayH : 0) + n * M.rowH + Math.max(0, n - 1) * M.rowGap);
}

function rowOps(r, y, s, area, measure, pal) {
  const ops = [];
  const h = M.rowH * s;
  const mid = y + h / 2;
  ops.push({ op: "box", x: area.x, y, w: area.w, h, r: M.radius * s,
    fill: pal.box, stroke: pal.boxStroke });
  let left = area.x + M.pad * s;
  let avail = area.w - 2 * M.pad * s;
  if (r.chip) {
    const cw = M.chipW * s;
    const ch = M.chipH * s;
    ops.push({ op: "box", x: left, y: mid - ch / 2, w: cw, h: ch, r: 8 * s, fill: pal.chip, stroke: null });
    const chipFont = { family: BODY_FONT, size: M.rowText * s, weight: 400 };
    const chipSize = fitSize(r.chip, chipFont, cw - 8 * s, measure);
    ops.push({ op: "text", x: left + cw / 2, y: mid, text: r.chip, family: BODY_FONT,
      size: chipSize, weight: 400, color: pal.chipText, align: "center" });
    left += cw + M.pad * s;
    avail -= cw + M.pad * s;
  }
  // One size for the whole row, shrunk only if THIS row is too long.
  const font = (seg, size) => ({ family: BODY_FONT, size, weight: seg.bold ? 700 : 400 });
  const widthAt = (size) => r.segments.reduce((w, seg) => w + measure(seg.text, font(seg, size)), 0);
  const size = shrinkToFit(M.rowText * s, avail, widthAt);
  const width = widthAt(size);
  // Fixtures read left-aligned after the chip; results are centred, as on the owner's cards.
  let x = r.chip ? left : left + (avail - width) / 2;
  for (const seg of r.segments) {
    const f = font(seg, size);
    ops.push({ op: "text", x, y: mid, text: seg.text, ...f, color: pal.text, align: "left" });
    x += measure(seg.text, f);
  }
  return ops;
}

// One card for these groups, or null if it cannot fit at FLOOR.
function buildCard(kind, groups, shapeName, measure, part) {
  const shape = SHAPES[shapeName];
  const pal = PALETTES[kind];
  const { region } = shape;
  const body = bodyRegion(shape);
  const showDays = groups.length > 1;
  const head = header(kind, groups, shape, part, measure, pal);
  // Only the row BOXES must clear the crest. A multi-day card opens with a short, centred
  // day sub-heading that sits right of the crest, so it may start under the rule as
  // before; at FLOOR its slot still carries the first box below body.top.
  const top = Math.max(head.bottom, body.top - (showDays ? M.subdayH * FLOOR : 0));
  const avail = region.y + region.h - top;
  const s = Math.min(1, avail / bodyHeight(groups, 1, showDays));
  if (s < FLOOR) return null;
  const ops = [{ op: "image" }, ...head.ops];
  let y = top;
  for (const g of groups) {
    if (showDays) {
      // Fitted like the header lines, so no text op relies on the metrics happening to fit.
      const day = { text: dayName(g.date), family: BODY_FONT, size: M.subday * s, weight: 400 };
      ops.push({ op: "text", x: body.x + body.w / 2, y: y + (M.subdayH * s) / 2,
        ...day, size: fitSize(day.text, day, body.w - 2 * INSET, measure),
        color: pal.heading, align: "center" });
      y += M.subdayH * s;
    }
    for (const r of g.rows) {
      ops.push(...rowOps(r, y, s, body, measure, pal));
      y += (M.rowH + M.rowGap) * s;
    }
  }
  const from = groups[0].date;
  const to = groups[groups.length - 1].date;
  return { ops, scale: s, width: shape.w, height: shape.h,
    fileName: fileName(kind, from, to, shapeName, part) };
}

// Greedy pages that each fit at FLOOR. The header is sized for a part label throughout,
// so a page that fit while measuring still fits once numbered.
function paginate(kind, groups, shapeName, measure) {
  const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r })));
  const pages = [];
  let current = [];
  for (const r of flat) {
    const trial = [...current, r];
    if (current.length && !buildCard(kind, groupByDate(trial), shapeName, measure, [99, 99])) {
      pages.push(current);
      current = [r];
    } else {
      current = trial;
    }
  }
  if (current.length) pages.push(current);
  return pages.map((p) => groupByDate(p));
}

// Greedy pages decide only HOW MANY cards; the rows are then dealt out evenly in order,
// earlier cards taking the extra row (30 -> 8,8,7,7), so the halves of one day share a
// scale instead of 8 rows shrunk beside 4 at full size. A balanced chunk is never larger
// than the greedy page it replaces, but day boundaries can still shift what fits, so any
// chunk that fails falls back to the greedy pages rather than throwing.
function balance(pages) {
  const flat = pages.flatMap((p) => p.flatMap((g) => g.rows));
  const k = pages.length;
  const base = Math.floor(flat.length / k);
  const extra = flat.length % k;
  const chunks = [];
  let at = 0;
  for (let i = 0; i < k; i += 1) {
    const n = base + (i < extra ? 1 : 0);
    chunks.push(groupByDate(flat.slice(at, at + n)));
    at += n;
  }
  return chunks;
}

function build(kind, pages, shapeName, measure) {
  const cards = pages.map((p, i) => buildCard(kind, p, shapeName, measure, [i + 1, pages.length]));
  return cards.every(Boolean) ? cards : null;
}

function cardsFor(kind, groups, shapeName, measure) {
  const whole = buildCard(kind, groups, shapeName, measure, null);
  if (whole) return [whole];
  const pages = paginate(kind, groups, shapeName, measure);
  const cards = build(kind, balance(pages), shapeName, measure) ?? build(kind, pages, shapeName, measure);
  if (!cards) throw new Error("cardLayout: a single row does not fit at the floor scale");
  return cards;
}

// -> [{ops, scale, width, height, fileName}]
export function layoutCards({ kind, rows, mode = "auto", shape, measure: raw }) {
  if (!rows?.length) return [];
  const measure = checked(raw);
  const groups = groupByDate(rows);
  if (mode === "perDay") return groups.flatMap((g) => cardsFor(kind, [g], shape, measure));
  if (mode === "single") return cardsFor(kind, groups, shape, measure);
  // auto: one card if everything fits WITHOUT shrinking; otherwise a card per day.
  const whole = buildCard(kind, groups, shape, measure, null);
  if (whole && whole.scale === 1) return [whole];
  if (groups.length === 1) return cardsFor(kind, groups, shape, measure);
  return groups.flatMap((g) => cardsFor(kind, [g], shape, measure));
}
