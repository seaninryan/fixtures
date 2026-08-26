import { useState } from "react";
import { announceLines } from "../lib/announce.js";
import { WINDOWS } from "../lib/window.js";

export default function AnnouncementTab({ fixtures, config, today }) {
  const [windowName, setWindowName] = useState("Next 7 days");
  const [copied, setCopied] = useState(false);

  // One builder for both: the swatches decorate these lines, and Copy sends the same
  // lines joined. The colour is deliberately NOT in the text - a swatch in the gutter
  // cannot ride along into a pasted WhatsApp message the way an emoji prefix did.
  const lines = announceLines(fixtures, config, windowName, today);
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
        {WINDOWS.map((w) => (
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
