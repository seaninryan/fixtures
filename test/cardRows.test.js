// test/cardRows.test.js
import { describe, it, expect } from "vitest";
import { fixtureRows, resultRows, cardLabels } from "../src/lib/cardRows.js";

const labels = { "11": "U15A Boys", "12": "U15B Boys", "20": "U15 Girls" };

const fx = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-10-31", time: "12:00", isHome: true,
  ourTeam: "Craughwell United", opponent: "Knocknacarra", venue: "Craughwell",
  competition: "GFA Boys U15", comment: "", ...over,
});
const rs = (over = {}) => ({
  fid: "1", teamId: "11", date: "2026-10-31", isHome: true,
  ourTeam: "Craughwell United", opponent: "Knocknacarra", ourScore: 0, theirScore: 1,
  venue: "Craughwell", competition: "GFA Boys U15", ...over,
});

describe("fixtureRows", () => {
  it("bolds the squad and writes v for home", () => {
    expect(fixtureRows([fx()], labels)[0]).toMatchObject({
      id: "1", date: "2026-10-31", time: "12:00", chip: "12:00",
      segments: [{ text: "U15A Boys", bold: true }, { text: " v Knocknacarra", bold: false }],
    });
  });

  it("writes @ for away", () => {
    const row = fixtureRows([fx({ isHome: false, opponent: "Oughterard" })], labels)[0];
    expect(row.segments[1].text).toBe(" @ Oughterard");
  });

  it("names the ground when a home game is played elsewhere", () => {
    const row = fixtureRows([fx({ venue: "Athenry" })], labels)[0];
    expect(row.segments[1].text).toBe(" v Knocknacarra (at Athenry)");
  });

  it("drops the ground for a game the owner hid it on, and only that game", () => {
    const rows = fixtureRows([fx({ fid: 7, venue: "Kiltullagh," }), fx({ fid: 8, venue: "Athenry" })],
      labels, undefined, ["7"]);
    expect(rows[0].segments[1].text).toBe(" v Knocknacarra");
    expect(rows[1].segments[1].text).toBe(" v Knocknacarra (at Athenry)");
  });

  // The UI offers the switch only where a note exists, and must still offer it once hidden.
  it("reports whether a row has a venue note and whether it is hidden", () => {
    const [hidden, shown, none] = fixtureRows(
      [fx({ fid: "7", venue: "Kiltullagh," }), fx({ fid: "8", venue: "Athenry" }), fx({ fid: "9" })],
      labels, undefined, ["7"]);
    expect(hidden.meta).toMatchObject({ venueNote: " (at Kiltullagh,)", venueHidden: true });
    expect(shown.meta).toMatchObject({ venueNote: " (at Athenry)", venueHidden: false });
    expect(none.meta).toMatchObject({ venueNote: "", venueHidden: false });
  });

  it("falls back to the feed name for an unlabelled squad", () => {
    expect(fixtureRows([fx({ teamId: "99" })], labels)[0].segments[0].text)
      .toBe("Craughwell United");
  });
});

describe("resultRows", () => {
  it("home: our label and OUR score bold, home side first", () => {
    expect(resultRows([rs({ ourScore: 5, theirScore: 0, opponent: "Gort" })], labels)[0].segments)
      .toEqual([{ text: "U15A Boys 5", bold: true }, { text: "-0 Gort", bold: false }]);
  });

  it("away: opponent first, our score and label bold", () => {
    const row = resultRows([rs({ teamId: "20", isHome: false, opponent: "Gort", ourScore: 1, theirScore: 1 })], labels)[0];
    expect(row.segments).toEqual([{ text: "Gort 1-", bold: false }, { text: "1 U15 Girls", bold: true }]);
  });

  it("home loss: our score is still the bold one", () => {
    expect(resultRows([rs({ ourScore: 0, theirScore: 3, opponent: "Gort" })], labels)[0].segments)
      .toEqual([{ text: "U15A Boys 0", bold: true }, { text: "-3 Gort", bold: false }]);
  });

  it("away win: opponent's lower score first, ours bold", () => {
    expect(resultRows([rs({ isHome: false, ourScore: 4, theirScore: 2, opponent: "Gort" })], labels)[0].segments)
      .toEqual([{ text: "Gort 2-", bold: false }, { text: "4 U15A Boys", bold: true }]);
  });

  it("has no time chip", () => {
    expect(resultRows([rs()], labels)[0].chip).toBeNull();
  });
});

describe("cardLabels", () => {
  // The bug that has happened three times: labels resolved over a filtered subset drop
  // the A/B letter. cardLabels takes ALL fixtures and only ever fills gaps.
  it("keeps the A/B letter when only one of the pair is in the window", () => {
    const all = [
      fx({ fid: "1", teamId: "11", competition: "GFA Boys U15 Div 1" }),
      fx({ fid: "2", teamId: "12", competition: "GFA Boys U15 Div 2" }),
    ];
    const config = { version: 1, teams: {} };
    const l = cardLabels(all, config, ["11"]);
    expect(l["11"]).not.toBe(cardLabels([all[0]], config, ["11"])["11"]);
  });

  it("names a squad that has left the fixture list from config", () => {
    const config = { version: 1, teams: { "77": { label: "U18 Girls" } } };
    expect(cardLabels([], config, ["77"])["77"]).toBe("U18 Girls");
  });
});

describe("opponent names and meta", () => {
  const config = { opponents: { "Team X Junior Men's Team": "Team X" } };

  it("fixture rows show the cleaned or renamed opponent", () => {
    expect(fixtureRows([fx({ opponent: "Knocknacarra D" })], labels, config)[0].segments[1].text)
      .toBe(" v Knocknacarra");
    expect(fixtureRows([fx({ opponent: "Team X Junior Men's Team" })], labels, config)[0].segments[1].text)
      .toBe(" v Team X");
  });

  it("result rows show the cleaned opponent on both sides", () => {
    expect(resultRows([rs({ opponent: "Gort B" })], labels, config)[0].segments[1].text).toBe("-1 Gort");
    expect(resultRows([rs({ opponent: "Gort B", isHome: false })], labels, config)[0].segments[0].text).toBe("Gort 1-");
  });

  it("a hand-entered result keeps the name as typed", () => {
    expect(resultRows([rs({ opponent: "Gort B", manual: true })], labels, config)[0].segments[1].text).toBe("-1 Gort B");
  });

  it("rows carry meta for the section UI", () => {
    expect(fixtureRows([fx({ opponent: "Knocknacarra D" })], labels, config)[0].meta).toEqual({
      label: "U15A Boys", versus: "v", opponentRaw: "Knocknacarra D", opponent: "Knocknacarra",
      score: null, editable: true, venueNote: "", venueHidden: false,
    });
    expect(resultRows([rs({ opponent: "Gort B", manual: true })], labels, config)[0].meta).toMatchObject({
      score: "0-1", editable: false,
    });
  });
});
