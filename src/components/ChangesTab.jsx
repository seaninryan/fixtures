import { resolveTeams } from "../lib/teams.js";

const HEADINGS = {
  cancelled: "CANCELLED", moved: "MOVED", venue: "VENUE CHANGE",
  opponent: "CORRECTION", added: "NEW", comment: "NOTE",
};

function summarise(change) {
  switch (change.type) {
    case "moved":
      return `${change.from.date} ${change.from.time} → ${change.to.date} ${change.to.time}`;
    case "venue":
      return `${change.from || "(none)"} → ${change.to || "(none)"}`;
    case "opponent":
      return `${change.from.opponent} → ${change.to.opponent}`;
    // A note change carries its text in from/to, not in `comment` - see diff.js.
    case "comment":
      return `"${change.from || "(none)"}" → "${change.to || "(none)"}"`;
    default:
      return `${change.fixture.date} ${change.fixture.time} — ${change.fixture.venue}`;
  }
}

export default function ChangesTab({ history, fixtures, config }) {
  if (!history || history.length === 0) {
    return <p className="dim">No changes recorded yet.</p>;
  }
  // Labels resolve over EVERY fixture, never one run's changes. deriveLabels shows the
  // A/B letter only when the club runs more than one side at that age and gender, so a
  // subset renames "U14B Boys" to "U14 Boys". History is unioned in because a cancelled
  // fixture has already left the snapshot and still needs a squad name.
  const everyFixture = [
    ...(fixtures ?? []),
    ...history.flatMap((run) => run.changes.map((c) => c.fixture)),
  ];
  const { labels } = resolveTeams(everyFixture, config);
  return (
    <section>
      {history.map((run) => (
        <div className="card" key={run.checkedAt}>
          <h3 className="dim">{run.checkedAt.slice(0, 10)}</h3>
          {run.changes.map((c) => (
            <div className="change" key={`${c.type}-${c.fid}`}>
              <span className="tag">{HEADINGS[c.type]}</span>
              <strong>{labels[c.teamId] ?? c.fixture.ourTeam}</strong>{" "}
              {c.fixture.isHome ? "v" : "@"} {c.fixture.opponent}
              <div className="dim">{summarise(c)}</div>
              {c.comment ? <div className="dim">League note: “{c.comment}”</div> : null}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
