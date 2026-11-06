// src/components/ConfigSave.jsx
// The one way teams.json is saved: copy here, paste on GitHub. The site is static and
// cannot write to the data repo. Shared by the Squads and Graphics tabs so both say the
// same thing - including the cache delay, which otherwise looks like a failed save.
import { useState } from "react";
import { EDIT_TEAMS_URL } from "../lib/dataSource.js";
import { cleanOpponents } from "../lib/opponents.js";

// Key order is not content: a hand-edited teams.json, or a rename removed and re-added,
// must not read as unsaved. Opponents go through cleanOpponents, as every reader does.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
}
function canonical(config) {
  const { opponents, ...rest } = config ?? {};
  const clean = cleanOpponents(opponents);
  return JSON.stringify(sortKeys(Object.keys(clean).length ? { ...rest, opponents: clean } : rest));
}

function renameChanges(config, saved) {
  const a = cleanOpponents(config?.opponents);
  const b = cleanOpponents(saved?.opponents);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]).length;
}

// savedConfig: what teams.json holds; null when it could not be read, and then there is
// nothing safe to save - the JSON here would paste an empty squad list over the real file.
export default function ConfigSave({ config, savedConfig }) {
  const [copied, setCopied] = useState(false);
  const json = `${JSON.stringify(config, null, 2)}\n`;
  const dirty = savedConfig != null && canonical(config) !== canonical(savedConfig);
  const renames = renameChanges(config, savedConfig);

  if (savedConfig === null) {
    return (
      <div className="card save warn">
        <p><b>teams.json could not be loaded</b> — reload before editing, or saving would
          overwrite it with an empty file.</p>
      </div>
    );
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
    <div className="card save">
      {dirty && (
        <p>
          <b>{renames > 0 ? `${renames} unsaved name change${renames === 1 ? "" : "s"}` : "Unsaved changes"}</b>
          {" "}— copy the JSON and paste it over teams.json on GitHub to keep them.
        </p>
      )}
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy JSON"}</button>
        <a className="chip" href={EDIT_TEAMS_URL} target="_blank" rel="noreferrer">Edit on GitHub</a>
      </div>
      <p className="dim">
        <b>Changes take a few minutes to appear.</b> The JSON is served through GitHub’s
        CDN, which caches compressed and uncompressed copies separately, so a reload can
        keep showing the old file until that copy expires. That is not a failed save —
        wait a few minutes rather than pasting again. If you used Sync now after saving,
        reload the page once the change is live so this stops showing as unsaved.
      </p>
    </div>
  );
}
