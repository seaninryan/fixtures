import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { FIXTURE_COUNT, TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

describe("parse", () => {
  it("finds every fixture block in the real capture", () => {
    const { fixtures, errors } = parse(html);
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
    expect(errors).toEqual([]);
  });

  it("gives every fixture a unique league fixture id", () => {
    const { fixtures } = parse(html);
    const fids = fixtures.map((f) => f.fid);
    expect(fids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(new Set(fids).size).toBe(FIXTURE_COUNT);
  });

  it("identifies our own team id on every fixture", () => {
    const { fixtures } = parse(html);
    expect(fixtures.every((f) => /^\d+$/.test(f.teamId))).toBe(true);
    expect(new Set(fixtures.map((f) => f.teamId)).size).toBe(TEAM_COUNT);
  });

  it("records which side is the club, so home/away never depends on name matching", () => {
    const { fixtures } = parse(html);
    expect(fixtures.every((f) => f.homeClubId === "2960" || f.awayClubId === "2960")).toBe(true);
  });

  it("carries the data attributes across", () => {
    const { fixtures } = parse(html);
    const f = fixtures.find((x) => x.fid === "6951014");
    expect(f).toMatchObject({
      date: "29 Aug 2026",
      time: "12:00",
      homeTeam: "Craughwell United",
      awayTeam: "St Bernards",
      venue: "Craughwell",
      competition: "GFA Boys U14 Championship 1",
    });
  });

  it("never throws, and reports empty input as an error", () => {
    expect(() => parse(null)).not.toThrow();
    expect(parse("").errors).toEqual(["empty response"]);
    expect(parse("<html>nothing here</html>").fixtures).toEqual([]);
  });

  it("loses only the malformed block, never the whole page", () => {
    const broken = html.replace(/data-fid="6951014"/, 'data-XXX="6951014"');
    const { fixtures, errors } = parse(broken);
    expect(fixtures).toHaveLength(FIXTURE_COUNT - 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/no data-fid/);
  });
});
