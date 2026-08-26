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

export default function ChangesTab({ history, config }) {
  if (!history || history.length === 0) {
    return <p className="dim">No changes recorded yet.</p>;
  }
  return (
    <section>
      {history.map((run) => {
        const { labels } = resolveTeams(run.changes.map((c) => c.fixture), config);
        return (
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
        );
      })}
    </section>
  );
}
