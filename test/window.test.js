import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  WINDOWS,
  windowRange,
  windowPredicate,
  RESULT_WINDOWS,
  resultWindowRange,
  resultWindowPredicate,
  weekStart,
  addDays,
  seasonStart,
  seasonPredicate,
} from "../src/lib/window.js";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { FIXTURE_COUNT } from "./fixtures/meta.js";

// 2026-08-25 is a Tuesday. 08-28 Fri, 08-29 Sat, 08-30 Sun.

// Independent day-of-week and day-arithmetic helpers for the invariant loops below.
// Deliberately NOT imported from the module under test: a test that reuses the
// implementation's own arithmetic cannot detect that the arithmetic is wrong.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const plus = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

describe("windowRange", () => {
  it("offers exactly the four named windows", () => {
    expect(WINDOWS).toEqual(["This weekend", "Next 7 days", "Next 14 days", "All"]);
  });

  it("finds the coming Friday-to-Sunday from midweek", () => {
    expect(windowRange("This weekend", "2026-08-25"))
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
  });

  it("uses the current weekend when asked on a Saturday", () => {
    expect(windowRange("This weekend", "2026-08-29"))
      .toEqual({ from: "2026-08-29", to: "2026-08-30" });
  });

  it("uses today only when asked on a Sunday", () => {
    expect(windowRange("This weekend", "2026-08-30"))
      .toEqual({ from: "2026-08-30", to: "2026-08-30" });
  });

  it("starts a Friday weekend on that Friday", () => {
    expect(windowRange("This weekend", "2026-08-28"))
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
  });

  // The baseline covered Tue/Fri/Sat/Sun. Mon/Wed/Thu are the days a midweek U21
  // announcement is most likely to be sent, so pin every remaining weekday too.
  it("finds the same coming weekend from Monday, Wednesday and Thursday", () => {
    expect(windowRange("This weekend", "2026-08-24")) // Monday
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
    expect(windowRange("This weekend", "2026-08-26")) // Wednesday
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
    expect(windowRange("This weekend", "2026-08-27")) // Thursday
      .toEqual({ from: "2026-08-28", to: "2026-08-30" });
  });

  it("counts N days inclusive of today", () => {
    expect(windowRange("Next 7 days", "2026-08-25"))
      .toEqual({ from: "2026-08-25", to: "2026-08-31" });
    expect(windowRange("Next 14 days", "2026-08-25"))
      .toEqual({ from: "2026-08-25", to: "2026-09-07" });
  });

  // Stated as a span rather than as literals, so an off-by-one in either N-day
  // window fails even if someone "fixes" the literals above to match the code.
  it("spans exactly 7 and 14 calendar days counting today", () => {
    const week = windowRange("Next 7 days", "2026-08-25");
    expect(daysBetween(week.from, week.to)).toBe(6);
    const fortnight = windowRange("Next 14 days", "2026-08-25");
    expect(daysBetween(fortnight.from, fortnight.to)).toBe(13);
  });

  it("runs to the far future for All", () => {
    expect(windowRange("All", "2026-08-25")).toEqual({ from: "2026-08-25", to: "9999-12-31" });
  });

  it("treats an unknown window name as All rather than showing nothing", () => {
    expect(windowRange("nonsense", "2026-08-25")).toEqual(windowRange("All", "2026-08-25"));
  });

  it("treats a missing or empty window name as All too", () => {
    // The site restores a saved selection and announce.js takes a CLI flag; either can
    // hand us undefined. Falling back to an empty range would silently announce nothing.
    expect(windowRange(undefined, "2026-08-25")).toEqual(windowRange("All", "2026-08-25"));
    expect(windowRange("", "2026-08-25")).toEqual(windowRange("All", "2026-08-25"));
  });

  it("never returns an inverted or empty range for any window name", () => {
    for (const name of [...WINDOWS, "nonsense", undefined, ""]) {
      const { from, to } = windowRange(name, "2026-08-25");
      expect(from <= to).toBe(true);
    }
  });
});

describe("windowRange weekend invariants", () => {
  // A loop over three consecutive weeks: covers every weekday twice over and cannot
  // rot into testing only the handful of dates someone happened to think of.
  it("always returns Friday-to-Sunday, or the remainder of a weekend in progress", () => {
    let today = "2026-08-24"; // Monday
    for (let i = 0; i < 21; i++, today = plus(today, 1)) {
      const { from, to } = windowRange("This weekend", today);
      const dow = dayName(today);

      if (dow === "Sat") {
        expect({ today, ...windowRange("This weekend", today) })
          .toEqual({ today, from: today, to: plus(today, 1) });
        expect(dayName(to)).toBe("Sun");
      } else if (dow === "Sun") {
        expect({ today, from, to }).toEqual({ today, from: today, to: today });
      } else {
        // Mon..Fri: the COMING Friday, never last Friday and never the one after.
        expect({ today, dow, fromDay: dayName(from) })
          .toEqual({ today, dow, fromDay: "Fri" });
        expect(from >= today).toBe(true);
        expect(daysBetween(today, from)).toBeLessThanOrEqual(4);
        expect(to).toBe(plus(from, 2));
        expect(dayName(to)).toBe("Sun");
      }
      // Whatever the day, the weekend never starts in the past.
      expect(from >= today).toBe(true);
    }
  });
});

describe("windowRange calendar boundaries", () => {
  it("rolls a 7- and 14-day window over a year end", () => {
    // 2026-12-28 is a Monday.
    expect(windowRange("Next 7 days", "2026-12-28"))
      .toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(windowRange("Next 14 days", "2026-12-28"))
      .toEqual({ from: "2026-12-28", to: "2027-01-10" });
  });

  it("rolls a weekend over a month end", () => {
    // 2026-10-28 is a Wednesday; the coming Friday is 2026-10-30, Sunday is 2026-11-01.
    expect(windowRange("This weekend", "2026-10-28"))
      .toEqual({ from: "2026-10-30", to: "2026-11-01" });
    expect(windowRange("This weekend", "2026-10-30"))
      .toEqual({ from: "2026-10-30", to: "2026-11-01" });
  });

  it("rolls a weekend over a year end", () => {
    // 2026-12-31 is a Thursday; the coming Friday is New Year's Day.
    expect(windowRange("This weekend", "2026-12-31"))
      .toEqual({ from: "2027-01-01", to: "2027-01-03" });
  });

  it("counts 29 February in a leap year", () => {
    // 2028 IS a leap year: 2028-02-24 + 6 days lands on 2028-03-01, not 2028-03-02.
    expect(windowRange("Next 7 days", "2028-02-24"))
      .toEqual({ from: "2028-02-24", to: "2028-03-01" });
    expect(windowRange("Next 14 days", "2028-02-24"))
      .toEqual({ from: "2028-02-24", to: "2028-03-08" });
    expect(windowPredicate("Next 7 days", "2028-02-24")({ date: "2028-02-29" })).toBe(true);
    // The non-leap contrast: 2027 has no 29 February, so the same offset lands a day later.
    expect(windowRange("Next 7 days", "2027-02-24"))
      .toEqual({ from: "2027-02-24", to: "2027-03-02" });
  });
});

describe("windowPredicate", () => {
  const inWeek = windowPredicate("Next 7 days", "2026-08-25");

  it("includes both ends and excludes the past", () => {
    expect(inWeek({ date: "2026-08-25" })).toBe(true);
    expect(inWeek({ date: "2026-08-31" })).toBe(true);
    expect(inWeek({ date: "2026-09-01" })).toBe(false);
    expect(inWeek({ date: "2026-08-24" })).toBe(false);
  });

  it("includes both ends of a weekend, midweek U21 games included in the N-day windows", () => {
    const weekend = windowPredicate("This weekend", "2026-08-25");
    expect(weekend({ date: "2026-08-28" })).toBe(true); // Friday, the first day
    expect(weekend({ date: "2026-08-30" })).toBe(true); // Sunday, the last day
    expect(weekend({ date: "2026-08-27" })).toBe(false); // Thursday, before it opens
    expect(weekend({ date: "2026-09-02" })).toBe(false); // the midweek U21 game after it
    // ...which is precisely why Next 7 days is the default.
    expect(inWeek({ date: "2026-09-02" })).toBe(false); // beyond 08-31
    expect(windowPredicate("Next 7 days", "2026-08-30")({ date: "2026-09-02" })).toBe(true);
  });

  it("keeps everything from today onward for All, including the far future", () => {
    const all = windowPredicate("All", "2026-08-25");
    expect(all({ date: "2026-08-25" })).toBe(true);
    expect(all({ date: "2027-01-13" })).toBe(true);
    expect(all({ date: "9999-12-31" })).toBe(true);
  });

  it("excludes past fixtures from All despite the name", () => {
    // "All" is a window, not the whole file: a game played yesterday is not news.
    const all = windowPredicate("All", "2026-08-25");
    expect(all({ date: "2026-08-24" })).toBe(false);
    expect(all({ date: "2026-08-29" })).toBe(true);
  });

  it("falls back to All for an unknown name rather than filtering everything out", () => {
    const bogus = windowPredicate("Last Tuesday", "2026-08-25");
    expect(bogus({ date: "2026-08-25" })).toBe(true);
    expect(bogus({ date: "2027-01-13" })).toBe(true);
    expect(bogus({ date: "2026-08-24" })).toBe(false);
  });
});

describe("windowPredicate against the real capture", () => {
  const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
  const { fixtures } = normalizeAll(parse(html).fixtures);

  // 2026-09-08 is a Tuesday chosen FROM the data: the coming weekend (09-12, 09-13) is
  // the busiest in the capture, there is a midweek U21 game on 09-09 inside the 7-day
  // window but outside the weekend, and the fortnight picks up 09-19/09-20. Every
  // window below is therefore non-empty and each is strictly bigger than the last, so
  // none of the subset assertions can pass vacuously.
  const today = "2026-09-08";
  const pick = (name) => fixtures.filter(windowPredicate(name, today)).map((f) => f.fid);

  it("reads the whole committed capture", () => {
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
  });

  it("nests the four windows, each strictly larger than the last", () => {
    const weekend = pick("This weekend");
    const week = pick("Next 7 days");
    const fortnight = pick("Next 14 days");
    const all = pick("All");

    expect(weekend.length).toBe(11);
    expect(week.length).toBe(12);
    expect(fortnight.length).toBe(18);
    expect(all.length).toBe(33);

    expect(week).toEqual(expect.arrayContaining(weekend));
    expect(fortnight).toEqual(expect.arrayContaining(week));
    expect(all).toEqual(expect.arrayContaining(fortnight));
  });

  it("leaves the 16 fixtures already played out of every window", () => {
    const played = fixtures.filter((f) => f.date < today);
    expect(played).toHaveLength(16);
    for (const name of WINDOWS) {
      const kept = new Set(fixtures.filter(windowPredicate(name, today)).map((f) => f.fid));
      for (const f of played) expect(kept.has(f.fid)).toBe(false);
    }
  });

  it("selects exactly the dates the named window covers", () => {
    const dates = (name) =>
      [...new Set(fixtures.filter(windowPredicate(name, today)).map((f) => f.date))].sort();
    expect(dates("This weekend")).toEqual(["2026-09-12", "2026-09-13"]);
    expect(dates("Next 7 days")).toEqual(["2026-09-09", "2026-09-12", "2026-09-13"]);
    expect(dates("Next 14 days"))
      .toEqual(["2026-09-09", "2026-09-12", "2026-09-13", "2026-09-19", "2026-09-20"]);
    expect(dates("All").at(-1)).toBe("2027-01-13");
  });
});

// 2026-08-29 is a Saturday, 08-30 Sunday, 08-31 Monday, 09-01 Tuesday,
// 09-02 Wednesday, 09-03 Thursday, 09-04 Friday.
describe("result windows", () => {
  it("offers exactly the three backward windows", () => {
    expect(RESULT_WINDOWS).toEqual(["Last 7 days", "Last 14 days", "All"]);
  });

  // The defect this replaced: "Last weekend" was the Results tab's default, and on a
  // Thursday it selected Sat+Sun only. Midweek evening kick-offs are routine for this
  // club, so it hid half the store most weeks.
  it("no longer offers a weekend-only window", () => {
    expect(RESULT_WINDOWS).not.toContain("Last weekend");
  });

  it("treats a stale window name as All, rather than as nothing", () => {
    expect(resultWindowRange("Last weekend", "2026-09-03"))
      .toEqual(resultWindowRange("All", "2026-09-03"));
  });

  it("selects midweek results, which is the whole point of the change", () => {
    const inWindow = resultWindowPredicate("Last 7 days", "2026-09-03");
    expect(inWindow({ date: "2026-08-31" })).toBe(true); // Monday
    expect(inWindow({ date: "2026-09-01" })).toBe(true); // Tuesday
    expect(inWindow({ date: "2026-09-02" })).toBe(true); // Wednesday
  });

  it("counts back inclusively for the rolling windows", () => {
    expect(resultWindowRange("Last 7 days", "2026-08-30"))
      .toEqual({ from: "2026-08-24", to: "2026-08-30" });
    expect(resultWindowRange("Last 14 days", "2026-08-30"))
      .toEqual({ from: "2026-08-17", to: "2026-08-30" });
  });

  it("shows everything for All, rather than nothing", () => {
    const { from, to } = resultWindowRange("All", "2026-08-30");
    expect(from < "1900-01-01").toBe(true);
    expect(to).toBe("9999-12-31");
  });

  it("selects results by date", () => {
    const inWindow = resultWindowPredicate("Last 7 days", "2026-09-03");
    expect(inWindow({ date: "2026-08-28" })).toBe(true);
    expect(inWindow({ date: "2026-09-03" })).toBe(true);
    expect(inWindow({ date: "2026-08-27" })).toBe(false);
    expect(inWindow({ date: "2026-09-04" })).toBe(false);
  });

  it("leaves the forward windows untouched", () => {
    expect(WINDOWS).toEqual(["This weekend", "Next 7 days", "Next 14 days", "All"]);
    expect(windowRange("Next 7 days", "2026-08-30"))
      .toEqual({ from: "2026-08-30", to: "2026-09-05" });
  });
});

// 2026-09-07 is a Monday, 09-13 the Sunday that ends its week.
describe("weekStart", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStart("2026-09-07")).toBe("2026-09-07");
  });

  it("returns the Monday just gone for a Sunday", () => {
    expect(weekStart("2026-09-13")).toBe("2026-09-07");
  });

  it("returns the Monday just gone for a mid-week day", () => {
    expect(weekStart("2026-09-10")).toBe("2026-09-07"); // Thursday
    expect(weekStart("2026-09-12")).toBe("2026-09-07"); // Saturday
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-09-02")).toBe("2026-08-31"); // Wed -> Mon in August
  });

  it("crosses a year boundary", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // Fri -> Mon in December
  });

  it("is idempotent", () => {
    expect(weekStart(weekStart("2026-09-13"))).toBe(weekStart("2026-09-13"));
  });
});

describe("addDays", () => {
  it("moves forward and backward across a month boundary", () => {
    expect(addDays("2026-08-31", 7)).toBe("2026-09-07");
    expect(addDays("2026-09-07", -7)).toBe("2026-08-31");
    expect(addDays("2026-09-07", 0)).toBe("2026-09-07");
  });
});

describe("seasonStart", () => {
  it("returns 1 August of the same year on or after 1 August", () => {
    expect(seasonStart("2026-08-01")).toBe("2026-08-01");
    expect(seasonStart("2026-09-17")).toBe("2026-08-01");
    expect(seasonStart("2026-12-31")).toBe("2026-08-01");
  });

  it("returns the PREVIOUS 1 August before 1 August", () => {
    expect(seasonStart("2026-07-31")).toBe("2025-08-01");
    expect(seasonStart("2026-01-01")).toBe("2025-08-01");
    expect(seasonStart("2026-05-01")).toBe("2025-08-01");
  });

  it("rolls over on the boundary day, not the day after", () => {
    expect(seasonStart("2027-07-31")).toBe("2026-08-01");
    expect(seasonStart("2027-08-01")).toBe("2027-08-01");
  });
});

describe("seasonPredicate", () => {
  it("keeps this season and drops last season", () => {
    const inSeason = seasonPredicate("2026-09-17");
    expect(inSeason({ date: "2026-09-12" })).toBe(true);
    expect(inSeason({ date: "2026-08-01" })).toBe(true);
    expect(inSeason({ date: "2026-07-31" })).toBe(false);
    expect(inSeason({ date: "2024-09-22" })).toBe(false);
  });
});

describe("resultWindowRange season clamp", () => {
  it("bounds All by the season start, not all time", () => {
    expect(resultWindowRange("All", "2026-09-17"))
      .toEqual({ from: "2026-08-01", to: "9999-12-31" });
  });

  it("clamps a backward window that would cross the boundary", () => {
    // 14 days back from 5 Aug reaches 23 July - last season.
    expect(resultWindowRange("Last 14 days", "2026-08-05").from).toBe("2026-08-01");
  });

  it("leaves a window that sits inside the season alone", () => {
    expect(resultWindowRange("Last 7 days", "2026-09-17"))
      .toEqual({ from: "2026-09-11", to: "2026-09-17" });
  });
});
