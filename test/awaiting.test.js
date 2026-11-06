import { describe, it, expect } from "vitest";
import { nextAwaiting, AWAITING_DAYS } from "../src/lib/awaiting.js";

const fx = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-11-01", time: "14:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Gort", venue: "Craughwell",
  competition: "GFA", comment: "", ...over,
});
const TODAY = "2026-11-02";

describe("nextAwaiting", () => {
  it("keeps a played fixture that left the feed with no result", () => {
    const previous = { fixtures: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toEqual([fx()]);
  });

  it("treats a fixture dated today that left the feed as played, as diff.js does", () => {
    const previous = { fixtures: [fx({ date: TODAY })] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toHaveLength(1);
  });

  it("never keeps a future fixture - that is a cancellation, not a played game", () => {
    const previous = { fixtures: [fx({ date: "2026-11-03" })] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY })).toEqual([]);
  });

  it("drops it once its fid has a result", () => {
    const previous = { fixtures: [], awaiting: [fx()] };
    const results = [{ fid: "1" }];
    expect(nextAwaiting({ previous, fixtures: [], results, today: TODAY })).toEqual([]);
  });

  it("drops it while it is still in the feed - pending.js already sees it there", () => {
    const previous = { fixtures: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [fx()], results: [], today: TODAY }))
      .toEqual([]);
  });

  it("carries the previous awaiting list forward", () => {
    const previous = { fixtures: [], awaiting: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY }))
      .toEqual([fx()]);
  });

  it(`expires an entry dated more than ${AWAITING_DAYS} days ago`, () => {
    const previous = { fixtures: [], awaiting: [fx({ date: "2026-10-18" }), fx({ fid: "2", date: "2026-10-19" })] };
    const out = nextAwaiting({ previous, fixtures: [], results: [], today: TODAY });
    expect(out.map((f) => f.fid)).toEqual(["2"]);
  });

  it("dedupes on fid when a game is in both previous lists", () => {
    const previous = { fixtures: [fx()], awaiting: [fx()] };
    expect(nextAwaiting({ previous, fixtures: [], results: [], today: TODAY })).toHaveLength(1);
  });

  it("is empty on a first run", () => {
    expect(nextAwaiting({ previous: null, fixtures: [], results: [], today: TODAY })).toEqual([]);
    expect(nextAwaiting({ previous: { fixtures: "nope" }, fixtures: [], results: [], today: TODAY }))
      .toEqual([]);
  });

  it("orders by date, time, fid like the snapshot", () => {
    const previous = { fixtures: [fx({ fid: "b", time: "10:00" }), fx({ fid: "a", time: "10:00" }), fx({ fid: "c", date: "2026-10-31" })] };
    const out = nextAwaiting({ previous, fixtures: [], results: [], today: TODAY });
    expect(out.map((f) => f.fid)).toEqual(["c", "a", "b"]);
  });
});
