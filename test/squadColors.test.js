import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PALETTE, contrastFg, squadColor, colorEmoji } from "../src/lib/squadColors.js";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { TEAM_COUNT } from "./fixtures/meta.js";

const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");

// The real squad ids the club fields, straight out of the golden capture. Asserting
// against these rather than invented ids is what proves nobody is left colourless.
const squadIds = [...new Set(normalizeAll(parse(html).fixtures).fixtures.map((f) => f.teamId))];

describe("PALETTE", () => {
  it("has at least one distinct palette entry per squad", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(TEAM_COUNT);
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
    expect(PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
  });
});

describe("contrastFg", () => {
  it("picks dark text on light backgrounds and light on dark", () => {
    expect(contrastFg("#ffffff")).toBe("#17222b");
    expect(contrastFg("#000000")).toBe("#ffffff");
    expect(contrastFg("#f2c744")).toBe("#17222b");
  });

  it("weighs the channels perceptually, not by raw value", () => {
    // Yellow and magenta are each two full channels, but yellow is the bright one to
    // the eye. A naive channel average would call them identical.
    expect(contrastFg("#ffff00")).toBe("#17222b");
    // Known limitation, pinned rather than hidden: by WCAG, magenta is more legible
    // with DARK text (5.18 vs 3.14), but this fast luminance puts it on the light-text
    // side. No palette entry sits in that region, so it is not worth a second
    // colour-space conversion to fix.
    expect(contrastFg("#ff00ff")).toBe("#ffffff");
  });

  it("returns one of exactly two values across the whole palette, and uses both", () => {
    const fgs = new Set(PALETTE.map(contrastFg));
    expect([...fgs].sort()).toEqual(["#17222b", "#ffffff"]);
  });
});

describe("squadColor", () => {
  const config = { teams: { "235380": { color: "#1f6feb" } } };

  it("uses the configured colour when there is one", () => {
    expect(squadColor("235380", config)).toEqual({ bg: "#1f6feb", fg: "#ffffff" });
  });

  it("recomputes fg from the configured colour rather than assuming dark", () => {
    // A configured light colour must still get dark text, or the chip is unreadable.
    expect(squadColor("235380", { teams: { "235380": { color: "#f2c744" } } }))
      .toEqual({ bg: "#f2c744", fg: "#17222b" });
  });

  it("falls back to a palette colour so nothing is ever colourless", () => {
    const c = squadColor("999999", config);
    expect(PALETTE).toContain(c.bg);
  });

  it("derives fg from the fallback colour too", () => {
    // 235435's fallback is the light #e5a94d; a hardcoded white fg would be unreadable.
    expect(squadColor("235435", {})).toEqual({ bg: "#e5a94d", fg: "#17222b" });
  });

  it("is stable ACROSS RUNS: these ids resolve to these exact colours", () => {
    // Pinned literals, not a self-comparison. A squad's colour is seeded into the
    // config once (Task 6) and printed into announcements; if the hash changes shape
    // between releases every squad silently swaps colour. These values are the
    // contract.
    //
    // They are a contract for a GIVEN palette: appending a colour changes the modulo
    // and legitimately moves these. If this test fails right after you added a palette
    // entry, re-pin it. If it fails for any other reason, the hash shape changed and
    // every squad's colour just moved.
    expect(squadColor("235380", {}).bg).toBe("#3fb9b9");
    expect(squadColor("235435", {}).bg).toBe("#e5a94d");
    expect(squadColor("284049", {}).bg).toBe("#7d8a99");
    expect(squadColor("999999", {}).bg).toBe("#a32d31");
  });

  it("survives an absent or empty config", () => {
    expect(squadColor("235380", undefined).bg).toBeTruthy();
    expect(squadColor("235380", { teams: {} }).bg).toBeTruthy();
  });

  it("falls back when the team is configured but its colour is null or blank", () => {
    for (const color of [null, undefined, ""]) {
      const c = squadColor("235380", { teams: { "235380": { color } } });
      expect(c.bg).toBe("#3fb9b9");
      expect(c.fg).toBe(contrastFg(c.bg));
    }
  });

  it("gives every squad in the capture a real colour with matching text", () => {
    expect(squadIds).toHaveLength(TEAM_COUNT);
    for (const id of squadIds) {
      const c = squadColor(id, {});
      expect(PALETTE).toContain(c.bg);
      expect(c.fg).toBe(contrastFg(c.bg));
    }
  });
});

describe("colorEmoji", () => {
  it("maps a colour to the nearest emoji square for plain-text announcements", () => {
    expect(colorEmoji("#e5484d")).toBe("🟥");
    expect(colorEmoji("#1f6feb")).toBe("🟦");
    expect(colorEmoji("#3fb950")).toBe("🟩");
  });

  it("covers the rest of the wheel", () => {
    expect(colorEmoji("#d9c53c")).toBe("🟨");
    expect(colorEmoji("#8b5ae5")).toBe("🟪");
    // Orange must stay orange: brown's hue sits in the same region, so it may only be
    // reached by the desaturation rule below, never by winning on hue distance.
    expect(colorEmoji("#e5794d")).toBe("🟧");
    expect(colorEmoji("#b06a1f")).toBe("🟧");
  });

  it("sends greys to the neutral squares rather than a hue", () => {
    expect(colorEmoji("#7d8a99")).toBe("⬜");
    expect(colorEmoji("#222222")).toBe("⬛");
    expect(colorEmoji("#ffffff")).toBe("⬜");
    expect(colorEmoji("#000000")).toBe("⬛");
  });

  it("sends muted dark colours to brown", () => {
    expect(colorEmoji("#8c6f5a")).toBe("🟫");
  });

  it("returns a real square for every palette entry, well spread", () => {
    const emojis = PALETTE.map(colorEmoji);
    expect(emojis.every((e) => typeof e === "string" && e.length > 0)).toBe(true);
    // Not all one square - the point of the emoji prefix is telling squads apart.
    expect(new Set(emojis).size).toBe(8);
    // And no single square may swallow the palette. Currently the worst is blue at 6.
    for (const e of new Set(emojis)) {
      expect(emojis.filter((x) => x === e).length).toBeLessThanOrEqual(6);
    }
  });
});
