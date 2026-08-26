import { describe, it, expect, vi } from "vitest";
import { fetchFixtures, FIXTURES_URL, REFERER, USER_AGENT } from "../src/lib/fetchFixtures.js";

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
    // Every query parameter here is load-bearing; a silent edit would fetch the wrong
    // club or the results list, and the diff would report the whole season as changed.
    expect(FIXTURES_URL).toContain("club_id=2960");
    expect(FIXTURES_URL).toContain("action=fixtures");
    expect(FIXTURES_URL).toContain("displayResults=");
    expect(FIXTURES_URL).toMatch(/^https:\/\/galwayfa\.ie\/wp-admin\/admin-ajax\.php\?/);
    expect(REFERER).toContain("/clubprofile/2960/");
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

  it("sends no request body", async () => {
    const fake = vi.fn().mockResolvedValue(okResponse());
    await fetchFixtures(fake);
    expect(fake.mock.calls[0][1].body).toBeUndefined();
  });
});
