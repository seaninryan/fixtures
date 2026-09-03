import { useState } from "react";
import { roundupLines } from "../lib/results.js";
import { pendingLines } from "../lib/pending.js";
import { RESULT_WINDOWS } from "../lib/window.js";

// `results` is the parsed results.json, or null when it could not be loaded. The
// distinction matters: an empty store means nobody played, a null one means we do not
// know, and rendering them identically would quietly turn a load failure into a
// confident "no games".
export default function ResultsTab({ results, fixtures, config, today, now }) {
  const [windowName, setWindowName] = useState("Last 7 days");
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

  // A played game with no result yet. Derived here rather than stored - see pending.js.
  // `now` carries the club's local time; without it there is nothing to compare a
  // kick-off against, so an absent prop yields no section rather than a wrong one.
  const pending = now ? pendingLines(fixtures, results?.results ?? [], config, now) : [];

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
      {pending.length > 0 && (
        // OUTSIDE the announcement card, and after it. `text` above is built from
        // roundupLines alone, so nothing here can reach the clipboard.
        <div className="card pending">
          <p className="phead">No result yet</p>
          {pending.map((line, i) => (
            // The index is the key on purpose: these lines have no identity of their
            // own, and the whole list is rebuilt whenever the data changes.
            <div className="aline pending" key={i}>
              <span className="swatch" style={{ background: line.color }} aria-hidden="true" />
              <span className="atext">{line.text}</span>
            </div>
          ))}
          <p className="dim">
            Played, but the league has not published a score. It usually appears within a
            day.
          </p>
        </div>
      )}
      <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  );
}
