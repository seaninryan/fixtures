import { describe, it, expect, vi } from "vitest";
import { accountEmail, CLIENT_ID, SCOPE } from "../src/lib/googleAuth.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe("accountEmail", () => {
  it("reads the address off Google's userinfo endpoint", async () => {
    const fake = vi.fn().mockResolvedValue(ok({ email: "someone@example.com" }));
    await expect(accountEmail("tok", fake)).resolves.toBe("someone@example.com");
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  // A null here means "not the owner", which is the safe direction: the gate closes.
  it("returns null rather than throwing when Google refuses", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(accountEmail("stale", fake)).resolves.toBeNull();
  });

  it("returns null when the response carries no email", async () => {
    const fake = vi.fn().mockResolvedValue(ok({ sub: "123" }));
    await expect(accountEmail("tok", fake)).resolves.toBeNull();
  });

  it("returns null when the request itself fails", async () => {
    const fake = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(accountEmail("tok", fake)).resolves.toBeNull();
  });

  it("asks for no token at all rather than sending 'Bearer undefined'", async () => {
    const fake = vi.fn();
    await expect(accountEmail(null, fake)).resolves.toBeNull();
    expect(fake).not.toHaveBeenCalled();
  });
});

describe("the OAuth client", () => {
  it("is the client the owner's other apps already use", () => {
    // Same client id as ballislife and fancystats, which is what makes
    // https://seaninryan.github.io an already-authorised origin. A new client would
    // need its origins configured by hand in the Google console before this works.
    expect(CLIENT_ID).toBe(
      "1082152886862-ls2qdqu246emgs93q6hvrcqq4ipi1iur.apps.googleusercontent.com",
    );
  });

  // The other two apps ask for Drive because they STORE there. This app only ever needs
  // to know who is looking, so it must not inherit that scope: a read-write Drive grant
  // for a fixtures list is a consent screen nobody should agree to.
  it("asks only for the signed-in address, never for Drive", () => {
    expect(SCOPE).toBe("https://www.googleapis.com/auth/userinfo.email");
    expect(SCOPE).not.toContain("drive");
  });
});
