// src/lib/combine.js
// Pure. The loaded files merged across both sources. Memoised in App on `state`, so a
// render that changes nothing loaded (a sync poll tick, a tab switch) hands the tabs the
// same arrays and the Graphics tab does not rebuild every card.
import { dropGalwayDuplicates } from "./dedupe.js";

export function combine(state) {
  const { snapshot, faiSnapshot } = state;
  // Every tab sees BOTH sources. The files are separate; the app is not. Labels and
  // colours come from the one shared teams.json, so a squad keeps its identity across the
  // announcement, the round-up, the chart and the table whichever system it is on.
  const galwayFixtures = snapshot.fixtures ?? [];
  const faiFixtures = faiSnapshot?.fixtures ?? [];
  const faiAwaiting = faiSnapshot?.awaiting ?? [];

  // A game both leagues list is shown once, as FAI Connect's - see dedupe.js. Matched
  // against FAI's upcoming AND awaiting games, because the two scans need not agree on
  // whether a game has left the feed yet.
  const faiGames = [...faiFixtures, ...faiAwaiting];
  const upcoming = dropGalwayDuplicates(galwayFixtures, faiGames);
  const played = dropGalwayDuplicates(snapshot.awaiting ?? [], faiGames);

  const fixtures = [...upcoming.kept, ...faiFixtures];
  // Undeduped, for the tabs that describe the feeds themselves (Squads, Changes).
  const allFixtures = [...galwayFixtures, ...faiFixtures];
  // Played games each scan is still waiting on a result for - see awaiting.js.
  const awaiting = [...played.kept, ...faiAwaiting];

  // ResultsTab and FormTab both read `results?.results ?? []` and both branch on
  // `results === null`, so this must stay the WRAPPER shape and must keep null meaning
  // "could not load" - which they render differently from "nobody played". A bare array
  // here would silently break both tabs.
  //
  // null only when BOTH failed: a club whose squads have not migrated has no
  // results-fai.json at all, and that must not blank the Results tab. The cost is that if
  // exactly one of the two fails we show a partial store without saying so - accepted,
  // because catch(() => null) cannot tell "absent" from "failed" across origins.
  //
  // Results carry no kick-off time, so they match without one.
  const faiResults = state.faiResults?.results ?? [];
  const results = state.results === null && state.faiResults === null
    ? null
    : {
      results: [
        ...dropGalwayDuplicates(state.results?.results ?? [], faiResults, { withTime: false }).kept,
        ...faiResults,
      ],
    };
  return { fixtures, allFixtures, hidden: upcoming.hidden, awaiting, results };
}
