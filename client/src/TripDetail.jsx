import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ITEM_TYPES } from "./api.js";
import { fmtRange, tripDays } from "./Trips.jsx";
import { BudgetCard, DayRoute, ItemRow, fmtDay } from "./Itinerary.jsx";

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

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(null); // null | item form state
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingItemDelete, setConfirmingItemDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [budgeting, setBudgeting] = useState(null); // null | draft string
  const [error, setError] = useState("");

  // P-013: Escape closes the topmost modal
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (confirmingItemDelete) setConfirmingItemDelete(false);
      else if (confirmingDelete) setConfirmingDelete(false);
      else if (sharing) setSharing(false);
      else if (budgeting !== null) setBudgeting(null);
      else if (editing) setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmingDelete, confirmingItemDelete, sharing, budgeting]);

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

  // P-018
  async function toggleShare() {
    if (trip.share_token) {
      await api.unshareTrip(trip.id);
      setTrip({ ...trip, share_token: null });
    } else {
      const { share_token } = await api.shareTrip(trip.id);
      setTrip({ ...trip, share_token });
    }
  }

  // P-020
  async function saveBudget(e) {
    e.preventDefault();
    setError("");
    try {
      const { trip: updated } = await api.updateTrip(trip.id, { budget: budgeting });
      setTrip(updated);
      setBudgeting(null);
    } catch (err) {
      setError(err.message);
    }
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
        <div className="trip-head-actions">
          <button className="btn btn-small" onClick={() => setSharing(true)}>
            {trip.share_token ? "🔗 Shared" : "Share"}
          </button>
          <button
            className="btn btn-small"
            onClick={() => setBudgeting(trip.budget == null ? "" : String(trip.budget))}
          >
            {trip.budget == null ? "Set budget" : "Edit budget"}
          </button>
          <button
            className="btn btn-ghost btn-danger btn-small"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete trip
          </button>
        </div>
      </div>

      {(totalCost > 0 || trip.budget != null) && (
        <BudgetCard items={items} days={days} budget={trip.budget} />
      )}

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
              <DayRoute items={dayItems} />
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

      {sharing && (
        <div className="modal-backdrop" onClick={() => setSharing(false)}>
          <div className="modal modal-small card" onClick={(e) => e.stopPropagation()}>
            <h2>Share this trip</h2>
            {trip.share_token ? (
              <>
                <p className="confirm-text">
                  Anyone with this link can view the itinerary. They can’t edit it and
                  don’t need an account.
                </p>
                <input
                  className="share-link"
                  readOnly
                  value={`${window.location.origin}/s/${trip.share_token}`}
                  onFocus={(e) => e.target.select()}
                />
                <div className="modal-actions">
                  <button className="btn btn-ghost btn-danger" onClick={toggleShare}>
                    Stop sharing
                  </button>
                  <span className="spacer" />
                  <button className="btn btn-primary" onClick={() => setSharing(false)}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="confirm-text">
                  Create a link that lets travel companions see this itinerary — view
                  only, no account needed. You can turn it off at any time.
                </p>
                <div className="modal-actions">
                  <span className="spacer" />
                  <button className="btn btn-ghost" onClick={() => setSharing(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={toggleShare}>
                    Create link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {budgeting !== null && (
        <div className="modal-backdrop" onClick={() => setBudgeting(null)}>
          <form
            className="modal modal-small card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveBudget}
          >
            <h2>Trip budget</h2>
            <p className="confirm-text">
              Set a target and Kite tracks what’s left as you plan. Leave it empty to
              remove the target.
            </p>
            <label>
              Budget ($)
              <input
                type="number"
                min="0"
                step="1"
                value={budgeting}
                onChange={(e) => setBudgeting(e.target.value)}
                autoFocus
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => setBudgeting(null)}>
                Cancel
              </button>
              <button className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

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
