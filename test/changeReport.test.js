import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { seedConfig, resolveTeams } from "../src/lib/teams.js";
import { diff } from "../src/lib/diff.js";
import { changeReport } from "../src/lib/changeReport.js";

const config = { teams: { "235380": { label: "U14A Boys" } } };

const base = {
  fid: "1", teamId: "235380", date: "2026-08-30", time: "14:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: "Craughwell", competition: "GFA U16 Division 1", comment: "",
};

const moved = {
  type: "moved", fid: "1", teamId: "235380", fixture: { ...base, time: "16:00" },
  from: { date: "2026-08-30", time: "14:00" }, to: { date: "2026-08-30", time: "16:00" },
  comment: "Colemanstown requested kickoff time",
};

const added = {
  type: "added", fid: "2", teamId: "235380",
  fixture: { ...base, fid: "2", date: "2026-09-16", time: "20:15", isHome: false,
    opponent: "Athenry", venue: "Athenry" },
  comment: "",
};

describe("changeReport", () => {
  it("counts the changes in the subject", () => {
    expect(changeReport([moved, added], config).subject)
      .toBe("Craughwell fixtures: 2 changes (1 moved, 1 new)");
  });

  it("uses the singular for one change", () => {
    expect(changeReport([moved], config).subject)
      .toBe("Craughwell fixtures: 1 change (1 moved)");
  });

  it("shows a move as before -> after", () => {
    const { text } = changeReport([moved], config);
    expect(text).toContain("MOVED");
    expect(text).toContain("U14A Boys v St Bernards");
    expect(text).toContain("Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00");
  });

  it("quotes the league's note under the change it explains", () => {
    expect(changeReport([moved], config).text)
      .toContain('League note: "Colemanstown requested kickoff time"');
  });

  it("omits the note line when there is no note", () => {
    expect(changeReport([added], config).text).not.toContain("League note");
  });

  it("groups by type, most disruptive first", () => {
    const { text } = changeReport([added, moved], config);
    expect(text.indexOf("MOVED")).toBeLessThan(text.indexOf("NEW"));
  });

  it("warns when a squad still needs a label", () => {
    const { text } = changeReport([added], config, { unknown: ["411902"], siteUrl: "https://example.com/" });
    expect(text).toContain("1 squad still needs a label");
  });

  it("links back to the site", () => {
    expect(changeReport([moved], config, { siteUrl: "https://example.com/" }).text)
      .toContain("https://example.com/");
  });

  it("returns null for an empty change list, so the caller cannot send an empty email", () => {
    expect(changeReport([], config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hardening. Everything below exists to kill a specific mutant of the module.
// ---------------------------------------------------------------------------

const fx = (over = {}) => ({ ...base, ...over });

const cancelled = {
  type: "cancelled", fid: "9", teamId: "235380",
  fixture: fx({ fid: "9", date: "2026-09-05", time: "10:00" }),
  comment: "Pitch unplayable",
};

const venue = {
  type: "venue", fid: "3", teamId: "235380",
  fixture: fx({ fid: "3", date: "2026-09-12", time: "11:30", venue: "Colemanstown" }),
  from: "Craughwell", to: "Colemanstown", comment: "",
};

const opponent = {
  type: "opponent", fid: "4", teamId: "235380",
  fixture: fx({ fid: "4", date: "2026-09-19", time: "13:00", opponent: "Colga B",
    competition: "GFA U16 Division 2" }),
  from: { opponent: "St Bernards", competition: "GFA U16 Division 1" },
  to: { opponent: "Colga B", competition: "GFA U16 Division 2" },
  comment: "Division regraded",
};

// NOTE the shape: a comment change carries NO `comment` key. diff.js documents why -
// the text IS the change and lives in from/to, so a `comment` key would print it twice.
const note = {
  type: "comment", fid: "5", teamId: "235380",
  fixture: fx({ fid: "5", date: "2026-09-26", time: "15:45", comment: "Bring both kits" }),
  from: "", to: "Bring both kits",
};

describe("changeReport rendering", () => {
  // Kills D: a venue change rendered to -> from sends the secretary to the OLD ground.
  it("shows a venue change as before -> after, in that direction", () => {
    const { text } = changeReport([venue], config);
    expect(text).toContain("VENUE CHANGE");
    expect(text).toContain("Sat 12 Sep 11:30");
    expect(text).toContain("Craughwell  ->  Colemanstown");
    expect(text).not.toContain("Colemanstown  ->  Craughwell");
  });

  // The feed can hand back an empty venue. "(none)" is readable; a bare arrow is not.
  it("writes (none) for an empty side of a venue change", () => {
    const { text } = changeReport([{ ...venue, from: "", to: "Colemanstown" }], config);
    expect(text).toContain("(none)  ->  Colemanstown");
  });

  // Kills H: v and @ are the only thing telling the secretary whose ground it is.
  it("uses v for a home game and @ for an away one", () => {
    expect(changeReport([moved], config).text).toContain("U14A Boys v St Bernards");
    expect(changeReport([added], config).text).toContain("U14A Boys @ Athenry");
    expect(changeReport([added], config).text).not.toContain("U14A Boys v Athenry");
  });

  // Kills I. Reachable for real: a cancelled fixture lives in the PREVIOUS snapshot, so
  // when it was the squad's last one its teamId is absent from labels resolved over the
  // new snapshot. The club's own side must still be named, never rendered as a blank.
  it("falls back to the feed's team name for a squad missing from the resolved labels", () => {
    const gone = {
      type: "cancelled", fid: "77", teamId: "999999",
      fixture: fx({ fid: "77", teamId: "999999", ourTeam: "Craughwell United B" }),
      comment: "",
    };
    const { text } = changeReport([gone], config, { fixtures: [base] });
    expect(text).toContain("Craughwell United B v St Bernards");
    expect(text).not.toContain(" v St Bernards\n  Sun 30 Aug 14:00 - Craughwell\n   v");
    expect(text.split("\n")[1]).toBe("  Craughwell United B v St Bernards");
  });

  // Kills C from the other side, and N: the weekday is what makes a date checkable
  // against what the secretary already told parents.
  it("names the weekday on every date it prints", () => {
    const { text } = changeReport([cancelled, added], config);
    expect(text).toContain("Sat 5 Sep 10:00 - Craughwell");
    expect(text).toContain("Wed 16 Sep 20:15 - Athenry");
  });

  // Coverage 3.
  it("renders a cancellation with its ground and competition", () => {
    expect(changeReport([cancelled], config).text).toBe(
      "CANCELLED\n" +
      "  U14A Boys v St Bernards\n" +
      "  Sat 5 Sep 10:00 - Craughwell\n" +
      "  GFA U16 Division 1\n" +
      '  League note: "Pitch unplayable"',
    );
  });

  // Coverage 2, and the diff.js asymmetry. The note's text must appear ONCE, from
  // from/to - never a second time as a League note line.
  it("renders a note change from from/to and never doubles it as a League note", () => {
    const { text } = changeReport([note], config);
    expect(text).toBe(
      "NOTE\n" +
      "  U14A Boys v St Bernards\n" +
      "  Sat 26 Sep 15:45\n" +
      '  "(none)"  ->  "Bring both kits"',
    );
    expect(text).not.toContain("League note");
  });

  it("shows a note being cleared as -> (none)", () => {
    expect(changeReport([{ ...note, from: "Bring both kits", to: "" }], config).text)
      .toContain('"Bring both kits"  ->  "(none)"');
  });

  it("renders an opponent correction with both competitions", () => {
    const { text } = changeReport([opponent], config);
    expect(text).toContain("CORRECTION");
    expect(text).toContain("St Bernards (GFA U16 Division 1)");
    expect(text).toContain("->  Colga B (GFA U16 Division 2)");
  });
});

describe("changeReport subject", () => {
  // Coverage 4. Kills A and B, and pins the SEVERITY ordering of the summary.
  it("summarises three types in severity order", () => {
    expect(changeReport([added, moved, cancelled], config).subject)
      .toBe("Craughwell fixtures: 3 changes (1 cancelled, 1 moved, 1 new)");
  });

  it("counts every change of a type, not the types", () => {
    const many = [moved, { ...moved, fid: "1b" }, { ...moved, fid: "1c" }, added];
    expect(changeReport(many, config).subject)
      .toBe("Craughwell fixtures: 4 changes (3 moved, 1 new)");
  });

  it("names all six types with the short words a phone can show", () => {
    expect(changeReport([cancelled, moved, venue, opponent, added, note], config).subject)
      .toBe("Craughwell fixtures: 6 changes (1 cancelled, 1 moved, 1 venue change, 1 correction, 1 new, 1 note)");
  });
});

describe("changeReport footer", () => {
  it("names the unlabelled squads and says what happens until they are named", () => {
    expect(changeReport([added], config, { unknown: ["411902"] }).text).toContain(
      "1 squad still needs a label (team 411902). Until then it shows its raw feed name.",
    );
  });

  // Kills K in the plural direction.
  it("pluralises the label warning for more than one squad", () => {
    const { text } = changeReport([added], config, { unknown: ["411902", "500001"] });
    expect(text).toContain("2 squads still need a label (team 411902, 500001).");
    expect(text).not.toContain("2 squad still");
  });

  // Kills J from the other side: no unknowns must mean no warning at all.
  it("says nothing about labels when every squad has one", () => {
    expect(changeReport([added], config, { unknown: [], siteUrl: "https://example.com/" }).text)
      .not.toContain("still needs a label");
  });

  it("omits the site line when no url is given", () => {
    expect(changeReport([added], config).text).not.toContain("Site:");
  });

  it("puts the site link last, after the changes", () => {
    const { text } = changeReport([moved], config, { siteUrl: "https://example.com/" });
    expect(text.endsWith("Site: https://example.com/")).toBe(true);
  });
});

describe("changeReport empty list", () => {
  // Kills L. The caller must not be able to send an email with no changes in it.
  it("returns null, not an object, for no changes", () => {
    expect(changeReport([], config)).toBeNull();
    expect(changeReport([], config, { siteUrl: "https://example.com/" })).toBeNull();
  });

  it("returns null rather than throwing when handed nothing at all", () => {
    expect(changeReport(undefined, config)).toBeNull();
    expect(changeReport(null, config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Correction 1. THE bug this module had to be built around.
// ---------------------------------------------------------------------------
describe("changeReport labels resolved over every fixture", () => {
  const aSide = {
    fid: "10", teamId: "235380", date: "2026-08-29", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "St Bernards", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "",
  };
  const bSide = {
    ...aSide, fid: "11", teamId: "254061", ourTeam: "Craughwell United B",
    opponent: "Cregmore/Claregalway C", venue: "Cregmore", isHome: false,
    competition: "GFA Boys U14 Division 4",
  };
  const bMoved = {
    type: "moved", fid: "11", teamId: "254061",
    fixture: { ...bSide, time: "16:00" },
    from: { date: "2026-08-29", time: "12:00" },
    to: { date: "2026-08-29", time: "16:00" },
    comment: "",
  };

  // Kills M. deriveLabels shows the A/B letter only when the club runs more than one
  // side at that age and gender. Counting over the CHANGED fixtures alone sees one U14
  // Boys side, drops the letter, and the email names the wrong squad - the secretary
  // then corrects the A side's parents about the B side's game.
  it("keeps the B side's letter when only the B side's fixture moved", () => {
    const { text } = changeReport([bMoved], {}, { fixtures: [aSide, bSide] });
    expect(text).toContain("U14B Boys @ Cregmore/Claregalway C");
    expect(text).not.toContain("U14 Boys @");
  });

  it("keeps the A side's letter when only the A side's fixture moved", () => {
    const aMoved = { ...bMoved, fid: "10", teamId: "235380", fixture: { ...aSide, time: "16:00" } };
    const { text } = changeReport([aMoved], {}, { fixtures: [aSide, bSide] });
    expect(text).toContain("U14A Boys v St Bernards");
  });

  // The two-argument call still has to work, just degraded - documented, not a promise.
  it("falls back to the changed fixtures when the caller supplies no fixture list", () => {
    expect(changeReport([bMoved], {}).text).toContain("U14 Boys @ Cregmore/Claregalway C");
  });

  it("still lets a configured label beat derivation", () => {
    const { text } = changeReport([bMoved], { teams: { "254061": { label: "U14 Bs" } } },
      { fixtures: [aSide, bSide] });
    expect(text).toContain("U14 Bs @ Cregmore/Claregalway C");
  });
});

// ---------------------------------------------------------------------------
// Correction 2. Unreachable while normalize.js holds, but this is an email.
// ---------------------------------------------------------------------------
describe("changeReport bad dates", () => {
  it("prints the raw date rather than NaN when a date is not a real one", () => {
    const broken = {
      type: "cancelled", fid: "6", teamId: "235380",
      fixture: fx({ fid: "6", date: "2026-08-32", time: "14:00" }), comment: "",
    };
    const { text } = changeReport([broken], config);
    expect(text).toContain("2026-08-32 14:00 - Craughwell");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("undefined");
  });

  it("prints raw values on both sides of a move with a bad date", () => {
    const broken = {
      ...moved,
      from: { date: "not-a-date", time: "14:00" },
      to: { date: "2026-08-30", time: "16:00" },
    };
    expect(changeReport([broken], config).text)
      .toContain("not-a-date 14:00  ->  Sun 30 Aug 16:00");
  });
});

// ---------------------------------------------------------------------------
// Coverage 6. Long content.
// ---------------------------------------------------------------------------
describe("changeReport long content", () => {
  const longNote =
    "Colemanstown have requested the kickoff be brought forward because their senior " +
    "side has a cup replay on the same pitch that evening, and the referee appointed to " +
    "this game is also appointed to that one";
  const longLabel = "Craughwell United Under 14 Boys Championship Squad B (second string)";

  it("keeps a long league note on one unwrapped, untruncated line", () => {
    const { text } = changeReport([{ ...moved, comment: longNote }], config);
    const lines = text.split("\n");
    expect(lines).toContain(`  League note: "${longNote}"`);
    expect(lines.filter((l) => l.includes("League note"))).toHaveLength(1);
  });

  it("keeps a long squad label on the fixture line without breaking it", () => {
    const { text } = changeReport([moved], { teams: { "235380": { label: longLabel } } });
    expect(text.split("\n")[1]).toBe(`  ${longLabel} v St Bernards`);
    expect(text).toContain("Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00");
  });

  it("keeps a long unknown list on the single footer line", () => {
    const unknown = ["411902", "500001", "500002", "500003", "500004"];
    const { text } = changeReport([added], config, { unknown });
    expect(text.split("\n").filter((l) => l.includes("still need a label"))).toHaveLength(1);
    expect(text).toContain(`(team ${unknown.join(", ")}).`);
  });
});

// ---------------------------------------------------------------------------
// Coverage 1. The golden email. This is the exact text the secretary reads, so it is
// pinned whole: any mutation of a heading, an arrow, an indent or a section order
// shows up here as a diff rather than as a passing test.
// ---------------------------------------------------------------------------
describe("changeReport golden", () => {
  it("renders one of every change type as this exact email", () => {
    const report = changeReport(
      [cancelled, moved, venue, opponent, added, note],
      config,
      { unknown: ["411902", "500001"], siteUrl: "https://example.com/" },
    );

    expect(report.subject).toBe(
      "Craughwell fixtures: 6 changes (1 cancelled, 1 moved, 1 venue change, 1 correction, 1 new, 1 note)",
    );
    expect(report.text).toBe(
`CANCELLED
  U14A Boys v St Bernards
  Sat 5 Sep 10:00 - Craughwell
  GFA U16 Division 1
  League note: "Pitch unplayable"

MOVED
  U14A Boys v St Bernards
  Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00
  League note: "Colemanstown requested kickoff time"

VENUE CHANGE
  U14A Boys v St Bernards
  Sat 12 Sep 11:30
  Craughwell  ->  Colemanstown

CORRECTION
  U14A Boys v Colga B
  Sat 19 Sep 13:00
  St Bernards (GFA U16 Division 1)
  ->  Colga B (GFA U16 Division 2)
  League note: "Division regraded"

NEW
  U14A Boys @ Athenry
  Wed 16 Sep 20:15 - Athenry
  GFA U16 Division 1

NOTE
  U14A Boys v St Bernards
  Sat 26 Sep 15:45
  "(none)"  ->  "Bring both kits"

2 squads still need a label (team 411902, 500001). Until then it shows its raw feed name.

Site: https://example.com/`);
  });

  it("puts two changes of the same type under one heading, blank-line separated", () => {
    const { text } = changeReport([moved, { ...moved, fid: "1b", comment: "" }], config);
    expect(text).toBe(
`MOVED
  U14A Boys v St Bernards
  Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00
  League note: "Colemanstown requested kickoff time"

  U14A Boys v St Bernards
  Sun 30 Aug 14:00  ->  Sun 30 Aug 16:00`);
    expect(text.match(/MOVED/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Coverage 5. The real capture, mutated, through parse -> normalize -> diff -> here.
// The B side's move in this email is exactly the case correction 1 exists for: the
// labels are resolved over the whole snapshot, so it reads "U14B Boys", not "U14 Boys".
// ---------------------------------------------------------------------------
describe("changeReport end to end on the real capture", () => {
  const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
  const { fixtures: prev } = normalizeAll(parse(html).fixtures);
  const today = "2026-08-28";
  const seeded = seedConfig(prev, {});

  // 6951300 is the U14 B side, 6957809 the U14 Girls, 6959215 the U16 Girls.
  const next = prev
    .filter((f) => f.fid !== "6959215")
    .map((f) => {
      if (f.fid === "6951300") {
        return { ...f, time: "16:00", comment: "Colemanstown requested kickoff time" };
      }
      if (f.fid === "6957809") {
        return { ...f, venue: "Colemanstown", comment: "Pitch unplayable at Craughwell" };
      }
      return f;
    })
    .concat([{
      ...prev[0], fid: "7000001", date: "2026-10-03", time: "10:30",
      isHome: false, opponent: "Athenry", venue: "Athenry", comment: "",
    }]);

  const changes = diff(prev, next, today);
  const { unknown } = resolveTeams(next, seeded);
  const report = changeReport(changes, seeded, {
    fixtures: next, unknown, siteUrl: "https://craughwellunited.example/",
  });

  it("produces the subject the secretary sees in his inbox list", () => {
    expect(report.subject)
      .toBe("Craughwell fixtures: 4 changes (1 cancelled, 1 moved, 1 venue change, 1 new)");
  });

  it("produces this exact email body", () => {
    expect(report.text).toBe(
`CANCELLED
  U16 Girls v St Bernards
  Sun 30 Aug 14:00 - Craughwell
  GFA U16 Girls Division 1

MOVED
  U14B Boys @ Cregmore/Claregalway C
  Sat 29 Aug 12:00  ->  Sat 29 Aug 16:00
  League note: "Colemanstown requested kickoff time"

VENUE CHANGE
  U14 Girls @ Colga B
  Sun 30 Aug 12:00
  Clarinbridge  ->  Colemanstown
  League note: "Pitch unplayable at Craughwell"

NEW
  U14A Boys @ Athenry
  Sat 3 Oct 10:30 - Athenry
  GFA Boys U14 Championship 1

2 squads still need a label (team 234323, 379931). Until then it shows its raw feed name.

Site: https://craughwellunited.example/`);
  });

  // The point of correction 1, stated against real data: the club runs two U14 Boys
  // sides, only the B side moved, and the email must still say which one.
  it("names the B side by its letter even though it is the only U14 Boys change", () => {
    expect(report.text).toContain("U14B Boys @");
    expect(report.text).not.toContain("U14 Boys @");
  });

  it("says nothing when the snapshot has not moved", () => {
    expect(changeReport(diff(prev, prev, today), seeded, { fixtures: prev })).toBeNull();
  });

  it("agrees the verb with the number of unlabelled squads", () => {
    const one = changeReport([added], config, { unknown: ["411902"] }).text;
    const two = changeReport([added], config, { unknown: ["234323", "379931"] }).text;
    expect(one).toContain("1 squad still needs a label");
    expect(two).toContain("2 squads still need a label");
    expect(two).not.toContain("squads still needs");
  });
});
