// Google sign-in, for identity only. Adapted from ballislife's driveAuth.js.
//
// That app needs a Drive token for storage and so carries a keep-alive, a silent-reauth
// path and an expiry callback. This app needs one thing: the address of whoever is
// looking, once, at load. So the scope is userinfo.email and nothing more - a
// read-write Drive grant to read a fixtures list would be an absurd consent screen -
// and there is no keep-alive, because the answer is not needed again after the gate.
//
// owner.js decides what to do with the address. This module never judges.
export const CLIENT_ID =
  "1082152886862-ls2qdqu246emgs93q6hvrcqq4ipi1iur.apps.googleusercontent.com";
export const SCOPE = "https://www.googleapis.com/auth/userinfo.email";

const TOK_KEY = "fixtures_tok";
const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";

let tokenClient = null;
let accessToken = null;
let tokenExp = 0;
// Two sign-in clicks in flight would open two consent popups. Ported from ballislife,
// where it was hard-won against real Google behaviour.
let pendingTokenRequest = null;

function rememberToken(resp) {
  accessToken = resp.access_token;
  const ttl = Number(resp.expires_in) || 3600;
  tokenExp = Date.now() + (ttl - 60) * 1000; // 60s safety margin
  try {
    sessionStorage.setItem(TOK_KEY, JSON.stringify({ t: accessToken, exp: tokenExp }));
  } catch { /* private mode; a re-sign-in on reload is an acceptable cost */ }
}

function recallToken() {
  try {
    const j = JSON.parse(sessionStorage.getItem(TOK_KEY));
    if (j?.t && j.exp > Date.now()) { tokenExp = j.exp; return j.t; }
  } catch { /* corrupt or absent */ }
  return null;
}

export function getAccessToken() {
  return accessToken && tokenExp > Date.now() ? accessToken : null;
}

export function signOut() {
  accessToken = null;
  tokenExp = 0;
  try { sessionStorage.removeItem(TOK_KEY); } catch { /* nothing to clear */ }
}

// Resolves true once GIS is ready. A cached token from this browser tab is picked up
// here, which is what makes a reload not re-prompt.
export function initAuth() {
  accessToken = recallToken();
  if (tokenClient) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(poll);
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: () => {},
        });
        resolve(true);
      } else if (Date.now() - started > 10000) {
        // The script is blocked or the network is down. The caller shows the sign-in
        // button anyway: a dead button beats a spinner that never resolves.
        clearInterval(poll);
        resolve(false);
      }
    }, 50);
  });
}

// -> token string or null. Call this only from a real user gesture, or the browser
// blocks the popup.
//
// There is deliberately NO silent variant. A `prompt: ""` request at load looks
// attractive - a returning visitor would skip the popup - but when the browser has no
// Google session GIS never calls back at all, so the caller waits forever and the page
// sits on "Loading..." instead of showing the sign-in button. ballislife has the same
// shape for the same reason: at load it only ever looks for a token this tab already
// has. error_callback covers the other half - a cancelled or blocked popup - which
// otherwise leaves the promise pending just as silently.
function requestToken() {
  if (!tokenClient) return Promise.resolve(null);
  if (pendingTokenRequest) return pendingTokenRequest;
  pendingTokenRequest = new Promise((resolve) => {
    const done = (token) => { pendingTokenRequest = null; resolve(token); };
    tokenClient.callback = (resp) => {
      if (resp?.access_token) {
        rememberToken(resp);
        done(accessToken);
      } else {
        done(null);
      }
    };
    tokenClient.error_callback = () => done(null);
    tokenClient.requestAccessToken();
  });
  return pendingTokenRequest;
}

export const signIn = () => requestToken();

// -> the signed-in address, or null. Never throws: every failure here must read as
// "not the owner" and close the gate rather than break the page.
export async function accountEmail(token, fetchImpl = globalThis.fetch) {
  if (!token) return null;
  try {
    const res = await fetchImpl(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.email ?? null;
  } catch {
    return null;
  }
}
