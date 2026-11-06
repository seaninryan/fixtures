import { describe, it, expect } from "vitest";
import { cardSections } from "../src/lib/cardSections.js";

const r = (id, date, time = "12:00") => ({ id, date, time });

describe("cardSections", () => {
  const all = [r("1", "2026-11-07"), r("2", "2026-11-07", "14:00"), r("3", "2026-11-08"), r("4", "2026-11-09")];
  const cards = [
    { fileName: "a", from: "2026-11-07", to: "2026-11-07", rowIds: ["1"] },
    { fileName: "b", from: "2026-11-08", to: "2026-11-08", rowIds: ["3"] },
  ];

  it("lists each card's rows and slots a left-off row into the card covering its date", () => {
    const { sections } = cardSections(cards, all, ["2", "4"]);
    expect(sections.map((s) => s.rows.map((x) => [x.row.id, x.leftOff]))).toEqual([
      [["1", false], ["2", true]],
      [["3", false]],
    ]);
  });

  it("puts a left-off row no card covers in orphans", () => {
    expect(cardSections(cards, all, ["2", "4"]).orphans.map((x) => x.id)).toEqual(["4"]);
  });

  it("a split day's left-off rows go under its first part", () => {
    const split = [
      { fileName: "p1", from: "2026-11-07", to: "2026-11-07", rowIds: ["1"] },
      { fileName: "p2", from: "2026-11-07", to: "2026-11-07", rowIds: ["2"] },
    ];
    const extra = [...all, r("5", "2026-11-07", "16:00")];
    const { sections } = cardSections(split, extra, ["5"]);
    expect(sections[0].rows.map((x) => x.row.id)).toEqual(["1", "5"]);
    expect(sections[1].rows.map((x) => x.row.id)).toEqual(["2"]);
  });

  it("orders a section by date, time, id", () => {
    const one = [{ fileName: "w", from: "2026-11-07", to: "2026-11-08", rowIds: ["3", "1"] }];
    const { sections } = cardSections(one, all, ["2"]);
    expect(sections[0].rows.map((x) => x.row.id)).toEqual(["1", "2", "3"]);
  });

  it("no cards: everything left off is an orphan", () => {
    expect(cardSections([], all, ["1"]).orphans.map((x) => x.id)).toEqual(["1"]);
  });
});
