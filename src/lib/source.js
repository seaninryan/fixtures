// Pure. Which system an id came from.
//
// Identity is still the league's own id - the prefix only names WHICH league. Galway FA
// ids stay bare and nothing in the data repo is renamed; only the new source carries a
// prefix. That is what lets teams.json stay a single shared file: config holds labels and
// COLOURS, and two squads sharing a key would share both.
//
// The two id ranges happen not to overlap today (Galway fixtures are 7-digit, COMET's are
// 8-digit), but nothing enforces that and both are bare numeric strings. This makes a
// collision structurally impossible rather than merely unlikely.
export const FAI_PREFIX = "fai:";

export const faiId = (id) => `${FAI_PREFIX}${id}`;

// String(), so a numeric id from a hand-edited teams.json cannot throw here.
export const isFaiId = (id) => String(id ?? "").startsWith(FAI_PREFIX);
