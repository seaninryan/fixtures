import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import {
  deriveLabels, resolveTeams, teamsFromFixtures, seedConfig, CONFIG_VERSION,
} from "../src/lib/teams.js";
import { PALETTE } from "../src/lib/squadColors.js";
import { TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
const { fixtures } = normalizeAll(parse(html).fixtures);

// A synthetic fixture. The golden capture has no derby, no C side and no squad whose
// competition changes mid-season, so those rules are exercised against hand-built input.
const fx = (over) => ({ ...fixtures[0], ...over });

describe("deriveLabels", () => {
  const labels = deriveLabels(fixtures);
  const squads = teamsFromFixtures(fixtures);

  it("letters a squad only when the club runs more than one at that age and gender", () => {
    expect(labels["235380"]).toBe("U14A Boys");
    expect(labels["254061"]).toBe("U14B Boys");
    expect(labels["300398"]).toBe("U17 Boys");
  });

  it("derives girls' squads the same way", () => {
    expect(labels["238174"]).toBe("U12A Girls");
    expect(labels["238188"]).toBe("U12B Girls");
    expect(labels["238155"]).toBe("U14 Girls");
  });

  it("returns null rather than guessing when the competition name lacks age or gender", () => {
    expect(labels["234323"]).toBeNull();
    expect(labels["379931"]).toBeNull();
  });

  it("labels exactly those squads whose competition names carry both an age and a gender", () => {
    for (const [teamId, meta] of Object.entries(squads)) {
      const derivable = /\bU\d{1,2}\b/.test(meta.competition)
        && /\b(Boys|Girls|Women'?s?|Men'?s?)\b/i.test(meta.competition);
      if (derivable) expect(labels[teamId]).toMatch(/^U\d{1,2}[A-Z]? (Boys|Girls|Women|Men)$/);
      else expect(labels[teamId]).toBeNull();
    }
  });

  // The letter is the club's own A/B/C side, which only the TEAM NAME carries. The
  // division number is the league's grading and moves between seasons: a B side can be
  // graded above an A side, so reading the letter off the division would swap them.
  it("takes the letter from the team name, never from the division", () => {
    const graded = [
      fx({ teamId: "900001", ourTeam: "Craughwell United B", competition: "GFA Boys U15 Premier 1" }),
      fx({ teamId: "900002", ourTeam: "Craughwell United", competition: "GFA Boys U15 Division 4" }),
    ];
    const l = deriveLabels(graded);
    expect(l["900001"]).toBe("U15B Boys");
    expect(l["900002"]).toBe("U15A Boys");
  });

  it("letters a third side C", () => {
    const three = [
      fx({ teamId: "900003", ourTeam: "Craughwell United", competition: "GFA Boys U13 Division 1" }),
      fx({ teamId: "900004", ourTeam: "Craughwell United B", competition: "GFA Boys U13 Division 3" }),
      fx({ teamId: "900005", ourTeam: "Craughwell United C", competition: "GFA Boys U13 Division 5" }),
    ];
    const l = deriveLabels(three);
    expect(l["900003"]).toBe("U13A Boys");
    expect(l["900004"]).toBe("U13B Boys");
    expect(l["900005"]).toBe("U13C Boys");
  });

  // Two of our own squads drawn against each other. parse keeps the HOME side's team_id
  // for such a block, so a derby reaches us as two separate fixtures, one per squad.
  it("labels both sides of a derby", () => {
    const derby = [
      fx({ fid: "d1", teamId: "900006", isHome: true, ourTeam: "Craughwell United",
        opponent: "Craughwell United B", competition: "GFA Boys U16 Division 3" }),
      fx({ fid: "d2", teamId: "900007", isHome: false, ourTeam: "Craughwell United B",
        opponent: "Craughwell United", competition: "GFA Boys U16 Division 3" }),
    ];
    const l = deriveLabels(derby);
    expect(l["900006"]).toBe("U16A Boys");
    expect(l["900007"]).toBe("U16B Boys");
  });

  it("counts sides per age AND gender, so a girls' squad never letters a boys' one", () => {
    const mixed = [
      fx({ teamId: "900008", ourTeam: "Craughwell United", competition: "GFA Boys U11 Division 1" }),
      fx({ teamId: "900009", ourTeam: "Craughwell United B", competition: "GFA Girls U11 Division 1" }),
    ];
    const l = deriveLabels(mixed);
    expect(l["900008"]).toBe("U11 Boys");
    expect(l["900009"]).toBe("U11 Girls");
  });

  it("does not let an underivable squad count towards the letter of a derivable one", () => {
    const l = deriveLabels([
      fx({ teamId: "900010", ourTeam: "Craughwell United", competition: "GFA Boys U19 Division 1" }),
      fx({ teamId: "900011", ourTeam: "Craughwell United B", competition: "GFA U19 Division 2" }),
    ]);
    expect(l["900010"]).toBe("U19 Boys");
    expect(l["900011"]).toBeNull();
  });

  it("derives women's and men's squads when an age is present", () => {
    const l = deriveLabels([
      fx({ teamId: "900012", ourTeam: "Craughwell United", competition: "GFA Women's U20 Championship" }),
      fx({ teamId: "900013", ourTeam: "Craughwell United", competition: "GFA Mens U20 League" }),
    ]);
    expect(l["900012"]).toBe("U20 Women");
    expect(l["900013"]).toBe("U20 Men");
  });

  it("does not throw on an empty fixture list", () => {
    expect(deriveLabels([])).toEqual({});
  });
});

describe("resolveTeams", () => {
  it("lets config beat derivation, so labels never drift", () => {
    const config = { teams: { "235380": { label: "U14A Lions" } } };
    expect(resolveTeams(fixtures, config).labels["235380"]).toBe("U14A Lions");
  });

  it("uses the derived label when config has nothing to say", () => {
    const { labels, unknown } = resolveTeams(fixtures, { teams: {} });
    expect(labels["254061"]).toBe("U14B Boys");
    expect(labels["300398"]).toBe("U17 Boys");
    expect(unknown).not.toContain("254061");
  });

  it("falls back to the raw feed name for an unlabelled squad, and reports it", () => {
    const { labels, unknown } = resolveTeams(fixtures, { teams: {} });
    expect(labels["379931"]).toBe("Craughwell United");
    expect(unknown).toContain("379931");
    expect(unknown).toContain("234323");
  });

  it("reports every squad it could not label, and only those", () => {
    const { unknown } = resolveTeams(fixtures, { teams: {} });
    expect(unknown.slice().sort()).toEqual(["234323", "379931"]);
  });

  it("reports nothing unknown once every gap is filled", () => {
    const { unknown: gaps } = resolveTeams(fixtures, { teams: {} });
    const config = { teams: Object.fromEntries(gaps.map((id) => [id, { label: `Squad ${id}` }])) };
    expect(resolveTeams(fixtures, config).unknown).toEqual([]);
  });

  // Clearing the box on the site must hand the squad back to derivation rather than
  // pinning it to an empty display name.
  it("treats an empty configured label as no label at all", () => {
    const config = { teams: { "235380": { label: "" }, "379931": { label: "" } } };
    const { labels, unknown } = resolveTeams(fixtures, config);
    expect(labels["235380"]).toBe("U14A Boys");
    expect(unknown).not.toContain("235380");
    expect(labels["379931"]).toBe("Craughwell United");
    expect(unknown).toContain("379931");
  });

  it("survives a missing config and an empty fixture list", () => {
    expect(() => resolveTeams(fixtures, null)).not.toThrow();
    expect(() => resolveTeams(fixtures, undefined)).not.toThrow();
    expect(resolveTeams(fixtures, undefined).unknown).toContain("234323");
    expect(resolveTeams(fixtures, {}).labels["235380"]).toBe("U14A Boys");
    expect(resolveTeams([], null)).toEqual({ labels: {}, unknown: [] });
    expect(resolveTeams([], undefined)).toEqual({ labels: {}, unknown: [] });
  });
});

describe("teamsFromFixtures", () => {
  it("finds every squad once", () => {
    expect(Object.keys(teamsFromFixtures(fixtures))).toHaveLength(TEAM_COUNT);
    expect(teamsFromFixtures(fixtures)["254061"]).toMatchObject({
      ourTeam: "Craughwell United B",
      competition: "GFA Boys U14 Division 4",
    });
  });

  // Fixtures arrive in date order, so the FIRST is the earliest. A squad's later cup
  // entry ("GFA Cup") carries no age or gender; taking the last would blank a label the
  // league round the squad played in August already told us.
  it("keeps the earliest fixture's competition and name for a squad", () => {
    const season = [
      fx({ fid: "s1", teamId: "900014", ourTeam: "Craughwell United",
        competition: "GFA Boys U13 Division 1" }),
      fx({ fid: "s2", teamId: "900014", ourTeam: "Craughwell United B",
        competition: "GFA Cup" }),
    ];
    expect(teamsFromFixtures(season)["900014"]).toEqual({
      ourTeam: "Craughwell United",
      competition: "GFA Boys U13 Division 1",
    });
    expect(deriveLabels(season)["900014"]).toBe("U13 Boys");
  });

  it("returns nothing for an empty fixture list", () => {
    expect(teamsFromFixtures([])).toEqual({});
  });
});

describe("seedConfig", () => {
  it("creates an entry for every squad, labelling what it can", () => {
    const config = seedConfig(fixtures, null);
    expect(Object.keys(config.teams)).toHaveLength(TEAM_COUNT);
    expect(config.teams["235380"].label).toBe("U14A Boys");
    expect(config.teams["379931"].label).toBeNull();
    expect(PALETTE).toContain(config.teams["235380"].color);
  });

  it("stamps the config version", () => {
    expect(seedConfig(fixtures, null).version).toBe(CONFIG_VERSION);
    expect(seedConfig(fixtures, { version: 0, teams: {} }).version).toBe(CONFIG_VERSION);
  });

  it("never overwrites what you already set", () => {
    const existing = { version: 1, teams: { "235380": { label: "My Lads", color: "#000000" } } };
    const config = seedConfig(fixtures, existing);
    expect(config.teams["235380"]).toEqual({ label: "My Lads", color: "#000000" });
  });

  it("adds a squad that appeared since the last run", () => {
    const existing = seedConfig(fixtures, null);
    const withNew = [...fixtures, { ...fixtures[0], fid: "999", teamId: "411902",
      ourTeam: "Craughwell United", competition: "GFA Boys U12 Cup" }];
    const config = seedConfig(withNew, existing);
    expect(config.teams["411902"]).toBeDefined();
    // "GFA Boys U12 Cup" carries both an age and a gender, so this squad IS derivable
    // and seedConfig labels it, exactly as deriveLabels' rule test requires. See the
    // task report: the supplied baseline asserted null here, which contradicts both
    // that rule and "labelling what it can" above.
    expect(config.teams["411902"].label).toBe("U12A Boys");
    expect(PALETTE).toContain(config.teams["411902"].color);
    // Every squad that was already there keeps the entry it had.
    expect(config.teams["235380"]).toEqual(existing.teams["235380"]);
  });

  it("leaves a new squad unlabelled when its competition says too little", () => {
    const existing = seedConfig(fixtures, null);
    const withNew = [...fixtures, fx({ fid: "998", teamId: "411903",
      ourTeam: "Craughwell United", competition: "GFA Junior Cup" })];
    const config = seedConfig(withNew, existing);
    expect(config.teams["411903"]).toBeDefined();
    expect(config.teams["411903"].label).toBeNull();
  });

  it("gives distinct colours to distinct squads", () => {
    // Distinctness is capped by the palette, not the squad count.
    const colors = Object.values(seedConfig(fixtures, null).teams).map((t) => t.color);
    expect(new Set(colors).size).toBe(Math.min(TEAM_COUNT, PALETTE.length));
  });

  it("does not hand a new squad a colour another squad already has", () => {
    const existing = seedConfig(fixtures, null);
    const withNew = [...fixtures, fx({ fid: "997", teamId: "411904",
      ourTeam: "Craughwell United", competition: "GFA Boys U10 Division 1" })];
    const colors = Object.values(seedConfig(withNew, existing).teams).map((t) => t.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("repairs a configured colour that is not a usable hex value", () => {
    // "red" reaches contrastFg as NaN and silently renders white text on an
    // unvalidated background.
    const config = seedConfig(fixtures, { version: 1, teams: { "235380": { label: "X", color: "red" } } });
    expect(config.teams["235380"].label).toBe("X");
    expect(config.teams["235380"].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("repairs every shape of unusable colour, keeping the label", () => {
    const junk = ["red", "", "  ", "#12345", "#1234567", "#GGGGGG", "rgb(1,2,3)", 16711680, null];
    for (const color of junk) {
      const config = seedConfig(fixtures, { version: 1, teams: { "235380": { label: "X", color } } });
      expect(config.teams["235380"].label).toBe("X");
      expect(config.teams["235380"].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(PALETTE).toContain(config.teams["235380"].color);
    }
  });

  it("expands a three-digit hex rather than discarding it", () => {
    const config = seedConfig(fixtures, { version: 1, teams: { "235380": { label: "X", color: "#F00" } } });
    expect(config.teams["235380"].color).toBe("#ff0000");
  });

  it("keeps a six-digit hex that is not in the palette, lowercased", () => {
    const config = seedConfig(fixtures, { version: 1, teams: { "235380": { label: "X", color: " #AB12Cd " } } });
    expect(config.teams["235380"].color).toBe("#ab12cd");
  });

  // The cron seeds every single day. If seeding churned, the club would get a commit a
  // day for nothing, and the site's config diff would stop meaning anything.
  it("is idempotent, byte for byte", () => {
    const once = seedConfig(fixtures, null);
    const twice = seedConfig(fixtures, once);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(JSON.stringify(seedConfig(fixtures, twice))).toBe(JSON.stringify(once));
  });

  // A squad whose season has ended drops out of the fixture list. Losing its label would
  // mean renaming it by hand every time it comes back.
  it("preserves a squad that has left the fixture list", () => {
    const existing = { version: 1, teams: { "111111": { label: "U18 Boys (2025)", color: "#123456" } } };
    const config = seedConfig(fixtures, existing);
    expect(config.teams["111111"]).toEqual({ label: "U18 Boys (2025)", color: "#123456" });
    expect(Object.keys(config.teams)).toHaveLength(TEAM_COUNT + 1);
  });

  it("survives a missing config and an empty fixture list", () => {
    expect(seedConfig([], null)).toEqual({ version: CONFIG_VERSION, teams: {} });
    expect(seedConfig([], undefined)).toEqual({ version: CONFIG_VERSION, teams: {} });
    expect(() => seedConfig(fixtures, undefined)).not.toThrow();
    expect(() => seedConfig(fixtures, {})).not.toThrow();
    expect(Object.keys(seedConfig(fixtures, {}).teams)).toHaveLength(TEAM_COUNT);
  });

  it("does not mutate the config it was given", () => {
    const existing = { version: 1, teams: { "235380": { label: "My Lads", color: "red" } } };
    const before = JSON.stringify(existing);
    seedConfig(fixtures, existing);
    expect(JSON.stringify(existing)).toBe(before);
  });
});
