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

      {/* The edit loop is not obvious from the buttons alone, and the cache delay below
          looks exactly like a failed save - which invites a re-paste that does nothing.
          Saying so here is cheaper than rediscovering it every few months. */}
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
        <p className="dim">
          <b>Changes take a few minutes to appear.</b> The JSON is served through GitHub’s
          CDN, which caches compressed and uncompressed copies separately, so a reload can
          keep showing the old file until that copy expires. That is not a failed save —
          wait a few minutes rather than pasting again.
        </p>
      </div>
    </section>
  );
}
