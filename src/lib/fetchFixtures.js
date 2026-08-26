// The only network I/O in this project.
//
// Two things here are load-bearing and were established the hard way:
//   1. The endpoint sits behind CloudFront, which 403s a default client User-Agent.
//      A browser UA plus a Referer gets a 200.
//   2. It sends no CORS headers, so this can never run in the browser - which is why
//      the whole fetch/diff pipeline lives in a CI job rather than in the app.
export const FIXTURES_URL =
  "https://galwayfa.ie/wp-admin/admin-ajax.php" +
  "?action=fixtures&club_id=2960&competition_id=&team_id=&displayResults=";

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
    },
  });
  if (!res.ok) throw new Error(`fixtures fetch failed: HTTP ${res.status}`);
  return res.text();
}
