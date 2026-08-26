// Restricts the deployed app to its owner's Google account. Ported from ballislife
// (src/lib/owner.js), which ports its auth lifecycle from fancystats.
//
// This is NOT a security boundary, and here it is weaker than in those two apps. There,
// the data lives in the owner's Drive, so a stranger who deletes this check gets their
// own empty Drive. Here the fixtures come from a PUBLIC repo over
// raw.githubusercontent.com, so anyone determined to read them still can - as the spec
// intended, since galwayfa.ie publishes them anyway. What this gate does is keep a
// stranger who finds the URL out of the app itself. Do not let it grow into something
// the rest of the code trusts.
//
// The address is stored hashed rather than in the clear because the repo is public and
// scrapers harvest plaintext addresses. Hashing adds no security; it removes that one
// concrete nuisance.
//
// Same digest as ballislife and fancystats: one owner, one Google account, three apps.
export const OWNER_EMAIL_SHA256 =
  "9620eb10792df98e40aa9814000f894744e9add26225d3aa834e707c6a6c3596";

// Lower-cased and trimmed before hashing: Google may return a differently-cased
// address than the one the digest was made from.
export async function digestEmail(email) {
  const bytes = new TextEncoder().encode(String(email).trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// -> boolean. Never throws: a malformed argument is simply "not the owner", because
// the failure mode of throwing here is a blank page on sign-in.
export async function isOwner(email, expected = OWNER_EMAIL_SHA256) {
  if (typeof email !== "string" || email.trim() === "") return false;
  try {
    return (await digestEmail(email)) === expected;
  } catch {
    return false;
  }
}
