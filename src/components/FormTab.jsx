import { squadRecords } from "../lib/form.js";
import { squadColor } from "../lib/squadColors.js";

// An em dash, not a zero. A squad that has yet to kick a ball must not render as 0.00,
// which reads as "lost every game" - and nine of eighteen squads are in that state.
const DASH = "—";

function ppg(record) {
  return record.pointsPerGame === null ? DASH : record.pointsPerGame.toFixed(2);
}

// `results` is the parsed results.json, or null when it could not be loaded. An empty
// store means nobody has played; a null one means we do not know, and rendering them
// identically would turn a load failure into a confident "no games".
export default function FormTab({ results, fixtures, config, today }) {
  if (results === null) {
    return (
      <section>
        <div className="card">
          <p>Could not load the results.</p>
          <p className="dim">
            This is not the same as no games having been played — the results file could
            not be read. Reload, or check the data repo.
          </p>
        </div>
      </section>
    );
  }

  const stored = results?.results ?? [];
  const records = squadRecords(stored, fixtures, config);

  return (
    <section>
      {stored.length === 0 ? (
        <div className="card"><p>No results yet.</p></div>
      ) : null}
      <div className="card">
        <table className="form-table">
          <thead>
            <tr>
              <th className="squad">Squad</th>
              <th>P</th><th>W</th><th>D</th><th>L</th>
              <th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>PPG</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.teamId}>
                <td className="squad">
                  <span className="swatch inline" style={{ background: squadColor(r.teamId, config).bg }}
                        aria-hidden="true" />
                  <span>{r.label}</span>
                  <div className="dim">{r.competition}</div>
                </td>
                {r.played === 0 ? (
                  // One dash per column rather than a row of zeros.
                  <>
                    <td>0</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td>
                    <td>{DASH}</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td><td>{DASH}</td>
                  </>
                ) : (
                  <>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                    <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td>
                    <td>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                    <td>{r.points}</td><td>{ppg(r)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim">
        Points are 3 for a win, 1 for a draw. Squads play in different divisions, so
        these are each squad&apos;s own record rather than a table to rank them by.
      </p>
    </section>
  );
}
