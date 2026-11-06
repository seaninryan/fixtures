// Pure. Where the site reads its JSON.
//
// The snapshots live in their OWN repo, so this repo's history stays code and the daily
// commits stay out of it. The site fetches them at RUNTIME rather than baking them into
// the bundle, which is why deploy.yml has no data trigger: new fixtures appear on the
// site without a rebuild.
//
// raw.githubusercontent.com is the only github.com host that sends
// `Access-Control-Allow-Origin: *`, so it is the only one the browser may read.
// `github.com/<owner>/<repo>/raw/...` 302s to it, but the redirect itself carries no CORS
// headers and the browser refuses it - do not "tidy" this into the prettier URL.
//
// It is CDN-cached for about five minutes. The cron runs daily, so that is invisible.
export const DATA_REPO = "seaninryan/fixtures-data";
export const DATA_BRANCH = "main";

export const DEFAULT_DATA_URL =
  `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/`;

// Deep link for the Squads tab. A static site cannot write to a repo, so editing is
// edit-here / copy / paste-on-GitHub - see the spec's "Config editing" section.
export const EDIT_TEAMS_URL =
  `https://github.com/${DATA_REPO}/edit/${DATA_BRANCH}/teams.json`;

// The base is overridable (VITE_DATA_URL) so `npm run dev` can point at a local copy.
// That value is typed by hand into a .env file, so a missing trailing slash must not
// silently produce ".../datalatest.json".
export function dataUrl(name, base = DEFAULT_DATA_URL) {
  return `${base.endsWith("/") ? base : `${base}/`}${name}`;
}

// "Sync now". The cron runs at 06:17 UTC, so a Sunday's results would otherwise land on
// Monday. The site cannot run the scan itself (no CORS from either league, and the FAI
// key is a secret), so it links to the workflow and the owner presses Run workflow.
export const WORKFLOW_URL =
  `https://github.com/${DATA_REPO}/actions/workflows/daily-check.yml`;

// Latest commit touching latest.json. Not the branch head: latest.json changes on every
// scan (fetchedAt moves), whereas a teams.json edit or any other push to main does not
// touch it, so only a finished scan moves this. Returns an ARRAY of one commit.
// Unauthenticated, CORS-enabled, 60 requests an hour per IP. One sync polls up to 41
// times, so a second sync within the hour may hit the limit - the app says so.
export const LATEST_SNAPSHOT_COMMIT_URL =
  `https://api.github.com/repos/${DATA_REPO}/commits?path=latest.json&sha=${DATA_BRANCH}&per_page=1`;

// The branch URL is CDN-cached for about five minutes, so straight after a sync it can
// serve the OLD file. A commit-pinned URL is a different cache key and is never stale.
export function rawBaseAt(sha) {
  return `https://raw.githubusercontent.com/${DATA_REPO}/${sha}/`;
}
