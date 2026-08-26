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
