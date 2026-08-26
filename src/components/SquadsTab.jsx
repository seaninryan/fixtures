import { useState } from "react";
import { teamsFromFixtures, resolveTeams } from "../lib/teams.js";
import { squadColor } from "../lib/squadColors.js";
import { EDIT_TEAMS_URL } from "../lib/dataSource.js";

// The site is static, so it cannot write to the repo. Editing is therefore
// edit-here / copy / paste-on-GitHub. See the spec's "Config editing" section.
export default function SquadsTab({ fixtures, config, onChange }) {
  const [copied, setCopied] = useState(false);
  const squads = teamsFromFixtures(fixtures);
  const { labels } = resolveTeams(fixtures, config);
  const json = `${JSON.stringify(config, null, 2)}\n`;

  function set(teamId, field, value) {
    onChange({
      ...config,
      teams: { ...config.teams, [teamId]: { ...(config.teams?.[teamId] ?? {}), [field]: value } },
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      {Object.entries(squads).map(([teamId, meta]) => {
        const unlabelled = !config?.teams?.[teamId]?.label;
        return (
          <div className="card row" key={teamId}>
            <input type="color"
                   value={squadColor(teamId, config).bg}
                   onChange={(e) => set(teamId, "color", e.target.value)} />
            <div className="grow">
              <input className="label-input"
                     value={config?.teams?.[teamId]?.label ?? ""}
                     placeholder={labels[teamId]}
                     onChange={(e) => set(teamId, "label", e.target.value || null)} />
              <div className="dim">{teamId} — {meta.competition}</div>
            </div>
            {unlabelled ? <span className="tag warn">needs a label</span> : null}
          </div>
        );
      })}
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy JSON"}</button>
        <a className="chip" href={EDIT_TEAMS_URL} target="_blank" rel="noreferrer">Edit on GitHub</a>
      </div>
    </section>
  );
}
