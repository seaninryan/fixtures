import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { diff, SEVERITY } from "../src/lib/diff.js";
import { parse } from "../src/lib/parse.js";
import { normalizeAll } from "../src/lib/normalize.js";
import { FIXTURE_COUNT } from "./fixtures/meta.js";

const TODAY = "2026-08-25";

const fixture = (over = {}) => ({
  fid: "6951014", teamId: "235380", date: "2026-08-29", time: "12:00",
  isHome: true, ourTeam: "Craughwell United", opponent: "St Bernards",
  venue: "Craughwell", competition: "GFA Boys U14 Championship 1", comment: "",
  ...over,
});

describe("diff", () => {
  it("reports nothing when nothing changed", () => {
    expect(diff([fixture()], [fixture()], TODAY)).toEqual([]);
  });

  it("reports a moved kick-off as one change, not a delete plus an add", () => {
    const changes = diff([fixture()], [fixture({ time: "16:00" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: "moved", fid: "6951014",
      from: { date: "2026-08-29", time: "12:00" },
      to: { date: "2026-08-29", time: "16:00" },
    });
  });

  it("reports a moved date", () => {
    const changes = diff([fixture()], [fixture({ date: "2026-09-05" })], TODAY);
    expect(changes[0].type).toBe("moved");
    expect(changes[0].to.date).toBe("2026-09-05");
  });

  it("reports a venue switch", () => {
    const changes = diff([fixture()], [fixture({ venue: "Colemanstown" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "venue", from: "Craughwell", to: "Colemanstown" });
  });

  it("reports a new fixture", () => {
    const changes = diff([], [fixture()], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("added");
  });

  it("reports a corrected opponent or competition", () => {
    expect(diff([fixture()], [fixture({ opponent: "Renmore" })], TODAY)[0].type).toBe("opponent");
    expect(diff([fixture()], [fixture({ competition: "GFA Cup" })], TODAY)[0].type).toBe("opponent");
  });

  it("treats a future fixture that vanished as a cancellation", () => {
    const changes = diff([fixture({ date: "2026-09-05" })], [], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("cancelled");
  });

  it("stays silent about a past fixture that vanished - it was simply played", () => {
    expect(diff([fixture({ date: "2026-08-20" })], [], TODAY)).toEqual([]);
  });

  it("treats a fixture vanishing on the day itself as played, not cancelled", () => {
    expect(diff([fixture({ date: TODAY })], [], TODAY)).toEqual([]);
  });

  it("attaches the league's note to the change it explains", () => {
    const changes = diff(
      [fixture()],
      [fixture({ time: "16:00", comment: "Colemanstown requested kickoff time" })],
      TODAY,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].comment).toBe("Colemanstown requested kickoff time");
  });

  it("reports a note on its own only when nothing else changed", () => {
    const changes = diff([fixture()], [fixture({ comment: "Home KO SUN 4PM" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "comment", to: "Home KO SUN 4PM" });
  });

  it("ignores referee, assessor and score fields entirely", () => {
    const changes = diff(
      [fixture({ referee: "TBC", homescore: "" })],
      [fixture({ referee: "J Murphy", homescore: "2" })],
      TODAY,
    );
    expect(changes).toEqual([]);
  });

  it("can report a move and a venue switch on the same fixture", () => {
    const changes = diff([fixture()], [fixture({ time: "16:00", venue: "Athenry" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["moved", "venue"]);
  });

  it("orders changes most-disruptive first", () => {
    const other = fixture({ fid: "7", date: "2026-09-05" });
    const changes = diff(
      [fixture(), other],
      [fixture({ venue: "Athenry" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["cancelled", "venue"]);
    expect(SEVERITY.indexOf("cancelled")).toBeLessThan(SEVERITY.indexOf("venue"));
  });

  it("handles a first-ever run with no previous snapshot", () => {
    expect(diff(undefined, [fixture()], TODAY)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Hardening. This module decides what lands in the owner's inbox, so the tests
// below pin DIRECTION (from/to) and IDENTITY (fid, never teamId) explicitly —
// "a change was reported" is not enough when a backwards change reads perfectly
// plausible in an email.
// ---------------------------------------------------------------------------

const real = () => {
  const html = readFileSync(new URL("./fixtures/club2960.html", import.meta.url), "utf8");
  const { fixtures: raw, errors } = parse(html);
  expect(errors).toEqual([]);
  const { fixtures, errors: normErrors } = normalizeAll(raw);
  expect(normErrors).toEqual([]);
  return fixtures;
};

const without = (list, ...fids) => list.filter((f) => !fids.includes(f.fid));
const patch = (list, fid, over) => list.map((f) => (f.fid === fid ? { ...f, ...over } : f));

describe("diff: identity is the fid, never the squad", () => {
  // Mutation O. Squad 235380 plays 6951014, 6951017 and 6951022 in the real capture.
  // Keying the map on teamId would collapse the three into one and lose two of them.
  const a = fixture({ fid: "6951014", teamId: "235380", date: "2026-08-29", time: "12:00" });
  const b = fixture({ fid: "6951017", teamId: "235380", date: "2026-09-01", time: "18:30" });
  const c = fixture({ fid: "6951022", teamId: "235380", date: "2026-09-12", time: "12:00" });

  it("tracks three fixtures of the same squad separately", () => {
    expect(diff([a, b, c], [a, b, c], TODAY)).toEqual([]);
  });

  it("moves one fixture of a squad without disturbing its siblings", () => {
    const changes = diff([a, b, c], [a, { ...b, time: "20:00" }, c], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].fid).toBe("6951017");
    expect(changes[0].teamId).toBe("235380");
    expect(changes[0].from).toEqual({ date: "2026-09-01", time: "18:30" });
    expect(changes[0].to).toEqual({ date: "2026-09-01", time: "20:00" });
  });

  it("cancels one fixture of a squad without cancelling the rest", () => {
    const changes = diff([a, b, c], [a, c], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "cancelled", fid: "6951017", teamId: "235380" });
  });

  it("reports the league's fid, not the squad id, as the change identity", () => {
    const changes = diff([a], [{ ...a, venue: "Athenry" }], TODAY);
    expect(changes[0].fid).toBe("6951014");
    expect(changes[0].fid).not.toBe(changes[0].teamId);
  });

  it("keeps two different squads apart even when both move", () => {
    const other = fixture({ fid: "6957591", teamId: "235299", date: "2026-08-31", time: "18:30" });
    const changes = diff(
      [a, other],
      [{ ...a, time: "13:00" }, { ...other, time: "19:00" }],
      TODAY,
    );
    // Both are moves, so the severity tie breaks on date: 29 Aug before 31 Aug.
    expect(changes.map((c) => [c.fid, c.teamId, c.to.time])).toEqual([
      ["6951014", "235380", "13:00"],
      ["6957591", "235299", "19:00"],
    ]);
  });
});

describe("diff: direction of every from/to", () => {
  // Mutations L, M. A swapped pair emails "moved to 12:00" for a fixture that moved
  // AWAY from 12:00 — it reads perfectly plausible and sends parents an hour early.
  it("points a moved time from the old value to the new one", () => {
    const [c] = diff([fixture({ time: "12:00" })], [fixture({ time: "16:00" })], TODAY);
    expect(c.from).toEqual({ date: "2026-08-29", time: "12:00" });
    expect(c.to).toEqual({ date: "2026-08-29", time: "16:00" });
    expect(c.from.time).not.toBe(c.to.time);
  });

  it("points a moved date from the old value to the new one", () => {
    const [c] = diff([fixture({ date: "2026-08-29" })], [fixture({ date: "2026-09-05" })], TODAY);
    expect(c.from).toEqual({ date: "2026-08-29", time: "12:00" });
    expect(c.to).toEqual({ date: "2026-09-05", time: "12:00" });
  });

  it("points a venue switch from the old ground to the new one", () => {
    const [c] = diff([fixture({ venue: "Craughwell" })], [fixture({ venue: "Cappagh Park" })], TODAY);
    expect(c.from).toBe("Craughwell");
    expect(c.to).toBe("Cappagh Park");
  });

  it("points an opponent correction from the old pairing to the new one", () => {
    const [c] = diff(
      [fixture({ opponent: "St Bernards", competition: "GFA Boys U14 Championship 1" })],
      [fixture({ opponent: "Renmore", competition: "GFA Cup" })],
      TODAY,
    );
    expect(c.from).toEqual({ opponent: "St Bernards", competition: "GFA Boys U14 Championship 1" });
    expect(c.to).toEqual({ opponent: "Renmore", competition: "GFA Cup" });
  });

  it("points a standalone note change from the old note to the new one", () => {
    const [c] = diff([fixture({ comment: "old note" })], [fixture({ comment: "new note" })], TODAY);
    expect(c.from).toBe("old note");
    expect(c.to).toBe("new note");
  });

  it("carries the fixture as it is NOW, so the email shows where to actually go", () => {
    const [c] = diff([fixture()], [fixture({ time: "16:00", venue: "Athenry" })], TODAY);
    expect(c.fixture.time).toBe("16:00");
    expect(c.fixture.venue).toBe("Athenry");
  });
});

describe("diff: date and time are both part of a move", () => {
  // Mutations E, F.
  it("catches a time-only move", () => {
    const changes = diff([fixture()], [fixture({ time: "16:00" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["moved"]);
    expect(changes[0].to).toEqual({ date: "2026-08-29", time: "16:00" });
  });

  it("catches a date-only move", () => {
    const changes = diff([fixture()], [fixture({ date: "2026-09-05" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["moved"]);
    expect(changes[0].to).toEqual({ date: "2026-09-05", time: "12:00" });
  });

  it("catches a date-and-time move as one change", () => {
    const changes = diff([fixture()], [fixture({ date: "2026-09-05", time: "16:00" })], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toEqual({ date: "2026-08-29", time: "12:00" });
    expect(changes[0].to).toEqual({ date: "2026-09-05", time: "16:00" });
  });
});

describe("diff: the played-versus-cancelled rule", () => {
  // Mutations A, B, C. The endpoint returns UPCOMING fixtures only, so a played game
  // vanishes exactly like a cancelled one and only the date tells them apart.
  const gone = (date) => diff([fixture({ date })], [], TODAY);

  it("is silent for every date up to and including today", () => {
    for (const date of ["2026-08-01", "2026-08-24", TODAY]) {
      expect(gone(date), `vanished on ${date}`).toEqual([]);
    }
  });

  it("cancels every date after today", () => {
    for (const date of ["2026-08-26", "2026-09-05", "2027-01-13"]) {
      expect(gone(date).map((c) => c.type), `vanished on ${date}`).toEqual(["cancelled"]);
    }
  });

  it("splits a mixed batch of disappearances on the day boundary", () => {
    const prev = [
      fixture({ fid: "played-1", date: "2026-08-20" }),
      fixture({ fid: "played-2", date: TODAY }),
      fixture({ fid: "off-1", date: "2026-08-26" }),
      fixture({ fid: "off-2", date: "2026-09-05" }),
    ];
    const changes = diff(prev, [], TODAY);
    expect(changes.map((c) => c.fid)).toEqual(["off-1", "off-2"]);
    expect(changes.every((c) => c.type === "cancelled")).toBe(true);
  });

  it("carries the vanished fixture's own details on a cancellation", () => {
    const p = fixture({ date: "2026-09-05", venue: "Cregmore", comment: "Called off" });
    const [c] = diff([p], [], TODAY);
    expect(c).toMatchObject({ type: "cancelled", fid: "6951014", teamId: "235380", comment: "Called off" });
    expect(c.fixture).toEqual(p);
  });
});

describe("diff: the note is context, not a change of its own", () => {
  // Mutations D, N.
  it("stays a single change when the league explains a move in the comment", () => {
    const changes = diff(
      [fixture({ comment: "" })],
      [fixture({ time: "16:00", comment: "Colemanstown requested kickoff time" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["moved"]);
    expect(changes[0].comment).toBe("Colemanstown requested kickoff time");
  });

  it("does not add a note item when the note changes alongside a venue switch", () => {
    const changes = diff(
      [fixture({ comment: "old" })],
      [fixture({ venue: "Athenry", comment: "Moved as agreed (21/8)" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["venue"]);
    expect(changes[0].comment).toBe("Moved as agreed (21/8)");
  });

  it("does not add a note item when the note changes alongside an opponent correction", () => {
    const changes = diff(
      [fixture({ comment: "old" })],
      [fixture({ opponent: "Renmore", comment: "new" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["opponent"]);
    expect(changes[0].comment).toBe("new");
  });

  it("reports the CURRENT note on a change, never the superseded one", () => {
    const changes = diff(
      [fixture({ comment: "Moved as agreed (21/8)" })],
      [fixture({ time: "16:00", comment: "Home KO SUN 4PM" })],
      TODAY,
    );
    expect(changes[0].comment).toBe("Home KO SUN 4PM");
    expect(changes[0].comment).not.toBe("Moved as agreed (21/8)");
  });

  it("carries the current note onto every change of a multi-change fixture", () => {
    const changes = diff(
      [fixture({ comment: "stale" })],
      [fixture({ time: "16:00", venue: "Athenry", opponent: "Renmore", comment: "fresh" })],
      TODAY,
    );
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.comment)).toEqual(["fresh", "fresh", "fresh"]);
  });

  it("leaves an unchanged note out of the report entirely", () => {
    const note = "Home KO SUN 4PM";
    expect(diff([fixture({ comment: note })], [fixture({ comment: note })], TODAY)).toEqual([]);
  });

  it("reports a cleared note as a note change to the empty string", () => {
    // Documented behaviour: clearing IS a change. The owner may have already told
    // parents what the note said.
    const changes = diff([fixture({ comment: "note" })], [fixture({ comment: "" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["comment"]);
    expect(changes[0].from).toBe("note");
    expect(changes[0].to).toBe("");
  });
});

describe("diff: every field that must and must not be compared", () => {
  it("reports a venue switch and nothing else", () => {
    // Mutation G.
    const changes = diff([fixture()], [fixture({ venue: "NFP Park, Drom" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["venue"]);
    expect(changes[0].to).toBe("NFP Park, Drom");
  });

  it("reports a competition correction even when the opponent is unchanged", () => {
    // Mutation H.
    const changes = diff(
      [fixture({ competition: "GFA Boys U14 Championship 1" })],
      [fixture({ competition: "GFA Boys U14 Division 4" })],
      TODAY,
    );
    expect(changes.map((c) => c.type)).toEqual(["opponent"]);
    expect(changes[0].from.competition).toBe("GFA Boys U14 Championship 1");
    expect(changes[0].to.competition).toBe("GFA Boys U14 Division 4");
    expect(changes[0].to.opponent).toBe("St Bernards");
  });

  it("reports an opponent correction even when the competition is unchanged", () => {
    const changes = diff([fixture()], [fixture({ opponent: "Colga B" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["opponent"]);
    expect(changes[0].from.opponent).toBe("St Bernards");
    expect(changes[0].to.opponent).toBe("Colga B");
  });

  it("ignores isHome and ourTeam drift on their own", () => {
    // Neither can change without the opponent or venue changing too, and reacting to
    // a lone flip would email the owner about nothing he can act on.
    const changes = diff(
      [fixture({ isHome: true, ourTeam: "Craughwell United" })],
      [fixture({ isHome: false, ourTeam: "Craughwell United B" })],
      TODAY,
    );
    expect(changes).toEqual([]);
  });

  it("ignores referee, assessor and scores even when they arrive populated", () => {
    const changes = diff(
      [fixture({ referee: "TBC", assessor: "", homescore: "", awayscore: "" })],
      [fixture({ referee: "J Murphy", assessor: "P Ryan", homescore: "2", awayscore: "1" })],
      TODAY,
    );
    expect(changes).toEqual([]);
  });

  it("reports an added fixture with its full details", () => {
    // Mutation I.
    const f = fixture({ fid: "6972287", teamId: "380133", date: "2026-09-05", comment: "New entry" });
    const changes = diff([fixture()], [fixture(), f], TODAY);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: "added", fid: "6972287", teamId: "380133", comment: "New entry" });
    expect(changes[0].fixture).toEqual(f);
  });

  it("reports a past-dated fixture appearing for the first time as added", () => {
    // The date rule guards disappearance only; anything NEW is worth knowing about.
    const changes = diff([], [fixture({ date: "2026-08-20" })], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["added"]);
  });
});

describe("diff: ordering", () => {
  // Mutations J, K. Insertion order is cancellations first, then next-list order —
  // so every case below is deliberately built to differ from the sorted answer.
  it("lists the six change types in the documented severity order", () => {
    expect(SEVERITY).toEqual(["cancelled", "moved", "venue", "opponent", "added", "comment"]);
  });

  it("sorts a moved fixture ahead of an added one listed before it", () => {
    const moved = fixture({ fid: "m", date: "2026-09-05", time: "12:00" });
    const fresh = fixture({ fid: "a", date: "2026-08-29", time: "10:00" });
    const changes = diff([moved], [fresh, { ...moved, time: "14:00" }], TODAY);
    expect(changes.map((c) => c.type)).toEqual(["moved", "added"]);
    expect(changes.map((c) => c.fid)).toEqual(["m", "a"]);
  });

  it("sorts every type into severity order regardless of input order", () => {
    const base = (fid, over) => fixture({ fid, date: "2026-09-05", ...over });
    const prev = [
      base("comment", { comment: "old" }),
      base("opponent"),
      base("venue"),
      base("moved"),
      base("cancelled"),
    ];
    const next = [
      base("comment", { comment: "new" }),
      base("opponent", { opponent: "Renmore" }),
      base("venue", { venue: "Athenry" }),
      base("moved", { time: "16:00" }),
      base("added"),
    ];
    expect(diff(prev, next, TODAY).map((c) => c.type)).toEqual(SEVERITY);
  });

  it("breaks a severity tie by date, earliest first", () => {
    const late = fixture({ fid: "late", date: "2026-12-02", time: "20:15" });
    const soon = fixture({ fid: "soon", date: "2026-08-29", time: "12:00" });
    const changes = diff(
      [late, soon],
      [{ ...late, venue: "X" }, { ...soon, venue: "Y" }],
      TODAY,
    );
    expect(changes.map((c) => c.fid)).toEqual(["soon", "late"]);
  });

  it("breaks a same-day tie by kick-off time, earliest first", () => {
    const pm = fixture({ fid: "pm", date: "2026-09-06", time: "14:00" });
    const am = fixture({ fid: "am", date: "2026-09-06", time: "10:00" });
    const changes = diff([pm, am], [{ ...pm, venue: "X" }, { ...am, venue: "Y" }], TODAY);
    expect(changes.map((c) => c.fid)).toEqual(["am", "pm"]);
  });

  it("orders cancellations among themselves by date too", () => {
    const dec = fixture({ fid: "dec", date: "2026-12-02" });
    const sep = fixture({ fid: "sep", date: "2026-09-05" });
    expect(diff([dec, sep], [], TODAY).map((c) => c.fid)).toEqual(["sep", "dec"]);
  });

  it("orders a fixture's own three changes by severity", () => {
    // Coverage item 3: date AND venue AND opponent at once, one fid.
    const changes = diff(
      [fixture()],
      [fixture({ date: "2026-09-05", venue: "Cregmore", opponent: "Renmore" })],
      TODAY,
    );
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.type)).toEqual(["moved", "venue", "opponent"]);
    expect(changes.every((c) => c.fid === "6951014")).toBe(true);
    expect(changes[0].to).toEqual({ date: "2026-09-05", time: "12:00" });
    expect(changes[1].to).toBe("Cregmore");
    expect(changes[2].to).toEqual({ opponent: "Renmore", competition: "GFA Boys U14 Championship 1" });
  });
});

describe("diff: the shape downstream destructures", () => {
  // Coverage item 7. changeReport.js and the site read these off every change.
  const mixedBatch = () => {
    const moved = fixture({ fid: "m", teamId: "235380", date: "2026-09-05" });
    const venue = fixture({ fid: "v", teamId: "238155", date: "2026-09-06" });
    const opponent = fixture({ fid: "o", teamId: "235299", date: "2026-09-12" });
    const cancelled = fixture({ fid: "c", teamId: "254061", date: "2026-09-13" });
    const note = fixture({ fid: "n", teamId: "284049", date: "2026-09-19", comment: "old" });
    const added = fixture({ fid: "a", teamId: "300398", date: "2026-09-20" });
    return diff(
      [moved, venue, opponent, cancelled, note],
      [
        { ...moved, time: "16:00", comment: "why" },
        { ...venue, venue: "Athenry" },
        { ...opponent, opponent: "Renmore" },
        { ...note, comment: "new" },
        added,
      ],
      TODAY,
    );
  };

  it("covers all six types in one batch", () => {
    expect(mixedBatch().map((c) => c.type)).toEqual(SEVERITY);
  });

  it("carries fid, teamId and the fixture on every change", () => {
    for (const c of mixedBatch()) {
      expect(typeof c.fid, c.type).toBe("string");
      expect(c.fid, c.type).not.toBe("");
      expect(typeof c.teamId, c.type).toBe("string");
      expect(c.teamId, c.type).not.toBe("");
      expect(c.fixture, c.type).toBeDefined();
      expect(c.fixture.fid, c.type).toBe(c.fid);
      expect(c.fixture.teamId, c.type).toBe(c.teamId);
    }
  });

  it("carries a string comment on every change except a note change", () => {
    // KNOWN ASYMMETRY, pinned deliberately: a "comment" change puts the note in `to`
    // and has no `comment` key at all, because the note IS the change there. Anything
    // downstream that reads `change.comment` blindly must handle undefined.
    for (const c of mixedBatch()) {
      if (c.type === "comment") {
        expect(c.comment).toBeUndefined();
        expect(c.to).toBe("new");
      } else {
        expect(typeof c.comment, c.type).toBe("string");
      }
    }
  });

  it("gives from/to only to the types that describe a transition", () => {
    const shape = Object.fromEntries(
      mixedBatch().map((c) => [c.type, "from" in c && "to" in c]),
    );
    expect(shape).toEqual({
      cancelled: false, added: false,
      moved: true, venue: true, opponent: true, comment: true,
    });
  });

  it("never mutates either snapshot it was handed", () => {
    const prev = [fixture(), fixture({ fid: "gone", date: "2026-09-05" })];
    const next = [fixture({ time: "16:00", venue: "Athenry" })];
    const prevCopy = JSON.parse(JSON.stringify(prev));
    const nextCopy = JSON.parse(JSON.stringify(next));
    diff(prev, next, TODAY);
    expect(prev).toEqual(prevCopy);
    expect(next).toEqual(nextCopy);
  });
});

describe("diff: junk in, no explosion out", () => {
  // Coverage item 6.
  it("returns an empty list for every flavour of missing snapshot", () => {
    for (const prev of [undefined, null, []]) {
      for (const next of [undefined, null, []]) {
        expect(diff(prev, next, TODAY), `${prev} / ${next}`).toEqual([]);
      }
    }
  });

  it("treats a missing previous snapshot as a first-ever run, not as chaos", () => {
    const fixtures = [fixture(), fixture({ fid: "2", date: "2026-09-05" })];
    for (const prev of [undefined, null, []]) {
      const changes = diff(prev, fixtures, TODAY);
      expect(changes.map((c) => c.type)).toEqual(["added", "added"]);
    }
  });

  it("treats a missing next snapshot as every future fixture cancelled", () => {
    const fixtures = [fixture({ date: "2026-08-20" }), fixture({ fid: "2", date: "2026-09-05" })];
    for (const next of [undefined, null, []]) {
      expect(diff(fixtures, next, TODAY).map((c) => c.fid)).toEqual(["2"]);
    }
  });

  it("keeps the LAST of duplicate fids within a snapshot", () => {
    // Coverage item 5. Shouldn't happen — the feed is third-party, so pin it.
    const changes = diff(
      [fixture({ time: "12:00" }), fixture({ time: "14:00" })],
      [fixture({ time: "12:00" })],
      TODAY,
    );
    // The 14:00 duplicate wins in the previous snapshot, so the fixture reads as
    // having moved BACK to 12:00. Garbage in, but deterministic garbage out.
    expect(changes.map((c) => c.type)).toEqual(["moved"]);
    expect(changes[0].from).toEqual({ date: "2026-08-29", time: "14:00" });
    expect(changes[0].to).toEqual({ date: "2026-08-29", time: "12:00" });
  });

  it("keeps the LAST of duplicate fids in the new snapshot too", () => {
    const changes = diff(
      [fixture({ time: "12:00" })],
      [fixture({ time: "14:00" }), fixture({ time: "16:00" })],
      TODAY,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].to).toEqual({ date: "2026-08-29", time: "16:00" });
  });
});

describe("diff: a production dry-run against the real capture", () => {
  // Coverage items 1 and 2. `real()` is the committed golden capture, parsed and
  // normalized exactly as the daily job does it. MID is a date mid-season so that
  // some of the capture is already in the past and the played-versus-cancelled rule
  // is actually exercised rather than trivially satisfied.
  const MID = "2026-10-01";

  it("reports nothing when the league published the same list again", () => {
    expect(diff(real(), real(), TODAY)).toEqual([]);
    expect(diff(real(), real(), MID)).toEqual([]);
  });

  it("reports every fixture as added on the first-ever run", () => {
    const fixtures = real();
    const changes = diff(undefined, fixtures, TODAY);
    expect(changes).toHaveLength(FIXTURE_COUNT);
    expect(changes.every((c) => c.type === "added")).toBe(true);
    expect(new Set(changes.map((c) => c.fid)).size).toBe(FIXTURE_COUNT);
    expect(changes.map((c) => c.fid).sort()).toEqual(fixtures.map((f) => f.fid).sort());
  });

  it("cancels only the still-future fixtures when the feed comes back empty", () => {
    const fixtures = real();
    const expected = fixtures.filter((f) => f.date > MID);
    // Computed from the data, not hardcoded — but assert the split is real, otherwise
    // this test would pass just as happily against a rule that ignores the date.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(FIXTURE_COUNT);

    const changes = diff(fixtures, [], MID);
    expect(changes).toHaveLength(expected.length);
    expect(changes.every((c) => c.type === "cancelled")).toBe(true);
    expect(changes.map((c) => c.fid)).toEqual(
      expected.map((f) => f.fid),
    );
    expect(changes.every((c) => c.fixture.date > MID)).toBe(true);
  });

  it("stays completely silent when a whole weekend of fixtures is simply played", () => {
    const fixtures = real();
    const weekend = fixtures.filter((f) => f.date === "2026-08-29" || f.date === "2026-08-30");
    expect(weekend.length).toBeGreaterThan(0);
    // Monday morning: the weekend's games have dropped off the upcoming list.
    expect(diff(fixtures, without(fixtures, ...weekend.map((f) => f.fid)), "2026-08-31")).toEqual([]);
  });

  it("picks out exactly the handful that changed from a 49-fixture snapshot", () => {
    const now = without(real(), "6964451", "6951014");
    let then = without(real(), "6964473");
    then = patch(then, "6964441", { time: "19:00" });
    then = patch(then, "6964462", { venue: "Ballinasloe" });

    const changes = diff(then, now, MID);

    expect(changes.map((c) => [c.type, c.fid])).toEqual([
      ["cancelled", "6964451"], // 2026-11-04, still in the future -> called off
      ["moved", "6964441"],     // 2026-10-07, kick-off pushed back
      ["venue", "6964462"],     // 2026-12-02, ground switched
      ["added", "6964473"],     // 2027-01-13, newly scheduled
      // 6951014 was 2026-08-29 and vanished too -- played, so not reported at all.
    ]);
    expect(changes.map((c) => c.fid)).not.toContain("6951014");

    const [off, moved, venue, added] = changes;
    expect(off.fixture.date).toBe("2026-11-04");
    expect(off.fixture.opponent).toBe("Knocknacarra B");

    expect(moved.from).toEqual({ date: "2026-10-07", time: "19:00" });
    expect(moved.to).toEqual({ date: "2026-10-07", time: "20:15" });
    expect(moved.fixture.venue).toBe("Ros A Mhil");

    expect(venue.from).toBe("Ballinasloe");
    expect(venue.to).toBe("Craughwell");

    expect(added.fixture.date).toBe("2027-01-13");
    expect(added.fixture.opponent).toBe("MacDara");

    // All four belong to squads the club actually fields.
    expect(changes.every((c) => c.teamId && c.teamId === c.fixture.teamId)).toBe(true);
  });

  it("keeps the league's own note attached when a real commented fixture moves", () => {
    // 6957591 carries "Moved as agreed (21/8)" in the capture.
    const now = real();
    const original = now.find((f) => f.fid === "6957591");
    expect(original.comment).toBe("Moved as agreed (21/8)");
    const then = patch(now, "6957591", { time: "18:00", comment: "" });

    const changes = diff(then, now, TODAY);
    expect(changes.map((c) => [c.type, c.fid])).toEqual([["moved", "6957591"]]);
    expect(changes[0].comment).toBe("Moved as agreed (21/8)");
    expect(changes[0].from.time).toBe("18:00");
    expect(changes[0].to.time).toBe("18:30");
  });

  it("does not confuse two same-day, same-time fixtures of different squads", () => {
    // 6951014 and 6951300 are both 2026-08-29 12:00 for different squads.
    const now = real();
    const then = patch(now, "6951300", { venue: "Craughwell" });
    const changes = diff(then, now, TODAY);
    expect(changes.map((c) => [c.type, c.fid])).toEqual([["venue", "6951300"]]);
    expect(changes[0].teamId).toBe("254061");
    expect(changes[0].to).toBe("Cregmore");
  });
});
