import { useCallback, useEffect, useState } from "react";
import AnnouncementTab from "./components/AnnouncementTab.jsx";
import ResultsTab from "./components/ResultsTab.jsx";
import FormTab from "./components/FormTab.jsx";
import ChangesTab from "./components/ChangesTab.jsx";
import SquadsTab from "./components/SquadsTab.jsx";
import { dataUrl, DEFAULT_DATA_URL, DATA_REPO } from "./lib/dataSource.js";
import {
  initAuth, signIn, signOut, getAccessToken, accountEmail,
} from "./lib/googleAuth.js";
import { isOwner } from "./lib/owner.js";
import { clubNow } from "./lib/clock.js";

const TABS = ["Fixtures", "Results", "Form", "Changes", "Squads"];

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
  // "checking" | "signed-out" | "not-owner" | "ok". See src/lib/owner.js: this gate
  // keeps a stranger who finds the URL out of the app, and is not a security boundary.
  const [gate, setGate] = useState("checking");
  const [tab, setTab] = useState("Fixtures");
  const [state, setState] = useState({ status: "loading" });
  const [config, setConfig] = useState({ version: 1, teams: {} });

  const check = useCallback(async (interactive) => {
    // Never a silent token request at load - see googleAuth.js: GIS may never answer
    // one, and the page would sit on "Loading..." forever. A token this tab already
    // holds is enough to skip the button on a reload.
    const token = getAccessToken() ?? (interactive ? await signIn() : null);
    if (!token) return setGate("signed-out");
    if (await isOwner(await accountEmail(token))) return setGate("ok");
    // Drop the token: leaving a non-owner signed in invites a confusing retry loop
    // where the silent path keeps handing back the same wrong account.
    signOut();
    return setGate("not-owner");
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await initAuth();
      if (live) await check(false);
    })();
    return () => { live = false; };
  }, [check]);

  useEffect(() => {
    if (gate !== "ok") return undefined;
    let live = true;
    (async () => {
      try {
        // latest.json is the site. The others degrade: a club with no recorded changes
        // and no labels still gets a correct announcement.
        //
        // results.json resolves to null, NOT [], when it cannot be read. An empty array
        // would render as "No results in this window." - which reads as "nobody played"
        // when the truth is "we could not load them". That is the spinner problem in a
        // different costume, so the tab is told the difference and says so.
        // The FAI files degrade the way results.json does. A club whose squads have not
        // migrated yet has no latest-fai.json at all, and that is not an error - so the
        // snapshot resolves to an empty fixture list rather than rejecting and blanking
        // the whole site.
        const [snapshot, history, loaded, results, faiSnapshot, faiHistory, faiResults] =
          await Promise.all([
            loadJson("latest.json"),
            loadJson("changes.json").catch(() => []),
            loadJson("teams.json").catch(() => ({ version: 1, teams: {} })),
            loadJson("results.json").catch(() => null),
            loadJson("latest-fai.json").catch(() => ({ fixtures: [] })),
            loadJson("changes-fai.json").catch(() => []),
            loadJson("results-fai.json").catch(() => null),
          ]);
        if (!live) return;
        setConfig(loaded);
        setState({
          status: "ready", snapshot, history, results, faiSnapshot, faiHistory, faiResults,
        });
      } catch (err) {
        // The data is fetched across origins, so this is a real path: offline, a
        // rate-limited CDN, a data repo that is not public yet. Saying so beats a
        // spinner that never stops.
        if (live) setState({ status: "failed", error: String(err?.message ?? err) });
      }
    })();
    return () => { live = false; };
  }, [gate]);

  if (gate === "checking") {
    return <main className="wrap"><p className="dim">Loading…</p></main>;
  }

  if (gate !== "ok") {
    return (
      <main className="gate">
        {/* Nothing but the button. The wrong-account line stays, though: without it a
            second click just reopens the popup and looks like the site is broken. */}
        {gate === "not-owner"
          ? <p className="dim">That account does not have access to this site.</p>
          : null}
        <button className="primary" onClick={() => check(true)}>Sign in with Google</button>
      </main>
    );
  }

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

  const { snapshot, faiSnapshot } = state;
  // The club's local date, not UTC. Ireland is UTC+1 for half the year, so a UTC date
  // is a day behind between Irish midnight and 01:00 - every window would then select
  // yesterday's games. `now` also carries the time, which the Results tab needs to tell
  // whether a kick-off has passed.
  const now = clubNow(new Date());
  const today = now.date;

  // Every tab sees BOTH sources. The files are separate; the app is not. Labels and
  // colours come from the one shared teams.json, so a squad keeps its identity across the
  // announcement, the round-up, the chart and the table whichever system it is on.
  const fixtures = [...(snapshot.fixtures ?? []), ...(faiSnapshot?.fixtures ?? [])];

  // ResultsTab and FormTab both read `results?.results ?? []` and both branch on
  // `results === null`, so this must stay the WRAPPER shape and must keep null meaning
  // "could not load" - which they render differently from "nobody played". A bare array
  // here would silently break both tabs.
  //
  // null only when BOTH failed: a club whose squads have not migrated has no
  // results-fai.json at all, and that must not blank the Results tab. The cost is that if
  // exactly one of the two fails we show a partial store without saying so - accepted,
  // because catch(() => null) cannot tell "absent" from "failed" across origins.
  const results = state.results === null && state.faiResults === null
    ? null
    : { results: [...(state.results?.results ?? []), ...(state.faiResults?.results ?? [])] };

  const history = [...(state.history ?? []), ...(state.faiHistory ?? [])]
    .sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)));

  // Two sources, two fetchedAt stamps, and the OLDER one is the honest answer to "when
  // was this last updated": the site is only as current as its stalest source, so a FAI
  // scan that stopped running a week ago must show through rather than hide behind this
  // morning's Galway fetch. ISO strings compare correctly, so no Date is unwrapped here.
  // Either may be absent - one source can have no file at all - in which case the other
  // stamp is the whole truth.
  const stamps = [snapshot.fetchedAt, faiSnapshot?.fetchedAt].filter(Boolean);
  const updated = stamps.length === 0 ? undefined : stamps.sort()[0];

  return (
    <main className="wrap">
      <h1>Craughwell United</h1>
      <div className="row">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "chip on" : "chip"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Fixtures" && <AnnouncementTab fixtures={fixtures} config={config} today={today} />}
      {tab === "Results" && (
        <ResultsTab results={results} fixtures={fixtures} config={config}
                    today={today} now={now} />
      )}
      {tab === "Form" && (
        <FormTab results={results} fixtures={fixtures} config={config} today={today} />
      )}
      {tab === "Changes" && <ChangesTab history={history} fixtures={fixtures} config={config} />}
      {tab === "Squads" && <SquadsTab fixtures={fixtures} config={config} onChange={setConfig} />}
      <footer className="dim">Updated {updated?.slice(0, 10)}</footer>
    </main>
  );
}
