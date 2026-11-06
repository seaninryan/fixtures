// test/opponents.test.js
import { describe, it, expect } from "vitest";
import { cleanOpponent, opponentName, setOpponent, cleanOpponents } from "../src/lib/opponents.js";

describe("cleanOpponent", () => {
  it.each([
    ["Knocknacarra D", "Knocknacarra"],
    ["Maree/Oranmore C", "Maree/Oranmore"],
    ["Cregmore/Claregalway B", "Cregmore/Claregalway"],
    ["Corofin Utd B", "Corofin Utd"],
    ["Salthill Devon C", "Salthill Devon"],
    ["Merlin Woods Reserve 2425", "Merlin Woods Reserve"],
    ["Merlin Woods B 2526", "Merlin Woods"],
    ["St Bernards", "St Bernards"],
    ["Athenry FC", "Athenry FC"],
    ["Gort", "Gort"],
  ])("%s -> %s", (raw, clean) => {
    expect(cleanOpponent(raw)).toBe(clean);
  });

  it("only strips A-H, never a letter that could be a real word or initial", () => {
    expect(cleanOpponent("Mervue U")).toBe("Mervue U");
    expect(cleanOpponent("Team I")).toBe("Team I");
  });

  it("only strips four digits that read as consecutive years", () => {
    expect(cleanOpponent("Club 2024")).toBe("Club 2024");
    expect(cleanOpponent("Club 2599")).toBe("Club 2599");
    expect(cleanOpponent("Club 9900")).toBe("Club 9900");
  });

  it("never empties a name", () => {
    expect(cleanOpponent("B")).toBe("B");
    expect(cleanOpponent("2425")).toBe("2425");
  });

  it("trims and tolerates junk", () => {
    expect(cleanOpponent("  Gort  ")).toBe("Gort");
    expect(cleanOpponent(undefined)).toBe("");
    expect(cleanOpponent(null)).toBe("");
  });
});

describe("opponentName", () => {
  const config = { opponents: { "Team X Junior Men's Team": "Team X" } };

  it("prefers the override", () => {
    expect(opponentName("Team X Junior Men's Team", config)).toBe("Team X");
  });

  it("falls back to the cleaned name", () => {
    expect(opponentName("Knocknacarra D", config)).toBe("Knocknacarra");
    expect(opponentName("Knocknacarra D", undefined)).toBe("Knocknacarra");
  });

  it("ignores an empty or non-string override", () => {
    expect(opponentName("Gort B", { opponents: { "Gort B": "" } })).toBe("Gort");
    expect(opponentName("Gort B", { opponents: { "Gort B": 7 } })).toBe("Gort");
  });
});

describe("setOpponent", () => {
  const base = { version: 1, teams: { "1": { label: "U14A Boys", color: "#123456" } } };

  it("stores a real override without touching teams", () => {
    const next = setOpponent(base, "Team X Junior Men's Team", "Team X");
    expect(next.opponents).toEqual({ "Team X Junior Men's Team": "Team X" });
    expect(next.teams).toBe(base.teams);
    expect(base.opponents).toBeUndefined();
  });

  it("removes the override when set back to the cleaned default", () => {
    const withIt = setOpponent(base, "Knocknacarra D", "Knocks");
    expect(setOpponent(withIt, "Knocknacarra D", "Knocknacarra")).not.toHaveProperty("opponents");
  });

  it("removes the override when cleared", () => {
    const withIt = setOpponent(base, "Knocknacarra D", "Knocks");
    expect(setOpponent(withIt, "Knocknacarra D", "   ")).not.toHaveProperty("opponents");
  });

  it("stores trimmed text", () => {
    expect(setOpponent(base, "Gort B", "  Gort Utd ").opponents).toEqual({ "Gort B": "Gort Utd" });
  });
});

describe("cleanOpponents", () => {
  it("keeps string -> non-empty string entries only", () => {
    expect(cleanOpponents({ a: "A", b: "", c: 3, d: " D " })).toEqual({ a: "A", d: "D" });
  });

  it("treats a non-object as empty", () => {
    expect(cleanOpponents(null)).toEqual({});
    expect(cleanOpponents("nope")).toEqual({});
    expect(cleanOpponents(["x"])).toEqual({});
  });
});
