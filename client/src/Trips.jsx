import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { coverStyle } from "./covers.js";
import { useUser } from "./App.jsx";
import { RatingPrompts } from "./Suggestions.jsx";
import { fmtRange, tripDays, todayYmd, tripStatus } from "./lib/dates.js";

// re-exported so the pages that grew up importing them from here still work
export { fmtRange, tripDays, todayYmd, tripStatus };

const EMPTY = { title: "", destination: "", start_date: "", end_date: "", notes: "" };

const FILTERS = [
  { key: "all", label: "All trips" },
  { key: "now", label: "Happening now" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

export default function Trips() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [trips, setTrips] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    api.trips().then((d) => setTrips(d.trips));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      const { trip } = await api.createTrip(form);
      navigate(`/trips/${trip.id}`); // P-010: land inside the new trip
    } catch (err) {
      setError(err.message);
    }
  }

  if (!trips)
    return (
      <div className="trips-page">
        <div className="page-head">
          <h1>Your trips</h1>
        </div>
        <div className="trip-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    );

  const counts = {
    all: trips.length,
    now: trips.filter((t) => tripStatus(t.start_date, t.end_date).kind === "now").length,
    upcoming: trips.filter((t) =>
      ["soon", "future"].includes(tripStatus(t.start_date, t.end_date).kind)
    ).length,
    past: trips.filter((t) => tripStatus(t.start_date, t.end_date).kind === "past").length,
  };

  const visible = trips.filter((t) => {
    const kind = tripStatus(t.start_date, t.end_date).kind;
    if (filter === "all") return true;
    if (filter === "upcoming") return kind === "soon" || kind === "future";
    return kind === filter;
  });

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <div className="trips-page">
      <div className="greeting">
        <div>
          <h1>Where to next{firstName ? `, ${firstName}` : ""}?</h1>
          <p className="greeting-sub">
            {counts.now > 0
              ? "You're on a trip right now — have a good one."
              : counts.upcoming > 0
              ? `${counts.upcoming} ${counts.upcoming === 1 ? "trip" : "trips"} on the horizon.`
              : "Every trip starts with a first line in the itinerary."}
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New trip"}
        </button>
      </div>

      <RatingPrompts />

      {trips.length > 0 && (
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? "selected" : ""}`}
              onClick={() => setFilter(f.key)}
              disabled={counts[f.key] === 0 && f.key !== "all"}
            >
              {f.label}
              <span className="chip-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <form className="card trip-form" onSubmit={create}>
          <div className="form-row">
            <label>
              Trip name
              <input
                value={form.title}
                onChange={set("title")}
                placeholder="Summer in Italy"
                required
                autoFocus
              />
            </label>
            <label>
              Destination
              <input
                value={form.destination}
                onChange={set("destination")}
                placeholder="Italy"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Start date
              <input type="date" value={form.start_date} onChange={set("start_date")} required />
            </label>
            <label>
              End date
              <input type="date" value={form.end_date} onChange={set("end_date")} required />
            </label>
          </div>
          <label>
            Notes
            <textarea
              rows={2}
              value={form.notes}
              onChange={set("notes")}
              placeholder="Budget, who's coming, ideas…"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary">Create trip</button>
        </form>
      )}

      {trips.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-emoji">🧳</div>
          <p>No trips yet. Create your first one and start filling in the days.</p>
        </div>
      )}

      {trips.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <p>No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} to show.</p>
        </div>
      )}

      <div className="trip-grid">
        {visible.map((t) => {
          const status = tripStatus(t.start_date, t.end_date);
          const days = tripDays(t.start_date, t.end_date).length;
          return (
            <Link key={t.id} to={`/trips/${t.id}`} className="trip-card">
              <div className="trip-cover" style={coverStyle(t.id)}>
                <CoverPhoto city={t.destination || t.title} />
                <span className={`trip-countdown on-cover ${status.kind}`}>
                  {status.live && <span className="live-dot" />}
                  {status.label}
                </span>
                <div className="trip-cover-text">
                  <div className="trip-card-title">{t.title}</div>
                  {t.destination && (
                    <div className="trip-card-dest">{t.destination}</div>
                  )}
                </div>
              </div>
              <div className="trip-card-body">
                <span className="trip-card-dates">
                  {fmtRange(t.start_date, t.end_date)}
                </span>
                <span className="trip-card-meta">
                  {days} {days === 1 ? "day" : "days"} · {t.item_count}{" "}
                  {t.item_count === 1 ? "item" : "items"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
