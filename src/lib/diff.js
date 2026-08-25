// Pure. What changed between two snapshots.
//
// Everything keys off the league's fixture id. That is the whole trick: matching on id
// turns a reschedule into "12:00 -> 16:00" instead of an unrelated delete and add, and it
// keeps working when a fixture moves to a different date, venue and opponent at once.

// Most disruptive first. Also the order sections appear in the email.
export const SEVERITY = ["cancelled", "moved", "venue", "opponent", "added", "comment"];

const byFid = (list) => new Map((list ?? []).map((f) => [f.fid, f]));

export function diff(prev, next, today) {
  const before = byFid(prev);
  const after = byFid(next);
  const changes = [];

  for (const [fid, p] of before) {
    if (after.has(fid)) continue;
    // A fixture leaving the list is ambiguous: the endpoint only ever returns UPCOMING
    // fixtures, so a played game disappears exactly like a cancelled one. The date settles
    // it. Without this, every Monday would email "43 fixtures cancelled".
    if (p.date > today) {
      changes.push({ type: "cancelled", fid, teamId: p.teamId, fixture: p, comment: p.comment || "" });
    }
  }

  for (const [fid, n] of after) {
    const p = before.get(fid);
    if (!p) {
      changes.push({ type: "added", fid, teamId: n.teamId, fixture: n, comment: n.comment || "" });
      continue;
    }

    let substantive = false;
    const note = n.comment || "";

    if (p.date !== n.date || p.time !== n.time) {
      substantive = true;
      changes.push({
        type: "moved", fid, teamId: n.teamId, fixture: n, comment: note,
        from: { date: p.date, time: p.time },
        to: { date: n.date, time: n.time },
      });
    }
    if (p.venue !== n.venue) {
      substantive = true;
      changes.push({ type: "venue", fid, teamId: n.teamId, fixture: n, comment: note,
        from: p.venue, to: n.venue });
    }
    if (p.opponent !== n.opponent || p.competition !== n.competition) {
      substantive = true;
      changes.push({
        type: "opponent", fid, teamId: n.teamId, fixture: n, comment: note,
        from: { opponent: p.opponent, competition: p.competition },
        to: { opponent: n.opponent, competition: n.competition },
      });
    }
    // The league writes its explanation in the comment, so it is context on the change
    // above rather than an item of its own. Alone, it is still worth knowing about.
    //
    // NOTE THE SHAPE: this is the one change type with NO `comment` key - the text is
    // the change, so it lives in from/to. That asymmetry is deliberate and load-bearing:
    // changeReport renders `League note: "..."` from `change.comment`, so setting it here
    // would print a note change's text twice. Consumers must read from/to for this type.
    if (!substantive && p.comment !== n.comment) {
      changes.push({ type: "comment", fid, teamId: n.teamId, fixture: n,
        from: p.comment, to: n.comment });
    }
  }

  return changes.sort(
    (a, b) =>
      SEVERITY.indexOf(a.type) - SEVERITY.indexOf(b.type) ||
      a.fixture.date.localeCompare(b.fixture.date) ||
      a.fixture.time.localeCompare(b.fixture.time),
  );
}
