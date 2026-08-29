import { describe, it, expect } from "vitest";
import { mergeResults, RESULTS_VERSION, formatResultLine, roundup, roundupLines } from "../src/lib/results.js";

const result = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-08-29", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards",
  ourScore: 1, theirScore: 0,
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1",
  ...over,
});

describe("mergeResults", () => {
  it("creates the store on a first run", () => {
    const out = mergeResults(null, [result()], "2026-08-29T12:00:00.000Z");
    expect(out.version).toBe(RESULTS_VERSION);
    expect(out.updatedAt).toBe("2026-08-29T12:00:00.000Z");
    expect(out.results).toHaveLength(1);
  });

  it("adds a result it has not seen", () => {
    const prev = { version: 1, results: [result({ fid: "1" })] };
    const out = mergeResults(prev, [result({ fid: "2", date: "2026-09-05" })], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "2"]);
  });

  it("NEVER removes a stored result that is absent from the feed", () => {
    // The single most important behaviour here. Results age out of the feed within a
    // day or two, so an absent result means the feed moved on - never that the game
    // was unplayed. This is the results counterpart of "a failed fetch must never
    // look like a cancellation".
    const prev = { version: 1, results: [result({ fid: "1" }), result({ fid: "2" })] };
    const out = mergeResults(prev, [], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "2"]);
  });

  it("updates a score the league has corrected", () => {
    const prev = { version: 1, results: [result({ fid: "1", ourScore: 1, theirScore: 0 })] };
    const out = mergeResults(prev, [result({ fid: "1", ourScore: 2, theirScore: 0 })], "now");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].ourScore).toBe(2);
  });

  it("keeps a stable order so the committed diff stays small", () => {
    const prev = { version: 1, results: [result({ fid: "9", date: "2026-09-05" })] };
    const out = mergeResults(prev, [result({ fid: "1", date: "2026-08-29" })], "now");
    expect(out.results.map((r) => r.fid)).toEqual(["1", "9"]);
  });

  it("survives a corrupted store rather than throwing", () => {
    const out = mergeResults({ version: 1, results: "nope" }, [result()], "now");
    expect(out.results).toHaveLength(1);
  });

  it("tolerates a null incoming list", () => {
    const prev = { version: 1, results: [result({ fid: "1" })] };
    expect(mergeResults(prev, null, "now").results).toHaveLength(1);
  });
});

const config = {
  version: 1,
  teams: {
    "11": { label: "U14A Boys", color: "#d9c53c" },
    "22": { label: "U14B Boys", color: "#4d9ae5" },
  },
};

const home = result({ fid: "1", teamId: "11", isHome: true, ourScore: 1, theirScore: 0, opponent: "St Bernards" });
const away = result({
  fid: "2", teamId: "22", isHome: false, ourScore: 3, theirScore: 4,
  ourTeam: "Craughwell United B", opponent: "Cregmore/Claregalway C",
});

describe("formatResultLine", () => {
  it("writes the home game with our label first", () => {
    expect(formatResultLine(home, { 11: "U14A Boys" }))
      .toBe("U14A Boys 1-0 St Bernards");
  });

  it("writes the away game with the opponent first", () => {
    expect(formatResultLine(away, { 22: "U14B Boys" }))
      .toBe("Cregmore/Claregalway C 4-3 U14B Boys");
  });

  it("falls back to the team name when a squad has no label", () => {
    expect(formatResultLine(away, {})).toBe("Cregmore/Claregalway C 4-3 Craughwell United B");
  });

  it("renders a nil-all draw", () => {
    expect(formatResultLine(result({ teamId: "11", ourScore: 0, theirScore: 0 }), { 11: "U14A Boys" }))
      .toBe("U14A Boys 0-0 St Bernards");
  });
});

// A real fixture list for the two squads under test. roundup resolves labels over
// FIXTURES, so callers must supply them - see the comment in results.js.
const squadFixtures = [
  { fid: "90", teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "" },
  { fid: "91", teamId: "22", date: "2026-09-05", time: "14:00", isHome: true,
    ourTeam: "Craughwell United B", opponent: "Y", venue: "Craughwell",
    competition: "GFA Boys U14 Division 4", comment: "" },
];

describe("roundup", () => {
  it("matches the agreed format exactly", () => {
    expect(roundup([home, away], config, "Last weekend", "2026-08-31", squadFixtures)).toBe(
      "SATURDAY 29 AUGUST\n\nU14A Boys 1-0 St Bernards\nCregmore/Claregalway C 4-3 U14B Boys",
    );
  });

  it("puts the newest day first", () => {
    const later = result({ fid: "3", teamId: "11", date: "2026-08-30" });
    const text = roundup([home, later], config, "Last weekend", "2026-08-31", squadFixtures);
    expect(text.indexOf("SUNDAY 30 AUGUST")).toBeLessThan(text.indexOf("SATURDAY 29 AUGUST"));
  });

  it("never indents a result line", () => {
    for (const line of roundup([home, away], config, "All", "2026-08-31", squadFixtures).split("\n")) {
      expect(line).toBe(line.trimStart());
    }
  });

  it("says so when the window is empty", () => {
    expect(roundup([], config, "Last weekend", "2026-08-31")).toMatch(/No results/);
  });

  it("excludes results outside the window", () => {
    const old = result({ fid: "4", teamId: "11", date: "2026-07-01" });
    expect(roundup([old], config, "Last weekend", "2026-08-31")).toMatch(/No results/);
  });
});

describe("roundupLines label resolution", () => {
  // A squad's season ends before the club's does. Its results stay in the store forever
  // while it leaves the fixture list, and resolveTeams only ever builds entries for
  // squads in that list - so this is the one case where config must be consulted
  // directly. The spec calls it out; it was missing until the final review found it.
  const retired = result({
    fid: "77", teamId: "99", date: "2026-08-29", isHome: true,
    ourTeam: "Craughwell United U16", opponent: "Some Team",
    ourScore: 2, theirScore: 1, competition: "GFA Boys U16 Division 1",
  });
  const otherSquadsFixtures = [{
    fid: "90", teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "",
  }];

  it("keeps a configured label for a squad whose season has ended", () => {
    const cfg = { version: 1, teams: { "99": { label: "U16A Boys", color: "#3fb950" } } };
    const text = roundup([retired], cfg, "All", "2026-08-31", otherSquadsFixtures);
    expect(text).toContain("U16A Boys 2-1 Some Team");
    expect(text).not.toContain("Craughwell United U16");
  });

  it("shows a retired squad's raw feed name when nothing configured it", () => {
    // Derivation cannot help a squad that has left the fixture list, and inventing a
    // label is the guess this codebase refuses to make. Visibly unfinished is correct.
    const text = roundup([retired], {}, "All", "2026-08-31", otherSquadsFixtures);
    expect(text).toContain("Craughwell United U16 2-1 Some Team");
  });

  it("does not let the config fallback override a live squad's resolved label", () => {
    // The fill must only patch GAPS. A squad still in the fixture list keeps whatever
    // resolveTeams decided, including its collision handling.
    const cfg = { version: 1, teams: { "11": { label: "U14A Boys", color: "#d9c53c" } } };
    const text = roundup([home], cfg, "All", "2026-08-31", otherSquadsFixtures);
    expect(text).toContain("U14A Boys 1-0 St Bernards");
  });

  it("does not derive labels from the results when fixtures are omitted", () => {
    // Guards the default. If `fixtures` ever defaults to `results`, an UNCONFIGURED
    // squad gets a label derived by counting only the squads that happened to play -
    // "U14 Boys" on a weekend when only the A side did. Falling back to the raw feed
    // name is the correct failure: visibly unfinished beats silently mislabelled.
    const text = roundup([home], {}, "All", "2026-08-31").trim();
    expect(text).toContain("Craughwell United 1-0 St Bernards");
    expect(text).not.toContain("U14 Boys");
  });

  it("keeps the A/B letter when only one of two same-age squads played", () => {
    // The bug that has appeared three times: deriveLabels decides whether to show the
    // A/B letter by counting the club's squads at that age and gender. Resolving over
    // the RESULTS alone would count one U14 side and rename "U14A Boys" to "U14 Boys".
    const fixtures = [
      { fid: "90", teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
        ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
        competition: "GFA Boys U14 Championship 1", comment: "" },
      { fid: "91", teamId: "22", date: "2026-09-05", time: "14:00", isHome: true,
        ourTeam: "Craughwell United B", opponent: "Y", venue: "Craughwell",
        competition: "GFA Boys U14 Division 4", comment: "" },
    ];
    const lines = roundupLines([home], {}, "All", "2026-08-31", fixtures);
    const text = lines.map((l) => l.text).join("\n");
    expect(text).toContain("U14A Boys");
    expect(text).not.toContain("U14 Boys 1-0");
  });
});
