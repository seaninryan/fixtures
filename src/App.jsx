import { useEffect, useState } from "react";
import AnnouncementTab from "./components/AnnouncementTab.jsx";
import ChangesTab from "./components/ChangesTab.jsx";
import SquadsTab from "./components/SquadsTab.jsx";
import { dataUrl, DEFAULT_DATA_URL, DATA_REPO } from "./lib/dataSource.js";

const TABS = ["Fixtures", "Changes", "Squads"];

// Set VITE_DATA_URL in a .env file to read a local copy instead of the data repo.
const BASE = import.meta.env.VITE_DATA_URL || DEFAULT_DATA_URL;

// no-cache, not no-store: the CDN copy is fine to revalidate against, we just must not
// let the browser serve yesterday's snapshot out of its own cache without asking.
async function loadJson(name) {
  const res = await fetch(dataUrl(name, BASE), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [tab, setTab] = useState("Fixtures");
  const [state, setState] = useState({ status: "loading" });
  const [config, setConfig] = useState({ version: 1, teams: {} });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // latest.json is the site. The other two degrade to empty: a club with no
        // recorded changes and no labels still gets a correct announcement.
        const [snapshot, history, loaded] = await Promise.all([
          loadJson("latest.json"),
          loadJson("changes.json").catch(() => []),
          loadJson("teams.json").catch(() => ({ version: 1, teams: {} })),
        ]);
        if (!live) return;
        setConfig(loaded);
        setState({ status: "ready", snapshot, history });
      } catch (err) {
        // The data is fetched across origins now, so this is a real path: offline, a
        // rate-limited CDN, a data repo that is not public yet. Saying so beats a
        // spinner that never stops.
        if (live) setState({ status: "failed", error: String(err?.message ?? err) });
      }
    })();
    return () => { live = false; };
  }, []);

  if (state.status === "loading") {
    return <main className="wrap"><p className="dim">Loading…</p></main>;
  }

  if (state.status === "failed") {
    return (
      <main className="wrap">
        <h1>Craughwell United</h1>
        <div className="card">
          <p>Could not load the fixtures.</p>
          <p className="dim">{state.error}</p>
          <p className="dim">
            The snapshots come from{" "}
            <a href={`https://github.com/${DATA_REPO}`}>{DATA_REPO}</a>. If that repo is
            reachable, this is usually a network hiccup — reload.
          </p>
        </div>
      </main>
    );
  }

  const { snapshot, history } = state;
  const today = new Date().toISOString().slice(0, 10);
  const fixtures = snapshot.fixtures ?? [];

  return (
    <main className="wrap">
      <h1>Craughwell United</h1>
      <div className="row">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "chip on" : "chip"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Fixtures" && <AnnouncementTab fixtures={fixtures} config={config} today={today} />}
      {tab === "Changes" && <ChangesTab history={history} fixtures={fixtures} config={config} />}
      {tab === "Squads" && <SquadsTab fixtures={fixtures} config={config} onChange={setConfig} />}
      <footer className="dim">Updated {snapshot.fetchedAt?.slice(0, 10)}</footer>
    </main>
  );
}
