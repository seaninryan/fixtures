// src/lib/cardSections.js
// Pure. The Graphics tab's per-card row lists.
//
// A card only holds the rows that are ON it, but the owner needs to see a left-off row
// where it would have been, or there is nothing to tick to put it back. So a left-off
// row is slotted into the first card whose date range covers it; one no card covers (a
// whole day left off) is an orphan.
const byOrder = (a, b) =>
  a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))
  || String(a.id).localeCompare(String(b.id));

// cards: [{fileName, from, to, rowIds}]; allRows: every row before leave-off;
// leftOffIds: ids (without the kind prefix) currently left off.
// -> {sections: [{fileName, rows: [{row, leftOff}]}], orphans: [row]}
export function cardSections(cards, allRows, leftOffIds) {
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const off = new Set(leftOffIds);
  const sections = cards.map((c) => ({
    fileName: c.fileName,
    rows: c.rowIds.map((id) => byId.get(id)).filter(Boolean).map((row) => ({ row, leftOff: false })),
  }));
  const orphans = [];
  for (const row of allRows) {
    if (!off.has(row.id)) continue;
    const i = cards.findIndex((c) => c.from <= row.date && row.date <= c.to);
    if (i === -1) orphans.push(row);
    else sections[i].rows.push({ row, leftOff: true });
  }
  for (const s of sections) s.rows.sort((a, b) => byOrder(a.row, b.row));
  return { sections, orphans: orphans.sort(byOrder) };
}
