import { useState } from "react";
import {
  squadRecords, defaultSelection, weekAxis, weekSeries, seriesGeometry, FORM_WINDOWS,
  SORT_COLUMNS, DEFAULT_SORT, sortRecords,
} from "../lib/form.js";
import { squadColor } from "../lib/squadColors.js";

// An em dash, not a zero. A squad that has yet to kick a ball must not render as 0.00,
// which reads as "lost every game" - and nine of eighteen squads are in that state.
const DASH = "—";

// viewBox units. The SVG scales to its container by CSS, so this is an aspect ratio
// rather than a pixel size.
const CHART_W = 640;
const CHART_H = 220;

// Above this many lines, colour cannot carry identity - the dataviz guidance caps a
// categorical palette at 8 series. The owner chose no cap, so this warns instead of
// blocking, and the direct labels drop away before it (see DIRECT_LABEL_LIMIT).
const CROWDED = 8;

// Direct labels are the thing that makes many series readable, but they collide with
// each other past a handful. Below this many, label every line; above it, the checkbox
// list and the hover titles carry identity.
const DIRECT_LABEL_LIMIT = 6;

const MODES = [
  { key: "cumulative", label: "Cumulative" },
  { key: "weekly", label: "Weekly points" },
];

function ppg(record) {
  return record.pointsPerGame === null ? DASH : record.pointsPerGame.toFixed(2);
}

// `results` is the parsed results.json, or null when it could not be loaded. An empty
// store means nobody has played; a null one means we do not know, and rendering them
// identically would turn a load failure into a confident "no games".
export default function FormTab({ results, fixtures, config, today }) {
  // Hooks run before the early return below, because a hook may never be conditional.
  // null means "not chosen yet", so the default is computed from the data rather than
  // pinned in an effect - which keeps this component renderable on the server.
  const [picked, setPicked] = useState(null);
  const [windowName, setWindowName] = useState(FORM_WINDOWS[0]);
  const [mode, setMode] = useState("cumulative");
  const [sort, setSort] = useState(DEFAULT_SORT);

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

  // A display pass over squadRecords' stable alphabetical base - see sortRecords.
  const sorted = sortRecords(records, sort.key, sort.direction);

  // Clicking the active column flips it. A new column starts at the interesting end:
  // descending for a number, A-Z for the squad name.
  function sortBy(column) {
    setSort(sort.key === column.key
      ? { key: column.key, direction: sort.direction === "asc" ? "desc" : "asc" }
      : { key: column.key, direction: column.numeric ? "desc" : "asc" });
  }

  const selected = picked ?? defaultSelection(records);
  const weeks = weekAxis(stored, windowName, today);
  const series = weekSeries(stored, fixtures, config, { mode, windowName, teamIds: selected, today });
  const { xTicks, yTicks, lines } = seriesGeometry(series, weeks, CHART_W, CHART_H);
  const labelDirectly = lines.length > 0 && lines.length <= DIRECT_LABEL_LIMIT;

  function toggle(teamId) {
    setPicked(selected.includes(teamId)
      ? selected.filter((id) => id !== teamId)
      : [...selected, teamId]);
  }

  return (
    <section>
      {stored.length === 0 ? (
        <div className="card"><p>No results yet.</p></div>
      ) : (
        <>
          <div className="row">
            {FORM_WINDOWS.map((w) => (
              <button key={w} className={w === windowName ? "chip on" : "chip"}
                      onClick={() => setWindowName(w)}>{w}</button>
            ))}
          </div>
          <div className="row">
            {MODES.map((m) => (
              <button key={m.key} className={m.key === mode ? "chip on" : "chip"}
                      onClick={() => setMode(m.key)}>{m.label}</button>
            ))}
          </div>

          <div className="card">
            {lines.length === 0 ? (
              <p className="dim">Pick a squad to compare.</p>
            ) : (
              <svg className="chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                   role="img" aria-label="Points by week, per squad">
                {yTicks.map((t) => (
                  <g key={t.label}>
                    <line className="grid" x1="30" y1={t.y} x2={CHART_W - 14} y2={t.y} />
                    <text className="tick" x="24" y={t.y + 4} textAnchor="end">{t.label}</text>
                  </g>
                ))}
                {xTicks.map((t) => (
                  <text key={t.label} className="tick" x={t.x} y={CHART_H - 6}
                        textAnchor="middle">{t.label}</text>
                ))}
                {lines.map((line) => (
                  <g key={line.teamId}>
                    <path className="series" d={line.d} fill="none" stroke={line.color}
                          strokeWidth="2" strokeDasharray={line.dash || undefined}
                          strokeLinecap="round" strokeLinejoin="round" />
                    {line.points.map((p) => (
                      // A 5px marker with a 2px surface ring, so overlapping series stay
                      // separable. The <title> is the hover tooltip - native, no JS.
                      <circle key={`${line.teamId}-${p.week}`} cx={p.x} cy={p.y} r="5"
                              fill={line.color} stroke="#182029" strokeWidth="2">
                        <title>{`${line.label} — ${p.week}: ${p.value}`}</title>
                      </circle>
                    ))}
                    {labelDirectly ? (
                      <text className="series-label"
                            x={line.points.at(-1).x - 6} y={line.points.at(-1).y - 10}
                            textAnchor="end" fill={line.color}>{line.label}</text>
                    ) : null}
                  </g>
                ))}
              </svg>
            )}
          </div>

          {selected.length > CROWDED ? (
            <p className="dim">
              {selected.length} squads selected — colour alone cannot separate this many
              lines. The table below is the reliable read.
            </p>
          ) : null}

          {/* The checkbox list is also the legend: every row carries its squad's colour,
              so identity is never colour-in-the-chart alone. */}
          <div className="card">
            <div className="row">
              <button className="chip" onClick={() => setPicked(records.map((r) => r.teamId))}>All</button>
              <button className="chip" onClick={() => setPicked([])}>None</button>
            </div>
            {records.map((r) => (
              <label className="legend-row" key={r.teamId}>
                <input type="checkbox" checked={selected.includes(r.teamId)}
                       onChange={() => toggle(r.teamId)} />
                <span className="swatch inline" style={{ background: squadColor(r.teamId, config).bg }}
                      aria-hidden="true" />
                <span>{r.label}</span>
                <span className="dim">{r.played === 0 ? "no games" : `${r.played} played`}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Above the table, not below it: the tab now opens on a ranking, so the reader
          needs this before the numbers rather than after them. */}
      <p className="dim caveat">
        Points are 3 for a win, 1 for a draw. Squads play in different divisions, so
        these are each squad&apos;s own record — a squad top on points per game in a
        lower division is not outplaying one below it in a championship.
      </p>
      <div className="card">
        <table className="form-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((column) => (
                <th key={column.key} className={column.key === "label" ? "squad" : undefined}
                    aria-sort={sort.key === column.key
                      ? (sort.direction === "asc" ? "ascending" : "descending")
                      : "none"}>
                  <button className="sort" onClick={() => sortBy(column)}>
                    {column.label}
                    {/* The arrow is decorative - aria-sort above is what conveys state. */}
                    <span aria-hidden="true">
                      {sort.key === column.key ? (sort.direction === "asc" ? " \u25b2" : " \u25bc") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
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
    </section>
  );
}
