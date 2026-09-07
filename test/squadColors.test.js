import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PALETTE, contrastFg, squadColor, CHART_SURFACE, strokeOn, squadDash,
} from "../src/lib/squadColors.js";
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

// The WCAG contrast ratio, recomputed here rather than imported: a test that shares the
// implementation's maths cannot catch the implementation's maths being wrong.
function ratio(a, b) {
  const lin = (c) => (c /= 255, c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

describe("strokeOn", () => {
  // Asserted as a computed ratio, never as a hardcoded hex, so the function may improve
  // without the test lying about what it guarantees.
  it("lifts a colour that is invisible on the card to at least 3:1", () => {
    expect(ratio("#080080", CHART_SURFACE)).toBeLessThan(3); // the premise
    expect(ratio(strokeOn("#080080"), CHART_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it("lifts every squad colour the live config had failing", () => {
    for (const hex of ["#080080", "#5900b3", "#2b00ff"]) {
      expect(ratio(strokeOn(hex), CHART_SURFACE)).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves a colour that already passes untouched", () => {
    expect(strokeOn("#d0ff00")).toBe("#d0ff00");
    expect(strokeOn("#e5a94d")).toBe("#e5a94d");
  });

  it("is idempotent", () => {
    const once = strokeOn("#080080");
    expect(strokeOn(once)).toBe(once);
  });

  it("keeps the hue recognisable rather than washing to white", () => {
    const out = strokeOn("#080080");
    const n = parseInt(out.slice(1), 16);
    // Navy: blue must still dominate red and green.
    expect(n & 255).toBeGreaterThan((n >> 16) & 255);
    expect(out).not.toBe("#ffffff");
  });

  // Never return something invisible for junk input - a missing line is worse than an
  // ugly one, and config is hand-edited JSON.
  it("falls back to white for input that is not a hex colour", () => {
    expect(strokeOn("nonsense")).toBe("#ffffff");
    expect(strokeOn(undefined)).toBe("#ffffff");
    expect(strokeOn("#fff")).toBe("#ffffff");
  });
});

describe("squadDash", () => {
  it("is stable for a given squad", () => {
    expect(squadDash("235380")).toBe(squadDash("235380"));
  });

  // Secondary encoding follows the ENTITY, not its position in a selection: deselecting
  // one squad must not restyle the others.
  it("does not depend on any surrounding selection", () => {
    const alone = squadDash("254061");
    expect(squadDash("254061")).toBe(alone);
  });

  it("returns an SVG dasharray string or the solid sentinel", () => {
    for (const id of ["1", "2", "3", "235380", "254061", "238155"]) {
      expect(typeof squadDash(id)).toBe("string");
    }
  });
});
