import { describe, it, expect } from "vitest";
import { FAI_PREFIX, faiId, isFaiId } from "../src/lib/source.js";

describe("faiId", () => {
  it("prefixes a numeric id, as a string", () => {
    expect(faiId(52005172)).toBe("fai:52005172");
    expect(faiId("61270")).toBe("fai:61270");
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
