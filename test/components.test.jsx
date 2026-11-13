import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnnouncementTab from "../src/components/AnnouncementTab.jsx";
import ResultsTab from "../src/components/ResultsTab.jsx";
import ChangesTab from "../src/components/ChangesTab.jsx";
import SquadsTab from "../src/components/SquadsTab.jsx";
import FormTab from "../src/components/FormTab.jsx";
import GraphicsTab from "../src/components/GraphicsTab.jsx";
import ConfigSave from "../src/components/ConfigSave.jsx";
import { setOpponent } from "../src/lib/opponents.js";
import { roundup } from "../src/lib/results.js";

const config = { version: 1, teams: { "235380": { label: "U14A Boys", color: "#1f6feb" } } };
const fixtures = [{
  fid: "1", teamId: "235380", date: "2026-08-29", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "",
}];

describe("AnnouncementTab", () => {
  it("renders the announcement text", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("U14A Boys v St Bernards");
  });

  // The colour lives BESIDE the line, never in it. An emoji prefix would ride along
  // into every pasted WhatsApp message; a swatch in the gutter cannot.
  it("shows each squad's colour beside its fixture line", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toContain('style="background:#1f6feb"');
  });

  it("keeps the swatch empty, so selecting the text cannot pick it up", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toMatch(/<span[^>]*class="swatch"[^>]*><\/span>/);
    expect(html).toContain('aria-hidden="true"');
  });

  it("puts no emoji in the announcement text", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).not.toContain("Colour squares");
  });

  it("offers every window", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("This weekend");
    expect(html).toContain("All");
  });
});

const resultsFixture = [{
  fid: "1", teamId: "11", date: "2026-08-29", isHome: true,
  ourTeam: "Craughwell United", opponent: "St Bernards",
  ourScore: 1, theirScore: 0, venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1",
}];

const resultsSquadFixtures = [{
  fid: "90", teamId: "11", date: "2026-09-05", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
  competition: "GFA Boys U14 Championship 1", comment: "",
}];

const resultsConfig = { version: 1, teams: { "11": { label: "U14A Boys", color: "#d9c53c" } } };

describe("ResultsTab", () => {
  it("renders a result line with its squad label", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsSquadFixtures} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toContain("U14A Boys 1-0 St Bernards");
    expect(html).toContain("SATURDAY 29 AUGUST");
  });

  it("says the store could not be loaded rather than claiming nobody played", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={null} fixtures={[]} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toMatch(/could not/i);
    expect(html).not.toMatch(/No results in this window/);
  });

  it("distinguishes an empty store from a failed one", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: [] }}
                  fixtures={[]} config={resultsConfig} today="2026-08-31" />,
    );
    expect(html).toMatch(/No results/);
    expect(html).not.toMatch(/could not/i);
  });

  // fid "77" deliberately has no matching entry in resultsFixture (fid "1").
  const resultsPendingFixtures = [{
    fid: "77", teamId: "11", date: "2026-08-30", time: "18:30", isHome: false,
    ourTeam: "Craughwell United", opponent: "Colga", venue: "Colga",
    competition: "GFA Boys U14 Championship 1", comment: "",
  }];
  const nowAfter = { date: "2026-08-31", time: "09:00" };

  it("lists a played game that has no result yet", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsPendingFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html).toContain("No result yet");
    expect(html).toContain("U14A Boys @ Colga");
  });

  it("shows no pending section when every played game has a result", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsSquadFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html).not.toContain("No result yet");
  });

  // The pending card must sit AFTER the copyable one, and outside it. The copied text is
  // built from roundupLines alone, so a pending line can never reach the clipboard.
  it("keeps the pending section outside the copyable card", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={{ version: 1, results: resultsFixture }}
                  fixtures={resultsPendingFixtures} config={resultsConfig}
                  today="2026-08-31" now={nowAfter} />,
    );
    expect(html.indexOf("No result yet"))
      .toBeGreaterThan(html.indexOf('class="card announcement"'));
    expect(roundup(resultsFixture, resultsConfig, "Last 7 days", "2026-08-31",
                   resultsPendingFixtures)).not.toContain("Colga");
  });

  it("renders no pending section when the store could not be loaded", () => {
    const html = renderToStaticMarkup(
      <ResultsTab results={null} fixtures={resultsPendingFixtures}
                  config={resultsConfig} today="2026-08-31" now={nowAfter} />,
    );
    expect(html).not.toContain("No result yet");
    expect(html).toMatch(/could not/i);
  });
});

const formFixtures = [
  { fid: "f1", teamId: "11", date: "2026-09-12", time: "12:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", venue: "Craughwell",
    competition: "GFA Boys U14 Championship 1", comment: "" },
  { fid: "f2", teamId: "22", date: "2026-09-12", time: "14:00", isHome: true,
    ourTeam: "Craughwell United B", opponent: "Y", venue: "Craughwell",
    competition: "GFA Boys U14 Division 4", comment: "" },
  { fid: "f3", teamId: "33", date: "2026-09-13", time: "11:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "Z", venue: "Craughwell",
    competition: "GFA Boys U13 Championship 1", comment: "" },
];

const formResults = [
  { fid: "r1", teamId: "11", date: "2026-09-05", isHome: true,
    ourTeam: "Craughwell United", opponent: "X", ourScore: 2, theirScore: 1,
    venue: "Craughwell", competition: "GFA Boys U14 Championship 1" },
  { fid: "r2", teamId: "33", date: "2026-09-05", isHome: false,
    ourTeam: "Craughwell United", opponent: "Z", ourScore: 0, theirScore: 4,
    venue: "Away", competition: "GFA Boys U13 Championship 1" },
];

// Squad 33 carries #080080 AND has a result, so it lands in the default selection - which
// is what makes the "no invisible stroke" test in Task 8 meaningful rather than vacuous.
// Squad 22 is the never-played one, for the dashes test.
const formConfig = { version: 1, teams: {
  "11": { label: "U14A Boys", color: "#d9c53c" },
  "22": { label: "U14B Boys", color: "#b95ad9" },
  "33": { label: "U13 Boys", color: "#080080" },
} };

// The squad's row in the form table. The labels appear in the chart and its legend too,
// so every table assertion has to start from the table itself.
function tableRow(html, label) {
  const table = html.slice(html.indexOf('class="form-table"'));
  return table.slice(table.indexOf(label)).split("</tr>")[0];
}

describe("FormTab", () => {
  const render = (over = {}) => renderToStaticMarkup(
    <FormTab results={{ version: 1, results: formResults }} fixtures={formFixtures}
             config={formConfig} today="2026-09-07" {...over} />,
  );

  it("renders a squad's season record", () => {
    const html = render();
    expect(html).toContain("U14A Boys");
    expect(html).toContain("3.00"); // one win, one game
  });

  // A squad that has not played must never render as 0.00, which reads as "lost every
  // game". Asserted on that squad's ROW, not the whole page: U13 Boys played and lost
  // 0-4, so a legitimate 0.00 exists elsewhere in the table.
  it("renders dashes, not zeros, for a squad that has not played", () => {
    // Scoped to the TABLE: the squad labels also appear in the chart legend above it,
    // so a bare indexOf would find the wrong occurrence.
    const row = tableRow(render(), "U14B Boys");
    expect(row).toContain("\u2014");
    expect(row).not.toMatch(/\d\.\d\d/);
  });

  // The other half of the same rule: a squad that DID play and took nothing shows a real
  // 0.00. Without this, "dashes everywhere" would pass the test above and be wrong.
  it("renders a real 0.00 for a squad that played and took no points", () => {
    expect(tableRow(render(), "U13 Boys")).toContain("0.00");
  });

  it("says the store could not be loaded rather than claiming nobody played", () => {
    const html = render({ results: null });
    expect(html).toMatch(/could not/i);
  });

  it("distinguishes an empty store from a failed one", () => {
    const html = render({ results: { version: 1, results: [] } });
    expect(html).toMatch(/No results yet/i);
    expect(html).not.toMatch(/could not/i);
  });

  // The invariant, at the component boundary.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const html = render({ config: bare });
    expect(html).toContain("U14A Boys");
    expect(html).toContain("U14B Boys");
  });

  it("draws one path per selected squad", () => {
    const html = render();
    // Two squads have played, so the default selection is those two.
    expect(html.match(/<path[^>]*class="series"/g)).toHaveLength(2);
  });

  it("offers both windows and both modes", () => {
    const html = render();
    expect(html).toContain("Last 5 weeks");
    expect(html).toContain("Full season");
    expect(html).toContain("Weekly points");
    expect(html).toContain("Cumulative");
  });

  it("lists every squad as a checkbox, so the list doubles as the legend", () => {
    const html = render();
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain("U14A Boys");
    expect(html).toContain("U14B Boys");
  });

  // Identity must not rest on colour alone: every point carries a native tooltip.
  it("gives each plotted point a title naming the squad, the week and the value", () => {
    const html = render();
    expect(html).toMatch(/<title>U14A Boys/);
  });

  // A dark squad colour is invisible as a line on the card, so the chart must not use
  // the raw chip colour. #080080 is 1.03:1 against #182029. Squad 33 owns it and has a
  // result, so it IS selected by default - without that this test would pass vacuously.
  it("does not stroke a line in a colour that is invisible on the card", () => {
    const html = render();
    expect(html).toContain("U13 Boys");           // the squad is on the chart
    expect(html).not.toContain('stroke="#080080"'); // but not in its chip colour
  });

  it("renders no chart when the store is empty", () => {
    const html = render({ results: { version: 1, results: [] } });
    expect(html).not.toContain('class="series"');
    expect(html).toMatch(/No results yet/i);
  });

  it("renders a sort button for every column", () => {
    const html = render();
    const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(header.match(/<button/g)).toHaveLength(10);
    expect(header).toContain("Squad");
    expect(header).toContain("PPG");
  });

  // The default this feature exists for: best points-per-game first.
  it("opens sorted by points per game, descending", () => {
    const html = render();
    const body = html.slice(html.indexOf("<tbody"));
    // U14A Boys 3.00 beats U13 Boys 0.00; U14B Boys has not played and sinks last.
    expect(body.indexOf("U14A Boys")).toBeLessThan(body.indexOf("U13 Boys"));
    expect(body.indexOf("U14B Boys")).toBeGreaterThan(body.indexOf("U13 Boys"));
  });

  // Identity of the sorted column must not be conveyed by an arrow glyph alone.
  it("marks the sorted column with aria-sort and leaves the others none", () => {
    const html = render();
    const header = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
    expect(header.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(header.match(/aria-sort="none"/g)).toHaveLength(9);
  });

  // Now that the tab opens on a ranking, the caveat has to be readable before the
  // numbers rather than after them.
  it("puts the divisions caveat above the table", () => {
    const html = render();
    expect(html.indexOf("different divisions")).toBeLessThan(html.indexOf("form-table"));
  });
});

describe("ChangesTab", () => {
  it("says so when nothing has ever changed", () => {
    expect(renderToStaticMarkup(<ChangesTab history={[]} config={config} />))
      .toContain("No changes recorded");
  });

  it("renders a recorded change", () => {
    const history = [{ checkedAt: "2026-08-25T06:00:00Z", changes: [{
      type: "moved", fid: "1", teamId: "235380", fixture: fixtures[0],
      from: { date: "2026-08-29", time: "12:00" }, to: { date: "2026-08-29", time: "16:00" },
      comment: "",
    }] }];
    const html = renderToStaticMarkup(<ChangesTab history={history} config={config} />);
    expect(html).toContain("MOVED");
    expect(html).toContain("U14A Boys");
  });

  // The invariant that has bitten announce.js, changeReport.js and runCheck's call site:
  // deriveLabels only shows the A/B letter when the club runs more than one side at that
  // age and gender, so labels resolved over one run's changes silently rename a squad.
  it("keeps the A/B letter by resolving labels over every fixture", () => {
    const bare = { version: 1, teams: {} };
    const aSide = { ...fixtures[0], fid: "1", teamId: "A1", ourTeam: "Craughwell United" };
    const bSide = { ...fixtures[0], fid: "2", teamId: "B1", ourTeam: "Craughwell United B" };
    const history = [{ checkedAt: "2026-08-25T06:00:00Z", changes: [{
      type: "venue", fid: "2", teamId: "B1", fixture: bSide, comment: "",
      from: "Ros A Mhil", to: "Carraroe Astro",
    }] }];
    const html = renderToStaticMarkup(
      <ChangesTab history={history} fixtures={[aSide, bSide]} config={bare} />,
    );
    expect(html).toContain("U14B Boys");
  });
});

describe("ChangesTab opponent names", () => {
  const lettered = { ...fixtures[0], opponent: "Knocknacarra D" };

  it("shows a cleaned opponent on the fixture line", () => {
    const history = [{ checkedAt: "2026-08-25T06:00:00Z", changes: [{
      type: "moved", fid: "1", teamId: "235380", fixture: lettered,
      from: { date: "2026-08-29", time: "12:00" }, to: { date: "2026-08-29", time: "16:00" },
      comment: "",
    }] }];
    const html = renderToStaticMarkup(<ChangesTab history={history} config={config} />);
    expect(html).toContain("v Knocknacarra<");
    expect(html).not.toContain("Knocknacarra D");
  });

  it("keeps the RAW names in an opponent change's summary", () => {
    const history = [{ checkedAt: "2026-08-25T06:00:00Z", changes: [{
      type: "opponent", fid: "1", teamId: "235380", fixture: lettered, comment: "",
      from: { opponent: "Knocknacarra C", competition: "X" },
      to: { opponent: "Knocknacarra D", competition: "X" },
    }] }];
    const html = renderToStaticMarkup(<ChangesTab history={history} config={config} />);
    expect(html).toContain("Knocknacarra C → Knocknacarra D");
  });
});

describe("SquadsTab", () => {
  it("lists every squad with its label", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} onChange={() => {}} />,
    );
    expect(html).toContain("U14A Boys");
    expect(html).toContain("235380");
  });

  it("links to the file's edit page on GitHub", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} onChange={() => {}} />,
    );
    expect(html).toContain("github.com");
    // teams.json lives in the DATA repo now, at its root - not in this repo's public/.
    expect(html).toContain("fixtures-data/edit/main/teams.json");
  });
});

describe("both sources together", () => {
  it("renders an announcement containing Galway and FAI squads", () => {
    const union = [
      ...fixtures,
      { fid: "fai:52005172", teamId: "fai:61270", date: "2026-08-29", time: "14:00",
        isHome: false, ourTeam: "Craughwell United Juniors", opponent: "Renmore FC",
        venue: "", competition: "Western Hygiene Supplies Brod Trill Mens Premier League",
        comment: "" },
    ];
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={union} config={config} today="2026-08-25" />,
    );
    expect(html).toContain("U14A Boys v St Bernards");
    expect(html).toContain("Renmore FC");
  });
});

describe("SquadsTab editing help", () => {
  it("explains the edit loop and that the cache delay is not a failed save", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} onChange={() => {}} />,
    );
    // The three things someone actually gets wrong: that nothing saves by itself, that a
    // typed label survives the daily run, and that a slow reload is not a lost edit.
    expect(html).toContain("cannot write to the data");
    expect(html).toContain("never overwrites");
    expect(html).toContain("not a failed save");
  });
});

describe("GraphicsTab", () => {
  const now = { date: "2026-08-25", time: "10:00" };

  it("renders a preview for fixtures in the window", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-25" now={now} />,
    );
    expect(html).toContain("<canvas");
    expect(html).toContain("fixtures-2026-08-29-4x5.png");
  });

  it("lists rows with a Leave off control", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-25" now={now} />,
    );
    expect(html).toContain("U14A Boys");
    expect(html).toContain("Leave off");
  });

  it("lists each card's games under it, with the opponent editable", () => {
    const two = [
      { ...fixtures[0], fid: "1", date: "2026-08-29", opponent: "Knocknacarra D" },
      { ...fixtures[0], fid: "2", date: "2026-08-30", opponent: "Team X Junior Men's Team" },
    ];
    const cfg = { ...config, opponents: { "Team X Junior Men's Team": "Team X" } };
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={two} awaiting={[]} results={{ results: [] }} config={cfg} savedConfig={cfg}
                   onConfigChange={() => {}} today="2026-08-25" now={{ date: "2026-08-25", time: "10:00" }} />,
    );
    expect(html).toContain('class="cardrows"');
    expect(html).toContain('value="Knocknacarra"');
    expect(html).toContain('value="Team X"');
    expect(html).toContain('title="League name: Knocknacarra D"');
    expect(html).not.toContain(">Rows<");
  });

  it("shows the unsaved bar when renames differ from teams.json", () => {
    const cfg = { ...config, opponents: { "St Bernards": "Bernards" } };
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }} config={cfg} savedConfig={config}
                   onConfigChange={() => {}} today="2026-08-25" now={{ date: "2026-08-25", time: "10:00" }} />,
    );
    expect(html).toContain("1 unsaved name change");
  });

  // A pre-filled pending game is shown - and stored, once scored - under its display
  // name, or the hand-entered card would say "Knocknacarra D" beside an official
  // "Knocknacarra".
  it("shows a pending game's opponent by its display name", () => {
    const lettered = [{ ...fixtures[0], opponent: "Knocknacarra D" }];
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={lettered} awaiting={[]} results={{ results: [] }} config={config}
                   today="2026-08-30" now={{ date: "2026-08-30", time: "10:00" }} initialKind="Results" />,
    );
    expect(html).toContain("U14A Boys v Knocknacarra — 2026-08-29");
    expect(html).not.toContain("Knocknacarra D —");
  });

  it("says so when the results could not be loaded", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={null}
                   config={config} today="2026-08-25" now={now} initialKind="Results" />,
    );
    expect(html).toContain("Could not load the results");
  });

  it("renders a results card and offers a played game for a hand-entered score", () => {
    const played = { date: "2026-08-30", time: "10:00" };
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]}
                   results={{ results: [{ ...fixtures[0], fid: "2", date: "2026-08-28", ourScore: 3, theirScore: 1 }] }}
                   config={config} today="2026-08-30" now={played} initialKind="Results" />,
    );
    expect(html).toContain("results-2026-08-28-4x5.png");
    // The card's own section lists the game, score included.
    expect(html).toContain('value="St Bernards"');
    expect(html).toContain('<span class="dim"> 3-1</span>');
    expect(html).toContain("U14A Boys v St Bernards — 2026-08-29");
  });

  // Nothing is drawn or downloadable until the card fonts are confirmed: a PNG in the
  // fallback face, fitted to widths measured for another font, must never be saved.
  it("keeps every download disabled until the fonts have loaded", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-25" now={now} />,
    );
    expect(html).toMatch(/<button class="primary" disabled="">Download all/);
    expect(html).toMatch(/<button class="chip" disabled="">Download both shapes/);
    expect(html).toMatch(/<button class="chip" disabled="">Download<\/button>/);
  });

  it("disables Add until both scores are numbers, so nothing fails silently", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }}
                   config={config} today="2026-08-30" now={{ date: "2026-08-30", time: "10:00" }}
                   initialKind="Results" />,
    );
    expect(html).not.toMatch(/<button class="chip">Add<\/button>/);
    expect(html).toMatch(/<button class="chip" disabled="">Add<\/button>/);
  });

  it("offers a squad from the results in the dropdown even with no fixtures left", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={[]} awaiting={[]}
                   results={{ results: [{ ...fixtures[0], fid: "3", date: "2026-08-28", ourScore: 1, theirScore: 0 }] }}
                   config={config} today="2026-08-30" now={{ date: "2026-08-30", time: "10:00" }}
                   initialKind="Results" />,
    );
    expect(html).toContain('<option value="235380">U14A Boys</option>');
  });
});

// The bar's own wording, not the word "unsaved", which the cache note also uses.
const UNSAVED_BAR = /<b>(\d+ unsaved name changes?|Unsaved changes)<\/b>/;

describe("ConfigSave", () => {
  const saved = { version: 1, teams: {} };

  it("says nothing is unsaved when the config matches", () => {
    const html = renderToStaticMarkup(<ConfigSave config={saved} savedConfig={saved} />);
    expect(html).toContain("Copy JSON");
    expect(html).not.toMatch(UNSAVED_BAR);
  });

  it("counts unsaved opponent renames", () => {
    const edited = { ...saved, opponents: { "Gort B": "Gort Utd", "Team X Junior": "Team X" } };
    const html = renderToStaticMarkup(<ConfigSave config={edited} savedConfig={saved} />);
    expect(html).toContain("2 unsaved name changes");
  });

  // seedConfig omits an empty `opponents`, so a rename added then cleared must leave the
  // config byte-identical to teams.json - not carrying a phantom `opponents: {}`.
  it("is not dirty after a rename is added and cleared again", () => {
    const roundTrip = setOpponent(setOpponent(saved, "Gort B", "Gort Utd"), "Gort B", "");
    const html = renderToStaticMarkup(<ConfigSave config={roundTrip} savedConfig={saved} />);
    expect(html).not.toMatch(UNSAVED_BAR);
  });
});

describe("ConfigSave review fixes", () => {
  it("ignores key order when deciding what is unsaved", () => {
    const saved = { version: 1, teams: {}, opponents: { "A X": "Alpha", "B Y": "Beta" } };
    const edited = { teams: {}, version: 1, opponents: { "B Y": "Beta", "A X": "Alpha" } };
    const html = renderToStaticMarkup(<ConfigSave config={edited} savedConfig={saved} />);
    expect(html).not.toMatch(UNSAVED_BAR);
  });

  // Copy JSON here would paste an empty squad list over the real teams.json.
  it("offers no copy when teams.json could not be loaded", () => {
    const html = renderToStaticMarkup(<ConfigSave config={{ version: 1, teams: {} }} savedConfig={null} />);
    expect(html).toContain("teams.json could not be loaded");
    expect(html).not.toContain("Copy JSON");
  });

  it("tells the owner to reload after a Sync now", () => {
    const html = renderToStaticMarkup(<ConfigSave config={{ version: 1 }} savedConfig={{ version: 1 }} />);
    expect(html).toContain("If you used Sync now after saving, reload the page");
  });
});

describe("editing while teams.json failed to load", () => {
  const now = { date: "2026-08-25", time: "10:00" };

  it("disables the opponent inputs on the Graphics tab", () => {
    const html = renderToStaticMarkup(
      <GraphicsTab fixtures={fixtures} awaiting={[]} results={{ results: [] }} config={config} savedConfig={null}
                   onConfigChange={() => {}} today="2026-08-25" now={now} />,
    );
    expect(html).toMatch(/<input class="opp"[^>]* disabled=""/);
    expect(html).toContain("teams.json could not be loaded");
  });

  it("disables the Squads tab inputs", () => {
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={config} savedConfig={null} onChange={() => {}} />,
    );
    expect(html).toMatch(/<input type="color"[^>]* disabled=""/);
    expect(html).toMatch(/<input class="label-input"[^>]* disabled=""/);
  });
});

describe("SquadsTab opponents", () => {
  it("lists opponent renames raw -> shown", () => {
    const cfg = { ...config, opponents: { "Team X Junior Men's Team": "Team X" } };
    const html = renderToStaticMarkup(
      <SquadsTab fixtures={fixtures} config={cfg} savedConfig={cfg} onChange={() => {}} />,
    );
    expect(html).toContain("Opponent names");
    expect(html).toContain("Team X Junior Men&#x27;s Team");
    expect(html).toContain("Team X");
  });
});

describe("AnnouncementTab duplicate note", () => {
  const dup = {
    fid: "7035325", teamId: "234323", date: "2026-11-14", time: "14:00", isHome: true,
    ourTeam: "Craughwell United", opponent: "Mervue Utd", venue: "Craughwell",
    competition: "FAI Junior Cup", comment: "",
  };
  const cfg = { version: 1, teams: { "234323": { label: "U21 Men", color: "#e5484d" } } };

  it("says which Galway FA fixture was hidden", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-13" />,
    );
    expect(html).toContain("Hidden 1 Galway FA fixture that duplicates an FAI Connect one");
    expect(html).toContain("Sat 14 Nov 14:00  U21 Men v Mervue Utd");
  });

  it("pluralises", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup, { ...dup, fid: "2", time: "16:00" }]}
                       config={cfg} today="2026-11-13" />,
    );
    expect(html).toContain("Hidden 2 Galway FA fixtures that duplicate FAI Connect ones");
  });

  it("leaves out a hidden game that has already been played", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-15" />,
    );
    expect(html).not.toContain("Hidden");
  });

  it("renders no note when nothing was hidden", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={fixtures} config={config} today="2026-08-25" />,
    );
    expect(html).not.toContain("Hidden");
  });

  // The note explains the page; it is not part of what gets posted.
  it("keeps the note out of the announcement card", () => {
    const html = renderToStaticMarkup(
      <AnnouncementTab fixtures={[]} hidden={[dup]} config={cfg} today="2026-11-13" />,
    );
    const card = html.slice(html.indexOf('class="card announcement"'));
    expect(card).not.toContain("Hidden");
  });
});
