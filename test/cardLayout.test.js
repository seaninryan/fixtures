// test/cardLayout.test.js
import { describe, it, expect } from "vitest";
import {
  layoutCards, approxMeasure, SHAPES, FLOOR, INSET, rangeHeading, fileName,
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

// The bounds a text op occupies, by its alignment, under the measure that laid it out.
function span(o, measure = approxMeasure) {
  const w = measure(o.text, o);
  return o.align === "center" ? [o.x - w / 2, o.x + w / 2] : [o.x, o.x + w];
}

// Width is NOT proportional to size here, as with a real font's fixed side bearings, so a
// fit that scales once by max/width and never re-measures overflows.
const nonProportional = (t, f) => String(t).length * (0.55 * f.size + 1.5);
// Wide enough that the header's date and range lines must shrink too.
const wideNonProportional = (t, f) => String(t).length * (0.75 * f.size + 4);

// Every op inside the canvas, every row inside the text region.
function expectInBounds(cards, shapeName, measure = approxMeasure) {
  const { w, h, region } = SHAPES[shapeName];
  const right = region.x + region.w + 0.001;
  const bottom = region.y + region.h + 0.001;
  for (const card of cards) {
    for (const o of card.ops) {
      if (o.op === "box") {
        expect(o.x).toBeGreaterThanOrEqual(region.x);
        expect(o.y).toBeGreaterThanOrEqual(region.y);
        expect(o.x + o.w).toBeLessThanOrEqual(right);
        expect(o.y + o.h).toBeLessThanOrEqual(bottom);
      }
      if (o.op === "text") {
        const [a, b] = span(o, measure);
        expect(a).toBeGreaterThanOrEqual(region.x - 0.001);
        expect(b).toBeLessThanOrEqual(right);
        expect(o.y).toBeGreaterThanOrEqual(region.y);
        expect(o.y).toBeLessThanOrEqual(bottom);
        expect(o.y).toBeLessThanOrEqual(h);
      }
      if (o.op === "rule") {
        expect(o.x1).toBeGreaterThanOrEqual(region.x);
        expect(o.x2).toBeLessThanOrEqual(right);
        expect(o.y).toBeGreaterThanOrEqual(region.y);
        expect(o.y).toBeLessThanOrEqual(bottom);
      }
    }
    expect(card.width).toBe(w);
    expect(card.height).toBe(h);
  }
}

const SALTHILL = {
  segments: [{ text: "Junior Men's Reserves", bold: true }, { text: " @ Salthill Devon Athletic Football Club Reserves", bold: false }],
};

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

  it("a range of one day reads as that day", () => {
    expect(rangeHeading("2026-10-31", "2026-10-31")).toBe("31 OCTOBER");
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

  const chipCount = (c) => texts(c).filter((t) => /^\d\d:\d\d$/.test(t)).length;

  it("balances a split: 12 rows become two cards of 6 at the same scale", () => {
    const cards = lay({ rows: rows(12, "2026-11-01") });
    expect(cards.map(chipCount)).toEqual([6, 6]);
    expect(cards[0].scale).toBe(cards[1].scale);
  });

  it("balances a split in order, earlier cards taking the extra row", () => {
    expect(lay({ rows: rows(30, "2026-11-01") }).map(chipCount)).toEqual([8, 8, 7, 7]);
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
        expectInBounds(lay({ shape, rows: rows(n, "2026-11-01") }), shape);
      });

      it(`${shape}, ${n} results rows (no chip): inside the text region`, () => {
        const results = rows(n, "2026-11-01").map((r) => ({ ...r, time: "", chip: null }));
        expectInBounds(lay({ kind: "results", shape, rows: results }), shape);
      });
    }

    // 7,1,7,1 splits into pages that are already balanced; 1,1,4,7 on 4x3 is a case where
    // the balanced chunks move a day boundary and no longer fit, so it takes the greedy
    // fallback.
    for (const pattern of [[7, 1, 7, 1], [1, 1, 4, 7]]) {
      it(`${shape}: single mode over days of ${pattern} rows stays in bounds, every row once, in order`, () => {
        const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
        const all = [];
        pattern.forEach((n, d) => {
          for (let i = 0; i < n; i += 1) {
            const k = all.length;
            all.push(row(k, days[d], { id: String(k).padStart(2, "0"), time: "10:00", chip: "10:00",
              segments: [{ text: `R${k}`, bold: true }, { text: " v Knocknacarra", bold: false }] }));
          }
        });
        const cards = lay({ shape, mode: "single", rows: [...all].reverse() });
        expect(cards.length).toBeGreaterThan(1);
        expectInBounds(cards, shape);
        const seen = cards.flatMap((c) => texts(c).filter((t) => /^R\d+$/.test(t)));
        expect(seen).toEqual(all.map((r) => r.segments[0].text));
      });
    }

    for (const [name, measure] of [["non-proportional", nonProportional], ["wide non-proportional", wideNonProportional]]) {
      it(`${shape}, ${name} measure: the long Salthill row still fits`, () => {
        const long = row(1, "2026-11-01", SALTHILL);
        expectInBounds(lay({ shape, measure, rows: [long, row(2, "2026-11-01")] }), shape, measure);
        const results = [{ ...long, chip: null, time: "" }, { ...row(2, "2026-11-01"), chip: null, time: "" }];
        expectInBounds(lay({ shape, measure, kind: "results", rows: results }), shape, measure);
      });

      it(`${shape}, ${name} measure: long headings fit inside the inset`, () => {
        const sets = [
          [row(1, "2026-09-30")], // WEDNESDAY / 30 SEPTEMBER
          [row(1, "2026-09-30"), row(2, "2026-10-03")], // a cross-month range, sub-headings
          rows(30, "2026-09-30"), // FIXTURES (n/m)
        ];
        for (const rs of sets) {
          for (const mode of ["auto", "single"]) {
            const cards = lay({ shape, measure, mode, rows: rs });
            expectInBounds(cards, shape, measure);
            const { region } = SHAPES[shape];
            for (const o of cards.flatMap((c) => c.ops)) {
              if (o.op !== "text" || o.align !== "center" || o.color === "#10244A") continue;
              const [a, b] = span(o, measure);
              expect(a).toBeGreaterThanOrEqual(region.x + INSET - 0.001);
              expect(b).toBeLessThanOrEqual(region.x + region.w - INSET + 0.001);
            }
          }
        }
      });
    }
  }

  it("a measure that returns NaN is an error, not a blank card", () => {
    expect(() => lay({ measure: () => NaN })).toThrow(/cardLayout: measure returned NaN for/);
  });
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
