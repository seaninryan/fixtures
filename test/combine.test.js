import { describe, it, expect } from "vitest";
import { combine } from "../src/lib/combine.js";

const g = {
  fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
  competition: "FAI Junior Cup", comment: "",
};
const f = {
  fid: "fai:56104529", teamId: "fai:61270", date: "2026-11-14", time: "14:00", isHome: true,
  ourTeam: "Craughwell United Juniors", opponent: "Mervue United FC Jun A", venue: "Craughwell",
  competition: "FAI Junior Cup 2026/27 - Galway", comment: "",
};
const other = { ...g, fid: "6958003", teamId: "284049", opponent: "Loughrea", time: "09:30" };
const score = (x) => {
  const { time: _t, comment: _c, ...rest } = x;
  return { ...rest, ourScore: 2, theirScore: 1 };
};

describe("combine", () => {
  it("hides the Galway duplicate from fixtures and lists it in hidden", () => {
    const out = combine({ snapshot: { fixtures: [g, other] }, faiSnapshot: { fixtures: [f] } });
    expect(out.fixtures.map((x) => x.fid)).toEqual(["6958003", "fai:56104529"]);
    expect(out.hidden).toEqual([g]);
  });

  // Squads and Changes describe the feeds themselves, and labels resolve over ALL
  // fixtures - so the undeduped list must still be available.
  it("keeps every fixture in allFixtures", () => {
    const out = combine({ snapshot: { fixtures: [g, other] }, faiSnapshot: { fixtures: [f] } });
    expect(out.allFixtures).toEqual([g, other, f]);
  });

  it("hides a Galway awaiting entry that FAI also has, upcoming or awaiting", () => {
    const out = combine({ snapshot: { fixtures: [], awaiting: [g] }, faiSnapshot: { awaiting: [f] } });
    expect(out.awaiting).toEqual([f]);
  });

  it("hides a Galway result that FAI also has, ignoring time", () => {
    const out = combine({
      snapshot: { fixtures: [] },
      results: { results: [score(g), score(other)] },
      faiResults: { results: [score(f)] },
    });
    expect(out.results.results.map((x) => x.fid)).toEqual(["6958003", "fai:56104529"]);
  });

  it("keeps a Galway result against the same club on the same day with another score", () => {
    const youth = { ...score(g), fid: "7000001", opponent: "Mervue Utd B", ourScore: 5, theirScore: 0 };
    const out = combine({
      snapshot: { fixtures: [] },
      results: { results: [youth] },
      faiResults: { results: [score(f)] },
    });
    expect(out.results.results.map((x) => x.fid)).toEqual(["7000001", "fai:56104529"]);
  });

  it("keeps results null only when both stores failed", () => {
    expect(combine({ snapshot: { fixtures: [] }, results: null, faiResults: null }).results).toBeNull();
    expect(combine({ snapshot: { fixtures: [] }, results: null, faiResults: { results: [] } }).results)
      .toEqual({ results: [] });
  });

  it("works with no FAI snapshot at all", () => {
    const out = combine({ snapshot: { fixtures: [g] } });
    expect(out.fixtures).toEqual([g]);
    expect(out.hidden).toEqual([]);
  });
});
