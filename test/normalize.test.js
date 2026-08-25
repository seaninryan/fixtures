import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { isoDate, normalize, normalizeAll, sortFixtures } from "../src/lib/normalize.js";
import { FIXTURE_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

const raw = {
  fid: "1", teamId: "235380", date: "29 Aug 2026", time: "12:00",
  homeTeam: "Craughwell United", awayTeam: "St Bernards",
  homeClubId: "2960", awayClubId: "2787",
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1", comment: "",
};

// Normalizing the golden capture is the basis of several assertions below; do it once.
const capture = normalizeAll(parse(html).fixtures);

describe("isoDate", () => {
  it("converts the feed's date format", () => {
    expect(isoDate("29 Aug 2026")).toBe("2026-08-29");
    expect(isoDate("01 Sep 2026")).toBe("2026-09-01");
    expect(isoDate("13 Jan 2027")).toBe("2027-01-13");
  });

  it("maps every month name the feed can emit", () => {
    // A single wrong entry in the month table would silently misfile a whole month
    // of fixtures, so pin all twelve rather than sampling.
    expect([
      "05 Jan 2027", "05 Feb 2027", "05 Mar 2027", "05 Apr 2027",
      "05 May 2027", "05 Jun 2027", "05 Jul 2027", "05 Aug 2027",
      "05 Sep 2027", "05 Oct 2027", "05 Nov 2027", "05 Dec 2027",
    ].map(isoDate)).toEqual([
      "2027-01-05", "2027-02-05", "2027-03-05", "2027-04-05",
      "2027-05-05", "2027-06-05", "2027-07-05", "2027-08-05",
      "2027-09-05", "2027-10-05", "2027-11-05", "2027-12-05",
    ]);
  });

  it("pads a single-digit day", () => {
    // Without the pad this yields "2026-09-1", which sorts and compares wrongly.
    expect(isoDate("1 Sep 2026")).toBe("2026-09-01");
    expect(isoDate("9 Dec 2026")).toBe("2026-12-09");
  });

  it("puts the day in the day position, not the month position", () => {
    // Guards a transposed template: a day > 12 is the only way to see the swap,
    // because "05 Jun" reads plausibly either way round.
    expect(isoDate("29 Aug 2026")).toBe("2026-08-29");
    expect(isoDate("29 Aug 2026").slice(5, 7)).toBe("08");
    expect(isoDate("29 Aug 2026").slice(8, 10)).toBe("29");
  });

  it("tolerates a longer month spelling", () => {
    expect(isoDate("29 Sept 2026")).toBe("2026-09-29");
    expect(isoDate("29 September 2026")).toBe("2026-09-29");
    expect(isoDate("13 Jan 2027")).toBe("2027-01-13");
    expect(isoDate("13 January 2027")).toBe("2027-01-13");
  });

  it("accepts the feed's spacing and casing variations", () => {
    expect(isoDate("  29 Aug 2026  ")).toBe("2026-08-29");
    expect(isoDate("29  Aug  2026")).toBe("2026-08-29");
    expect(isoDate("29 AUG 2026")).toBe("2026-08-29");
    expect(isoDate("29 aug 2026")).toBe("2026-08-29");
  });

  it("returns null rather than a wrong date", () => {
    expect(isoDate("29 Xxx 2026")).toBeNull();
    expect(isoDate("nonsense")).toBeNull();
    expect(isoDate("")).toBeNull();
    expect(isoDate("2026-08-29")).toBeNull();
    expect(isoDate("29/08/2026")).toBeNull();
    expect(isoDate("29 Aug")).toBeNull();
    expect(isoDate("Aug 29 2026")).toBeNull();
    expect(isoDate("29 Aug 26")).toBeNull();
  });

  it("returns null for a missing value instead of throwing", () => {
    expect(() => isoDate(null)).not.toThrow();
    expect(() => isoDate(undefined)).not.toThrow();
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
  });
});

describe("normalize", () => {
  it("marks a home fixture and names the opponent", () => {
    expect(normalize(raw)).toMatchObject({
      fid: "1", date: "2026-08-29", time: "12:00",
      isHome: true, opponent: "St Bernards", ourTeam: "Craughwell United",
    });
  });

  it("marks an away fixture and names the opponent", () => {
    const away = { ...raw, homeTeam: "Colga B", awayTeam: "Craughwell United",
      homeClubId: "2801", awayClubId: "2960" };
    expect(normalize(away)).toMatchObject({
      isHome: false, opponent: "Colga B", ourTeam: "Craughwell United",
    });
  });

  it("keeps the feed's time string untouched", () => {
    // A timezone round-trip would silently turn a 12:00 kick-off into 11:00.
    expect(normalize(raw).time).toBe("12:00");
  });

  it("produces exactly the Fixture shape, carrying every field through", () => {
    // Downstream tasks consume these names; a dropped or blanked passthrough field
    // (venue, competition, comment) shows up here rather than as a blank web page.
    expect(normalize({
      ...raw,
      venue: "Craughwell Astro",
      competition: "GFA Boys U14 Championship 1",
      comment: "Moved as agreed (21/8)",
    })).toEqual({
      fid: "1",
      teamId: "235380",
      date: "2026-08-29",
      time: "12:00",
      isHome: true,
      ourTeam: "Craughwell United",
      opponent: "St Bernards",
      venue: "Craughwell Astro",
      competition: "GFA Boys U14 Championship 1",
      comment: "Moved as agreed (21/8)",
    });
  });

  it("keeps teamId distinct from fid", () => {
    // teamId identifies the squad (used to group the site by team); fid identifies
    // the match. Confusing the two would silently collapse the team grouping.
    const f = normalize({ ...raw, fid: "6951014", teamId: "235380" });
    expect(f.teamId).toBe("235380");
    expect(f.fid).toBe("6951014");
    expect(f.teamId).not.toBe(f.fid);
  });

  it("carries venue, competition and comment through unaltered", () => {
    const f = normalize({
      ...raw,
      venue: "Ballinasloe Town AFC",
      competition: "GFA U21 Division 1",
      comment: "Pitch unplayable — venue TBC",
    });
    expect(f.venue).toBe("Ballinasloe Town AFC");
    expect(f.competition).toBe("GFA U21 Division 1");
    expect(f.comment).toBe("Pitch unplayable — venue TBC");
  });

  it("preserves an empty comment as an empty string", () => {
    expect(normalize(raw).comment).toBe("");
  });

  it("decides home/away on club id, not on the team name", () => {
    // Team names repeat across the feed ("Craughwell United" fields many squads),
    // so a name-based check would mislabel the away leg of a fixture.
    const away = { ...raw, homeTeam: "Craughwell United", awayTeam: "Craughwell United",
      homeClubId: "2801", awayClubId: "2960" };
    expect(normalize(away).isHome).toBe(false);
    expect(normalize({ ...away, homeClubId: "2960" }).isHome).toBe(true);
  });

  it("treats a missing home club id as away rather than throwing", () => {
    // parse() yields null when the team1 span carries no club link.
    expect(normalize({ ...raw, homeClubId: null }).isHome).toBe(false);
    expect(normalize({ ...raw, homeClubId: null }).opponent).toBe("Craughwell United");
  });

  it("reports a bad date as null instead of inventing one", () => {
    expect(normalize({ ...raw, date: "nonsense" }).date).toBeNull();
  });
});

describe("normalizeAll", () => {
  it("normalizes the whole real capture", () => {
    const { fixtures } = capture;
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
    expect(fixtures.every((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date))).toBe(true);
  });

  it("finds no errors in the real capture", () => {
    expect(capture.errors).toEqual([]);
  });

  it("fills venue, competition, ourTeam and opponent for every real fixture", () => {
    const blank = capture.fixtures.filter(
      (f) => !f.venue || !f.competition || !f.ourTeam || !f.opponent,
    );
    expect(blank).toEqual([]);
  });

  it("names one of our own sides as ourTeam throughout the real capture", () => {
    // The club fields a B team, so ourTeam is not a single constant. Both names and
    // their counts are pinned: a home/away swap would move fixtures between them.
    const counts = {};
    for (const f of capture.fixtures) counts[f.ourTeam] = (counts[f.ourTeam] ?? 0) + 1;
    expect(counts).toEqual({ "Craughwell United": 41, "Craughwell United B": 8 });
    // No derby in this capture, so no opponent is one of ours.
    expect(capture.fixtures.filter((f) => /craughwell/i.test(f.opponent))).toEqual([]);
  });

  it("splits the real capture into both home and away fixtures", () => {
    // 24 home / 25 away in the golden capture. A comparison stuck on true or false
    // still passes a "has both" check only if both counts are pinned.
    const home = capture.fixtures.filter((f) => f.isHome);
    expect(home).toHaveLength(24);
    expect(capture.fixtures.filter((f) => !f.isHome)).toHaveLength(FIXTURE_COUNT - 24);
  });

  it("keeps each real fixture's teamId, distinct from its fid", () => {
    expect(capture.fixtures.every((f) => /^\d+$/.test(f.teamId))).toBe(true);
    expect(capture.fixtures.filter((f) => f.teamId === f.fid)).toEqual([]);
    // 19 squads in the capture, so teamId must repeat across the 49 fixtures.
    expect(new Set(capture.fixtures.map((f) => f.teamId)).size).toBeLessThan(FIXTURE_COUNT);
  });

  it("keeps the admin comments the capture actually carries", () => {
    const commented = capture.fixtures.filter((f) => f.comment !== "");
    expect(commented).toHaveLength(6);
    expect(commented.map((f) => f.comment)).toContain("Moved as agreed (21/8)");
  });

  it("returns the real capture already sorted", () => {
    const keys = capture.fixtures.map((f) => `${f.date} ${f.time} ${f.fid}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("sorts fixtures it is handed out of order", () => {
    const r = (fid, date, time) => ({ ...raw, fid, date, time });
    const { fixtures } = normalizeAll([
      r("30", "05 Sep 2026", "14:00"),
      r("10", "29 Aug 2026", "12:00"),
      r("20", "29 Aug 2026", "10:00"),
    ]);
    expect(fixtures.map((f) => f.fid)).toEqual(["20", "10", "30"]);
  });

  it("drops an unparseable date into errors instead of the fixture list", () => {
    const { fixtures, errors } = normalizeAll([{ ...raw, date: "nonsense" }]);
    expect(fixtures).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("names the offending fixture and its raw date in the error", () => {
    // The email and the Action log show these strings; they have to identify which
    // fixture failed and what the feed actually said.
    const { errors } = normalizeAll([{ ...raw, fid: "6951014", date: "29 Xxx 2026" }]);
    expect(errors).toEqual(['fid 6951014: unparseable date "29 Xxx 2026"']);
  });

  it("keeps the good fixtures when one record is bad", () => {
    const { fixtures, errors } = normalizeAll([
      { ...raw, fid: "10", date: "05 Sep 2026" },
      { ...raw, fid: "11", date: "nonsense" },
      { ...raw, fid: "12", date: "29 Aug 2026" },
    ]);
    expect(fixtures.map((f) => f.fid)).toEqual(["12", "10"]);
    expect(errors).toEqual(['fid 11: unparseable date "nonsense"']);
  });

  it("returns empty results for empty input", () => {
    expect(normalizeAll([])).toEqual({ fixtures: [], errors: [] });
  });
});

describe("sortFixtures", () => {
  it("orders by date, then kick-off, then id so snapshots are stable", () => {
    const f = (fid, date, time) => ({ fid, date, time });
    const sorted = sortFixtures([
      f("3", "2026-08-30", "14:00"), f("1", "2026-08-29", "12:00"),
      f("2", "2026-08-29", "10:00"),
    ]);
    expect(sorted.map((x) => x.fid)).toEqual(["2", "1", "3"]);
  });

  it("orders by date before kick-off", () => {
    // An earlier kick-off on a later date must still sort last, so the date
    // comparator has to run first.
    const f = (fid, date, time) => ({ fid, date, time });
    const sorted = sortFixtures([
      f("1", "2026-09-05", "10:00"), f("2", "2026-08-29", "14:00"),
    ]);
    expect(sorted.map((x) => x.fid)).toEqual(["2", "1"]);
  });

  it("breaks a same-date same-time tie on fid", () => {
    // The capture has ten date+time collisions (whole age groups kick off together),
    // so without this tiebreak the snapshot reshuffles on feed reordering alone.
    const f = (fid) => ({ fid, date: "2026-08-29", time: "12:00" });
    const sorted = sortFixtures([f("6951300"), f("6951014"), f("6946083")]);
    expect(sorted.map((x) => x.fid)).toEqual(["6946083", "6951014", "6951300"]);
  });

  it("is deterministic regardless of input order", () => {
    const f = (fid) => ({ fid, date: "2026-08-29", time: "12:00" });
    const forwards = sortFixtures([f("a"), f("b"), f("c")]).map((x) => x.fid);
    const backwards = sortFixtures([f("c"), f("b"), f("a")]).map((x) => x.fid);
    expect(forwards).toEqual(["a", "b", "c"]);
    expect(backwards).toEqual(forwards);
  });

  it("does not mutate the array it is given", () => {
    const f = (fid, date, time) => ({ fid, date, time });
    const input = [f("2", "2026-08-30", "14:00"), f("1", "2026-08-29", "12:00")];
    const sorted = sortFixtures(input);
    expect(input.map((x) => x.fid)).toEqual(["2", "1"]);
    expect(sorted.map((x) => x.fid)).toEqual(["1", "2"]);
    expect(sorted).not.toBe(input);
  });

  it("sorts the real capture into ascending date order", () => {
    const dates = capture.fixtures.map((f) => f.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe("2026-08-29");
    expect(dates[dates.length - 1]).toBe("2027-01-13");
  });

  it("rejects a day that does not exist in that month", () => {
    // Was "2026-08-32" before hardening, which reached the alert email as
    // "undefined NaN undefined 12:00" instead of being reported as a bad date.
    expect(isoDate("32 Aug 2026")).toBeNull();
    expect(isoDate("00 Aug 2026")).toBeNull();
    expect(isoDate("31 Sep 2026")).toBeNull();
    // V8 rolls these into March rather than calling them invalid, so a plain
    // Number.isNaN check would let both through.
    expect(isoDate("30 Feb 2026")).toBeNull();
    expect(isoDate("29 Feb 2026")).toBeNull();   // 2026 is not a leap year
    expect(isoDate("29 Feb 2024")).toBe("2024-02-29"); // ...but 2024 is
  });

  it("accepts a long month name in any casing", () => {
    expect(isoDate("29 SEPTEMBER 2026")).toBe("2026-09-29");
    expect(isoDate("29 September 2026")).toBe("2026-09-29");
    expect(isoDate("29 AUG 2026")).toBe("2026-08-29");
  });

  it("deliberately tolerates a nonsense suffix after a valid month prefix", () => {
    // Documented laxity, not an accident: the feed only ever emits three-letter months,
    // and tightening this would reject "Sept" which it plausibly could emit.
    expect(isoDate("29 Augxyz 2026")).toBe("2026-08-29");
  });
});
