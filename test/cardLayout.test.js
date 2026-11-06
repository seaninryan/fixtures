// test/cardLayout.test.js
import { describe, it, expect } from "vitest";
import {
  layoutCards, approxMeasure, SHAPES, FLOOR, rangeHeading, fileName,
} from "../src/lib/cardLayout.js";

const row = (i, date = "2026-11-01", over = {}) => ({
  id: String(i), date, time: `1${i % 10}:00`, chip: `1${i % 10}:00`,
  segments: [{ text: `U1${i % 10} Boys`, bold: true }, { text: " v Knocknacarra", bold: false }],
  ...over,
});
const rows = (n, date) => Array.from({ length: n }, (_, i) => row(i, date));
const lay = (over) => layoutCards({ kind: "fixtures", rows: rows(2, "2026-10-31"), mode: "auto",
  shape: "4x5", measure: approxMeasure, ...over });
const texts = (card) => card.ops.filter((o) => o.op === "text").map((o) => o.text);

// The bounds a text op occupies, by its alignment.
function span(o) {
  const w = approxMeasure(o.text, o);
  return o.align === "center" ? [o.x - w / 2, o.x + w / 2] : [o.x, o.x + w];
}

describe("headings", () => {
  it("a single day reads FIXTURES / SATURDAY / 31 OCTOBER", () => {
    const [card] = lay();
    expect(texts(card).slice(0, 3)).toEqual(["FIXTURES", "SATURDAY", "31 OCTOBER"]);
  });

  it("results say RESULTS", () => {
    expect(texts(lay({ kind: "results" })[0])[0]).toBe("RESULTS");
  });

  it("same-month range", () => {
    expect(rangeHeading("2026-08-29", "2026-08-30")).toBe("29–30 AUGUST");
  });

  it("cross-month range", () => {
    expect(rangeHeading("2026-08-30", "2026-09-03")).toBe("30 AUG – 3 SEP");
  });

  it("several days get the range and a sub-heading per day", () => {
    const [card] = lay({ rows: [row(1, "2026-08-29"), row(2, "2026-08-30")] });
    const t = texts(card);
    expect(t.slice(0, 2)).toEqual(["FIXTURES", "29–30 AUGUST"]);
    expect(t).toContain("SATURDAY");
    expect(t).toContain("SUNDAY");
  });
});

describe("grouping", () => {
  const twoDays = [...rows(2, "2026-10-31"), ...rows(2, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];

  it("auto: one card when everything fits at full size", () => {
    expect(lay({ rows: twoDays })).toHaveLength(1);
  });

  it("auto: a card per day when one card would have to shrink", () => {
    const busy = [...rows(6, "2026-10-31"), ...rows(6, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];
    expect(lay({ rows: busy })).toHaveLength(2);
  });

  it("perDay forces a card per day", () => {
    expect(lay({ rows: twoDays, mode: "perDay" })).toHaveLength(2);
  });

  it("single forces one card", () => {
    // 3+3 would shrink, so auto would split it; single must not.
    const busy = [...rows(3, "2026-10-31"), ...rows(3, "2026-11-01").map((r) => ({ ...r, id: `b${r.id}` }))];
    expect(lay({ rows: busy })).toHaveLength(2);
    expect(lay({ rows: busy, mode: "single" })).toHaveLength(1);
  });

  it("no rows, no cards", () => {
    expect(lay({ rows: [] })).toEqual([]);
  });

  it("orders rows by date, time, id whatever order they arrive in", () => {
    const [card] = lay({ rows: [row(2, "2026-10-31"), row(1, "2026-10-31")] });
    const chips = texts(card).filter((t) => /^\d\d:\d\d$/.test(t));
    expect(chips).toEqual(["11:00", "12:00"]);
  });
});

describe("fitting", () => {
  it("full size when it fits", () => {
    expect(lay()[0].scale).toBe(1);
  });

  it("shrinks a busy day instead of splitting it", () => {
    const [card, ...rest] = lay({ rows: rows(8, "2026-11-01") });
    expect(rest).toEqual([]);
    expect(card.scale).toBeLessThan(1);
    expect(card.scale).toBeGreaterThanOrEqual(FLOOR);
  });

  it("splits a day that cannot fit at the floor, numbering the parts", () => {
    const cards = lay({ rows: rows(30, "2026-11-01") });
    expect(cards.length).toBeGreaterThan(1);
    expect(texts(cards[0])[0]).toBe(`FIXTURES (1/${cards.length})`);
    const total = cards.reduce((n, c) => n + texts(c).filter((t) => /^\d\d:\d\d$/.test(t)).length, 0);
    expect(total).toBe(30);
  });

  it("shrinks one long row without shrinking its neighbours", () => {
    const long = row(1, "2026-11-01", {
      segments: [{ text: "Junior Men's Reserves", bold: true }, { text: " @ Salthill Devon Athletic Football Club Reserves", bold: false }],
    });
    const [card] = lay({ rows: [long, row(2, "2026-11-01")] });
    const sizes = card.ops.filter((o) => o.op === "text" && o.weight === 700 && /Boys|Reserves/.test(o.text)).map((o) => o.size);
    expect(sizes[0]).toBeLessThan(sizes[1]);
  });

  for (const shape of Object.keys(SHAPES)) {
    for (const n of [1, 6, 12, 30]) {
      it(`${shape}, ${n} rows: every op inside the canvas, every row inside the text region`, () => {
        const { w, h, region } = SHAPES[shape];
        for (const card of lay({ shape, rows: rows(n, "2026-11-01") })) {
          for (const o of card.ops) {
            if (o.op === "box") {
              expect(o.x).toBeGreaterThanOrEqual(region.x);
              expect(o.x + o.w).toBeLessThanOrEqual(region.x + region.w + 0.001);
              expect(o.y + o.h).toBeLessThanOrEqual(region.y + region.h + 0.001);
            }
            if (o.op === "text") {
              const [a, b] = span(o);
              expect(a).toBeGreaterThanOrEqual(region.x - 0.001);
              expect(b).toBeLessThanOrEqual(region.x + region.w + 0.001);
              expect(o.y).toBeLessThanOrEqual(h);
            }
          }
          expect(card.width).toBe(w);
          expect(card.height).toBe(h);
        }
      });
    }
  }
});

describe("file names", () => {
  it("single day", () => {
    expect(fileName("fixtures", "2026-10-31", "2026-10-31", "4x5", null))
      .toBe("fixtures-2026-10-31-4x5.png");
  });

  it("same-month range", () => {
    expect(fileName("results", "2026-08-29", "2026-08-30", "4x3", null))
      .toBe("results-2026-08-29_30-4x3.png");
  });

  it("cross-month range", () => {
    expect(fileName("fixtures", "2026-08-30", "2026-09-03", "4x5", null))
      .toBe("fixtures-2026-08-30_09-03-4x5.png");
  });

  it("split part", () => {
    expect(fileName("fixtures", "2026-11-01", "2026-11-01", "4x5", [1, 2]))
      .toBe("fixtures-2026-11-01-1of2-4x5.png");
  });

  it("every card carries its file name", () => {
    expect(lay()[0].fileName).toBe("fixtures-2026-10-31-4x5.png");
  });
});
