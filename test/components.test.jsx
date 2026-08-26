import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AnnouncementTab from "../src/components/AnnouncementTab.jsx";
import ChangesTab from "../src/components/ChangesTab.jsx";
import SquadsTab from "../src/components/SquadsTab.jsx";

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
