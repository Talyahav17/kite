// P-047: a proposed plan for each day, which the traveller accepts or ignores.
//
// Nothing is written until they say so. Every suggestion is a place Kite
// actually holds, and where it has nothing to offer it says so rather than
// padding the day out.
import { useEffect, useState } from "react";
import { api, typeMeta } from "./api.js";
import { fmtDay } from "./lib/dates.js";
import { Stars } from "./Stars.jsx";

export default function DayPlanner({ tripId, onClose, onAccepted }) {
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [skipped, setSkipped] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .plan(tripId)
      .then((d) => {
        setPlan(d.plan);
        setSummary(d.summary);
      })
      .catch((err) => setError(err.message));
  }, [tripId]);

  const keyOf = (date, id) => `${date}:${id}`;
  const chosen = (plan || [])
    .flatMap((day) => day.items.map((item) => ({ ...item, date: day.date })))
    .filter((item) => !skipped.has(keyOf(item.date, item.attraction_id)));

  function toggle(date, id) {
    setSkipped((current) => {
      const next = new Set(current);
      const key = keyOf(date, id);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function accept() {
    setBusy(true);
    setError("");
    const created = [];
    try {
      for (const item of chosen) {
        const { item: saved } = await api.createItem(tripId, {
          title: item.title,
          type: item.type,
          date: item.date,
          time: item.time,
          location: item.location || "",
        });
        created.push(saved);
      }
      onAccepted(created);
    } catch (err) {
      // keep whatever landed rather than losing the lot
      setError(`${err.message}. ${created.length} of ${chosen.length} were added.`);
      if (created.length) onAccepted(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <h2>A plan for each day</h2>
        <p className="confirm-text">
          Built from places Kite knows and how travellers rated them. Nothing is
          added until you say so — untick anything you don’t fancy.
        </p>

        {error && <div className="form-error">{error}</div>}

        {plan?.[0]?.hotel && (
          <div className="plan-hotel">
            🏨 Based at {plan[0].hotel.title.replace(/\s*—\s*check ?in\s*$/i, "")}
            {plan[0].hotel.location && ` · ${plan[0].hotel.location}`}
          </div>
        )}

        {!plan ? (
          <div className="skeleton skeleton-line" style={{ width: "70%" }} />
        ) : (
          <div className="plan-days">
            {plan.map((day) => (
              <section key={day.date} className="plan-day">
                <div className="plan-day-head">
                  <strong>{fmtDay(day.date)}</strong>
                  {day.city && <span className="plan-city">{day.city}</span>}
                </div>

                {day.items.length === 0 ? (
                  <p className="plan-empty">
                    Nothing left to suggest here — a free day, or add something yourself.
                  </p>
                ) : (
                  <ul className="plan-list">
                    {day.items.map((item) => {
                      const meta = typeMeta(item.type);
                      const off = skipped.has(keyOf(day.date, item.attraction_id));
                      return (
                        <li key={item.attraction_id} className={`plan-item ${off ? "off" : ""}`}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!off}
                              onChange={() => toggle(day.date, item.attraction_id)}
                            />
                            <span className="plan-time">{item.time}</span>
                            <span className={`item-badge type-${item.type}`}>
                              {meta.emoji} {meta.label}
                            </span>
                            <span className="plan-name">{item.title}</span>
                            <Stars value={item.avg_stars} count={item.rating_count} />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        {summary?.notes?.length > 0 && (
          <ul className="plan-notes">
            {summary.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
          <button
            className="btn btn-primary"
            onClick={accept}
            disabled={busy || chosen.length === 0}
          >
            {busy ? "Adding…" : `Add ${chosen.length} to my trip`}
          </button>
        </div>
      </div>
    </div>
  );
}
