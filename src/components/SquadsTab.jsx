import { teamsFromFixtures, resolveTeams } from "../lib/teams.js";
import { squadColor } from "../lib/squadColors.js";
import { cleanOpponents, setOpponent } from "../lib/opponents.js";
import ConfigSave from "./ConfigSave.jsx";

// The site is static, so it cannot write to the repo. Editing is therefore
// edit-here / copy / paste-on-GitHub. See the spec's "Config editing" section.
export default function SquadsTab({ fixtures, config, savedConfig, onChange }) {
  // teams.json failed to load: edits could only be saved over it as an empty file.
  const locked = savedConfig === null;
  const squads = teamsFromFixtures(fixtures);
  const { labels } = resolveTeams(fixtures, config);
  const renames = Object.entries(cleanOpponents(config?.opponents)).sort(([a], [b]) => a.localeCompare(b));

  function set(teamId, field, value) {
    onChange({
      ...config,
      teams: { ...config.teams, [teamId]: { ...(config.teams?.[teamId] ?? {}), [field]: value } },
    });
  }

  return (
    <section>
      {Object.entries(squads).map(([teamId, meta]) => {
        const unlabelled = !config?.teams?.[teamId]?.label;
        return (
          <div className="card row" key={teamId}>
            <input type="color" disabled={locked}
                   value={squadColor(teamId, config).bg}
                   onChange={(e) => set(teamId, "color", e.target.value)} />
            <div className="grow">
              <input className="label-input" disabled={locked}
                     value={config?.teams?.[teamId]?.label ?? ""}
                     placeholder={labels[teamId]}
                     onChange={(e) => set(teamId, "label", e.target.value || null)} />
              <div className="dim">{teamId} — {meta.competition}</div>
            </div>
            {unlabelled ? <span className="tag warn">needs a label</span> : null}
          </div>
        );
      })}
      <div className="card">
        <h3>Opponent names</h3>
        {renames.length === 0
          ? <p className="dim">No renames yet. Rename an opponent on a card in the Graphics tab; team letters and season codes are removed automatically.</p>
          : renames.map(([raw, shown]) => (
            <div className="row" key={raw}>
              <span className="dim">{raw}</span> → <b>{shown}</b>
              <button className="chip" disabled={locked} onClick={() => onChange(setOpponent(config, raw, ""))}>Remove</button>
            </div>
          ))}
      </div>
      <ConfigSave config={config} savedConfig={savedConfig} />

      {/* The edit loop is not obvious from the buttons alone. The cache delay, which
          looks exactly like a failed save, is explained in ConfigSave above. */}
      <div className="card help">
        <h3>Editing squads</h3>
        <p className="dim">
          Nothing here saves by itself — the site is static and cannot write to the data
          repo. Change the labels and colours above, press <b>Copy JSON</b>, then
          <b> Edit on GitHub</b>, paste over the whole file and commit.
        </p>
        <p className="dim">
          A squad with no label shows its raw name from the league feed, like
          “Craughwell United Juniors”. A label you set always wins: the daily run seeds
          new squads but never overwrites what you have typed.
        </p>
      </div>
    </section>
  );
}
