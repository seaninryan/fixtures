// Pure. Raw endpoint HTML -> raw fixture records.
//
// NEVER THROWS. One malformed block must cost that block and nothing else: this feed
// is a third-party WordPress plugin and a single odd fixture must not blank the club's
// whole weekend.
export const CLUB_ID = "2960";

const BLOCK_START = '<ul class="column-eight table-body fixtures';
const SPLIT = /(?=<ul class="column-eight table-body fixtures")/;

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&nbsp;/g, " ");
}

function dataAttrs(openTag) {
  const out = {};
  for (const m of openTag.matchAll(/data-([a-z0-9]+)="([^"]*)"/g)) {
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

  blocks.forEach((block, i) => {
    try {
      const open = block.slice(0, block.indexOf(">") + 1);
      const a = dataAttrs(open);
      const fid = block.match(/data-fid="(\d+)"/)?.[1] ?? null;
      const ours = block.match(
        new RegExp(`clubprofile/${CLUB_ID}/\\?competition_id=(\\d+)&(?:amp;)?team_id=(\\d+)`),
      );
      if (!fid) return void errors.push(`block ${i}: no data-fid`);
      if (!ours) return void errors.push(`block ${i} (fid ${fid}): no team link for club ${CLUB_ID}`);
      if (!a.date || !a.time) return void errors.push(`block ${i} (fid ${fid}): missing date or time`);

      fixtures.push({
        fid,
        teamId: ours[2],
        competitionId: ours[1],
        date: a.date,
        time: a.time,
        homeTeam: a.hometeam ?? "",
        awayTeam: a.awayteam ?? "",
        homeClubId: sideClubId(block, "team1"),
        awayClubId: sideClubId(block, "team2"),
        venue: a.venue ?? "",
        competition: a.compname ?? "",
        comment: a.comment ?? "",
      });
    } catch (e) {
      errors.push(`block ${i}: ${e.message}`);
    }
  });

  return { fixtures, errors };
}
