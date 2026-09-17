// The second module in this project that touches the outside world.
//
// Three things here are load-bearing:
//   1. THE api_key HEADER IS REQUIRED. Without it the host answers 403. It is a
//      credential observed in FAI Connect's own app traffic - server-side only, never in
//      browser code, never committed.
//   2. THERE IS A USER-AGENT DENYLIST. `Python-urllib/3.12` gets a 403 while curl's
//      default, okhttp, `node` and a browser UA all get 200. The same class of trap as
//      the CloudFront rule in fetchFixtures.js, so it gets the same treatment: send an
//      explicit UA rather than trusting whatever the runtime happens to use.
//   3. `size` IS THE TOTAL, NOT THE PAGE LENGTH. Verified - pageSize=2 returns size=9
//      with two results. So a short page is detectable, and detecting it matters: a
//      truncated list read as complete looks exactly like fixtures being cancelled.
//
// Like fetchFixtures, this deliberately does NOT judge an empty body. Zero teams or zero
// matches is runFaiCheck's decision, since it owns the abort rules.
export const FAI_BASE_URL = "https://api-fai.analyticom.de";

// Identifies this scan honestly rather than impersonating the mobile app. Any UA outside
// the denylist is accepted; what matters is that one is sent at all.
export const FAI_USER_AGENT = "craughwell-fixtures/1.0 (+https://github.com/seaninryan/fixtures)";

export const FAI_PAGE_SIZE = 100;
export const FAI_PERIODS = ["future", "past"];

async function getJson(url, { apiKey, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl(url, {
    headers: {
      api_key: apiKey,
      "accept-language": "en",
      "User-Agent": FAI_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`FAI Connect fetch failed: HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchTeams(clubId, opts) {
  return getJson(`${FAI_BASE_URL}/api/live/team/${clubId}/teams`, opts);
}

// The trailing `/1` is inert - verified that /0, /2 and /3 return identical data. It is
// sent because the app sends it, not because anything depends on it.
export async function fetchMatches(teamId, period, opts) {
  if (!FAI_PERIODS.includes(period)) {
    throw new Error(`unknown period "${period}" (expected ${FAI_PERIODS.join(" or ")})`);
  }
  const url = `${FAI_BASE_URL}/api/live/team/${teamId}/matches/paginated/${period}/1`
    + `?page=1&pageSize=${FAI_PAGE_SIZE}`;
  const body = await getJson(url, opts);
  const result = body?.result ?? [];
  const size = body?.size ?? result.length;
  // Louder than paginating on. A club with more than 100 matches in one period is a
  // season nobody has played, so this firing means the contract changed - and guessing
  // at a second page would hide that behind a list that is silently missing games.
  if (result.length < size) {
    throw new Error(
      `FAI Connect returned a partial page for team ${teamId} ${period}: `
      + `${result.length} of ${size}`,
    );
  }
  return result;
}

// Undocumented - found by probing, not in the captured app traffic, so it is the lowest
// confidence call here. It exists only to supply a venue, and a venue is the one field
// the fixtures can publish without, so a caller treats a failure as "no venue".
export async function fetchMatchDetail(matchId, opts) {
  const body = await getJson(`${FAI_BASE_URL}/api/live/match/${matchId}`, opts);
  return body?.facility ?? null;
}
