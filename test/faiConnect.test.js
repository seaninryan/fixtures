import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faiFixture } from "../src/lib/faiConnect.js";
import { FAI_JUNIORS_TEAM_ID } from "./fixtures/meta.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const future = load("fai-matches-61270-future.json").result;
const byId = (id) => future.find((m) => m.id === id);

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
});
