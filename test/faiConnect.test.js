import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faiFixture, faiFixtures, faiResult, faiResults } from "../src/lib/faiConnect.js";
import { FAI_JUNIORS_TEAM_ID, FAI_JUNIORS_PAST_COUNT, FAI_JUNIORS_PAST_IN_SEASON } from "./fixtures/meta.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const future = load("fai-matches-61270-future.json").result;
const byId = (id) => future.find((m) => m.id === id);

const past = load("fai-matches-61270-past.json").result;
const pastById = (id) => past.find((m) => m.id === id);

describe("faiFixture", () => {
  it("converts epoch ms to the club's LOCAL kick-off, never UTC", () => {
    // 2026-09-19 13:00Z is 14:00 in Craughwell - Ireland is UTC+1 in September.
    // Storing 13:00 would move every kick-off by an hour for half the year.
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.date).toBe("2026-09-19");
    expect(f.time).toBe("14:00");
  });

  it("keeps date and time as STRINGS", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(typeof f.date).toBe("string");
    expect(typeof f.time).toBe("string");
  });

  it("prefixes both fid and teamId", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.fid).toBe("fai:52005172");
    expect(f.teamId).toBe("fai:61270");
  });

  it("reads an away game from team === 'A'", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.isHome).toBe(false);
    expect(f.ourTeam).toBe("Craughwell United Juniors");
    expect(f.opponent).toBe("Renmore FC");
  });

  it("reads a home game from team === 'H'", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID);
    expect(f.isHome).toBe(true);
    expect(f.ourTeam).toBe("Craughwell United Juniors");
    expect(f.opponent).toBe("Moyne Villa Junior A");
  });

  it("carries a non-scheduled status as the comment, so diff reports it", () => {
    const f = faiFixture(byId(52005183), FAI_JUNIORS_TEAM_ID);
    expect(f.comment).toBe("POSTPONED");
  });

  it("leaves the comment empty for an ordinary scheduled game", () => {
    expect(faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID).comment).toBe("");
  });

  it("takes the competition name, not the parent season", () => {
    const f = faiFixture(byId(52005172), FAI_JUNIORS_TEAM_ID);
    expect(f.competition).toBe("Western Hygiene Supplies Brod Trill Mens Premier League");
  });

  it("defaults venue to empty - the list endpoint carries none", () => {
    expect(faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID).venue).toBe("");
  });

  it("takes a venue when a facility is supplied", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID, { place: "Craughwell" });
    expect(f.venue).toBe("Craughwell");
  });

  it("tolerates a null facility - one live fixture has one", () => {
    const f = faiFixture(byId(52005175), FAI_JUNIORS_TEAM_ID, null);
    expect(f.venue).toBe("");
  });

  it("derives isHome from the ids, not the team letter", () => {
    const lying = { ...byId(52005175), team: "A" };  // ids say home
    expect(faiFixture(lying, FAI_JUNIORS_TEAM_ID).isHome).toBe(true);
  });

  it("does not turn a null kick-off into 1970", () => {
    const broken = { ...byId(52005172), dateTimeUTC: null };
    expect(faiFixture(broken, FAI_JUNIORS_TEAM_ID).date).toBeNull();
  });

  it("does not throw on a missing kick-off - it costs that fixture, not the scan", () => {
    const broken = { ...byId(52005172), dateTimeUTC: undefined };
    expect(() => faiFixture(broken, FAI_JUNIORS_TEAM_ID)).not.toThrow();
  });
});

describe("faiFixtures", () => {
  it("drops a fixture whose team letter and ids disagree", () => {
    const lying = { ...byId(52005175), team: "A" };
    const { fixtures, errors } = faiFixtures([lying], FAI_JUNIORS_TEAM_ID, {}, {});
    expect(fixtures).toHaveLength(0);
    expect(errors[0]).toMatch(/ids say home/);
  });

  it("drops a match that involves neither of our sides", () => {
    const wrong = { ...byId(52005175), homeTeam: { id: 1, name: "A" }, awayTeam: { id: 2, name: "B" } };
    const { fixtures, errors } = faiFixtures([wrong], FAI_JUNIORS_TEAM_ID, {}, {});
    expect(fixtures).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("drops an unusable kick-off with an error, keeping the rest", () => {
    const broken = [{ ...byId(52005172), dateTimeUTC: null }, byId(52005175)];
    const { fixtures, errors } = faiFixtures(broken, FAI_JUNIORS_TEAM_ID, {}, {});
    expect(fixtures).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/fai:52005172/);
  });
});

describe("faiResult", () => {
  it("stores a home defeat from OUR point of view", () => {
    // 52005166: Craughwell 0 - 4 Mervue, at home.
    const r = faiResult(pastById(52005166), FAI_JUNIORS_TEAM_ID);
    expect(r.isHome).toBe(true);
    expect(r.ourScore).toBe(0);
    expect(r.theirScore).toBe(4);
  });

  it("flips the scores for an away game", () => {
    // 52005161: Salthill Devon 8 - 1 Craughwell, away. Ours is the 1.
    const r = faiResult(pastById(52005161), FAI_JUNIORS_TEAM_ID);
    expect(r.isHome).toBe(false);
    expect(r.ourScore).toBe(1);
    expect(r.theirScore).toBe(8);
  });

  it("keeps a nil-all as real zeroes, not as missing", () => {
    // 27609861: 0-0. Number("") is 0, so a blank must never reach here as a score.
    const r = faiResult(pastById(27609861), FAI_JUNIORS_TEAM_ID);
    expect(r.ourScore).toBe(0);
    expect(r.theirScore).toBe(0);
  });

  it("does NOT store the W/D/L field - the scores already say who won", () => {
    expect(faiResult(pastById(52005166), FAI_JUNIORS_TEAM_ID).result).toBeUndefined();
  });
});

describe("faiResults", () => {
  it("drops everything before the season start", () => {
    const { results } = faiResults(past, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(past).toHaveLength(FAI_JUNIORS_PAST_COUNT);
    expect(results).toHaveLength(FAI_JUNIORS_PAST_IN_SEASON);
    expect(results.map((r) => r.fid)).toEqual(["fai:52005161", "fai:52005166"]);
  });

  it("keeps the 2024 cup run OUT - mergeResults never deletes, so this is permanent", () => {
    const { results } = faiResults(past, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(results.some((r) => r.date < "2026-08-01")).toBe(false);
  });

  it("moves the floor with the season", () => {
    // Read from 2026-09-17 the floor is 2026-08-01, so the 2024 cup run is out. Read from
    // inside that cup run's own season the floor is 2024-08-01 and it is in. No upper
    // bound is asserted: seasonPredicate is a floor, because a result is always a game
    // already played.
    const now = faiResults(past, FAI_JUNIORS_TEAM_ID, "2026-09-17").results;
    const then = faiResults(past, FAI_JUNIORS_TEAM_ID, "2025-03-01").results;
    expect(now.some((r) => r.date === "2024-09-22")).toBe(false);
    expect(then.some((r) => r.date === "2024-09-22")).toBe(true);
  });

  it("drops a past match with an unusable kick-off rather than dating it 1970", () => {
    const broken = [{ ...pastById(52005166), dateTimeUTC: null }];
    const { results, errors } = faiResults(broken, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/unusable kick-off/);
  });

  it("skips a match with no score rather than inventing a draw", () => {
    const unplayed = [{ ...pastById(52005166), homeTeamResult: null, awayTeamResult: null }];
    const { results, errors } = faiResults(unplayed, FAI_JUNIORS_TEAM_ID, "2026-09-17");
    expect(results).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/fai:52005166/);
  });
});
