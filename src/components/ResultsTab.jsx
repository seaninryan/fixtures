import { useState } from "react";
import { roundupLines } from "../lib/results.js";
import { RESULT_WINDOWS } from "../lib/window.js";

// `results` is the parsed results.json, or null when it could not be loaded. The
// distinction matters: an empty store means nobody played, a null one means we do not
// know, and rendering them identically would quietly turn a load failure into a
// confident "no games".
export default function ResultsTab({ results, fixtures, config, today }) {
  const [windowName, setWindowName] = useState("Last weekend");
  const [copied, setCopied] = useState(false);

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

  // Labels resolve over the FIXTURES, never over the windowed results - see
  // roundupLines. Passing the wrong list here is how the A/B letter goes missing.
  const lines = roundupLines(results?.results ?? [], config, windowName, today, fixtures);
  const text = lines.map((line) => line.text).join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <div className="row">
        {RESULT_WINDOWS.map((w) => (
          <button key={w} className={w === windowName ? "chip on" : "chip"}
                  onClick={() => setWindowName(w)}>{w}</button>
        ))}
      </div>
      <div className="card announcement">
        {lines.map((line, i) => (
          // The index is the key on purpose: these lines have no identity of their own,
          // and the whole list is rebuilt whenever the window changes.
          <div className={`aline ${line.kind}`} key={i}>
            {line.color
              ? <span className="swatch" style={{ background: line.color }} aria-hidden="true" />
              : null}
            <span className="atext">{line.text}</span>
          </div>
        ))}
      </div>
      <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  );
}
