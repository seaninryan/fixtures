// src/lib/awaiting.js
// Pure. Played games that have left the league's feed with no result yet.
//
// The feed lists only UPCOMING fixtures, and diff.js deliberately ignores a past-dated
// departure (it is a played game, not a cancellation). So once a run happens after
// kick-off, a game the league has not scored yet vanished from the data entirely - the
// gap pending.js used to document. A Sunday-evening "Sync now" makes that the ordinary
// case, so the snapshot now carries such games in `awaiting` until their result lands.
//
// Kept INSIDE latest.json / latest-fai.json because the data repo's workflow `git add`s
// a fixed list of files; a new file would need an edit in the other repo.
//
// Never counted by the zero-fixtures or shrink guards and never diffed: these games have
// already left the feed, and the guards are about the feed.
import { addDays } from "./window.js";
import { sortFixtures } from "./normalize.js";

// Long enough to outlast any league's delay in publishing; short enough that a game the
// league never scores (a walkover recorded elsewhere) stops showing as pending.
export const AWAITING_DAYS = 14;

export function nextAwaiting({ previous, fixtures, results, today }) {
  // Same first-run test as runCheck: no baseline, nothing to carry.
  if (!previous || !Array.isArray(previous.fixtures)) return [];
  const inFeed = new Set((fixtures ?? []).map((f) => f.fid));
  const scored = new Set((results ?? []).map((r) => r.fid));
  const floor = addDays(today, -AWAITING_DAYS);
  const byFid = new Map();
  const carried = Array.isArray(previous.awaiting) ? previous.awaiting : [];
  for (const f of [...carried, ...previous.fixtures]) {
    // `<= today`, matching diff.js: a departure dated today is a played game.
    if (f.date > today || f.date < floor) continue;
    if (inFeed.has(f.fid) || scored.has(f.fid)) continue;
    byFid.set(f.fid, f);
  }
  return sortFixtures([...byFid.values()]);
}
