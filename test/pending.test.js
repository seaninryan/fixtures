import { describe, it, expect } from "vitest";
import { hasKickedOff, pendingFixtures, pendingLines } from "../src/lib/pending.js";

const config = { version: 1, teams: { "11": { label: "U14A Boys", color: "#d9c53c" } } };

const fixture = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-09-02", time: "18:30", isHome: false,
  ourTeam: "Craughwell United", opponent: "Colga", venue: "Colga",
  competition: "GFA Boys U14 Championship 1", comment: "", ...over,
});

const result = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-09-02", isHome: false,
  ourTeam: "Craughwell United", opponent: "Colga",
  ourScore: 3, theirScore: 5, venue: "Colga",
  competition: "GFA Boys U14 Championship 1", ...over,
});

const now = { date: "2026-09-03", time: "09:00" };

describe("hasKickedOff", () => {
  it("is true for a fixture on an earlier day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-02", time: "23:45" }), now)).toBe(true);
  });

  it("is false for a fixture on a later day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-04", time: "00:15" }), now)).toBe(false);
  });

  it("is false before kick-off on the same day", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "18:30" }), now)).toBe(false);
  });

  it("is true at and after kick-off on the same day", () => {
    const atNine = fixture({ date: "2026-09-03", time: "09:00" });
    expect(hasKickedOff(atNine, now)).toBe(true);
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "08:30" }), now)).toBe(true);
  });

  // "9:00" compares ABOVE "18:30" as a string, which would make a morning game look
  // permanently unplayed. An unrecognised time falls back to the date alone, which
  // reports not-yet-kicked-off today and picks the game up tomorrow.
  it("falls back to the date alone when the time is not HH:MM", () => {
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "9:00" }), now)).toBe(false);
    expect(hasKickedOff(fixture({ date: "2026-09-03", time: "" }), now)).toBe(false);
    expect(hasKickedOff(fixture({ date: "2026-09-02", time: "9:00" }), now)).toBe(true);
  });
});

describe("pendingFixtures", () => {
  it("lists an elapsed fixture with no result", () => {
    expect(pendingFixtures([fixture()], [], now).map((f) => f.fid)).toEqual(["1"]);
  });

  it("excludes a fixture whose result has arrived", () => {
    expect(pendingFixtures([fixture()], [result()], now)).toEqual([]);
  });

  // Identity is fid. A result for a DIFFERENT game on the same day must not clear it.
  it("matches a result to a fixture on fid, never on the date", () => {
    const other = result({ fid: "999" });
    expect(pendingFixtures([fixture()], [other], now).map((f) => f.fid)).toEqual(["1"]);
  });

  it("excludes a fixture that has not kicked off", () => {
    expect(pendingFixtures([fixture({ date: "2026-09-05" })], [], now)).toEqual([]);
  });

  it("excludes a fixture older than the Last 14 days floor", () => {
    // now.date is 2026-09-03, so the floor is 2026-08-21.
    expect(pendingFixtures([fixture({ date: "2026-08-20" })], [], now)).toEqual([]);
    expect(pendingFixtures([fixture({ date: "2026-08-21" })], [], now)).toHaveLength(1);
  });

  it("treats a missing or malformed store as empty rather than throwing", () => {
    expect(pendingFixtures([fixture()], null, now)).toHaveLength(1);
    expect(pendingFixtures([fixture()], undefined, now)).toHaveLength(1);
    expect(pendingFixtures(null, [], now)).toEqual([]);
  });

  it("orders newest first, then by teamId, then by fid", () => {
    const older = fixture({ fid: "2", date: "2026-08-29" });
    const sameDayB = fixture({ fid: "3", teamId: "22", date: "2026-09-02" });
    const sameDayA2 = fixture({ fid: "0", teamId: "11", date: "2026-09-02" });
    const order = pendingFixtures([older, sameDayB, sameDayA2, fixture()], [], now)
      .map((f) => f.fid);
    expect(order).toEqual(["0", "1", "3", "2"]);
  });
});

describe("pendingLines", () => {
  it("is empty when nothing is pending", () => {
    expect(pendingLines([fixture()], [result()], config, now)).toEqual([]);
  });

  it("writes the squad, the opponent and when it was played", () => {
    const [line] = pendingLines([fixture()], [], config, now);
    expect(line.text).toBe("U14A Boys @ Colga — Wed 2 Sep, 18:30");
    expect(line.kind).toBe("pending");
    expect(line.teamId).toBe("11");
    expect(line.color).toBe("#d9c53c");
  });

  it("writes v for a home game, matching the announcement", () => {
    const [line] = pendingLines([fixture({ isHome: true })], [], config, now);
    expect(line.text).toContain("U14A Boys v Colga");
  });

  // Both halves matter. An empty config is NOT enough to reach the fallback: derivation
  // reads the age and gender out of the competition name, so "GFA Boys U14 Championship
  // 1" still yields "U14 Boys". The raw feed name appears only when derivation itself
  // has nothing to work with - visibly unfinished, never silently wrong.
  it("derives a label from the competition when config has none", () => {
    const bare = { version: 1, teams: {} };
    const [line] = pendingLines([fixture()], [], bare, now);
    expect(line.text).toContain("U14 Boys @ Colga");
  });

  it("falls back to the feed name when the competition yields no label", () => {
    const bare = { version: 1, teams: {} };
    const cup = fixture({ competition: "GFA Cup" });
    const [line] = pendingLines([cup], [], bare, now);
    expect(line.text).toContain("Craughwell United @ Colga");
  });

  // THE INVARIANT. deriveLabels shows the A/B letter only when the club runs more than
  // one side at that age and gender. Resolve over the pending subset - one U14 side -
  // and "U14A Boys" silently becomes "U14 Boys". This bug has appeared three times.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const aSide = fixture({ fid: "1", teamId: "A1", ourTeam: "Craughwell United" });
    const bSide = fixture({
      fid: "2", teamId: "B1", ourTeam: "Craughwell United B", date: "2026-09-05",
    });
    // Only aSide is pending; bSide has not been played. The B side must still be
    // counted when the label is derived.
    const lines = pendingLines([aSide, bSide], [], bare, now);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("U14A Boys");
  });
});
