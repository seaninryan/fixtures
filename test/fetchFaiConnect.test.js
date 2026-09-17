import { describe, it, expect, vi } from "vitest";
import {
  FAI_BASE_URL, FAI_USER_AGENT, fetchTeams, fetchMatches, fetchMatchDetail,
} from "../src/lib/fetchFaiConnect.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const opts = { apiKey: "test-key" };

describe("fetchTeams", () => {
  it("sends the api_key and an explicit User-Agent", async () => {
    const fetchImpl = vi.fn(async () => ok([{ id: 1 }]));
    await fetchTeams(10671, { ...opts, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${FAI_BASE_URL}/api/live/team/10671/teams`);
    expect(init.headers.api_key).toBe("test-key");
    // A DEFAULT client UA is not safe here: Python-urllib/3.12 gets a 403 from this
    // host. Never rely on whatever the runtime happens to send.
    expect(init.headers["User-Agent"]).toBe(FAI_USER_AGENT);
  });

  it("throws on a non-2xx rather than returning nothing", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    await expect(fetchTeams(10671, { ...opts, fetchImpl })).rejects.toThrow(/403/);
  });
});

describe("fetchMatches", () => {
  it("asks for the documented path with a large page", async () => {
    const fetchImpl = vi.fn(async () => ok({ result: [], size: 0 }));
    await fetchMatches(61270, "future", { ...opts, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${FAI_BASE_URL}/api/live/team/61270/matches/paginated/future/1?page=1&pageSize=100`,
    );
  });

  it("returns the result array", async () => {
    const fetchImpl = vi.fn(async () => ok({ result: [{ id: 7 }], size: 1 }));
    expect(await fetchMatches(61270, "past", { ...opts, fetchImpl })).toEqual([{ id: 7 }]);
  });

  it("THROWS when the page is short of `size` rather than reading it as complete", async () => {
    // `size` is the TOTAL, not the page length - verified against the live API. A partial
    // list read as complete is a fixture list that shrank for no reason, which is exactly
    // what this project refuses to write.
    const fetchImpl = vi.fn(async () => ok({ result: [{ id: 1 }], size: 9 }));
    await expect(fetchMatches(61270, "past", { ...opts, fetchImpl }))
      .rejects.toThrow(/1 of 9/);
  });

  it("THROWS when `result` is not an array at all", async () => {
    // {result: {...}, size: 9}: `result.length` is undefined, `undefined < 9` is false,
    // so the partial-page guard passed and a non-iterable was returned - failing later
    // as a bare TypeError naming neither the team nor the endpoint.
    const fetchImpl = vi.fn(async () => ok({ result: { id: 1 }, size: 9 }));
    await expect(fetchMatches(61270, "past", { ...opts, fetchImpl }))
      .rejects.toThrow(/61270.*past/);
  });

  it("rejects a period it does not know", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchMatches(61270, "sideways", { ...opts, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a missing size as the page being whole", async () => {
    const fetchImpl = vi.fn(async () => ok({ result: [{ id: 1 }] }));
    expect(await fetchMatches(61270, "past", { ...opts, fetchImpl })).toEqual([{ id: 1 }]);
  });
});

describe("fetchMatchDetail", () => {
  it("returns the facility, which the list endpoint does not carry", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 1, facility: { place: "Craughwell" } }));
    expect(await fetchMatchDetail(1, { ...opts, fetchImpl })).toEqual({ place: "Craughwell" });
  });

  it("returns null when there is no facility, rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 1, facility: null }));
    expect(await fetchMatchDetail(1, { ...opts, fetchImpl })).toBeNull();
  });
});
