import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ITEM_TYPES } from "./api.js";
import { useUser } from "./App.jsx";
import { fmtRange, tripDays, todayYmd, tripStatus } from "./Trips.jsx";
import { BudgetCard, DayRoute, ItemRow, fmtDay } from "./Itinerary.jsx";
import { Suggestions } from "./Suggestions.jsx";
import { sortItems } from "./lib/itinerary.js";
import ImportItems from "./ImportItems.jsx";
import DayPlanner from "./DayPlanner.jsx";
import Modal from "./Modal.jsx";
import { plural } from "./lib/plural.js";

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
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null); // null | item form state
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingItemDelete, setConfirmingItemDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmingUnshare, setConfirmingUnshare] = useState(false);
  const [importing, setImporting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [budgeting, setBudgeting] = useState(null); // null | draft string
  const { setUser } = useUser();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function flash(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }

  // P-051: an async click handler with no catch rejects into nothing — the
  // modal just sits there and the user cannot tell whether it worked. Priya
  // hit this on "Stop sharing" and could only settle it by checking the
  // error log. A lapsed session belongs back at sign-in, as in Trips.jsx;
  // anything else is said out loud where the button was pressed.
  function failed(err) {
    if (/not logged in|session expired|no longer exists/i.test(err.message)) setUser(null);
    else setError(err.message);
  }

  // P-013: Escape closes the topmost modal
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (confirmingItemDelete) setConfirmingItemDelete(false);
      else if (confirmingDelete) setConfirmingDelete(false);
      else if (confirmingUnshare) setConfirmingUnshare(false); // back out, don't revoke
      else if (sharing) setSharing(false);
      else if (budgeting !== null) setBudgeting(null);
      else if (editing) setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmingDelete, confirmingItemDelete, sharing, confirmingUnshare, budgeting]);

  useEffect(() => {
    api
      .trip(id)
      .then((d) => {
        setTrip(d.trip);
        setItems(d.items);
      })
      .catch((err) => {
        // P-052: this used to catch everything as "Trip not found", so a
        // lapsed session or a server hiccup told the traveller their trip was
        // gone. Only a real 404 means gone; a lapsed session belongs back at
        // sign-in, as in Trips.jsx, and anything else says what happened.
        if (/not logged in|session expired|no longer exists/i.test(err.message))
          setUser(null);
        else if (/not found/i.test(err.message)) setNotFound(true);
        else setLoadError(err.message);
      });
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

  // P-033: "add another" keeps the dialog open with the day and category
  // intact, so a five-item day costs one dialog instead of five.
  async function saveAndAddAnother(e) {
    e.preventDefault();
    setError("");
    try {
      const { item } = await api.createItem(trip.id, editing);
      setItems(sortItems([...items, item]));
      setEditing({ ...EMPTY_ITEM, date: editing.date, type: editing.type });
      flash(`Added “${item.title}”`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveItem(e) {
    e.preventDefault();
    setError("");
    try {
      if (editing.id) {
        const { item } = await api.updateItem(editing.id, editing);
        setItems(sortItems(items.map((i) => (i.id === item.id ? item : i))));
      } else {
        const { item } = await api.createItem(trip.id, editing);
        setItems(sortItems([...items, item]));
      }
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(item) {
    setError("");
    try {
      await api.deleteItem(item.id);
      setItems(items.filter((i) => i.id !== item.id));
      setConfirmingItemDelete(false);
      setEditing(null);
    } catch (err) {
      // the modals stay open: the item is still there, and closing them
      // would say otherwise.
      failed(err);
    }
  }

  async function removeTrip() {
    setError("");
    try {
      await api.deleteTrip(trip.id);
      navigate("/");
    } catch (err) {
      // never navigate away on failure — that would look like it worked
      failed(err);
    }
  }

  // P-018
  async function startSharing() {
    setError("");
    try {
      const { share_token } = await api.shareTrip(trip.id);
      setTrip({ ...trip, share_token });
      flash("Share link created");
    } catch (err) {
      failed(err);
    }
  }

  // P-030: only ever reached through the confirmation step — revoking is
  // permanent for links already sent, since re-sharing mints a new token.
  async function stopSharing() {
    setError("");
    try {
      await api.unshareTrip(trip.id);
      setTrip({ ...trip, share_token: null });
      setConfirmingUnshare(false);
      flash("Sharing turned off — the old link no longer works");
    } catch (err) {
      // the modal stays open on failure: the link has NOT been revoked, and
      // closing it would imply otherwise.
      failed(err);
    }
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/s/${trip.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied to clipboard");
    } catch {
      flash("Press ⌘C to copy the selected link");
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
      flash(updated.budget == null ? "Budget cleared" : "Budget saved");
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
  if (loadError)
    return (
      <div className="empty-state">
        <div className="empty-emoji">🌧️</div>
        <h2>Couldn’t load this trip</h2>
        <p>{loadError}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Try again
        </button>
        <Link to="/">← Back to trips</Link>
      </div>
    );
  if (!trip)
    return (
      <div className="trip-detail">
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="skeleton skeleton-line" style={{ width: "45%", height: 20 }} />
          <div className="skeleton skeleton-line short" />
        </div>
        <div className="days">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton-card" />
          ))}
        </div>
      </div>
    );

  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });
  const status = tripStatus(trip.start_date, trip.end_date);
  const today = todayYmd();

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
              {plural(days.length, "day")} · {plural(items.length, "item")}
              {totalCost > 0 && ` · $${totalCost.toLocaleString()} planned`}
            </span>
            <span className={`trip-countdown ${status.kind}`}>
              {status.live && <span className="live-dot" />}
              {status.label}
            </span>
          </div>
          {trip.notes && <p className="trip-notes">{trip.notes}</p>}
        </div>
        <div className="trip-head-actions">
          <button className="btn btn-small btn-primary" onClick={() => setPlanning(true)}>
            Plan my days
          </button>
          <button className="btn btn-small" onClick={() => setImporting(true)}>
            Paste plan
          </button>
          <button
            className="btn btn-small"
            onClick={() => {
              setError("");
              setSharing(true);
            }}
          >
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

      <Suggestions
        trip={trip}
        items={items}
        onAdd={({ title, type }) => {
          setError("");
          setEditing({ ...EMPTY_ITEM, title, type, date: days[0] || "" });
        }}
      />

      <div className="days">
        {days.map((date, i) => {
          const dayItems = byDay.get(date) || [];
          const cities = dayItems.filter((it) => it.type === "city");
          return (
            <section key={date} className={`day card ${date === today ? "is-today" : ""}`}>
              <div className="day-head">
                <div>
                  <span className="day-num">Day {i + 1}</span>
                  <span className="day-date">{fmtDay(date)}</span>
                  {date === today && <span className="day-today-pill">Today</span>}
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

      {toast && <div className="toast">{toast}</div>}

      {planning && (
        <DayPlanner
          tripId={trip.id}
          onClose={() => setPlanning(false)}
          onAccepted={(created) => {
            setItems((prev) => sortItems([...prev, ...created]));
            setPlanning(false);
            flash(`Added ${plural(created.length, "item")}`);
          }}
        />
      )}

      {importing && (
        <ImportItems
          tripId={trip.id}
          days={days}
          onClose={() => setImporting(false)}
          onImported={(created) => {
            setItems((prev) => sortItems([...prev, ...created]));
            setImporting(false);
            flash(`Added ${plural(created.length, "item")}`);
          }}
        />
      )}

      {sharing && (
        <Modal
          size="small"
          error={error}
          onClose={() => {
            setSharing(false);
            setConfirmingUnshare(false);
          }}
          actions={
            confirmingUnshare ? (
              <>
                <span className="spacer" />
                <button
                  className="btn btn-ghost"
                  onClick={() => setConfirmingUnshare(false)}
                >
                  Keep sharing
                </button>
                <button className="btn btn-danger-solid" onClick={stopSharing}>
                  Stop sharing
                </button>
              </>
            ) : trip.share_token ? (
              <>
                <span className="spacer" />
                <button className="btn" onClick={copyShareLink}>
                  Copy link
                </button>
                <button className="btn btn-primary" onClick={() => setSharing(false)}>
                  Done
                </button>
              </>
            ) : (
              <>
                <span className="spacer" />
                <button className="btn btn-ghost" onClick={() => setSharing(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={startSharing}>
                  Create link
                </button>
              </>
            )
          }
          after={
            !confirmingUnshare && trip.share_token ? (
              <button
                className="btn-link btn-link-danger"
                onClick={() => setConfirmingUnshare(true)}
              >
                Stop sharing this trip
              </button>
            ) : null
          }
        >
          {confirmingUnshare ? (
            <>
              <h2>Stop sharing “{trip.title}”?</h2>
              <p className="confirm-text">
                Everyone holding the current link loses access straight away. If you
                share again later the link will be <strong>different</strong> — the one
                you already sent stays dead.
              </p>
            </>
          ) : trip.share_token ? (
            <>
              <h2>Share this trip</h2>
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
            </>
          ) : (
            <>
              <h2>Share this trip</h2>
              <p className="confirm-text">
                Create a link that lets travel companions see this itinerary — view
                only, no account needed. You can turn it off at any time.
              </p>
            </>
          )}
        </Modal>
      )}

      {budgeting !== null && (
        <Modal
          as="form"
          size="small"
          error={error}
          onClose={() => setBudgeting(null)}
          onSubmit={saveBudget}
          actions={
            <>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setBudgeting(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary">Save</button>
            </>
          }
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
        </Modal>
      )}

      {confirmingItemDelete && editing && (
        <Modal
          size="small"
          top
          error={error}
          onClose={() => setConfirmingItemDelete(false)}
          actions={
            <>
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
            </>
          }
        >
          <h2>Delete “{editing.title}”?</h2>
          <p className="confirm-text">
            This removes it from your itinerary. It can’t be undone.
          </p>
        </Modal>
      )}

      {confirmingDelete && (
        <Modal
          size="small"
          error={error}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <span className="spacer" />
              <button className="btn btn-ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={removeTrip}>
                Delete trip
              </button>
            </>
          }
        >
          <h2>Delete “{trip.title}”?</h2>
          <p className="confirm-text">
            This deletes the trip and all {plural(items.length, "item")} in it.
            It can’t be undone.
          </p>
        </Modal>
      )}

      {editing && (
        <Modal
          as="form"
          error={error}
          onClose={() => setEditing(null)}
          onSubmit={saveItem}
          actions={
            <>
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
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              {!editing.id && (
                <button type="button" className="btn" onClick={saveAndAddAnother}>
                  Add another
                </button>
              )}
              <button className="btn btn-primary">{editing.id ? "Save" : "Add"}</button>
            </>
          }
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

        </Modal>
      )}
    </div>
  );
}
