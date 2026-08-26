// The only network I/O in this project.
//
// Three things here are load-bearing and were each established the hard way:
//   1. The endpoint sits behind CloudFront, which 403s a default client User-Agent.
//      A browser UA plus a Referer gets a 200.
//   2. THE PARAMETERS TRAVEL IN THE BODY, NOT THE QUERY STRING. With them in the query
//      string the WAF answers "Request blocked." to a datacenter IP - a GitHub runner -
//      while still serving a residential one. So it passed every local test and failed
//      the first time the cron ran. The response is byte-identical either way, and
//      `admin-ajax.php?action=heartbeat` is fine from the same runner, so it is the
//      query string the rule inspects, not the path. A browser's $.post sends a body;
//      match the browser.
//   3. It sends no CORS headers, so this can never run in the browser - which is why
//      the whole fetch/diff pipeline lives in a CI job rather than in the app.
export const FIXTURES_URL = "https://galwayfa.ie/wp-admin/admin-ajax.php";

// Every parameter is load-bearing. `displayResults=` empty is what asks for FIXTURES
// rather than results; the two empty ids ask for every competition and every team.
export const FIXTURES_PARAMS = {
  action: "fixtures",
  club_id: "2960",
  competition_id: "",
  team_id: "",
  displayResults: "",
};

export const FIXTURES_BODY = new URLSearchParams(FIXTURES_PARAMS).toString();

export const REFERER = "https://galwayfa.ie/clubprofile/2960/";
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Safari/537.36";

// Returns the raw HTML. Deliberately does NOT judge the body: an empty or unparseable
// response is runCheck's decision, since it owns the abort-on-empty rule. This module's
// only job is to fail loudly on a transport error rather than hand back something that
// would read downstream as "the club has no fixtures".
export async function fetchFixtures(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(FIXTURES_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Referer: REFERER,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: FIXTURES_BODY,
  });
  if (!res.ok) throw new Error(`fixtures fetch failed: HTTP ${res.status}`);
  return res.text();
}
