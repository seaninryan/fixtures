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
    expect(html).toContain("public/data/teams.json");
  });
});
