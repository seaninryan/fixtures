import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnnouncementTab from "../src/components/AnnouncementTab.jsx";
import ResultsTab from "../src/components/ResultsTab.jsx";
import ChangesTab from "../src/components/ChangesTab.jsx";
import SquadsTab from "../src/components/SquadsTab.jsx";
import FormTab from "../src/components/FormTab.jsx";
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
