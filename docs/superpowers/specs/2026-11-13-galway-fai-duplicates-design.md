# Galway FA / FAI Connect duplicates

## Problem

On 2 Nov Galway FA's feed added `fid 7035325`: Craughwell United v Mervue Utd, Sat 14 Nov
14:00, "FAI Junior Cup", filed under team `234323`, which is our **U21 Men**. It is the
adult Juniors' cup tie. On 13 Nov FAI Connect published the same game correctly as
`fai:56104529` for `fai:61270` (Craughwell United Juniors) v "Mervue United FC Jun A".
The site merges both sources, so the announcement listed the game twice, once under the
wrong squad, and the wrong line was posted to club members.

Galway FA's public page no longer shows the game, but its `admin-ajax.php` feed still
does, so a resync does not remove it. As squads migrate, more cross-listings like this are
likely. FAI Connect is the system that will replace Galway FA, so **FAI Connect wins**.

## Decision

At read time, hide a Galway FA fixture that duplicates an FAI Connect fixture, and say so
visibly in the app.

Display only. The scan, `diff.js`, `changes*.json`, the alert email and every stored file
are untouched. Dropping the row in the scan would make the next run email a CANCELLED
alert for a game that is still on, which is the false cancellation the invariants forbid.
`fid` stays the identity everywhere. This match decides only what is shown.

## The rule - `src/lib/dedupe.js`

`dupeKey(opponentRaw)`: `cleanOpponent(raw)` (strips the trailing team letter and the
COMET season code), then lowercase it, replace the word `utd` with `united`, remove the
words `fc`, `afc`, `jun`, `junior` and `juniors`, remove punctuation and collapse
whitespace. "Mervue Utd" and "Mervue United FC Jun A" both give `mervue united`. The
owner's `teams.json` renames are deliberately not used, so matching never depends on
whether a rename has been saved.

`dropGalwayDuplicates(galway, fai, { withTime })` returns `{ kept, hidden }`.
A Galway entry is hidden when an FAI entry not already used has the same `date`, the same
`isHome`, the same `dupeKey` of `opponent` and, when `withTime` is true, the same `time`.
Each FAI entry hides at most one Galway entry, so two Galway rows never collapse into one
FAI row. Order of `kept` is the order of `galway`. Pure, no I/O, never throws on a
malformed entry: an entry missing date or opponent simply never matches.

## Where it runs - `combine()` in `src/lib/combine.js`

`combine` (moved out of `App.jsx` so it can be unit-tested) already joins the sources, and every tab reads from what it returns. It now:

- Fixtures: Galway `snapshot.fixtures` is deduped against FAI `fixtures + awaiting`
  (`withTime: true`).
- Awaiting: Galway `snapshot.awaiting` is deduped against FAI `fixtures + awaiting`
  (`withTime: true`), so a hidden game does not come back in `pending.js` once its
  kick-off has passed.
- Results: Galway `results` is deduped against FAI `results` (`withTime: false`, because
  results carry no time), so a Galway score for the cup tie cannot add a game to the U21
  Form record.
- Returns `hidden`: the fixtures hidden by the first rule. Hidden awaiting and results
  entries are not listed separately. They are the same games, already listed while
  upcoming.

**Labels.** Squad labels resolve over all fixtures. The Squads and Changes tabs receive
`allFixtures` (both sources, undeduped), because they describe the feed itself. The
announcement, Results, Graphics and Form tabs get the deduped list. Their labels come
from `teams.json`, which the scan seeds for every team on every run, and config beats
derivation, so a hidden row cannot rename a squad.

## The note

When `hidden` holds any game dated today or later, the Fixtures tab shows a note above the
announcement. A hidden game already played is no longer news and is left out:

> Hidden 1 Galway FA fixture that duplicates an FAI Connect one: Sat 14 Nov 14:00 U21 Men
> v Mervue Utd.

The line is pluralised for more than one, and each entry is formatted with the existing
announcement line formatter, so a wrong match is never silent. It is a small component
in `src/components/`, and it is not part of the copied announcement text.

## Tests

- `test/dedupe.test.js`: the real Mervue pair from the data repo is hidden. These are
  kept: a different time, a different `isHome`, a different date, a different opponent.
  Two identical Galway rows against one FAI row: one hidden, one kept. `withTime: false`
  ignores time. An entry with no opponent or date is kept. `dupeKey` cases: `Utd`,
  `FC`, `AFC`, punctuation, trailing team letter, COMET season code.
- `combine` is exported and unit-tested: hidden fixtures, awaiting and results are
  absent, `allFixtures` still holds them, and `results === null` keeps its meaning.
- SSR smoke test of the note: renders when entries are hidden, renders nothing when none.

## Out of scope

The scan, `changes*.json`, the email, the stored snapshots, and any manual
"not a duplicate" override. If a false match ever happens, the note shows it, and an
override can be designed then.
