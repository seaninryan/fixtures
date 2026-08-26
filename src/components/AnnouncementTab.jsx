import { useState } from "react";
import { announce } from "../lib/announce.js";
import { WINDOWS } from "../lib/window.js";

export default function AnnouncementTab({ fixtures, config, today }) {
  const [windowName, setWindowName] = useState("Next 7 days");
  const [colors, setColors] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = announce(fixtures, config, windowName, today, { colors });

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
      <label className="row dim">
        <input type="checkbox" checked={colors} onChange={(e) => setColors(e.target.checked)} />
        Colour squares
      </label>
      <pre className="card announcement">{text}</pre>
      <button className="primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  );
}
