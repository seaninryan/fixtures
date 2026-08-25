// Pure. Raw endpoint HTML -> raw fixture records.
//
// NEVER THROWS. One malformed block must cost that block and nothing else: this feed
// is a third-party WordPress plugin and a single odd fixture must not blank the club's
// whole weekend.
export const CLUB_ID = "2960";

// One spelling of the selector, so a class change cannot break the split and the
// filter asymmetrically. Deliberately does not require the closing quote: the plugin
// appending a class (`... fixtures past"`) must not silently match zero blocks.
const BLOCK_START = '<ul class="column-eight table-body fixtures';
const SPLIT = new RegExp(`(?=${BLOCK_START})`);

// An out-of-range numeric entity (&#99999999;) makes String.fromCodePoint throw. That
// would cost the whole fixture over one stray character in an admin comment, so an
// undecodable entity is left as written instead.
function codePoint(n, original) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return original;
  }
}

function decode(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => codePoint(+d, `&#${d};`))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16), `&#x${h};`))
    .replace(/&nbsp;/g, " ")
    // Last, so `&amp;lt;` decodes once to `&lt;` and not twice to `<`.
    .replace(/&amp;/g, "&");
}

function dataAttrs(openTag) {
  const out = {};
  for (const m of openTag.matchAll(/data-([a-z0-9-]+)="([^"]*)"/g)) {
    out[m[1]] = decode(m[2]).trim();
  }
  return out;
}

// Which club plays on a given side. The team1/team2 spans each wrap a link to that
// club's profile, so this is positional and does not depend on matching club names —
// which matters the day two Craughwell teams are drawn against each other.
function sideClubId(block, side) {
  const re = new RegExp(`<span class="data ${side}">\\s*<a href="[^"]*clubprofile/(\\d+)/`);
  return block.match(re)?.[1] ?? null;
}

export function parse(html) {
  const fixtures = [];
  const errors = [];
  if (typeof html !== "string" || html.trim() === "") {
    return { fixtures, errors: ["empty response"] };
  }

  const blocks = html.split(SPLIT).filter((b) => b.startsWith(BLOCK_START));
  if (blocks.length === 0) {
    return { fixtures, errors: [`no fixture blocks found in ${html.length} bytes of HTML`] };
  }

  blocks.forEach((block, i) => {
    try {
      // Quote-aware, so a `>` inside an attribute value cannot truncate the open tag
      // and silently blank every attribute after it. data-comment is admin free text
      // ("Moved as agreed (21/8)") and is followed by data-venue and data-compname.
      const openMatch = /^<ul(?:[^>"]|"[^"]*")*>/.exec(block);
      const open = openMatch ? openMatch[0] : block.slice(0, block.indexOf(">") + 1);
      const attrs = dataAttrs(open);
      const label = `block ${i} (${attrs.hometeam || "?"} v ${attrs.awayteam || "?"}, ${attrs.date || "?"})`;

      // NOTE: every data-fid in this feed lives inside an HTML COMMENT — the plugin
      // emits a commented-out .toggle-table div and nothing else carries the fid. The
      // whole identity scheme therefore depends on markup its author has already
      // disabled. If the plugin ever drops that dead block, no fixture gets an id; the
      // zero-blocks guard above and this per-block error are what make that loud.
      const fid = block.match(/data-fid="(\d+)"/)?.[1] ?? null;
      // First match wins, and the home side is always listed first — so in a derby
      // between two of our own teams we keep the home team's id and lose the away one.
      const ours = block.match(
        new RegExp(
          `clubprofile/${CLUB_ID}/\\?competition_id=(?<competitionId>\\d+)&(?:amp;)?team_id=(?<teamId>\\d+)`,
        ),
      );
      if (!fid) return void errors.push(`${label}: no data-fid`);
      if (!ours) return void errors.push(`${label}: no team link for club ${CLUB_ID}`);
      if (!attrs.date || !attrs.time) return void errors.push(`${label}: missing date or time`);

      fixtures.push({
        fid,
        teamId: ours.groups.teamId,
        competitionId: ours.groups.competitionId,
        date: attrs.date,
        time: attrs.time,
        homeTeam: attrs.hometeam ?? "",
        awayTeam: attrs.awayteam ?? "",
        homeClubId: sideClubId(block, "team1"),
        awayClubId: sideClubId(block, "team2"),
        venue: attrs.venue ?? "",
        competition: attrs.compname ?? "",
        comment: attrs.comment ?? "",
      });
    } catch (e) {
      errors.push(`block ${i}: ${e.message}`);
    }
  });

  return { fixtures, errors };
}
