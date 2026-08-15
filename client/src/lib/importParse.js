// The paste-import parser, kept apart from the component so it can be tested
// directly. This is the only place Kite accepts bulk free-form text, so it is
// the most likely thing to be handed something unexpected.
const TYPES = ["city", "attraction", "hotel", "transport", "food", "activity", "other"];

/**
 * Rows are tab- or comma-separated: title, day, time, cost, type — all but the
 * title optional, in any order. "Day 3" and a real date both work for the day.
 */
export function parseRows(text, days = []) {
  const rows = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const cells = (line.includes("\t") ? line.split("\t") : line.split(","))
      .map((c) => c.trim().replace(/^["']|["']$/g, ""));

    const item = { title: "", date: "", time: "", cost: "", type: "other", notes: "" };
    for (const cell of cells) {
      if (!cell) continue;

      const dayNum = cell.match(/^day\s*(\d+)$/i);
      if (dayNum && days[+dayNum[1] - 1]) {
        item.date = days[+dayNum[1] - 1];
        continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(cell) && days.includes(cell)) {
        item.date = cell;
        continue;
      }
      if (/^\d{1,2}:\d{2}$/.test(cell)) {
        item.time = cell.padStart(5, "0");
        continue;
      }
      const money = cell.match(/^[$€£]?\s*(\d+(?:\.\d{1,2})?)$/);
      if (money && item.title) {
        item.cost = money[1];
        continue;
      }
      if (TYPES.includes(cell.toLowerCase()) && item.title) {
        item.type = cell.toLowerCase();
        continue;
      }
      if (!item.title) item.title = cell;
      else if (!item.location) item.location = cell;
    }

    if (item.title) rows.push(item);
  }
  return rows;
}
