import { describe, it, expect, vi } from "vitest";
import {
  fetchFixtures, FIXTURES_URL, FIXTURES_BODY, REFERER, USER_AGENT,
} from "../src/lib/fetchFixtures.js";

const okResponse = (body = "<ul>") => ({ ok: true, status: 200, text: async () => body });

describe("fetchFixtures", () => {
  it("POSTs to the club's fixtures endpoint", async () => {
    const fake = vi.fn().mockResolvedValue(okResponse());
    await fetchFixtures(fake);
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(FIXTURES_URL);
    expect(init.method).toBe("POST");
  });

  it("sends the headers the WAF requires", async () => {
    // CloudFront 403s a default client user-agent. This is not optional politeness.
    const fake = vi.fn().mockResolvedValue(okResponse());
    await fetchFixtures(fake);
    const { headers } = fake.mock.calls[0][1];
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["User-Agent"]).toMatch(/Mozilla/);
    expect(headers.Referer).toBe(REFERER);
  });

  it("returns the body on success", async () => {
    const fake = vi.fn().mockResolvedValue(okResponse("<ul>hi</ul>"));
    await expect(fetchFixtures(fake)).resolves.toBe("<ul>hi</ul>");
  });

  it("throws on a non-200 so the caller aborts instead of writing an empty snapshot", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "blocked" });
    await expect(fetchFixtures(fake)).rejects.toThrow(/403/);
  });

  // --- hardening beyond the baseline ---

  it("asks the right club, competition-wide, for fixtures rather than results", () => {
    // Every parameter here is load-bearing; a silent edit would fetch the wrong club or
    // the results list, and the diff would report the whole season as changed.
    expect(FIXTURES_BODY).toContain("club_id=2960");
    expect(FIXTURES_BODY).toContain("action=fixtures");
    expect(FIXTURES_BODY).toContain("displayResults=");
    expect(FIXTURES_URL).toBe("https://galwayfa.ie/wp-admin/admin-ajax.php");
    expect(REFERER).toContain("/clubprofile/2960/");
  });

  // THE RULE THAT COST A GREEN BUILD. The parameters must travel in the BODY.
  // With them in the query string CloudFront's WAF answers "Request blocked." to a
  // datacenter IP - a GitHub runner - while still serving a residential one, so this
  // passed every local test and failed the moment it ran in CI. Identical response
  // either way; the same path with ?action=heartbeat is fine. It is the query string
  // the rule inspects.
  it("carries no query string, because the WAF inspects it", () => {
    expect(FIXTURES_URL).not.toContain("?");
    expect(FIXTURES_URL).not.toContain("club_id");
  });

  it("identifies itself as a browser XHR, which is what gets past the WAF", async () => {
    const fake = vi.fn().mockResolvedValue(okResponse());
    await fetchFixtures(fake);
    const { headers } = fake.mock.calls[0][1];
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(headers.Accept).toBe("*/*");
  });

  it("names the status in the error for every failure code, not just 403", async () => {
    for (const status of [403, 429, 500, 502, 503]) {
      const fake = vi.fn().mockResolvedValue({ ok: false, status, text: async () => "" });
      await expect(fetchFixtures(fake)).rejects.toThrow(new RegExp(String(status)));
    }
  });

  it("lets a network failure propagate rather than returning an empty body", async () => {
    // Returning "" here would parse to zero fixtures and read as "everything cancelled".
    const fake = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(fetchFixtures(fake)).rejects.toThrow(/ECONNREFUSED/);
  });

  it("propagates a body that fails to read", async () => {
    const fake = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => { throw new Error("stream closed"); },
    });
    await expect(fetchFixtures(fake)).rejects.toThrow(/stream closed/);
  });

  it("returns an empty body verbatim instead of inventing an error", async () => {
    // Emptiness is runCheck's call to make, not this module's - it owns the abort rule.
    const fake = vi.fn().mockResolvedValue(okResponse(""));
    await expect(fetchFixtures(fake)).resolves.toBe("");
  });

  it("sends the parameters as a form-encoded body, the way the site's own XHR does", async () => {
    const fake = vi.fn().mockResolvedValue(okResponse());
    await fetchFixtures(fake);
    const [url, init] = fake.mock.calls[0];
    expect(url).not.toContain("?");
    expect(init.body).toBe(FIXTURES_BODY);
    expect(init.headers["Content-Type"]).toMatch(/^application\/x-www-form-urlencoded/);
  });
});
