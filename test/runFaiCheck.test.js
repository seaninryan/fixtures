import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runFaiCheck } from "../src/lib/runFaiCheck.js";
import { FAI_ACTIVE_TEAM_COUNT, FAI_TEAM_COUNT } from "./fixtures/meta.js";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const TEAMS = load("fai-teams.json");
const JUNIORS_FUTURE = load("fai-matches-61270-future.json").result;
const JUNIORS_PAST = load("fai-matches-61270-past.json").result;
const RESERVES_FUTURE = load("fai-matches-87946-future.json").result;

// What check.mjs hands in: one entry per team that returned anything.
const MATCHES = {
  61270: { future: JUNIORS_FUTURE, past: JUNIORS_PAST },
  87946: { future: RESERVES_FUTURE, past: [] },
};

const base = {
  teams: TEAMS,
  matches: MATCHES,
  facilities: {},
  previous: null,
  previousResults: null,
  config: null,
  now: "2026-09-17T11:00:00.000Z",
  today: "2026-09-17",
};

describe("runFaiCheck", () => {
  it("keeps only the squads that actually have matches", () => {
    const out = runFaiCheck(base);
    expect(TEAMS).toHaveLength(FAI_TEAM_COUNT);
    const squads = new Set(out.snapshot.fixtures.map((f) => f.teamId));
    expect(squads.size).toBe(FAI_ACTIVE_TEAM_COUNT);
    expect([...squads].sort()).toEqual(["fai:61270", "fai:87946"]);
  });

  it("orders fixtures by date, then time, then fid", () => {
    const { fixtures } = runFaiCheck(base).snapshot;
    const keys = fixtures.map((f) => `${f.date} ${f.time} ${f.fid}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("reports NO changes on a first run", () => {
    const out = runFaiCheck(base);
    expect(out.firstRun).toBe(true);
    expect(out.changes).toEqual([]);
    expect(out.report).toBeNull();
  });

  it("aborts when team discovery comes back empty", () => {
    // Broken auth or a moved endpoint - never a club with no teams.
    expect(() => runFaiCheck({ ...base, teams: [] })).toThrow(/no teams/i);
  });

  it("aborts when every team goes quiet but the previous run had fixtures", () => {
    const previous = runFaiCheck(base).snapshot;
    expect(() => runFaiCheck({ ...base, matches: {}, previous }))
      .toThrow(/no fixtures/i);
  });

  it("does NOT abort on an empty first run - the club may not have migrated yet", () => {
    const out = runFaiCheck({ ...base, matches: {} });
    expect(out.snapshot.fixtures).toEqual([]);
  });

  it("does NOT apply the 50% shrink rule - playing games is not a collapse", () => {
    // The Juniors have 5 upcoming fixtures. Playing three in a fortnight halves the list
    // and is entirely ordinary at this scale, which is why runCheck's guard is not reused.
    const previous = runFaiCheck(base).snapshot;
    const thinned = { 61270: { future: JUNIORS_FUTURE.slice(3), past: [] } };
    const out = runFaiCheck({ ...base, matches: thinned, previous });
    expect(out.snapshot.fixtures).toHaveLength(2);
  });

  it("stores only this season's results", () => {
    const out = runFaiCheck(base);
    expect(out.results.results.map((r) => r.fid)).toEqual(["fai:52005161", "fai:52005166"]);
  });

  it("never drops a stored result that has left the feed", () => {
    const previousResults = {
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      results: [{
        fid: "fai:99", teamId: "fai:61270", date: "2026-08-20", isHome: true,
        ourTeam: "Craughwell United Juniors", opponent: "Someone", ourScore: 1,
        theirScore: 0, venue: "", competition: "Cup",
      }],
    };
    const out = runFaiCheck({ ...base, previousResults });
    expect(out.results.results.map((r) => r.fid)).toContain("fai:99");
  });

  it("seeds config for the new squads without touching an existing entry", () => {
    const config = { version: 1, teams: { 235380: { label: "U14A Boys", color: "#123456" } } };
    const out = runFaiCheck({ ...base, config });
    expect(out.config.teams["235380"]).toEqual({ label: "U14A Boys", color: "#123456" });
    expect(out.config.teams["fai:61270"]).toBeDefined();
  });

  it("reports a postponement as a change against a clean previous run", () => {
    const clean = JUNIORS_FUTURE.map((m) =>
      m.id === 52005183 ? { ...m, liveStatus: "SCHEDULED" } : m);
    const previous = runFaiCheck({ ...base, matches: { 61270: { future: clean, past: [] } } }).snapshot;
    const out = runFaiCheck({ ...base, previous });
    expect(out.changes.some((c) => c.fid === "fai:52005183")).toBe(true);
  });

  it("attaches a venue from the facilities it was given", () => {
    const out = runFaiCheck({ ...base, facilities: { 52005175: { place: "Craughwell" } } });
    const f = out.snapshot.fixtures.find((x) => x.fid === "fai:52005175");
    expect(f.venue).toBe("Craughwell");
  });
});
