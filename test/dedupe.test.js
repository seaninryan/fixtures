import { describe, it, expect } from "vitest";
import { dupeKey, dropGalwayDuplicates } from "../src/lib/dedupe.js";

// The real pair from fixtures-data on 2026-11-13. Galway FA filed the adult Juniors'
// FAI Junior Cup tie under the U21 team id; FAI Connect has it under the right squad.
const galway = {
  fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
  competition: "FAI Junior Cup", comment: "",
};
const fai = {
  fid: "fai:56104529", teamId: "fai:61270", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United Juniors", opponent: "Mervue United FC Jun A", venue: "Craughwell",
  competition: "FAI Junior Cup 2026/27 - Galway", comment: "",
};

describe("dupeKey", () => {
  it("gives both spellings of Mervue the same key", () => {
    expect(dupeKey("Mervue Utd")).toBe("mervue united");
    expect(dupeKey("Mervue United FC Jun A")).toBe("mervue united");
  });

  it("drops FC, AFC, junior words, punctuation and case", () => {
    expect(dupeKey("St. Bernards AFC")).toBe("st bernards");
    expect(dupeKey("Salthill Devon FC A")).toBe("salthill devon");
    expect(dupeKey("Renmore Juniors")).toBe("renmore");
  });

  it("strips a COMET season code the way the display does", () => {
    expect(dupeKey("Merlin Woods Reserve 2425")).toBe("merlin woods reserve");
  });

  it("keys a missing opponent as empty", () => {
    expect(dupeKey(undefined)).toBe("");
  });
});

describe("dropGalwayDuplicates", () => {
  it("hides the Galway copy of the real Mervue cup tie", () => {
    const out = dropGalwayDuplicates([galway], [fai]);
    expect(out.hidden).toEqual([galway]);
    expect(out.kept).toEqual([]);
  });

  it.each([
    ["a different time", { time: "15:00" }],
    ["a different date", { date: "2026-11-15" }],
    ["the other side's ground", { isHome: false }],
    ["a different opponent", { opponent: "Moyne Villa" }],
  ])("keeps a Galway fixture with %s", (_, change) => {
    const out = dropGalwayDuplicates([{ ...galway, ...change }], [fai]);
    expect(out.kept).toHaveLength(1);
    expect(out.hidden).toEqual([]);
  });

  // One FAI game is one game. Two Galway rows matching it are not both the same game,
  // so only one may disappear.
  it("lets each FAI entry hide at most one Galway entry", () => {
    const twin = { ...galway, fid: "7035326" };
    const out = dropGalwayDuplicates([galway, twin], [fai]);
    expect(out.hidden).toEqual([galway]);
    expect(out.kept).toEqual([twin]);
  });

  // Results carry no time.
  it("ignores time when withTime is false", () => {
    const { time: _g, ...g } = galway;
    const { time: _f, ...f } = fai;
    expect(dropGalwayDuplicates([g], [f], { withTime: false }).hidden).toEqual([g]);
  });

  // A result has no time, and the key drops team letters and "Jun" - so a double-header
  // against two sides of one club on one day shares a key. The score tells them apart:
  // the same game has the same score, a double-header almost never does.
  describe("withScore", () => {
    const { time: _g, ...g0 } = galway;
    const { time: _f, ...f0 } = fai;
    const g = { ...g0, opponent: "Mervue Utd B", ourScore: 3, theirScore: 1 };
    const f = { ...f0, ourScore: 0, theirScore: 2 };

    it("keeps a same-day result against the same club with a different score", () => {
      const out = dropGalwayDuplicates([g], [f], { withTime: false, withScore: true });
      expect(out.kept).toEqual([g]);
    });

    it("hides a result with the same score", () => {
      const same = { ...g, ourScore: 0, theirScore: 2 };
      expect(dropGalwayDuplicates([same], [f], { withTime: false, withScore: true }).hidden)
        .toEqual([same]);
    });

    it("never matches a result with no score", () => {
      const a = { ...g, ourScore: undefined, theirScore: undefined };
      const b = { ...f, ourScore: undefined, theirScore: undefined };
      expect(dropGalwayDuplicates([a], [b], { withTime: false, withScore: true }).kept)
        .toEqual([a]);
    });
  });

  it("keeps an entry with no opponent or no date rather than matching it", () => {
    const noOpp = { ...galway, opponent: "" };
    const noDate = { ...galway, date: undefined };
    const out = dropGalwayDuplicates([noOpp, noDate], [{ ...fai, opponent: "" }, { ...fai, date: undefined }]);
    expect(out.kept).toEqual([noOpp, noDate]);
  });

  it("keeps Galway order and copes with missing lists", () => {
    const a = { ...galway, fid: "1", time: "10:00" };
    const b = { ...galway, fid: "2", time: "11:00" };
    expect(dropGalwayDuplicates([a, b], undefined).kept).toEqual([a, b]);
    expect(dropGalwayDuplicates(undefined, [fai])).toEqual({ kept: [], hidden: [] });
  });
});
