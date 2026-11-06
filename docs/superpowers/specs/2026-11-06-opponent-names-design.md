# Opponent names and per-card rows — design

Written 2026-11-06. Follows `2026-11-06-social-cards-design.md` (merged in PR #6).
The owner has used the Graphics tab. Two things need work: the single "Rows" box
under the previews reads as one long run-on line, and opponent names arrive from the
leagues with team letters ("Knocknacarra D") and other clutter that the owner edits
by hand before posting.

## Goal

1. Opponent names are tidy by default and can be overridden once, from the Graphics
   tab. The override is shared across devices and used everywhere a name is shown.
2. Under each card preview, a section listing that card's games, with Leave off and
   the opponent name editable in place.

## Non-goals

- Editing OUR squad names from the Graphics tab. The Squads tab already does that, and
  the cards use those labels.
- Writing to the data repo from the browser. Saving stays copy JSON → edit on GitHub,
  as in the Squads tab.
- Identifying opponents by anything except their raw feed name. The leagues give no
  opponent club id.

---

## 1. Opponent names

### `src/lib/opponents.js` (pure, tested)

- `cleanOpponent(raw)`, applied in this order:
  - strips a trailing COMET season code: a space and four digits that read as two
    consecutive years (`2425`, `2526`)
  - then strips a trailing team letter: a space and one capital `A`–`H`
  - trims the result
  - Examples: `"Knocknacarra D"` → `"Knocknacarra"`; `"Maree/Oranmore C"` →
    `"Maree/Oranmore"`; `"Merlin Woods Reserve 2425"` → `"Merlin Woods Reserve"`;
    `"St Bernards"` unchanged.
  - Never returns an empty string: if stripping leaves nothing, the raw name is
    returned.
- `opponentName(raw, config)` returns the override `config.opponents[raw]` when it is a
  non-empty string, otherwise `cleanOpponent(raw)`.
- `setOpponent(config, raw, name)` returns a new config:
  - a non-empty `name` that differs from `cleanOpponent(raw)` is stored as an override;
  - an empty name, or one equal to the cleaned default, removes the override.
  - This keeps `teams.json` free of no-op entries.

### Where it applies

Opponent names are shown through `opponentName` in:

- the announcement (`announce.js` `formatFixtureLine`)
- the round-up (`results.js` `formatResultLine`)
- the pending list (`pending.js`)
- the card rows (`cardRows.js`)
- the alert email's fixture lines (`changeReport.js` line 31)
- the Changes tab's fixture line

**Exception:** an `opponent` change, in the email or the Changes tab, shows the RAW
from/to names. That change is about the feed itself, and cleaning both sides could print
"Knocknacarra → Knocknacarra".

Hand-entered results already carry whatever the owner typed, and are shown as typed.

**Identity is untouched.** `diff.js` compares fixtures by `fid` and raw `opponent`, so a
rename never raises an alert. The stored fixture and result objects keep the raw name.

Functions that only take `labels` today (`formatFixtureLine`, `formatResultLine`,
`fixtureRows`, `resultRows`) gain a `config` argument. Every caller already has config.

### `teams.json`

It gains an optional `opponents` object: `{"<raw feed name>": "<display name>"}`.

`seedConfig` currently returns `{version, teams}` and would drop the key on the next
scan. It must carry `opponents` through unchanged, after validating it:
- the value must be a plain object;
- each entry must have a string key and a non-empty string value;
- anything else is dropped.

Both scans call `seedConfig`, so both keep it. Tested.

## 2. One section per card

The "Rows" card below the previews is replaced by one section directly under each
preview. Each section lists that card's games in card order.

- **Each row:**
  - a Leave off checkbox;
  - our squad label, as text;
  - v / @;
  - the opponent as an input, showing the current display name, with the raw feed name
    as a placeholder or tooltip;
  - for results, the score.
- **Editing the input** updates the in-memory config (`setOpponent`). The cards
  re-render immediately.
- **Left-off rows** stay listed in the section for the card that covers their date,
  greyed out, with the checkbox unticked to put them back.
  - A split day's left-off rows go under its first part.
  - Rows whose date no card covers any more (a whole day left off) go in a final "Not
    on any card" section.
- **Saving:** while the in-memory config differs from the loaded `teams.json`, a bar
  under the sections reads "N unsaved name change(s)" with **Copy JSON** and **Edit on
  GitHub**.
  - That control is extracted from the Squads tab into a shared component, so the two
    tabs say the same thing, including the five-minute cache caveat.
  - App keeps the loaded config alongside the edited one so both tabs can tell what is
    unsaved.
- **Squads tab:** gains an "Opponent names" list. Each override shows raw → display,
  with a remove button. It shares the same save control.

Which rows belong to which card comes from `layoutCards`. Each card returns the ids of
its rows (`rowIds`), so the component never re-derives layout.

## 3. Testing

- `opponents.js`:
  - the examples above;
  - no-op stripping (`"Gort"`, `"Athenry FC"`);
  - a lone letter (`"B"` stays `"B"`);
  - `I`, `U` and similar letters outside `A`–`H` are not stripped;
  - overrides win;
  - `setOpponent` removes no-op entries.
- `seedConfig`:
  - keeps a valid `opponents` object;
  - drops malformed entries;
  - a first run with no config has no `opponents` key, or an empty one.
- The announcement, round-up, pending, `cardRows` and `changeReport` each show the
  display name. `changeReport`'s opponent-change line shows the raw names.
- `cardLayout`: each card's `rowIds` lists exactly its rows in order, and the cards'
  lists together cover every row.
- Graphics tab SSR smoke test:
  - a section per card containing its rows;
  - a left-off row still listed;
  - the unsaved bar appears when the config differs.
- Squads tab SSR smoke test: lists overrides.
