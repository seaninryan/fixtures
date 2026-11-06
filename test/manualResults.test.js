// test/manualResults.test.js
import { describe, it, expect } from "vitest";
import { mergeManual, manualEntry, applyLeaveOff, MANUAL_DAYS } from "../src/lib/manualResults.js";

const TODAY = "2026-11-01";
const official = (over = {}) => ({
  fid: "500", teamId: "11", date: "2026-11-01", isHome: true, ourTeam: "Craughwell United",
  opponent: "Gort", ourScore: 2, theirScore: 1, venue: "", competition: "", ...over,
});
const entry = (over = {}) => ({
  id: "500", fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true,
  opponent: "Gort", ourScore: 2, theirScore: 1, ...over,
});

describe("mergeManual", () => {
  it("adds a hand-entered result the league has not published", () => {
    const { results, conflicts } = mergeManual([], [entry()], TODAY);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ fid: "500", ourScore: 2, theirScore: 1, time: "14:00", manual: true });
    expect(conflicts).toEqual([]);
  });

  it("official wins when the fid arrives, silently if the scores agree", () => {
    const { results, conflicts } = mergeManual([official()], [entry()], TODAY);
    expect(results).toEqual([official()]);
    expect(conflicts).toEqual([]);
  });

  it("flags a disagreement so a wrong posted card is visible", () => {
    const { results, conflicts } = mergeManual([official({ ourScore: 3 })], [entry()], TODAY);
    expect(results).toEqual([official({ ourScore: 3 })]);
    expect(conflicts).toEqual([{ entry: entry(), official: official({ ourScore: 3 }) }]);
  });

  it("matches a free-form entry on squad and date", () => {
    const free = entry({ id: "manual:x", fid: null, opponent: "Gort FC" });
    const { results } = mergeManual([official()], [free], TODAY);
    expect(results).toEqual([official()]);
  });

  it("does not match a free-form entry to another squad's result that day", () => {
    const free = entry({ id: "manual:x", fid: null, teamId: "12" });
    expect(mergeManual([official()], [free], TODAY).results).toHaveLength(2);
  });

  it(`drops entries dated more than ${MANUAL_DAYS} days ago`, () => {
    const old = entry({ id: "manual:o", fid: null, date: "2026-10-17" });
    expect(mergeManual([], [old], TODAY).results).toEqual([]);
  });

  it("keeps an entry exactly MANUAL_DAYS old", () => {
    const edge = entry({ id: "manual:e", fid: null, date: "2026-10-18" });
    expect(mergeManual([], [edge], TODAY).results).toHaveLength(1);
  });

  it("flags a free-form entry the league scored differently", () => {
    const free = entry({ id: "manual:x", fid: null, ourScore: 9 });
    const { results, conflicts } = mergeManual([official()], [free], TODAY);
    expect(results).toEqual([official()]);
    expect(conflicts).toEqual([{ entry: free, official: official() }]);
  });

  it("carries the feed name through for an unlabelled squad", () => {
    const { results } = mergeManual([], [entry({ ourTeam: "Craughwell United" })], TODAY);
    expect(results[0].ourTeam).toBe("Craughwell United");
  });

  it("dedupes by id, last one wins", () => {
    const { results } = mergeManual([], [entry({ ourScore: 1 }), entry({ ourScore: 4 })], TODAY);
    expect(results).toHaveLength(1);
    expect(results[0].ourScore).toBe(4);
  });

  it("rejects entries with missing or malformed fields", () => {
    const bad = [
      entry({ opponent: undefined }), entry({ isHome: "yes" }), entry({ date: "1 Nov" }),
      entry({ teamId: "undefined" }), entry({ teamId: "" }),
    ];
    expect(mergeManual([], bad, TODAY).results).toEqual([]);
  });

  it("tolerates a corrupted store", () => {
    expect(mergeManual([], "nope", TODAY).results).toEqual([]);
    expect(mergeManual([], [null, { id: 1 }], TODAY).results).toEqual([]);
  });
});

describe("manualEntry", () => {
  it("keys a pre-filled entry on the league fid", () => {
    const fixture = { fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true, opponent: "Gort" };
    expect(manualEntry({ fixture, ourScore: "2", theirScore: "1" }))
      .toEqual(entry({ ourTeam: "" }));
  });

  it("rejects a blank or non-numeric score rather than inventing 0", () => {
    const fixture = { fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true, opponent: "Gort" };
    expect(manualEntry({ fixture, ourScore: "", theirScore: "1" })).toBeNull();
    expect(manualEntry({ fixture, ourScore: "x", theirScore: "1" })).toBeNull();
  });

  it("stores the feed name", () => {
    const fixture = { fid: "500", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true, opponent: "Gort", ourTeam: "Craughwell United" };
    expect(manualEntry({ fixture, ourScore: "2", theirScore: "1" }).ourTeam).toBe("Craughwell United");
  });

  it("returns null without a squad", () => {
    for (const teamId of [undefined, null, ""]) {
      const fixture = { fid: "500", teamId, date: "2026-11-01", isHome: true, opponent: "Gort" };
      expect(manualEntry({ fixture, ourScore: "2", theirScore: "1" })).toBeNull();
    }
  });

  it("gives a free-form entry a manual id", () => {
    const fixture = { fid: null, teamId: "11", date: "2026-11-01", time: "", isHome: false, opponent: "Gort" };
    const e = manualEntry({ fixture, ourScore: "0", theirScore: "0", newId: () => "abc" });
    expect(e.id).toBe("manual:abc");
    expect(e.fid).toBeNull();
  });
});

describe("applyLeaveOff", () => {
  it("removes rows whose id is left off", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    expect(applyLeaveOff(rows, ["2"])).toEqual([{ id: "1" }]);
  });

  it("treats a corrupted list as nothing left off", () => {
    expect(applyLeaveOff([{ id: "1" }], "nope")).toEqual([{ id: "1" }]);
  });
});
