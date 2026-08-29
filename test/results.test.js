import { describe, it, expect } from "vitest";
import { mergeResults, RESULTS_VERSION } from "../src/lib/results.js";

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
