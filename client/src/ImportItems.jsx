// P-033: paste rows straight from a spreadsheet instead of typing them one at
// a time. Daniel's complaint was ~7 clicks per item; a planner who already has
// a sheet should pay roughly zero.
import { useState } from "react";
import { api, ITEM_TYPES } from "./api.js";

const TYPES = ITEM_TYPES.map((t) => t.value);

// Rows are tab- or comma-separated: title, day, time, cost, type — all but the
// title optional. "Day 3" and a real date both work for the day column.
export function parseRows(text, days) {
  const rows = [];
  for (const raw of text.split("\n")) {
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

export default function ImportItems({ tripId, days, onClose, onImported }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseRows(text, days);

  async function run() {
    setBusy(true);
    setError("");
    const created = [];
    try {
      for (const row of parsed) {
        const { item } = await api.createItem(tripId, row);
        created.push(item);
      }
      onImported(created);
    } catch (err) {
      // keep whatever landed — half an import is better than losing the lot
      setError(`${err.message}. ${created.length} of ${parsed.length} were added.`);
      if (created.length) onImported(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <h2>Paste your plan</h2>
        <p className="confirm-text">
          One item per line, copied straight from a spreadsheet. Columns can be
          separated by tabs or commas: <strong>title, day, time, cost, type</strong> —
          only the title is required.
        </p>
        <textarea
          rows={8}
          className="import-box"
          placeholder={`Colosseum, Day 2, 09:00, 35, attraction
Hotel Artemide, Day 1, 15:00, 180, hotel
Dinner at Roscioli\tDay 2\t19:30\t90\tfood`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />

        {parsed.length > 0 && (
          <div className="import-preview">
            <div className="import-preview-head">
              {parsed.length} {parsed.length === 1 ? "item" : "items"} ready
            </div>
            <ul>
              {parsed.slice(0, 5).map((r, i) => (
                <li key={i}>
                  <strong>{r.title}</strong>
                  {r.date && ` · Day ${days.indexOf(r.date) + 1}`}
                  {r.time && ` · ${r.time}`}
                  {r.cost && ` · $${r.cost}`}
                  {` · ${r.type}`}
                </li>
              ))}
              {parsed.length > 5 && <li>…and {parsed.length - 5} more</li>}
            </ul>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || parsed.length === 0}>
            {busy ? "Adding…" : `Add ${parsed.length || ""} items`.trim()}
          </button>
        </div>
      </form>
    </div>
  );
}
