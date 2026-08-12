import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ITEM_TYPES, typeMeta } from "./api.js";
import { fmtRange, tripDays } from "./Trips.jsx";

const EMPTY_ITEM = {
  date: "",
  time: "",
  type: "attraction",
  title: "",
  location: "",
  notes: "",
  cost: "",
  link: "",
};

function fmtDay(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(null); // null | item form state
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingItemDelete, setConfirmingItemDelete] = useState(false);
  const [error, setError] = useState("");

  // P-013: Escape closes the topmost modal
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (confirmingItemDelete) setConfirmingItemDelete(false);
      else if (confirmingDelete) setConfirmingDelete(false);
      else if (editing) setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmingDelete, confirmingItemDelete]);

  useEffect(() => {
    api
      .trip(id)
      .then((d) => {
        setTrip(d.trip);
        setItems(d.items);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const days = useMemo(
    () => (trip ? tripDays(trip.start_date, trip.end_date) : []),
    [trip]
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.date || "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [items]);

  const totalCost = useMemo(
    () => items.reduce((sum, it) => sum + (it.cost || 0), 0),
    [items]
  );

  function openAdd(date) {
    setError("");
    setEditing({ ...EMPTY_ITEM, date: date || "" });
  }

  function openEdit(item) {
    setError("");
    setEditing({
      ...item,
      date: item.date || "",
      cost: item.cost == null ? "" : String(item.cost),
    });
  }

  async function saveItem(e) {
    e.preventDefault();
    setError("");
    try {
      if (editing.id) {
        const { item } = await api.updateItem(editing.id, editing);
        setItems(items.map((i) => (i.id === item.id ? item : i)));
      } else {
        const { item } = await api.createItem(trip.id, editing);
        setItems([...items, item]);
      }
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(item) {
    await api.deleteItem(item.id);
    setItems(items.filter((i) => i.id !== item.id));
    setConfirmingItemDelete(false);
    setEditing(null);
  }

  async function removeTrip() {
    await api.deleteTrip(trip.id);
    navigate("/");
  }

  if (notFound)
    return (
      <div className="empty-state">
        <p>Trip not found.</p>
        <Link to="/">← Back to trips</Link>
      </div>
    );
  if (!trip) return <div className="page-loading">Loading…</div>;

  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });

  return (
    <div className="trip-detail">
      <Link to="/" className="back-link">
        ← All trips
      </Link>

      <div className="trip-head card">
        <div>
          <h1>{trip.title}</h1>
          <div className="trip-head-sub">
            {trip.destination && <span>📍 {trip.destination}</span>}
            <span>🗓 {fmtRange(trip.start_date, trip.end_date)}</span>
            <span>
              {days.length} days · {items.length} items
              {totalCost > 0 && ` · $${totalCost.toLocaleString()} planned`}
            </span>
          </div>
          {trip.notes && <p className="trip-notes">{trip.notes}</p>}
        </div>
        <button className="btn btn-ghost btn-danger" onClick={() => setConfirmingDelete(true)}>
          Delete trip
        </button>
      </div>

      {totalCost > 0 && <BudgetCard items={items} days={days} />}

      <div className="days">
        {days.map((date, i) => {
          const dayItems = byDay.get(date) || [];
          const cities = dayItems.filter((it) => it.type === "city");
          return (
            <section key={date} className="day card">
              <div className="day-head">
                <div>
                  <span className="day-num">Day {i + 1}</span>
                  <span className="day-date">{fmtDay(date)}</span>
                  {cities.length > 0 && (
                    <span className="day-cities">
                      {cities.map((c) => c.title).join(" → ")}
                    </span>
                  )}
                </div>
                <button className="btn btn-small" onClick={() => openAdd(date)}>
                  + Add
                </button>
              </div>
              {dayItems.length === 0 ? (
                <button className="day-empty" onClick={() => openAdd(date)}>
                  Nothing planned yet — click to add something
                </button>
              ) : (
                <ul className="item-list">
                  {dayItems.map((it) => (
                    <ItemRow key={it.id} item={it} onEdit={() => openEdit(it)} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        <section className="day card">
          <div className="day-head">
            <div>
              <span className="day-num">Anytime</span>
              <span className="day-date">Not tied to a specific day</span>
            </div>
            <button className="btn btn-small" onClick={() => openAdd(null)}>
              + Add
            </button>
          </div>
          {(byDay.get("unscheduled") || []).length === 0 ? (
            <button className="day-empty" onClick={() => openAdd(null)}>
              Ideas, backup plans, documents — click to add anything without a date
            </button>
          ) : (
            <ul className="item-list">
              {(byDay.get("unscheduled") || []).map((it) => (
                <ItemRow key={it.id} item={it} onEdit={() => openEdit(it)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirmingItemDelete && editing && (
        <div
          className="modal-backdrop modal-backdrop-top"
          onClick={() => setConfirmingItemDelete(false)}
        >
          <div className="modal modal-small card" onClick={(e) => e.stopPropagation()}>
            <h2>Delete “{editing.title}”?</h2>
            <p className="confirm-text">
              This removes it from your itinerary. It can’t be undone.
            </p>
            <div className="modal-actions">
              <span className="spacer" />
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmingItemDelete(false)}
              >
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={() => removeItem(editing)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div className="modal modal-small card" onClick={(e) => e.stopPropagation()}>
            <h2>Delete “{trip.title}”?</h2>
            <p className="confirm-text">
              This deletes the trip and all {items.length}{" "}
              {items.length === 1 ? "item" : "items"} in it. It can’t be undone.
            </p>
            <div className="modal-actions">
              <span className="spacer" />
              <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={removeTrip}>
                Delete trip
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <form
            className="modal card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveItem}
          >
            <h2>{editing.id ? "Edit item" : "Add to itinerary"}</h2>

            <div className="type-picker">
              {ITEM_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  className={`type-chip type-${t.value} ${
                    editing.type === t.value ? "selected" : ""
                  }`}
                  onClick={() => setEditing({ ...editing, type: t.value })}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            <label>
              Title
              <input
                value={editing.title}
                onChange={set("title")}
                placeholder={
                  { city: "Rome", attraction: "Colosseum", hotel: "Hotel Artemide", transport: "Train to Florence", food: "Dinner at Roscioli", activity: "Cooking class", other: "Print tickets" }[editing.type]
                }
                required
                autoFocus
              />
            </label>

            <div className="form-row">
              <label>
                Day
                <select value={editing.date} onChange={set("date")}>
                  <option value="">Anytime</option>
                  {days.map((d, i) => (
                    <option key={d} value={d}>
                      Day {i + 1} — {fmtDay(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Time
                <input type="time" value={editing.time} onChange={set("time")} />
              </label>
            </div>

            <div className="form-row">
              <label>
                Location / address
                <input value={editing.location} onChange={set("location")} />
              </label>
              <label>
                Cost ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.cost}
                  onChange={set("cost")}
                />
              </label>
            </div>

            <label>
              Link (booking, tickets…)
              <input type="url" value={editing.link} onChange={set("link")} placeholder="https://" />
            </label>

            <label>
              Notes
              <textarea rows={2} value={editing.notes} onChange={set("notes")} />
            </label>

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              {editing.id && (
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => setConfirmingItemDelete(true)}
                >
                  Delete
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary">{editing.id ? "Save" : "Add"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function BudgetCard({ items, days }) {
  const fmt = (n) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2 });

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

  return (
    <section className="card budget">
      <div className="budget-head">
        <h2>Budget</h2>
        <span className="budget-total">${fmt(total)}</span>
      </div>
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
              <span className="budget-amount">${fmt(byType.get(t.value))}</span>
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
                  <span className="budget-amount">${fmt(byDay.get(d))}</span>
                </div>
              )
          )}
          {byDay.has("anytime") && (
            <div className="budget-row">
              <span className="budget-day">Anytime</span>
              <span className="budget-amount">${fmt(byDay.get("anytime"))}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ItemRow({ item, onEdit }) {
  const meta = typeMeta(item.type);
  return (
    <li className={`item type-border-${item.type}`} onClick={onEdit}>
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
        {item.cost != null && <span className="item-cost">${item.cost.toLocaleString()}</span>}
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
