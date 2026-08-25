import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { FIXTURE_COUNT, TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

const BLOCK_START = '<ul class="column-eight table-body fixtures';

// Corrupt exactly one fixture block, leaving the other 48 and the surrounding page
// untouched — the point of every error test below is that damage stays local.
function withFirstBlockMutated(source, fn) {
  const parts = source.split(new RegExp(`(?=${BLOCK_START})`));
  const i = parts.findIndex((p) => p.startsWith(BLOCK_START));
  parts[i] = fn(parts[i]);
  return parts.join("");
}

// A minimal block in the shape the feed emits: attributes on the <ul>, the fid buried
// in an HTML comment, and one clubprofile link per side. Synthetic on purpose — it
// carries entities and edge cases the golden capture happens not to contain.
function syntheticBlock({ attrs = "", team1 = "2960", team2 = "9999", t1 = "11", t2 = "22" } = {}) {
  return `<ul class="column-eight table-body fixtures" data-date="29 Aug 2026" data-time="12:00" ${attrs}>
    <li><span class="data team1"><a href="https://x/clubprofile/${team1}/?competition_id=77&team_id=${t1}">Home</a></span></li>
    <li><span class="data team2"><a href="https://x/clubprofile/${team2}/?competition_id=77&team_id=${t2}">Away</a></span></li>
    <li><!-- <img class="users-path-img toggle-table" data-fid="9000001"> --></li>
  </ul>`;
}

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
      // Pinned literally: a home/away swap or a teamId/competitionId swap is invisible
      // to set-size assertions, because the capture has 19 of each.
      homeClubId: "2960",
      awayClubId: "2787",
      teamId: "235380",
      competitionId: "218494",
    });
  });

  it("keeps the club on the away side when the club is away", () => {
    const { fixtures } = parse(html);
    const f = fixtures.find((x) => x.fid === "6951300");
    expect(f).toMatchObject({
      homeTeam: "Cregmore/Claregalway C",
      awayTeam: "Craughwell United B",
      homeClubId: "2791",
      awayClubId: "2960",
      teamId: "254061",
      competitionId: "218501",
      venue: "Cregmore",
    });
  });

  it("decodes entities once and trims, without whack-a-mole numeric cases", () => {
    const block = syntheticBlock({
      attrs: [
        'data-venue="  A &amp; B  "',
        'data-compname="&amp;lt;not a tag&gt;"',
        'data-hometeam="O&#039;Brien&#039;s"',
        'data-awayteam="Caf&#233; FC"',
        'data-comment="a&nbsp;b"',
      ].join(" "),
    });
    const { fixtures, errors } = parse(block);
    expect(errors).toEqual([]);
    expect(fixtures[0]).toMatchObject({
      venue: "A & B",
      competition: "&lt;not a tag>",
      homeTeam: "O'Brien's",
      awayTeam: "Café FC",
      comment: "a b",
    });
  });

  it("keeps every attribute when a value contains an angle bracket", () => {
    const block = syntheticBlock({
      attrs: 'data-comment="moved -> Sun 2pm" data-venue="Craughwell" data-compname="GFA Boys U14"',
    });
    const { fixtures, errors } = parse(block);
    expect(errors).toEqual([]);
    expect(fixtures[0]).toMatchObject({
      comment: "moved -> Sun 2pm",
      venue: "Craughwell",
      competition: "GFA Boys U14",
    });
  });

  it("keeps the home team's id in a derby between two of our own teams", () => {
    const block = syntheticBlock({ team1: "2960", team2: "2960", t1: "11", t2: "22" });
    const { fixtures } = parse(block);
    expect(fixtures[0]).toMatchObject({ homeClubId: "2960", awayClubId: "2960", teamId: "11" });
  });

  it("never throws, and reports empty input as an error", () => {
    expect(() => parse(null)).not.toThrow();
    expect(parse("").errors).toEqual(["empty response"]);
    expect(parse("<html>nothing here</html>").fixtures).toEqual([]);
  });

  it("says so loudly when the page parses to no blocks at all", () => {
    const { fixtures, errors } = parse("<html>server error</html>");
    expect(fixtures).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/no fixture blocks found in 25 bytes/);
  });

  it("loses only the malformed block, never the whole page", () => {
    const broken = html.replace(/data-fid="6951014"/, 'data-XXX="6951014"');
    const { fixtures, errors } = parse(broken);
    expect(fixtures).toHaveLength(FIXTURE_COUNT - 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/no data-fid/);
    expect(errors[0]).toMatch(/Craughwell United v St Bernards, 29 Aug 2026/);
  });

  it("drops only the block whose club team link is missing", () => {
    const broken = withFirstBlockMutated(html, (b) =>
      b.replaceAll("clubprofile/2960/", "clubprofile/9999/"),
    );
    const { fixtures, errors } = parse(broken);
    expect(fixtures).toHaveLength(FIXTURE_COUNT - 1);
    expect(errors).toEqual([
      "block 0 (Craughwell United v St Bernards, 29 Aug 2026): no team link for club 2960",
    ]);
  });

  it("drops only the block that is missing its date", () => {
    const broken = withFirstBlockMutated(html, (b) =>
      b.replace('data-date="29 Aug 2026"', 'data-nodate="29 Aug 2026"'),
    );
    const { fixtures, errors } = parse(broken);
    expect(fixtures).toHaveLength(FIXTURE_COUNT - 1);
    expect(errors).toEqual([
      "block 0 (Craughwell United v St Bernards, ?): missing date or time",
    ]);
  });

  it("leaves an out-of-range numeric entity alone rather than losing the fixture", () => {
    // String.fromCodePoint throws above 0x10FFFF. One stray character in an admin
    // comment must not cost a whole fixture.
    const broken = withFirstBlockMutated(html, (b) =>
      b.replace(/data-comment="[^"]*"/, 'data-comment="bad &#99999999; entity"'));
    const { fixtures, errors } = parse(broken);
    expect(errors).toEqual([]);
    expect(fixtures).toHaveLength(FIXTURE_COUNT);
    expect(fixtures.find((f) => f.fid === "6951014").comment).toBe("bad &#99999999; entity");
  });
});
