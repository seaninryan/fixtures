import { describe, it, expect } from "vitest";
import { squadRecords, defaultSelection } from "../src/lib/form.js";

const config = {
  version: 1,
  teams: {
    "11": { label: "U14A Boys", color: "#d9c53c" },
    "22": { label: "U14B Boys", color: "#b95ad9" },
    "33": { label: "U16 Boys", color: "#e5a94d" },
  },
};

const fixture = (over = {}) => ({
  fid: "f1", teamId: "11", date: "2026-09-12", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "", ...over,
});

const result = (over = {}) => ({
  fid: "r1", teamId: "11", date: "2026-09-05", isHome: true,
  ourTeam: "Craughwell United", opponent: "X",
  ourScore: 1, theirScore: 0, venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", ...over,
});

const find = (rows, teamId) => rows.find((r) => r.teamId === teamId);

describe("squadRecords", () => {
  it("scores a win, a draw and a loss", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 2, theirScore: 1 }),
      result({ fid: "b", ourScore: 1, theirScore: 1 }),
      result({ fid: "c", ourScore: 0, theirScore: 3 }),
    ], [fixture()], config);
    const row = find(rows, "11");
    expect(row.played).toBe(3);
    expect(row.won).toBe(1);
    expect(row.drawn).toBe(1);
    expect(row.lost).toBe(1);
    expect(row.points).toBe(4); // 3 + 1 + 0
  });

  // Number("") is 0 and a 0-0 is a real draw. Scoring it as a loss would be silent.
  it("treats 0-0 as a draw worth one point", () => {
    const rows = squadRecords([result({ ourScore: 0, theirScore: 0 })], [fixture()], config);
    expect(find(rows, "11").drawn).toBe(1);
    expect(find(rows, "11").points).toBe(1);
  });

  it("sums goals for and against, and gives a negative goal difference", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 1, theirScore: 3 }),
      result({ fid: "b", ourScore: 0, theirScore: 2 }),
    ], [fixture()], config);
    const row = find(rows, "11");
    expect(row.goalsFor).toBe(1);
    expect(row.goalsAgainst).toBe(5);
    expect(row.goalDifference).toBe(-4);
  });

  it("computes points per game", () => {
    const rows = squadRecords([
      result({ fid: "a", ourScore: 2, theirScore: 1 }),
      result({ fid: "b", ourScore: 0, theirScore: 1 }),
    ], [fixture()], config);
    expect(find(rows, "11").pointsPerGame).toBeCloseTo(1.5);
  });

  // A squad that has yet to kick a ball must never render as 0.00, which reads as
  // "lost everything". Nine of eighteen live squads are in this state.
  it("reports pointsPerGame as null for a squad that has not played", () => {
    const rows = squadRecords([], [fixture({ teamId: "33" })], config);
    const row = find(rows, "33");
    expect(row.played).toBe(0);
    expect(row.pointsPerGame).toBe(null);
    expect(row.points).toBe(0);
  });

  it("includes every squad in the fixture list, even with no results", () => {
    const rows = squadRecords([result()], [fixture(), fixture({ fid: "f2", teamId: "22" })], config);
    expect(rows.map((r) => r.teamId).sort()).toEqual(["11", "22"]);
  });

  // A squad whose season has ended has left the fixture list while its results stay in
  // the store forever - and it is exactly the squad a "how was their season" view needs.
  it("includes a retired squad, present in the results but not the fixtures", () => {
    const rows = squadRecords([result({ teamId: "33" })], [fixture()], config);
    expect(find(rows, "33")).toBeTruthy();
    expect(find(rows, "33").label).toBe("U16 Boys");
  });

  it("takes the competition from the fixtures, and from the last result when retired", () => {
    const rows = squadRecords(
      [result({ teamId: "33", competition: "GFA U16 Boys Division 1" })],
      [fixture()],
      config,
    );
    expect(find(rows, "11").competition).toBe("GFA Boys U14 Championship 1");
    expect(find(rows, "33").competition).toBe("GFA U16 Boys Division 1");
  });

  it("falls back to the feed name when nothing names the squad", () => {
    const bare = { version: 1, teams: {} };
    const rows = squadRecords([], [fixture({ teamId: "77", competition: "GFA Cup" })], bare);
    expect(find(rows, "77").label).toBe("Craughwell United");
  });

  // THE INVARIANT. deriveLabels shows the A/B letter only when the club runs more than
  // one side at that age and gender, so labels resolved over anything less than the full
  // fixture list silently rename a squad.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "f1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({ fid: "f2", teamId: "B1", ourTeam: "Craughwell United B" });
    const rows = squadRecords([result({ teamId: "A1" })], [aSide, bSide], bare);
    expect(find(rows, "A1").label).toBe("U14A Boys");
  });

  it("orders alphabetically by label, not by points", () => {
    const rows = squadRecords([
      result({ fid: "a", teamId: "33", ourScore: 9, theirScore: 0 }),
      result({ fid: "b", teamId: "11", ourScore: 0, theirScore: 9 }),
    ], [fixture(), fixture({ fid: "f3", teamId: "33" })], config);
    expect(rows.map((r) => r.label)).toEqual(["U14A Boys", "U16 Boys"]);
  });

  it("treats a missing store or fixture list as empty rather than throwing", () => {
    expect(squadRecords(null, null, config)).toEqual([]);
    expect(squadRecords(undefined, [fixture()], config)).toHaveLength(1);
  });
});

describe("defaultSelection", () => {
  const rows = [
    { teamId: "11", label: "U14A Boys", played: 3 },
    { teamId: "22", label: "U14B Boys", played: 1 },
    { teamId: "33", label: "U16 Boys", played: 2 },
    { teamId: "44", label: "U18 Boys", played: 0 },
  ];

  it("picks the three squads with the most results", () => {
    expect(defaultSelection(rows)).toEqual(["11", "33", "22"]);
  });

  it("never picks a squad that has not played", () => {
    expect(defaultSelection([{ teamId: "44", label: "U18 Boys", played: 0 }])).toEqual([]);
  });

  it("breaks ties by label, so the default is deterministic", () => {
    const tied = [
      { teamId: "99", label: "U17 Boys", played: 2 },
      { teamId: "88", label: "U12A Boys", played: 2 },
    ];
    expect(defaultSelection(tied)).toEqual(["88", "99"]);
  });
});
