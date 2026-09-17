import { describe, it, expect } from "vitest";
import { FAI_PREFIX, faiId, isFaiId } from "../src/lib/source.js";

describe("faiId", () => {
  it("prefixes a numeric id, as a string", () => {
    expect(faiId(52005172)).toBe("fai:52005172");
    expect(faiId("61270")).toBe("fai:61270");
  });

  it("throws on a missing id rather than minting \"fai:undefined\"", () => {
    // Two id-less matches would BOTH become "fai:undefined" and collide in diff.js's
    // map and in mergeResults - one silently overwriting the other. A crash is the
    // lesser harm.
    expect(() => faiId(undefined)).toThrow();
    expect(() => faiId(null)).toThrow();
    expect(() => faiId("")).toThrow();
    expect(() => faiId("  ")).toThrow();
  });

  it("still accepts a legitimate zero id", () => {
    expect(faiId(0)).toBe("fai:0");
  });
});

describe("isFaiId", () => {
  it("recognises a prefixed id", () => {
    expect(isFaiId("fai:61270")).toBe(true);
  });

  it("rejects a bare Galway id, whatever its type", () => {
    expect(isFaiId("235380")).toBe(false);
    expect(isFaiId(235380)).toBe(false);
  });

  it("does not throw on a missing id", () => {
    expect(isFaiId(undefined)).toBe(false);
    expect(isFaiId(null)).toBe(false);
  });
});

describe("FAI_PREFIX", () => {
  it("is the one definition both sides use", () => {
    expect(faiId(1).startsWith(FAI_PREFIX)).toBe(true);
  });
});
