import { useEffect, useState } from "react";
import AnnouncementTab from "./components/AnnouncementTab.jsx";
import ChangesTab from "./components/ChangesTab.jsx";
import SquadsTab from "./components/SquadsTab.jsx";

const TABS = ["Fixtures", "Changes", "Squads"];

async function loadJson(name, fallback) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState("Fixtures");
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState({ version: 1, teams: {} });

  useEffect(() => {
    loadJson("latest.json", null).then(setSnapshot);
    loadJson("changes.json", []).then(setHistory);
    loadJson("teams.json", { version: 1, teams: {} }).then(setConfig);
  }, []);

  if (!snapshot) return <main className="wrap"><p className="dim">Loading…</p></main>;

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
      {tab === "Changes" && <ChangesTab history={history} config={config} />}
      {tab === "Squads" && <SquadsTab fixtures={fixtures} config={config} onChange={setConfig} />}
      <footer className="dim">Updated {snapshot.fetchedAt?.slice(0, 10)}</footer>
    </main>
  );
}
