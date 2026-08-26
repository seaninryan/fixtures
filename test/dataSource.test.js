import { describe, it, expect } from "vitest";
import {
  DATA_REPO, DATA_BRANCH, DEFAULT_DATA_URL, EDIT_TEAMS_URL, dataUrl,
} from "../src/lib/dataSource.js";

describe("DEFAULT_DATA_URL", () => {
  it("reads from the data repo, not from this one", () => {
    expect(DEFAULT_DATA_URL).toContain("fixtures-data");
    expect(DEFAULT_DATA_URL).not.toContain("/fixtures/");
  });

  // raw.githubusercontent.com is the only github.com host that sends
  // Access-Control-Allow-Origin: *. github.com/<owner>/<repo>/raw/... redirects to it
  // but the redirect itself carries no CORS headers, so the browser refuses it.
  it("uses the host that sends CORS headers", () => {
    expect(DEFAULT_DATA_URL.startsWith("https://raw.githubusercontent.com/")).toBe(true);
  });

  it("names the branch it reads", () => {
    expect(DEFAULT_DATA_URL).toContain(`/${DATA_BRANCH}/`);
  });

  it("ends in a slash so joining cannot swallow a path segment", () => {
    expect(DEFAULT_DATA_URL.endsWith("/")).toBe(true);
  });
});

describe("dataUrl", () => {
  it("joins the file onto the default base", () => {
    expect(dataUrl("latest.json"))
      .toBe(`https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/latest.json`);
  });

  // The override is how `npm run dev` points at a local copy, and it is typed by hand
  // in a .env file, so a missing trailing slash must not silently produce
  // ".../datalatest.json".
  it("tolerates an override with no trailing slash", () => {
    expect(dataUrl("teams.json", "/fixtures/data")).toBe("/fixtures/data/teams.json");
  });

  it("honours an override that has one", () => {
    expect(dataUrl("teams.json", "/fixtures/data/")).toBe("/fixtures/data/teams.json");
  });
});

describe("EDIT_TEAMS_URL", () => {
  it("deep links to teams.json in the data repo", () => {
    expect(EDIT_TEAMS_URL)
      .toBe(`https://github.com/${DATA_REPO}/edit/${DATA_BRANCH}/teams.json`);
  });
});
