import { describe, it, expect } from "vitest";
import {
  squadRecords, defaultSelection, weekAxis, weekSeries, FORM_WINDOWS,
} from "../src/lib/form.js";

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

// 2026-08-31, 09-07, 09-14, 09-21, 09-28 and 10-05 are consecutive Mondays.
describe("weekAxis", () => {
  const on = (date) => result({ fid: date, date });

  it("offers exactly the two windows", () => {
    expect(FORM_WINDOWS).toEqual(["Last 5 weeks", "Full season"]);
  });

  it("runs from the first result's week to the current week for the full season", () => {
    const axis = weekAxis([on("2026-08-31"), on("2026-09-16")], "Full season", "2026-09-21");
    expect(axis).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("takes the current week and the four before it for the short window", () => {
    const axis = weekAxis([on("2026-08-03")], "Last 5 weeks", "2026-09-28");
    expect(axis).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  // Never pad to fill five: an axis of empty weeks implies a season that has not
  // happened yet.
  it("shows only the weeks that exist when there are fewer than five", () => {
    const axis = weekAxis([on("2026-09-14")], "Last 5 weeks", "2026-09-21");
    expect(axis).toEqual(["2026-09-14", "2026-09-21"]);
  });

  it("is empty when nothing has been played", () => {
    expect(weekAxis([], "Full season", "2026-09-21")).toEqual([]);
  });
});

describe("weekSeries", () => {
  const opts = (over = {}) => ({
    mode: "cumulative", windowName: "Full season", teamIds: ["11"], today: "2026-09-21", ...over,
  });
  const win = (date, fid) => result({ fid, date, ourScore: 2, theirScore: 0 });
  const loss = (date, fid) => result({ fid, date, ourScore: 0, theirScore: 2 });

  it("returns one series per selected squad, and only those", () => {
    const series = weekSeries(
      [win("2026-09-07", "a"), win("2026-09-07", "b")],
      [fixture(), fixture({ fid: "f2", teamId: "22" })], config,
      opts({ teamIds: ["11", "22"] }),
    );
    expect(series.map((s) => s.teamId)).toEqual(["11", "22"]);
  });

  it("accumulates points across weeks in cumulative mode", () => {
    const series = weekSeries(
      [win("2026-08-31", "a"), win("2026-09-14", "b")],
      [fixture()], config, opts(),
    );
    expect(series[0].values).toEqual([3, 3, 6, 6]);
  });

  it("reports the points earned that week in weekly mode", () => {
    const series = weekSeries(
      [win("2026-08-31", "a"), win("2026-09-14", "b")],
      [fixture()], config, opts({ mode: "weekly" }),
    );
    expect(series[0].values).toEqual([3, 0, 3, 0]);
  });

  // A squad playing twice in one week can take more than 3. Both games fall in the week
  // commencing 2026-09-07, and the axis runs to the week of `today`.
  it("adds up two games in the same week", () => {
    const series = weekSeries(
      [win("2026-09-07", "a"), win("2026-09-09", "b")],
      [fixture()], config, opts({ mode: "weekly" }),
    );
    expect(series[0].values).toEqual([6, 0, 0]);
  });

  it("holds flat on a blank week in cumulative mode and shows zero in weekly", () => {
    const results = [win("2026-08-31", "a"), loss("2026-09-14", "b")];
    expect(weekSeries(results, [fixture()], config, opts())[0].values)
      .toEqual([3, 3, 3, 3]);
    expect(weekSeries(results, [fixture()], config, opts({ mode: "weekly" }))[0].values)
      .toEqual([3, 0, 0, 0]);
  });

  // Cumulative means SEASON total. Restarting at zero because the window opened later
  // would understate every squad and make the two windows disagree.
  it("carries points earned before the window into cumulative mode", () => {
    const series = weekSeries(
      [win("2026-08-03", "a"), win("2026-09-21", "b")],
      [fixture()], config, opts({ windowName: "Last 5 weeks" }),
    );
    expect(series[0].values.at(0)).toBe(3);
    expect(series[0].values.at(-1)).toBe(6);
  });

  it("does not carry earlier points into weekly mode", () => {
    const series = weekSeries(
      [win("2026-08-03", "a"), win("2026-09-21", "b")],
      [fixture()], config, opts({ mode: "weekly", windowName: "Last 5 weeks" }),
    );
    expect(series[0].values.at(0)).toBe(0);
    expect(series[0].values.at(-1)).toBe(3);
  });

  it("gives a selected squad with no results a flat zero line", () => {
    const series = weekSeries([win("2026-09-07", "a")], [fixture(), fixture({ fid: "f2", teamId: "22" })],
      config, opts({ teamIds: ["22"] }));
    expect(series[0].values.every((v) => v === 0)).toBe(true);
  });

  it("carries a visible stroke colour and a dash pattern", () => {
    const dark = { version: 1, teams: { "11": { label: "U14A Boys", color: "#080080" } } };
    const [s] = weekSeries([win("2026-09-07", "a")], [fixture()], dark, opts());
    expect(s.color).not.toBe("#080080"); // lifted to be visible on the card
    expect(typeof s.dash).toBe("string");
  });

  // Colour follows the squad, not its position in the selection: dropping one squad must
  // not repaint the others.
  it("gives a squad the same colour and dash whatever else is selected", () => {
    const results = [win("2026-09-07", "a"), win("2026-09-07", "b")];
    const fixtures = [fixture(), fixture({ fid: "f2", teamId: "22" })];
    const alone = weekSeries(results, fixtures, config, opts({ teamIds: ["22"] }))[0];
    const together = weekSeries(results, fixtures, config, opts({ teamIds: ["11", "22"] }))
      .find((s) => s.teamId === "22");
    expect(together.color).toBe(alone.color);
    expect(together.dash).toBe(alone.dash);
  });

  it("keeps the A/B letter even when one squad is selected", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "f1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({ fid: "f2", teamId: "B1", ourTeam: "Craughwell United B" });
    const [s] = weekSeries([result({ teamId: "A1", date: "2026-09-07" })], [aSide, bSide], bare,
      opts({ teamIds: ["A1"] }));
    expect(s.label).toBe("U14A Boys");
  });

  it("is empty when nothing has been played", () => {
    expect(weekSeries([], [fixture()], config, opts())).toEqual([]);
  });
});
