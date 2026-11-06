// src/components/GraphicsTab.jsx
// Thin. Every decision is in lib: cardRows (what each row says), manualResults (what is
// hand-entered or left off), cardLayout (where it all goes). This file wires state and
// runs the ops on canvases. Nothing at render time touches document, localStorage or a
// canvas - the SSR tests render it in node - so those live in effects and handlers.
import { useEffect, useMemo, useRef, useState } from "react";
import { WINDOWS, RESULT_WINDOWS, windowPredicate, resultWindowPredicate, addDays } from "../lib/window.js";
import { fixtureRows, resultRows, cardLabels } from "../lib/cardRows.js";
import { mergeManual, manualEntry, applyLeaveOff, MANUAL_DAYS } from "../lib/manualResults.js";
import { parseScore } from "../lib/normalize.js";
import { pendingFixtures } from "../lib/pending.js";
import { layoutCards, approxMeasure, DISPLAY_FONT, BODY_FONT, SHAPES } from "../lib/cardLayout.js";
import { canvasMeasure, loadBackground, drawCard, downloadCanvas } from "./cardCanvas.js";

const MODES = [["auto", "Auto"], ["single", "One card"], ["perDay", "Card per day"]];
const SHAPE_NAMES = Object.keys(SHAPES);
const SHAPE_LABEL = { "4x5": "4:5", "4x3": "4:3" };
const LS_LEAVE_OFF = "cards.leaveOff";
const LS_MANUAL = "cards.manual";

// Browser storage is a convenience: it can throw (private mode, blocked site data) or
// come back empty, and the tab must work either way.
function readLs(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeLs(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// "loading" | "ready" | "missing". A card drawn before the fonts arrive, or without
// them, is in a fallback face at widths measured for another font - so nothing draws or
// downloads until "ready", and "missing" says so on screen.
function useCardFonts() {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let live = true;
    const faces = [`700 40px "${DISPLAY_FONT}"`, `400 40px "${BODY_FONT}"`, `700 40px "${BODY_FONT}"`];
    // Judged on what load() actually found, NOT on document.fonts.check: check() answers
    // true when no face of that family is registered at all, which is exactly what a
    // blocked Google Fonts stylesheet looks like - the case the warning exists for.
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .then((lists) => lists.every((l) => l.length > 0 && l.every((ff) => ff.status === "loaded")))
      .catch(() => false)
      .then((ok) => { if (live) setStatus(ok ? "ready" : "missing"); });
    return () => { live = false; };
  }, []);
  return status;
}

const bothScores = (a, b) => parseScore(a) !== null && parseScore(b) !== null;

// The entries mergeManual would still use: older ones are dropped on read.
const liveEntries = (entries, today) =>
  entries.filter((e) => typeof e?.date === "string" && e.date >= addDays(today, -MANUAL_DAYS));

// layoutCards throws when a single row cannot fit even at the floor scale. There is no
// error boundary above the tabs, so that becomes a message, not a blank app.
function layoutAll(kind, rows, mode, measure) {
  try {
    return { cardsByShape: Object.fromEntries(SHAPE_NAMES.map((s) =>
      [s, layoutCards({ kind, rows, mode, shape: s, measure })])), error: null };
  } catch (e) {
    return { cardsByShape: Object.fromEntries(SHAPE_NAMES.map((s) => [s, []])), error: e.message };
  }
}

function CardPreview({ kind, shape, card, fontsReady }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  // Download stays off until the background is drawn, or it would save a blank PNG.
  const [drawn, setDrawn] = useState(false);
  // Keyed on content, not identity: an unrelated re-render that rebuilds an identical
  // card must not reload the background and redraw.
  const signature = useMemo(() => JSON.stringify(card), [card]);
  useEffect(() => {
    let live = true;
    setDrawn(false);
    if (!fontsReady) return () => { live = false; };
    loadBackground(kind, shape)
      .then((bg) => {
        if (live && ref.current) { drawCard(ref.current, card, bg); setError(null); setDrawn(true); }
      })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
    // `signature` stands in for `card` in the deps.
  }, [kind, shape, signature, fontsReady]);
  return (
    <figure className="cardprev">
      <canvas ref={ref} width={card.width} height={card.height} />
      <figcaption className="dim">{error ?? card.fileName}</figcaption>
      <button className="chip" disabled={!drawn || Boolean(error)}
              onClick={() => downloadCanvas(ref.current, card.fileName)}>Download</button>
    </figure>
  );
}

async function downloadAll(kind, shapes, cardsByShape) {
  for (const shape of shapes) {
    const bg = await loadBackground(kind, shape);
    for (const card of cardsByShape[shape]) {
      const canvas = document.createElement("canvas");
      drawCard(canvas, card, bg);
      await downloadCanvas(canvas, card.fileName);
    }
  }
}

export default function GraphicsTab({ fixtures, awaiting = [], results, config, today, now, initialKind = "Fixtures" }) {
  const [kind, setKind] = useState(initialKind);
  const [fxWindow, setFxWindow] = useState("This weekend");
  const [rsWindow, setRsWindow] = useState("Last 7 days");
  const [mode, setMode] = useState("auto");
  const [shape, setShape] = useState("4x5");
  const [leaveOff, setLeaveOff] = useState([]);
  const [manual, setManual] = useState([]);
  const [downloadError, setDownloadError] = useState(null);
  useEffect(() => {
    setLeaveOff(readLs(LS_LEAVE_OFF));
    // Expired entries are pruned from storage, not just hidden, so it cannot grow forever.
    const stored = readLs(LS_MANUAL);
    const kept = liveEntries(stored, today);
    if (kept.length !== stored.length) writeLs(LS_MANUAL, kept);
    setManual(kept);
  }, [today]);
  const fonts = useCardFonts();
  const fontsReady = fonts === "ready";
  // approxMeasure until the fonts are in. Nothing is drawn with it - previews and
  // downloads wait for fontsReady - it only lets the tab show its card list early.
  const measure = useMemo(() => (fontsReady ? canvasMeasure() : approxMeasure), [fontsReady]);

  const isResults = kind === "Results";
  const lower = isResults ? "results" : "fixtures";
  const official = useMemo(() => results?.results ?? [], [results]);
  const merged = useMemo(() => mergeManual(official, manual, today), [official, manual, today]);

  const allRows = useMemo(() => {
    if (isResults) {
      const chosen = merged.results.filter(resultWindowPredicate(rsWindow, today));
      // Labels over ALL fixtures; the chosen results only fill gaps for departed squads.
      const labels = cardLabels(fixtures, config, chosen.map((r) => r.teamId));
      return resultRows(chosen, labels);
    }
    const chosen = fixtures.filter(windowPredicate(fxWindow, today));
    return fixtureRows(chosen, cardLabels(fixtures, config, []));
  }, [isResults, merged, rsWindow, fxWindow, fixtures, config, today]);

  // Leave-off keys carry the kind: a fixture row and its result share a fid, and leaving
  // a game off Friday's fixtures card must not hide its score on Sunday's results card.
  const leaveKey = (id) => `${lower}:${id}`;
  // Memoised so the cards keep their identity across renders - CardPreview redraws
  // whenever its `card` changes.
  const rows = useMemo(() => {
    const prefix = `${lower}:`;
    const off = leaveOff.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    return applyLeaveOff(allRows, off);
  }, [allRows, leaveOff, lower]);
  const { cardsByShape, error: layoutError } = useMemo(
    () => layoutAll(lower, rows, mode, measure), [lower, rows, mode, measure]);

  function toggleLeaveOff(key) {
    const next = leaveOff.includes(key) ? leaveOff.filter((x) => x !== key) : [...leaveOff, key];
    setLeaveOff(next);
    writeLs(LS_LEAVE_OFF, next);
  }
  function saveManual(next) { setManual(next); writeLs(LS_MANUAL, next); }
  function startDownload(shapes) {
    setDownloadError(null);
    downloadAll(lower, shapes, cardsByShape).catch((e) => setDownloadError(e.message));
  }

  if (isResults && results === null) {
    return (
      <section>
        <KindPicker kind={kind} setKind={setKind} />
        <div className="card"><p>Could not load the results.</p>
          <p className="dim">The graphics need the results file. Reload, or check the data repo.</p></div>
      </section>
    );
  }

  const windows = isResults ? RESULT_WINDOWS : WINDOWS;
  const windowName = isResults ? rsWindow : fxWindow;
  const setWindow = isResults ? setRsWindow : setFxWindow;
  const cards = cardsByShape[shape];

  return (
    <section>
      <KindPicker kind={kind} setKind={setKind} />
      <div className="row">
        {windows.map((w) => (
          <button key={w} className={w === windowName ? "chip on" : "chip"} onClick={() => setWindow(w)}>{w}</button>
        ))}
      </div>
      <div className="row">
        {MODES.map(([m, label]) => (
          <button key={m} className={m === mode ? "chip on" : "chip"} onClick={() => setMode(m)}>{label}</button>
        ))}
        {SHAPE_NAMES.map((s) => (
          <button key={s} className={s === shape ? "chip on" : "chip"} onClick={() => setShape(s)}>
            {s === "4x5" ? "4:5 portrait" : "4:3 landscape"}
          </button>
        ))}
      </div>

      {fonts === "missing" && (
        <div className="card warn"><p>Card fonts did not load — downloads would use the wrong font.</p>
          <p className="dim">Reload; if it persists, Google Fonts may be blocked on this network.</p></div>
      )}
      {layoutError && <div className="card warn"><p>Could not lay out the cards: {layoutError}</p></div>}
      {!layoutError && cards.length === 0 && (
        <div className="card"><p className="dim">Nothing in this window.</p></div>
      )}
      {cards.length > 0 && (
        <>
          <div className="row">
            <button className="primary" disabled={!fontsReady} onClick={() => startDownload([shape])}>Download all ({SHAPE_LABEL[shape]})</button>
            <button className="chip" disabled={!fontsReady} onClick={() => startDownload(SHAPE_NAMES)}>Download both shapes</button>
            {downloadError && <span className="dim">{downloadError}</span>}
          </div>
          <div className="cardgrid">
            {cards.map((card) => <CardPreview key={card.fileName} kind={lower} shape={shape} card={card} fontsReady={fontsReady} />)}
          </div>
        </>
      )}

      {merged.conflicts.length > 0 && (
        <div className="card warn">
          {merged.conflicts.map(({ entry, official: o }) => (
            <p key={entry.id}>
              The league scored {entry.opponent} on {entry.date} as {o.ourScore}-{o.theirScore};
              you entered {entry.ourScore}-{entry.theirScore}. A card you posted may be wrong.
            </p>
          ))}
        </div>
      )}

      {allRows.length > 0 && (
        <div className="card">
          <p className="phead">Rows</p>
          {allRows.map((r) => (
            <label key={r.id} className="aline">
              <input type="checkbox" checked={leaveOff.includes(leaveKey(r.id))}
                     onChange={() => toggleLeaveOff(leaveKey(r.id))} />
              {" "}Leave off — {r.segments.map((s) => s.text).join("")}
            </label>
          ))}
        </div>
      )}

      {isResults && (
        <ManualResults fixtures={fixtures} awaiting={awaiting} official={official} config={config}
                       now={now} today={today} manual={manual} onChange={saveManual} />
      )}
    </section>
  );
}

function KindPicker({ kind, setKind }) {
  return (
    <div className="row">
      {["Fixtures", "Results"].map((k) => (
        <button key={k} className={k === kind ? "chip on" : "chip"} onClick={() => setKind(k)}>{k}</button>
      ))}
    </div>
  );
}

// Hand-entered results. Pending games come pre-filled; a free-form row covers a game the
// league never listed. Stored in this browser only; shown on cards only.
function ManualResults({ fixtures, awaiting, official, config, now, today, manual, onChange }) {
  const pending = now ? pendingFixtures(fixtures, official, now, awaiting) : [];
  const shown = liveEntries(manual, today);
  // A pre-fill is hidden once it has an entry: by fid, or - for a free-form entry for the
  // same game - by squad and date, the rule mergeManual matches official results by.
  const entered = new Set(manual.map((e) => e.id));
  const enteredDay = new Set(manual.map((e) => `${e.teamId}|${e.date}`));
  // Gaps include the results' squads, so a squad whose season has ended is still pickable.
  const labels = cardLabels(fixtures, config,
    [...pending, ...manual, ...official].map((x) => x.teamId));
  const squads = Object.entries(labels).sort((a, b) => a[1].localeCompare(b[1]));
  const blank = { teamId: "", opponent: "", isHome: true, date: now?.date ?? "", ours: "", theirs: "" };
  const [free, setFree] = useState(blank);

  // -> true when stored. manualEntry returns null for a blank or non-numeric score.
  function add(fixture, ours, theirs) {
    const e = manualEntry({ fixture, ourScore: ours, theirScore: theirs });
    if (!e) return false;
    onChange([...manual.filter((m) => m.id !== e.id), e]);
    return true;
  }

  return (
    <div className="card">
      <p className="phead">Add a result the league has not published</p>
      {pending.filter((f) => !entered.has(String(f.fid)) && !enteredDay.has(`${f.teamId}|${f.date}`)).map((f) => (
        <PendingRow key={f.fid} fixture={f} label={labels[f.teamId] ?? f.ourTeam} onAdd={add} />
      ))}
      <form className="row" onSubmit={(ev) => {
        ev.preventDefault();
        const fixture = { fid: null, teamId: free.teamId, date: free.date, time: "",
          isHome: free.isHome, opponent: free.opponent.trim(), ourTeam: labels[free.teamId] ?? "" };
        if (add(fixture, free.ours, free.theirs)) setFree(blank);
      }}>
        <select value={free.teamId} onChange={(e) => setFree({ ...free, teamId: e.target.value })}>
          <option value="">Squad…</option>
          {squads.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={free.isHome ? "home" : "away"} onChange={(e) => setFree({ ...free, isHome: e.target.value === "home" })}>
          <option value="home">v (home)</option>
          <option value="away">@ (away)</option>
        </select>
        <input placeholder="Opponent" value={free.opponent} onChange={(e) => setFree({ ...free, opponent: e.target.value })} />
        <input type="date" value={free.date} onChange={(e) => setFree({ ...free, date: e.target.value })} />
        <input className="score" inputMode="numeric" placeholder="Us" value={free.ours} onChange={(e) => setFree({ ...free, ours: e.target.value })} />
        <input className="score" inputMode="numeric" placeholder="Them" value={free.theirs} onChange={(e) => setFree({ ...free, theirs: e.target.value })} />
        <button className="chip" type="submit" disabled={!free.teamId || !free.opponent.trim() || !free.date || !bothScores(free.ours, free.theirs)}>Add</button>
      </form>
      {shown.length > 0 && (
        <>
          <p className="phead">Entered by hand</p>
          {shown.map((e) => (
            <div key={e.id} className="aline">
              {labels[e.teamId] ?? e.ourTeam ?? e.teamId} {e.isHome ? "v" : "@"} {e.opponent}: {e.ourScore}-{e.theirScore} ({e.date}){" "}
              <button className="chip" onClick={() => onChange(manual.filter((m) => m.id !== e.id))}>Remove</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PendingRow({ fixture, label, onAdd }) {
  const [ours, setOurs] = useState("");
  const [theirs, setTheirs] = useState("");
  return (
    <div className="row">
      <span>{`${label} ${fixture.isHome ? "v" : "@"} ${fixture.opponent} — ${fixture.date}`}</span>
      <input className="score" inputMode="numeric" placeholder="Us" value={ours} onChange={(e) => setOurs(e.target.value)} />
      <input className="score" inputMode="numeric" placeholder="Them" value={theirs} onChange={(e) => setTheirs(e.target.value)} />
      <button className="chip" disabled={!bothScores(ours, theirs)} onClick={() => onAdd(fixture, ours, theirs)}>Add</button>
    </div>
  );
}
