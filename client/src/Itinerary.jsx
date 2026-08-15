// Presentational pieces shared by the owner's trip page and the public
// read-only share view (P-018).
import { ITEM_TYPES, typeMeta } from "./api.js";
import { fmtDay } from "./lib/dates.js";

export { fmtDay };

const money = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function BudgetCard({ items, days, budget }) {
  const byType = new Map();
  const byDay = new Map();
  let total = 0;
  for (const it of items) {
    if (!it.cost) continue;
    total += it.cost;
    byType.set(it.type, (byType.get(it.type) || 0) + it.cost);
    const key = it.date || "anytime";
    byDay.set(key, (byDay.get(key) || 0) + it.cost);
  }

  const typeRows = ITEM_TYPES.filter((t) => byType.has(t.value));
  const max = Math.max(...byType.values());

  // P-020: measure planned spend against the trip's target budget.
  const remaining = budget == null ? null : budget - total;
  const usedPct = budget ? Math.min(100, (total / budget) * 100) : 0;

  return (
    <section className="card budget">
      <div className="budget-head">
        <h2>Budget</h2>
        <span className="budget-total">${money(total)}</span>
      </div>

      {budget != null && (
        <div className={`budget-target ${remaining < 0 ? "over" : ""}`}>
          <div className="budget-target-bar">
            <span style={{ width: `${usedPct}%` }} />
          </div>
          <div className="budget-target-text">
            {remaining >= 0 ? (
              <>
                <strong>${money(remaining)}</strong> left of your ${money(budget)} budget
              </>
            ) : (
              <>
                <strong>${money(-remaining)} over</strong> your ${money(budget)} budget
              </>
            )}
          </div>
        </div>
      )}

      <div className="budget-cols">
        <div>
          <div className="budget-col-title">By category</div>
          {typeRows.map((t) => (
            <div key={t.value} className="budget-row">
              <span className={`item-badge type-${t.value}`}>
                {t.emoji} {t.label}
              </span>
              <span className="budget-bar-track">
                <span
                  className={`budget-bar type-${t.value}`}
                  style={{ width: `${(byType.get(t.value) / max) * 100}%` }}
                />
              </span>
              <span className="budget-amount">${money(byType.get(t.value))}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="budget-col-title">By day</div>
          {days.map(
            (d, i) =>
              byDay.has(d) && (
                <div key={d} className="budget-row">
                  <span className="budget-day">Day {i + 1}</span>
                  <span className="budget-amount">${money(byDay.get(d))}</span>
                </div>
              )
          )}
          {byDay.has("anytime") && (
            <div className="budget-row">
              <span className="budget-day">Anytime</span>
              <span className="budget-amount">${money(byDay.get("anytime"))}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// P-019: the day's stops in order, with a link that opens the whole route in
// the user's map app. Stops are matched by their free-text location/title —
// Kite does not store coordinates, so this is a route query, not a pin map.
export function DayRoute({ items }) {
  const stops = items
    .filter((it) => it.location || it.type === "city")
    .map((it) => ({ label: it.title, query: it.location || it.title }));
  if (stops.length < 2) return null;

  const origin = encodeURIComponent(stops[0].query);
  const destination = encodeURIComponent(stops[stops.length - 1].query);
  const waypoints = stops
    .slice(1, -1)
    .map((s) => encodeURIComponent(s.query))
    .join("|");
  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}` +
    (waypoints ? `&waypoints=${waypoints}` : "");

  return (
    <div className="day-route">
      <span className="day-route-stops">
        {stops.map((s, i) => (
          <span key={i}>
            {i > 0 && <span className="day-route-arrow">→</span>}
            {s.label}
          </span>
        ))}
      </span>
      <a className="day-route-link" href={url} target="_blank" rel="noreferrer">
        Open route ↗
      </a>
    </div>
  );
}

export function ItemRow({ item, onEdit }) {
  const meta = typeMeta(item.type);
  return (
    <li
      className={`item type-border-${item.type} ${onEdit ? "" : "item-static"}`}
      onClick={onEdit}
    >
      <span className="item-time">{item.time || "—"}</span>
      <span className={`item-badge type-${item.type}`}>
        {meta.emoji} {meta.label}
      </span>
      <span className="item-main">
        <span className="item-title">{item.title}</span>
        {item.location && <span className="item-loc">{item.location}</span>}
        {item.notes && <span className="item-notes">{item.notes}</span>}
      </span>
      <span className="item-right">
        {item.cost != null && <span className="item-cost">${money(item.cost)}</span>}
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="item-link"
          >
            ↗
          </a>
        )}
      </span>
    </li>
  );
}
