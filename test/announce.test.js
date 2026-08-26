import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { seedConfig } from "../src/lib/teams.js";
import { windowPredicate, WINDOWS } from "../src/lib/window.js";
import {
  announce, announceLines, formatFixtureLine, CLUB_TITLE, HOME_VENUE,
} from "../src/lib/announce.js";

const config = { teams: {
  "235380": { label: "U14A Boys", color: "#1f6feb" },
  "254061": { label: "U14B Boys", color: "#3fb950" },
  "238155": { label: "U14 Girls", color: "#e5484d" },
} };

const f = (over = {}) => ({
  fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: HOME_VENUE, competition: "GFA Boys U14 Championship 1", comment: "",
  ...over,
});

describe("formatFixtureLine", () => {
  const labels = { "235380": "U14A Boys" };

  it("writes a home game with v", () => {
    expect(formatFixtureLine(f(), labels, {}))
      .toBe("12:00  U14A Boys v St Bernards");
  });

  it("writes an away game with @", () => {
    expect(formatFixtureLine(f({ isHome: false, opponent: "Cregmore/Claregalway C", venue: "Cregmore" }), labels, {}))
      .toBe("12:00  U14A Boys @ Cregmore/Claregalway C");
  });

  it("keeps the opposition's own suffix, so parents know which side they face", () => {
    expect(formatFixtureLine(f({ opponent: "Colga B" }), labels, {}))
      .toContain("v Colga B");
  });

  it("names the ground only when a home game is not at the home ground", () => {
    expect(formatFixtureLine(f({ venue: "Colemanstown" }), labels, {}))
      .toBe("12:00  U14A Boys v St Bernards (at Colemanstown)");
  });

  // Hardening. Kills a mutant that drops the `?? fixture.ourTeam` fallback: a squad the
  // caller has no label for must still read as the club's own side, never as a blank gap
  // between the kick-off and the "v".
  it("falls back to the feed's own team name for a teamId the label map does not carry", () => {
    expect(formatFixtureLine(f({ teamId: "379931", ourTeam: "Craughwell United" }), labels, {}))
      .toBe("12:00  Craughwell United v St Bernards");
  });

  // Hardening for D: an away game at a named ground stays bare. The away side's ground
  // is the opponent's, and printing it invites a parent to drive to the WRONG pitch when
  // the opposition plays at a neutral one.
  it("never names the ground for an away game, however unusual the venue", () => {
    expect(formatFixtureLine(f({ isHome: false, opponent: "Cois Fharraige", venue: "Ros A Mhil" }), labels, {}))
      .not.toContain("(at ");
  });

  // Hardening for E: the home ground is the default and saying it is noise.
  it("never names the ground when a home game is at the home ground", () => {
    expect(formatFixtureLine(f({ venue: HOME_VENUE }), labels, {})).not.toContain("(at ");
  });

  it("leaves the ground unnamed when the feed gave no venue at all", () => {
    expect(formatFixtureLine(f({ venue: "" }), labels, {}))
      .toBe("12:00  U14A Boys v St Bernards");
  });

  it("shows a suffixed feed name unchanged when the squad has no label", () => {
    expect(formatFixtureLine(f({ teamId: "254061", ourTeam: "Craughwell United B" }), labels, {}))
      .toBe("12:00  Craughwell United B v St Bernards");
  });

  it("defaults to no colour square", () => {
    expect(formatFixtureLine(f(), labels, config)).toBe("12:00  U14A Boys v St Bernards");
  });
});

describe("announce", () => {
  const fixtures = [
    f({ fid: "1", date: "2026-08-29", time: "12:00" }),
    f({ fid: "2", date: "2026-08-29", time: "12:00", teamId: "254061",
        isHome: false, opponent: "Cregmore/Claregalway C", venue: "Cregmore" }),
    f({ fid: "3", date: "2026-08-30", time: "12:00", teamId: "238155",
        isHome: false, opponent: "Colga B", venue: "Clarinbridge" }),
    f({ fid: "9", date: "2026-12-01", time: "20:15" }),
  ];

  it("renders the house format, grouped by day", () => {
    expect(announce(fixtures, config, "This weekend", "2026-08-25")).toBe(
`CRAUGHWELL UNITED
Fri 28 Aug - Sun 30 Aug

SATURDAY 29 AUGUST
12:00  U14A Boys v St Bernards
12:00  U14B Boys @ Cregmore/Claregalway C

SUNDAY 30 AUGUST
12:00  U14 Girls @ Colga B`);
  });

  it("honours the window", () => {
    expect(announce(fixtures, config, "This weekend", "2026-08-25")).not.toContain("DECEMBER");
    expect(announce(fixtures, config, "All", "2026-08-25")).toContain("DECEMBER");
  });

  it("orders by kick-off within a day", () => {
    const out = announce(
      [f({ fid: "a", time: "14:00" }), f({ fid: "b", time: "10:00" })],
      config, "All", "2026-08-25",
    );
    expect(out.indexOf("10:00")).toBeLessThan(out.indexOf("14:00"));
  });

  it("says so plainly when the window is empty, instead of printing a bare header", () => {
    expect(announce([], config, "This weekend", "2026-08-25"))
      .toContain("No fixtures");
  });

  it("keeps the A/B letter when only one of the two squads plays this window", () => {
    const bOnly = [f({ fid: "2", teamId: "254061", ourTeam: "Craughwell United B",
      competition: "GFA Boys U14 Division 4" })];
    const all = [...bOnly, f({ fid: "1", teamId: "235380", date: "2026-12-01",
      competition: "GFA Boys U14 Championship 1" })];
    expect(announce(all, {}, "This weekend", "2026-08-25")).toContain("U14B Boys");
  });

  // The competition here is the REAL one squad 379931 plays in, and it is load-bearing:
  // a label is derived from the competition string, not from the config, so a fixture
  // still carrying the default "GFA Boys U14 Championship 1" derives "U14 Boys" happily
  // and never reaches the fallback this test is named for. Only a competition with no
  // age-and-gender pair in it - the women's and U21 sides - leaves the squad unlabelled.
  it("shows the raw feed name for a squad you have not labelled yet", () => {
    expect(announce(
      [f({ teamId: "379931", ourTeam: "Craughwell United", competition: "GFA Women's Championship" })],
      config, "All", "2026-08-25",
    )).toContain("Craughwell United v St Bernards");
  });

  // Hardening for F, from the other side: the demotion the windowed count would cause is
  // asserted as ABSENT, not merely the correct label as present. This is the bug that
  // renames a squad in a message sent to every parent in the club.
  it("does not demote U14B to U14 when the A side has no game this weekend", () => {
    const all = [
      f({ fid: "2", teamId: "254061", ourTeam: "Craughwell United B",
          competition: "GFA Boys U14 Division 4", date: "2026-08-29" }),
      f({ fid: "1", teamId: "235380", ourTeam: "Craughwell United",
          competition: "GFA Boys U14 Championship 1", date: "2026-12-01" }),
    ];
    const out = announce(all, {}, "This weekend", "2026-08-25");
    expect(out).toContain("U14B Boys v St Bernards");
    expect(out).not.toContain("U14 Boys v");
  });

  // Hardening for C at the level the secretary actually copies from. A home game moved
  // to another ground is the one case that strands a family at an empty pitch, and it has
  // to survive the whole render, not just the line formatter.
  it("carries the alternate ground through into the announcement itself", () => {
    const out = announce(
      [f({ fid: "a", venue: "Colemanstown" }), f({ fid: "b", time: "14:00", venue: HOME_VENUE })],
      config, "This weekend", "2026-08-25",
    );
    expect(out).toContain("12:00  U14A Boys v St Bernards (at Colemanstown)");
    expect(out).toMatch(/^14:00 {2}U14A Boys v St Bernards$/m);
  });

  // Hardening for J: a sort that ignores the date reorders the days themselves. The two
  // fixtures deliberately run counter to each other - the later DAY has the earlier
  // kick-off - so time-only sorting puts Sunday above Saturday.
  it("orders days by date even when the later day kicks off earlier", () => {
    const out = announce(
      [f({ fid: "a", date: "2026-08-30", time: "10:00" }),
       f({ fid: "b", date: "2026-08-29", time: "14:00" })],
      config, "All", "2026-08-25",
    );
    expect(out.indexOf("SATURDAY 29 AUGUST")).toBeLessThan(out.indexOf("SUNDAY 30 AUGUST"));
    expect(out.indexOf("14:00")).toBeLessThan(out.indexOf("10:00"));
  });

  // Hardening for H: one heading per DAY, not one per fixture.
  it("prints a day heading once however many games that day holds", () => {
    const out = announce(
      [f({ fid: "a", time: "10:00" }), f({ fid: "b", time: "12:00" }), f({ fid: "c", time: "14:00" })],
      config, "All", "2026-08-25",
    );
    expect(out.split("SATURDAY 29 AUGUST")).toHaveLength(2);
  });

  // Hardening for I: one weekday name is not enough - an off-by-one in the array is only
  // visible when several days are checked at once.
  it("names each weekday correctly across a whole week", () => {
    const week = [
      ["2026-08-29", "SATURDAY 29 AUGUST"], ["2026-08-30", "SUNDAY 30 AUGUST"],
      ["2026-08-31", "MONDAY 31 AUGUST"], ["2026-09-01", "TUESDAY 1 SEPTEMBER"],
      ["2026-09-02", "WEDNESDAY 2 SEPTEMBER"], ["2026-09-03", "THURSDAY 3 SEPTEMBER"],
      ["2026-09-04", "FRIDAY 4 SEPTEMBER"],
    ];
    const out = announce(week.map(([date], i) => f({ fid: `w${i}`, date })), config, "All", "2026-08-29");
    for (const [, heading] of week) expect(out).toContain(heading);
  });

  // Hardening for M: from and to are different dates and both must be printed.
  it("dates the header range from the window's own start and end", () => {
    const out = announce(fixtures, config, "Next 7 days", "2026-08-25");
    expect(out.split("\n")[1]).toBe("Tue 25 Aug - Mon 31 Aug");
  });

  it("titles the club and says plainly when the window is unbounded", () => {
    const out = announce(fixtures, config, "All", "2026-08-25");
    expect(out.split("\n")[0]).toBe(CLUB_TITLE);
    expect(out.split("\n")[1]).toBe("All upcoming fixtures");
  });

  // Hardening for K: the empty case must still be a message a secretary can paste, i.e.
  // still carry the club title and the dates it is talking about.
  it("keeps the title and the date range on an empty window", () => {
    const out = announce([], config, "This weekend", "2026-08-25");
    expect(out).toBe("CRAUGHWELL UNITED\nFri 28 Aug - Sun 30 Aug\n\nNo fixtures in this window.");
  });

  it("treats a missing fixture list as an empty one rather than throwing", () => {
    expect(announce(undefined, config, "This weekend", "2026-08-25")).toContain("No fixtures");
  });

  // window.js's contract, restated where the caller actually lives: a malformed `today`
  // is loud for the bounded windows and silent for All. Pinned so it cannot regress into
  // an announcement dated "Invalid Date".
  it("propagates window.js's RangeError for a malformed today on a bounded window", () => {
    expect(() => announce(fixtures, config, "This weekend", "not-a-date")).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// The real capture, end to end. Everything above is hand-built; this is the feed.
// ---------------------------------------------------------------------------
const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
const { fixtures: real } = normalizeAll(parse(html).fixtures);
const realConfig = seedConfig(real, {});
// Chosen from the data, not invented: the day the capture's earliest fixture is played.
const TODAY = real[0].date;

const DAY_HEADING = /^[A-Z]+ \d{1,2} [A-Z]+$/;
const FIXTURE_LINE = /^\d{2}:\d{2} {2}\S/;

describe("announce over the golden capture", () => {
  for (const name of WINDOWS) {
    it(`renders "${name}" with one heading per day and one line per fixture`, () => {
      const expected = real.filter(windowPredicate(name, TODAY));
      const days = new Set(expected.map((x) => x.date));
      const out = announce(real, realConfig, name, TODAY);
      const lines = out.split("\n");

      expect(out.trim()).not.toBe("");
      expect(expected.length).toBeGreaterThan(0);
      expect(lines.filter((l) => DAY_HEADING.test(l))).toHaveLength(days.size);
      expect(lines.filter((l) => FIXTURE_LINE.test(l))).toHaveLength(expected.length);
      expect(out).not.toContain("No fixtures");
    });
  }

  it("covers every fixture in the capture when the window is All", () => {
    const out = announce(real, realConfig, "All", TODAY);
    expect(out.split("\n").filter((l) => FIXTURE_LINE.test(l))).toHaveLength(real.length);
    for (const x of real) expect(out).toContain(x.opponent);
  });

  // The two squads whose competition carries no age-and-gender pair. resolveTeams
  // qualifies the shared "Craughwell United" fallback with the competition, and that
  // qualified name is what parents actually read.
  it("renders the unlabelled squads under a disambiguated name, not a bare duplicate", () => {
    const out = announce(real, realConfig, "All", TODAY);
    expect(out).toContain("Craughwell United (GFA U21 Division 1) v Galway Hibs");
    expect(out).toContain("Craughwell United (GFA Women's Championship) @ Oughterard");
    // The bare name would collide: the U21 men and the women would read identically.
    expect(out).not.toMatch(/^\d{2}:\d{2} {2}Craughwell United [v@]/m);
  });

  // The U21 side plays Wednesday nights. A weekend-only announcement must not carry them,
  // and the 7-day one must file them under the right weekday.
  it("files a midweek kick-off under its own weekday, and keeps it out of the weekend", () => {
    const sunday = "2026-09-06";
    const week = announce(real, realConfig, "Next 7 days", sunday);
    expect(week).toContain("WEDNESDAY 9 SEPTEMBER");
    expect(week).toContain("19:45  Craughwell United (GFA U21 Division 1) @ Colemanstown Utd");

    const weekend = announce(real, realConfig, "This weekend", sunday);
    expect(weekend).not.toContain("WEDNESDAY");
    expect(weekend).not.toContain("19:45");
  });

  it("names the right month for a fixture on the first of one", () => {
    const out = announce(real, realConfig, "Next 7 days", "2026-08-31");
    expect(out).toContain("TUESDAY 1 SEPTEMBER");
    // Anchored: "MONDAY 31 AUGUST" contains "1 AUGUST" as a substring, and a bare
    // toContain here would pass on a broken month lookup.
    expect(out).not.toMatch(/^\w+ 1 AUGUST$/m);
  });

  it("is deterministic and leaves the caller's fixture list untouched", () => {
    const before = JSON.stringify(real);
    const once = announce(real, realConfig, "Next 14 days", TODAY);
    const twice = announce(real, realConfig, "Next 14 days", TODAY);
    expect(once).toBe(twice);
    expect(JSON.stringify(real)).toBe(before);
  });

  it("orders two fixtures at the same kick-off by fid, whatever order it is given them", () => {
    // Total order, independent of the caller. Reversing the input must not reorder output.
    const a = f({ fid: "111", teamId: "254061", opponent: "Athenry" });
    const b = f({ fid: "222", teamId: "238155", opponent: "Colga B" });
    const forwards = announce([a, b], config, "All", "2026-08-25");
    const backwards = announce([b, a], config, "All", "2026-08-25");
    expect(forwards).toBe(backwards);
    expect(forwards.indexOf("Athenry")).toBeLessThan(forwards.indexOf("Colga B"));
  });
});

// --- the line model behind the site's colour swatches ---

describe("announceLines", () => {
  const fx = (over = {}) => ({
    fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "St Bernards", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "", ...over,
  });
  const cfg = { version: 1, teams: { 235380: { label: "U14A Boys", color: "#1f6feb" } } };

  // THE ANTI-DRIFT GUARANTEE. The site renders the lines and copies the joined text; the
  // email quotes announce(). If these two ever disagree, what a member is told and what
  // was copied to them differ, which is the one thing this module exists to prevent.
  it("joins to exactly what announce returns", () => {
    for (const win of ["This weekend", "Next 7 days", "Next 14 days", "All"]) {
      const lines = announceLines([fx(), fx({ fid: "2", date: "2026-09-05" })], cfg, win, "2026-08-25");
      expect(lines.map((l) => l.text).join("\n"))
        .toBe(announce([fx(), fx({ fid: "2", date: "2026-09-05" })], cfg, win, "2026-08-25"));
    }
  });

  it("carries the squad's colour on a fixture line, for the site to show beside it", () => {
    const lines = announceLines([fx()], cfg, "This weekend", "2026-08-25");
    const fixtures = lines.filter((l) => l.kind === "fixture");
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].teamId).toBe("235380");
    expect(fixtures[0].color).toBe("#1f6feb");
  });

  it("gives a colour to nothing but fixture lines", () => {
    const lines = announceLines([fx()], cfg, "This weekend", "2026-08-25");
    for (const line of lines.filter((l) => l.kind !== "fixture")) {
      expect(line.color).toBeUndefined();
      expect(line.teamId).toBeUndefined();
    }
  });

  it("labels the club title, the date range and each day heading", () => {
    const lines = announceLines([fx()], cfg, "This weekend", "2026-08-25");
    expect(lines[0]).toMatchObject({ kind: "title", text: "CRAUGHWELL UNITED" });
    expect(lines[1].kind).toBe("subtitle");
    expect(lines.find((l) => l.kind === "day").text).toBe("SATURDAY 29 AUGUST");
  });

  it("keeps the blank line before a day heading as its own line", () => {
    const lines = announceLines([fx()], cfg, "This weekend", "2026-08-25");
    const day = lines.findIndex((l) => l.kind === "day");
    expect(lines[day - 1]).toMatchObject({ kind: "blank", text: "" });
  });

  it("still says so when the window is empty", () => {
    const lines = announceLines([], cfg, "This weekend", "2026-08-25");
    expect(lines.map((l) => l.text).join("\n")).toContain("No fixtures in this window.");
    expect(lines.some((l) => l.kind === "fixture")).toBe(false);
  });

  it("never carries an emoji: the colour is the site's job, not the text's", () => {
    const lines = announceLines([fx()], cfg, "All", "2026-08-25");
    expect(lines.map((l) => l.text).join("\n")).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// The announcement is pasted into WhatsApp and into the club's Facebook page, and a
// leading space is not free there: some clients treat an indented line as preformatted,
// and it is fiddly to strip by hand on a phone. Every line therefore starts hard left.
// The two-space gap BETWEEN the time and the squad is not indentation and stays.
describe("indentation", () => {
  const fx = (over = {}) => ({
    fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "St Bernards", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "", ...over,
  });
  const cfg = { version: 1, teams: { 235380: { label: "U14A Boys" } } };

  it("starts no line with whitespace, in any window", () => {
    for (const win of ["This weekend", "Next 7 days", "Next 14 days", "All"]) {
      const out = announce([fx(), fx({ fid: "2", date: "2026-09-05" })], cfg, win, "2026-08-25");
      for (const line of out.split("\n")) expect(line).not.toMatch(/^\s+\S/);
    }
  });

  it("starts no line with whitespace over the golden capture either", () => {
    const out = announce(real, realConfig, "All", real[0].date);
    for (const line of out.split("\n")) expect(line).not.toMatch(/^\s+\S/);
  });

  it("keeps the gap between the kick-off and the squad", () => {
    expect(announce([fx()], cfg, "All", "2026-08-25")).toContain("12:00  U14A Boys");
  });
});
